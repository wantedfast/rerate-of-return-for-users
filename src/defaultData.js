export const defaultData = {
  totalCapitalTargets: {
    wang: 0,
    chen: 0,
    nanjing: 0,
    garlicm: 20000,
    sugar: 20000
  },
  fees: {
    wang: 0,
    chen: 0,
    nanjing: 0,
    garlicm: 100,
    sugar: 200
  },
  usAdjustments: {
    sugar: {
      profitCny: -1500
    }
  },
  dailyBalances: [
    { id: "d-2026-06-24", date: "2026-06-24", ashareTotalCny: 22476.04, usCurrentJpy: 835975, jpyCnyRate: 0.042, fundCurrentCny: 4965.46 }
  ],
  assetSnapshots: {
    usStock: {
      principalJpy: 1039964.2857142857,
      currentAssetJpy: 835975,
      jpyCnyRate: 0.042
    },
    fund: {
      principalCny: 5000,
      currentAssetCny: 4965.46
    },
    aShareDaily: [
      { id: "d-2026-06-24", date: "2026-06-24", totalCny: 22476.04 }
    ]
  },
  flows: []
};
