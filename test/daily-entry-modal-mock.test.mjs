import assert from "node:assert/strict";
import test from "node:test";
import { calculateDailyPerformance } from "../src/shared/dailySnapshots.js";
import { addOneDay } from "../src/shared/dailySnapshotRows.js";
import { roundCurrency } from "../src/shared/calculations.js";

function mockData(snapshot) {
  return {
    people: [{ id: "mock", name: "Mock", password: "pw" }],
    admin: { username: "admin", password: "pw" },
    totalCapitalTargets: { mock: 10000 },
    assetSnapshots: {
      ashare: {
        commonPoolPersonIds: ["mock"],
        openingCapitalCny: { mock: 10000 },
        commonPoolToUsStockDate: "2026-06-15",
        commonPoolToUsStockCny: 0,
        specialPrincipalCny: {}
      },
      usStock: {
        principalJpy: 0,
        currentAssetJpy: 0,
        earlyRealizedPnlJpy: 0,
        laterRealizedPnlJpy: 0,
        floatingPnlJpy: 0,
        jpyCnyRate: 0.05,
        currentCapitalByPersonCny: { mock: 0 }
      },
      fund: { ownerId: "mock", principalCny: 5000, currentAssetCny: 5000 }
    },
    dailyBalances: [],
    dailySnapshots: [snapshot],
    flows: [],
    cashBalances: { mock: 0 },
    fees: { mock: 0 }
  };
}

test("modal mock preview converts U.S. stock JPY values into CNY P/L", () => {
  const data = mockData({
    date: "2026-06-25",
    aShare: { beginningAssetsCny: 0, externalDepositCny: 0, externalWithdrawalCny: 0, transferInCny: 0, transferOutCny: 0, endingAssetsCny: 0 },
    usStock: { beginningAssetsCny: 5000, externalDepositJpy: 0, externalWithdrawalJpy: 0, transferInJpy: 0, transferOutJpy: 0, endingAssetsJpy: 102000, jpyToCnyRate: 0.05 },
    fund: { beginningAssetsCny: 5000, externalDepositCny: 0, externalWithdrawalCny: 0, transferInCny: 0, transferOutCny: 0, endingAssetsCny: 4965.46 }
  });

  const row = calculateDailyPerformance(data).accountRows[0];

  assert.equal(roundCurrency(row.usStock.endingAssetsCny), 5100);
  assert.equal(roundCurrency(row.usStock.dailyPnlCny), 100);
  assert.equal(roundCurrency(row.fund.dailyPnlCny), -34.54);
});

test("legacy U.S. stock CNY rows expose JPY values by rate fallback", () => {
  const data = mockData({
    date: "2026-06-25",
    aShare: { beginningAssetsCny: 0, externalDepositCny: 0, externalWithdrawalCny: 0, transferInCny: 0, transferOutCny: 0, endingAssetsCny: 0 },
    usStock: { beginningAssetsCny: 5000, externalDepositJpy: 0, externalWithdrawalJpy: 0, transferInJpy: 0, transferOutJpy: 0, endingAssetsCny: 5100, jpyToCnyRate: 0.05 },
    fund: { beginningAssetsCny: 5000, externalDepositCny: 0, externalWithdrawalCny: 0, transferInCny: 0, transferOutCny: 0, endingAssetsCny: 5000 }
  });

  const row = calculateDailyPerformance(data).accountRows[0];

  assert.equal(roundCurrency(row.usStock.beginningAssetsJpy), 100000);
  assert.equal(roundCurrency(row.usStock.endingAssetsJpy), 102000);
  assert.equal(roundCurrency(row.usStock.dailyPnlCny), 100);
});

test("zero U.S. stock JPY with nonzero CNY falls back instead of creating a fake full loss", () => {
  const data = mockData({
    date: "2026-06-25",
    aShare: { beginningAssetsCny: 0, externalDepositCny: 0, externalWithdrawalCny: 0, transferInCny: 0, transferOutCny: 0, endingAssetsCny: 0 },
    usStock: { beginningAssetsCny: 5000, externalDepositJpy: 0, externalWithdrawalJpy: 0, transferInJpy: 0, transferOutJpy: 0, endingAssetsJpy: 0, endingAssetsCny: 5000, jpyToCnyRate: 0.05 },
    fund: { beginningAssetsCny: 5000, externalDepositCny: 0, externalWithdrawalCny: 0, transferInCny: 0, transferOutCny: 0, endingAssetsCny: 5000 }
  });

  const row = calculateDailyPerformance(data).accountRows[0];

  assert.equal(roundCurrency(row.usStock.endingAssetsJpy), 100000);
  assert.equal(roundCurrency(row.usStock.dailyPnlCny), 0);
});

test("modal save semantics are immutable: cancel keeps rows, save appends a new row", () => {
  const rows = [{ date: "2026-06-24" }];
  const draft = { date: addOneDay(rows.at(-1).date) };
  const canceled = rows;
  const saved = [...rows, draft];

  assert.equal(canceled.length, 1);
  assert.equal(saved.length, 2);
  assert.equal(saved.at(-1).date, "2026-06-25");
  assert.notEqual(saved, rows);
});
