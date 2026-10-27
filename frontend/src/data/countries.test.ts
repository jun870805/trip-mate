import { describe, it } from "node:test";
import assert from "node:assert/strict";
import snapshot from "./countries.json" with { type: "json" };
import {
  countries,
  searchCountries,
  countryDefaults,
  timezoneLabel,
} from "./countries.ts";

describe("country search and trip defaults", () => {
  it("searches traditional/simplified Chinese, English and country codes", () => {
    for (const query of ["日本", "Japan", "jp", "JPN"])
      assert.equal(searchCountries(query)[0]?.code, "JP");
    for (const query of ["臺灣", "台灣", "Taiwan", "TW"])
      assert.equal(searchCountries(query)[0]?.code, "TW");
    assert.equal(searchCountries("韩国")[0]?.code, "KR");
    assert.equal(searchCountries("USA")[0]?.code, "US");
    assert.equal(searchCountries("UK")[0]?.code, "GB");
  });
  it("automatically fills unambiguous currency and timezone without guessing multi-zone countries", () => {
    assert.deepEqual(countryDefaults(countries.find((c) => c.code === "JP")!), {
      currency: "JPY",
      timezone: "Asia/Tokyo",
    });
    assert.deepEqual(countryDefaults(countries.find((c) => c.code === "TW")!), {
      currency: "TWD",
      timezone: "Asia/Taipei",
    });
    assert.deepEqual(countryDefaults(countries.find((c) => c.code === "US")!), {
      currency: "USD",
      timezone: "",
    });
    assert.equal(
      countryDefaults(countries.find((c) => c.code === "AU")!).timezone,
      "",
    );
  });
  it("requires a choice for multiple currencies and supports manual entry when no currency is available", () => {
    assert.equal(
      countryDefaults(countries.find((c) => c.code === "PA")!).currency,
      "",
    );
    assert.equal(
      countryDefaults(countries.find((c) => c.code === "AQ")!).currency,
      "",
    );
    assert.deepEqual(countryDefaults(null), { currency: "", timezone: "" });
  });
  it("handles empty and unmatched queries and prioritizes exact codes", () => {
    assert.equal(searchCountries("")[0].code, "JP");
    assert.equal(searchCountries("US")[0].code, "US");
    assert.deepEqual(searchCountries("not-a-real-country-999"), []);
    assert.ok(searchCountries("a").length <= 8);
  });
  it("has ISO country coverage and only offers currencies and timezones the runtime supports", () => {
    assert.equal(snapshot.countries.length, 249);
    assert.equal(new Set(countries.map((c) => c.code)).size, 249);
    for (const country of countries) {
      assert.match(country.code, /^[A-Z]{2}$/);
      assert.ok(country.label);
      for (const code of country.currencies)
        assert.ok(Intl.supportedValuesOf("currency").includes(code));
      for (const timezone of country.timezones)
        assert.doesNotThrow(() =>
          new Intl.DateTimeFormat("zh-TW", { timeZone: timezone }).format(),
        );
    }
  });
  it("includes a readable timezone name while retaining the IANA identifier", () => {
    assert.ok(timezoneLabel("America/New_York").includes("America/New_York"));
    assert.equal(timezoneLabel("invalid/timezone"), "invalid/timezone");
  });
});
