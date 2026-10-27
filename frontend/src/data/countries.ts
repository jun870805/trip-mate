import snapshot from "./countries.json" with { type: "json" };

export interface Country {
  code: string;
  label: string;
  english: string;
  currencies: string[];
  timezones: string[];
  search: string[];
  multipleCurrencies: boolean;
  multipleTimezones: boolean;
}
const traditional = new Intl.DisplayNames(["zh-TW"], { type: "region" });
const simplified = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const english = new Intl.DisplayNames(["en"], { type: "region" });
const aliases: Record<string, string[]> = {
  JP: ["JPN"],
  KR: ["KOR", "南韓", "南韩"],
  TW: ["TWN", "台灣", "臺灣", "台湾"],
  US: ["USA", "美利堅", "美利坚"],
  GB: ["UK", "GBR", "英國", "英国", "England"],
  TH: ["THA"],
  VN: ["VNM", "越南"],
  SG: ["SGP"],
  MY: ["MYS", "馬來西亞", "马来西亚"],
  HK: ["HKG", "香港"],
  MO: ["MAC", "澳門", "澳门"],
  CN: ["CHN", "中國", "中国", "大陸", "大陆"],
  AU: ["AUS", "澳洲"],
  NZ: ["NZL", "紐西蘭", "新西兰"],
  CA: ["CAN"],
  FR: ["FRA"],
  DE: ["DEU", "德國", "德国"],
  IT: ["ITA"],
  ES: ["ESP"],
};
function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll("臺", "台")
    .replace(/[\s._()/-]/g, "");
}
export function supportedTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("zh-TW", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));
export const countries: Country[] = snapshot.countries.map((country) => ({
  ...country,
  label: traditional.of(country.code) || country.english,
  english: english.of(country.code) || country.english,
  currencies: country.currencies.filter((currency) =>
    supportedCurrencies.has(currency),
  ),
  get timezones() {
    return [...new Set(country.timezones)].filter(supportedTimezone);
  },
  multipleCurrencies: country.currencies.length > 1,
  multipleTimezones: country.timezones.length > 1,
  search: [
    country.code,
    traditional.of(country.code) || "",
    simplified.of(country.code) || "",
    english.of(country.code) || "",
    country.english,
    ...(aliases[country.code] || []),
  ].map(normalize),
}));
const popular = ["JP", "KR", "TH", "VN", "SG", "TW", "US", "AU"];
export function searchCountries(query: string, limit = 8): Country[] {
  const key = normalize(query.trim());
  if (!key)
    return popular
      .map((code) => countries.find((country) => country.code === code)!)
      .slice(0, limit);
  return countries
    .map((country) => ({
      country,
      score: country.search.some((term) => term === key)
        ? 0
        : country.search.some((term) => term.startsWith(key))
          ? 1
          : country.search.some((term) => term.includes(key))
            ? 2
            : 3,
    }))
    .filter((result) => result.score < 3)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.country.label.localeCompare(b.country.label, "zh-TW"),
    )
    .slice(0, limit)
    .map((result) => result.country);
}
export function countryDefaults(country: Country | null): {
  currency: string;
  timezone: string;
} {
  return {
    currency:
      country?.currencies.length === 1 && !country.multipleCurrencies
        ? country.currencies[0]
        : "",
    timezone:
      country?.timezones.length === 1 && !country.multipleTimezones
        ? country.timezones[0]
        : "",
  };
}
export function currencyLabel(code: string): string {
  const label = new Intl.DisplayNames(["zh-TW"], { type: "currency" }).of(code);
  return label && label !== code ? `${label}（${code}）` : code;
}
export function timezoneLabel(timezone: string): string {
  try {
    const label = new Intl.DateTimeFormat("zh-TW", {
      timeZone: timezone,
      timeZoneName: "longGeneric",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return label ? `${label}（${timezone}）` : timezone;
  } catch {
    return timezone;
  }
}
