import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import xlsx from "xlsx";
import { calculateAll, roundCurrency } from "../src/shared/calculations.js";

const workbookPath = "C:\\Users\\wangf\\Documents\\Codex\\2026-06-24\\new-chat-2\\outputs\\个人盈亏维护表_阶段美股版.xlsx";
const seedDataPath = new URL("../data/investment-data.json", import.meta.url);

const rowToPersonId = {
  3: "wang",
  4: "chen",
  5: "nanjing",
  6: "garlicm",
  7: "sugar"
};

function readWorkbookSummary() {
  assert.equal(fs.existsSync(workbookPath), true, `missing source workbook: ${workbookPath}`);
  const workbook = xlsx.readFile(workbookPath, { cellDates: true });
  const summarySheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(summarySheet, { header: 1, raw: true });

  return Object.fromEntries(Object.entries(rowToPersonId).map(([rowIndex, personId]) => {
    const row = rows[Number(rowIndex)];
    return [personId, {
      aShareProfit: row[1],
      fundProfit: row[2],
      usProfit: row[3],
      totalProfit: row[4],
      capital: row[5],
      returnRate: row[6]
    }];
  }));
}

test("seed data reconciles to the Excel source workbook summary", async () => {
  const seed = JSON.parse(await fs.promises.readFile(seedDataPath, "utf8"));
  const appSummary = Object.fromEntries(calculateAll(seed).summary.map((row) => [row.personId, row]));
  const workbookSummary = readWorkbookSummary();

  for (const [personId, expected] of Object.entries(workbookSummary)) {
    const actual = appSummary[personId];
    assert.ok(actual, `missing app summary for ${personId}`);
    assert.equal(roundCurrency(actual.capital), roundCurrency(expected.capital));
    assert.equal(roundCurrency(actual.aShareProfit), roundCurrency(expected.aShareProfit));
    assert.equal(roundCurrency(actual.fundProfit), roundCurrency(expected.fundProfit));
    assert.equal(roundCurrency(actual.usProfit), roundCurrency(expected.usProfit));
    assert.equal(roundCurrency(actual.totalProfit), roundCurrency(expected.totalProfit));
    assert.equal(roundCurrency(actual.returnRate * 100), roundCurrency(expected.returnRate * 100));
  }
});
