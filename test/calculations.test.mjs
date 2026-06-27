import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  calculateAll,
  calculateAshareTimeline,
  calculateFund,
  calculateUsStock,
  roundCurrency
} from "../src/shared/calculations.js";

const seedDataPath = new URL("../data/investment-data.json", import.meta.url);

async function loadSeedData() {
  return JSON.parse(await fs.readFile(seedDataPath, "utf8"));
}

function createMinimalData(overrides = {}) {
  return {
    people: [
      { id: "alpha", name: "Alpha", password: "alpha123" },
      { id: "beta", name: "Beta", password: "beta123" }
    ],
    admin: { username: "admin", password: "admin123" },
    assetSnapshots: {
      ashare: {
        openingCapitalCny: {
          alpha: 0,
          beta: 0
        },
        commonPoolToUsStockDate: "2026-06-15",
        commonPoolToUsStockCny: 0
      },
      usStock: {
        principalJpy: 0,
        currentAssetJpy: 0,
        earlyRealizedPnlJpy: 0,
        laterRealizedPnlJpy: 0,
        floatingPnlJpy: 0,
        jpyCnyRate: 0.05,
        currentCapitalByPersonCny: {
          alpha: 0,
          beta: 0
        }
      },
      fund: {
        ownerId: "alpha",
        principalCny: 0,
        currentAssetCny: 0
      }
    },
    dailyBalances: [],
    flows: [],
    cashBalances: {
      alpha: 0,
      beta: 0
    },
    fees: {
      alpha: 0,
      beta: 0
    },
    ...overrides
  };
}

test("seed fixture matches the Excel source per-person summary totals", async () => {
  const summary = calculateAll(await loadSeedData()).summary;

  const expected = {
    wang: { capital: 20836.37, aShareProfit: -517.63, usProfit: -792.75, fundProfit: -34.54, totalProfit: -1344.92 },
    chen: { capital: 5000, aShareProfit: -668.34, usProfit: -280.4, fundProfit: 0, totalProfit: -948.74 },
    nanjing: { capital: 7000, aShareProfit: -935.68, usProfit: -392.55, fundProfit: 0, totalProfit: -1328.23 },
    garlicm: { capital: 20036.76, aShareProfit: 1087.72, usProfit: -933.59, fundProfit: 0, totalProfit: 154.12 },
    sugar: { capital: 20056, aShareProfit: -69.07, usProfit: -3006.52, fundProfit: 0, totalProfit: -3075.6 }
  };

  assert.equal(summary.length, 5);
  for (const row of summary) {
    const expectedRow = expected[row.personId];
    assert.ok(expectedRow, `unexpected person ${row.personId}`);
    assert.equal(roundCurrency(row.capital), expectedRow.capital);
    assert.equal(roundCurrency(row.aShareProfit), expectedRow.aShareProfit);
    assert.equal(roundCurrency(row.usProfit), expectedRow.usProfit);
    assert.equal(roundCurrency(row.fundProfit), expectedRow.fundProfit);
    assert.equal(roundCurrency(row.totalProfit), expectedRow.totalProfit);
  }
});

test("U.S. stock staged profit keeps early realized P/L fixed to Sugar and allocates later P/L by current capital", () => {
  const result = calculateUsStock(createMinimalData({
    people: [
      { id: "alpha", name: "Alpha", password: "alpha123" },
      { id: "beta", name: "Beta", password: "beta123" },
      { id: "sugar", name: "Sugar", password: "sugar123" }
    ],
    assetSnapshots: {
      ashare: {
        openingCapitalCny: {
          alpha: 0,
          beta: 0,
          sugar: 0
        },
        commonPoolToUsStockDate: "2026-06-15",
        commonPoolToUsStockCny: 0
      },
      usStock: {
        principalJpy: 10000,
        currentAssetJpy: 10800,
        earlyRealizedPnlJpy: 1000,
        laterRealizedPnlJpy: 500,
        floatingPnlJpy: -100,
        // Stale saved data must be ignored; early realized P/L is fixed to Sugar.
        earlyRealizedOwnerId: "alpha",
        jpyCnyRate: 0.05,
        currentCapitalByPersonCny: {
          alpha: 100,
          beta: 300,
          sugar: 0
        }
      },
      fund: {
        ownerId: "alpha",
        principalCny: 0,
        currentAssetCny: 0
      }
    },
    cashBalances: {
      alpha: 0,
      beta: 0,
      sugar: 0
    },
    fees: {
      alpha: 0,
      beta: 0,
      sugar: 0
    }
  }));

  assert.deepEqual(result.capitalByPerson, { alpha: 100, beta: 300, sugar: 0 });
  assert.equal(result.profitByPerson.alpha, 5);
  assert.equal(result.profitByPerson.beta, 15);
  assert.equal(result.profitByPerson.sugar, 50);
});

test("A-share pre-market flows participate immediately while post-market flows start on the next record", () => {
  const timeline = calculateAshareTimeline(createMinimalData({
    assetSnapshots: {
      ashare: {
        openingCapitalCny: {
          alpha: 100,
          beta: 100
        },
        commonPoolToUsStockDate: "2026-06-15",
        commonPoolToUsStockCny: 0
      },
      usStock: {
        principalJpy: 0,
        currentAssetJpy: 0,
        earlyRealizedPnlJpy: 0,
        laterRealizedPnlJpy: 0,
        floatingPnlJpy: 0,
        jpyCnyRate: 0.05,
        currentCapitalByPersonCny: {
          alpha: 0,
          beta: 0
        }
      },
      fund: {
        ownerId: "alpha",
        principalCny: 0,
        currentAssetCny: 0
      }
    },
    dailyBalances: [
      { id: "d1", date: "2026-06-01", ashareProfitCny: 30 },
      { id: "d2", date: "2026-06-02", ashareProfitCny: 30 }
    ],
    flows: [
      { id: "f1", date: "2026-06-01", asset: "ashare", personId: "alpha", amountCny: 100, timing: "pre" },
      { id: "f2", date: "2026-06-01", asset: "ashare", personId: "beta", amountCny: 100, timing: "post" }
    ]
  }));

  assert.deepEqual(timeline.rows[0].preProfitBalances, { alpha: 200, beta: 100 });
  assert.deepEqual(timeline.rows[1].preProfitBalances, { alpha: 220, beta: 210 });
  assert.equal(timeline.rows[0].allocations.alpha, 20);
  assert.equal(timeline.rows[0].allocations.beta, 10);
  assert.equal(roundCurrency(timeline.rows[1].allocations.alpha), 15.35);
  assert.equal(roundCurrency(timeline.rows[1].allocations.beta), 14.65);
});

test("common A-share flows allocate dynamically across all members with opening A-share capital", () => {
  const timeline = calculateAshareTimeline(createMinimalData({
    people: [
      { id: "member_one", name: "Member One", password: "one123" },
      { id: "member_two", name: "Member Two", password: "two123" },
      { id: "late_member", name: "Late Member", password: "late123" }
    ],
    assetSnapshots: {
      ashare: {
        openingCapitalCny: {
          member_one: 100,
          member_two: 300,
          late_member: 0
        },
        commonPoolToUsStockDate: "2026-06-15",
        commonPoolToUsStockCny: 0
      },
      usStock: {
        principalJpy: 0,
        currentAssetJpy: 0,
        earlyRealizedPnlJpy: 0,
        laterRealizedPnlJpy: 0,
        floatingPnlJpy: 0,
        jpyCnyRate: 0.05,
        currentCapitalByPersonCny: {
          member_one: 0,
          member_two: 0,
          late_member: 0
        }
      },
      fund: {
        ownerId: "member_one",
        principalCny: 0,
        currentAssetCny: 0
      }
    },
    dailyBalances: [
      { id: "d1", date: "2026-06-01", ashareProfitCny: 0 }
    ],
    flows: [
      { id: "f-common", date: "2026-06-01", asset: "ashare", personId: "common", amountCny: -80, timing: "pre" }
    ],
    cashBalances: {
      member_one: 0,
      member_two: 0,
      late_member: 0
    },
    fees: {
      member_one: 0,
      member_two: 0,
      late_member: 0
    }
  }));

  assert.deepEqual(timeline.rows[0].preProfitBalances, {
    member_one: 80,
    member_two: 240,
    late_member: 0
  });
});

test("fund profit is the current asset minus fund principal for the configured owner", () => {
  const result = calculateFund(createMinimalData({
    assetSnapshots: {
      ashare: {
        openingCapitalCny: {
          alpha: 0,
          beta: 0
        },
        commonPoolToUsStockDate: "2026-06-15",
        commonPoolToUsStockCny: 0
      },
      usStock: {
        principalJpy: 0,
        currentAssetJpy: 0,
        earlyRealizedPnlJpy: 0,
        laterRealizedPnlJpy: 0,
        floatingPnlJpy: 0,
        jpyCnyRate: 0.05,
        currentCapitalByPersonCny: {
          alpha: 0,
          beta: 0
        }
      },
      fund: {
        ownerId: "beta",
        principalCny: 5000,
        currentAssetCny: 5321.5
      }
    }
  }));

  assert.deepEqual(result.capitalByPerson, { alpha: 0, beta: 5000 });
  assert.deepEqual(result.profitByPerson, { alpha: 0, beta: 321.5 });
});
