import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";

const schema = JSON.parse(
  readFileSync("frontend/src/data/schema.json", "utf8"),
);
const books = [];
const validationLists = [];
const range = () => {
  const chain = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "setValues"
          ? (values) => {
              assert.ok(Array.isArray(values[0]));
              return chain;
            }
          : key === "requireValueInList"
            ? (values) => {
                validationLists.push(Array.from(values));
                return chain;
              }
            : () => chain,
    },
  );
  return chain;
};
function sheet() {
  return {
    name: "",
    setName(name) {
      this.name = name;
      return this;
    },
    getRange: range,
    getMaxRows: () => 1000,
    setFrozenRows() {},
    setColumnWidths() {},
  };
}
const api = {
  create() {
    const sheets = [sheet()];
    const book = {
      sheets,
      getSheets: () => sheets,
      insertSheet(name) {
        const row = sheet().setName(name);
        sheets.push(row);
        return row;
      },
      getUrl: () => "https://example.invalid/mock-sheet",
    };
    books.push(book);
    return book;
  },
  newDataValidation: range,
};
runInNewContext(
  readFileSync("frontend/public/templates/建立Google試算表範本.gs", "utf8") +
    "\ncreateTripMateTemplates();",
  { SpreadsheetApp: api, console: { log() {} } },
);
assert.equal(books.length, 2);
assert.deepEqual(
  books[0].sheets.map((s) => s.name),
  ["旅程清單"],
);
assert.deepEqual(
  books[1].sheets.map((s) => s.name),
  Object.keys(schema).filter((n) => n !== "旅程清單"),
);
const categories = JSON.parse(
  readFileSync("frontend/src/data/itinerary-categories.json", "utf8"),
);
assert.ok(
  validationLists.some(
    (values) => JSON.stringify(values) === JSON.stringify(categories),
  ),
  "Apps Script category validation must use the shared options",
);
console.log(
  "Apps Script creates a new catalog and 11-sheet trip template with mocked Google services.",
);
