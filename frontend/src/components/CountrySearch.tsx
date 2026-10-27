import { useEffect, useId, useRef, useState } from "react";
import { searchCountries } from "../data/countries";
import type { Country } from "../data/countries";

export function CountrySearch({
  selected,
  onSelect,
}: {
  selected: Country | null;
  onSelect: (country: Country | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const results = searchCountries(query);
  useEffect(() => {
    if (open && active >= 0 && results[active])
      document
        .getElementById(`${id}-${results[active].code}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, query, id]);
  function choose(country: Country) {
    setQuery(country.label);
    onSelect(country);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div
      className="country-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <label htmlFor={`${id}-input`}>搜尋國家／地區</label>
      <div className="country-query">
        <input
          id={`${id}-input`}
          ref={input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && active >= 0 && results[active]
              ? `${id}-${results[active].code}`
              : undefined
          }
          value={query}
          placeholder="國家名稱或代碼，例如日本、Japan、JP"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
            if (selected) onSelect(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                results.length
                  ? event.key === "ArrowDown"
                    ? (index + 1) % results.length
                    : index <= 0
                      ? results.length - 1
                      : index - 1
                  : -1,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (open && results[active]) choose(results[active]);
              else if (open && results.length === 1) choose(results[0]);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="quiet-button"
            aria-label="清除國家"
            onClick={() => {
              setQuery("");
              onSelect(null);
              setActive(-1);
              input.current?.focus();
              setOpen(true);
            }}
          >
            清除
          </button>
        )}
      </div>
      {open && (
        <div
          className="country-results"
          role="listbox"
          id={`${id}-options`}
          aria-label="國家搜尋結果"
        >
          {results.length ? (
            results.map((country, index) => (
              <button
                type="button"
                role="option"
                key={country.code}
                id={`${id}-${country.code}`}
                tabIndex={-1}
                aria-selected={
                  active === index || selected?.code === country.code
                }
                className={active === index ? "active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(country)}
              >
                <span>
                  {country.label}
                  <small>{country.english}</small>
                </span>
                <span>{country.code}</span>
              </button>
            ))
          ) : (
            <p role="status">查無符合國家，可直接填寫幣別與時區。</p>
          )}
        </div>
      )}
    </div>
  );
}
