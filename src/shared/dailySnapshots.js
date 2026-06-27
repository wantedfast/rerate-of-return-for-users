import { blankByPerson, listPersonIds, validateInvestmentData } from "./investmentData.js";
import { sortDailySnapshotsByDate } from "./dailySnapshotRows.js";

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? numberOrZero(numerator) / denominator : 0;
}

function flowCny(input, field, legacyField) {
  return numberOrZero(input[field] ?? input[legacyField]);
}

function jpyFlowCny(input, field, rate) {
  return numberOrZero(input[field]) * rate;
}

function commonPoolRatios(data) {
  const commonIds = data.assetSnapshots.ashare.commonPoolPersonIds ?? [];
  const opening = data.assetSnapshots.ashare.openingCapitalCny ?? {};
  const total = commonIds.reduce((sum, id) => sum + numberOrZero(opening[id]), 0);
  return Object.fromEntries(commonIds.map((id) => [id, safeRate(opening[id], total)]));
}

function buildAllocationWeights(data) {
  const ids = listPersonIds(data);
  const commonRatios = commonPoolRatios(data);
  const commonIds = new Set(Object.keys(commonRatios));
  const ashareOpening = data.assetSnapshots.ashare.openingCapitalCny ?? {};
  const specialAshare = data.assetSnapshots.ashare.specialPrincipalCny ?? {};
  const usCapital = data.assetSnapshots.usStock.currentCapitalByPersonCny ?? {};
  const commonUsCapital = numberOrZero(data.assetSnapshots.ashare.commonPoolToUsStockCny);

  const aShareCapital = blankByPerson(data);
  for (const id of ids) {
    aShareCapital[id] = commonIds.has(id)
      ? numberOrZero(ashareOpening[id])
      : numberOrZero(specialAshare[id]);
  }

  const usStockCapital = blankByPerson(data);
  for (const id of ids) {
    usStockCapital[id] = commonIds.has(id)
      ? commonUsCapital * numberOrZero(commonRatios[id])
      : numberOrZero(usCapital[id]);
  }

  const aShareTotal = ids.reduce((sum, id) => sum + numberOrZero(aShareCapital[id]), 0);
  const usStockTotal = ids.reduce((sum, id) => sum + numberOrZero(usStockCapital[id]), 0);

  return {
    aShare: Object.fromEntries(ids.map((id) => [id, safeRate(aShareCapital[id], aShareTotal)])),
    usStock: Object.fromEntries(ids.map((id) => [id, safeRate(usStockCapital[id], usStockTotal)])),
    fund: Object.fromEntries(ids.map((id) => [id, id === data.assetSnapshots.fund.ownerId ? 1 : 0]))
  };
}

function initialAccountAssets(data) {
  const commonIds = data.assetSnapshots.ashare.commonPoolPersonIds ?? [];
  const opening = data.assetSnapshots.ashare.openingCapitalCny ?? {};
  const special = data.assetSnapshots.ashare.specialPrincipalCny ?? {};
  const usCapital = data.assetSnapshots.usStock.currentCapitalByPersonCny ?? {};
  return {
    aShare:
      commonIds.reduce((sum, id) => sum + numberOrZero(opening[id]), 0)
      + Object.entries(special).reduce((sum, [, value]) => sum + numberOrZero(value), 0),
    usStock:
      numberOrZero(data.assetSnapshots.ashare.commonPoolToUsStockCny)
      + Object.entries(usCapital)
        .filter(([id]) => !commonIds.includes(id))
        .reduce((sum, [, value]) => sum + numberOrZero(value), 0),
    fund: numberOrZero(data.assetSnapshots.fund.principalCny)
  };
}

function calculateAccountRows(data, assetKey) {
  const sorted = sortDailySnapshotsByDate(data.dailySnapshots ?? []);
  const initialAssets = initialAccountAssets(data);
  let previousEnding = null;
  let previousEndingJpy = null;
  let initialInvestedCapital = null;
  let cumulativePnl = 0;
  let cumulativeNetInflow = 0;

  return sorted.map((snapshot) => {
    const input = snapshot[assetKey] ?? {};
    const rate = numberOrZero(input.jpyToCnyRate ?? data.assetSnapshots.usStock?.jpyCnyRate);
    const beginningAssetsCny = previousEnding === null
      ? numberOrZero(input.beginningAssetsCny ?? initialAssets[assetKey])
      : previousEnding;
    const beginningAssetsJpy = previousEndingJpy === null
      ? numberOrZero(input.beginningAssetsJpy ?? (assetKey === "usStock" && rate ? beginningAssetsCny / rate : 0))
      : previousEndingJpy;
    if (initialInvestedCapital === null) {
      initialInvestedCapital = beginningAssetsCny;
    }
    const depositCny = assetKey === "usStock"
      ? flowCny(input, "externalDepositCny", "depositCny") + jpyFlowCny(input, "externalDepositJpy", rate)
      : flowCny(input, "externalDepositCny", "depositCny");
    const withdrawalCny = assetKey === "usStock"
      ? flowCny(input, "externalWithdrawalCny", "withdrawalCny") + jpyFlowCny(input, "externalWithdrawalJpy", rate)
      : flowCny(input, "externalWithdrawalCny", "withdrawalCny");
    const transferInCny = assetKey === "usStock"
      ? numberOrZero(input.transferInCny) + jpyFlowCny(input, "transferInJpy", rate)
      : numberOrZero(input.transferInCny);
    const transferOutCny = assetKey === "usStock"
      ? numberOrZero(input.transferOutCny) + jpyFlowCny(input, "transferOutJpy", rate)
      : numberOrZero(input.transferOutCny);
    const inputEndingAssetsJpy = numberOrZero(input.endingAssetsJpy);
    const fallbackEndingAssetsJpy = assetKey === "usStock" && rate ? numberOrZero(input.endingAssetsCny) / rate : 0;
    const endingAssetsJpy = inputEndingAssetsJpy || fallbackEndingAssetsJpy;
    const endingAssetsCny = assetKey === "usStock" && endingAssetsJpy > 0
      ? endingAssetsJpy * rate
      : numberOrZero(input.endingAssetsCny);
    const netInflowCny = depositCny + transferInCny - withdrawalCny - transferOutCny;
    const dailyPnlCny = endingAssetsCny - beginningAssetsCny - depositCny - transferInCny + withdrawalCny + transferOutCny;
    cumulativePnl += dailyPnlCny;
    cumulativeNetInflow += netInflowCny;
    const investedCapital = initialInvestedCapital + cumulativeNetInflow;
    const row = {
      date: snapshot.date,
      beginningAssetsCny,
      beginningAssetsJpy,
      depositCny,
      withdrawalCny,
      transferInCny,
      transferOutCny,
      netFlowCny: netInflowCny,
      endingAssetsCny,
      endingAssetsJpy,
      jpyToCnyRate: rate,
      dailyPnlCny,
      cumulativePnlCny: cumulativePnl,
      dailyReturnRate: safeRate(dailyPnlCny, beginningAssetsCny + depositCny + transferInCny),
      cumulativeReturnRate: safeRate(cumulativePnl, investedCapital)
    };
    previousEnding = endingAssetsCny;
    if (assetKey === "usStock") {
      previousEndingJpy = endingAssetsJpy;
    }
    return row;
  });
}

function combineAccountRows(data) {
  const aShare = calculateAccountRows(data, "aShare");
  const usStock = calculateAccountRows(data, "usStock");
  const fund = calculateAccountRows(data, "fund");
  return aShare.map((row, index) => ({
    date: row.date,
    aShare: row,
    usStock: usStock[index],
    fund: fund[index]
  }));
}

function calculateMemberRows(data, accountRows) {
  const ids = listPersonIds(data);
  const weights = buildAllocationWeights(data);
  const cumulativeByPerson = Object.fromEntries(ids.map((id) => [id, {
    aSharePnlCny: 0,
    usStockPnlCny: 0,
    fundPnlCny: 0,
    totalPnlCny: 0,
    netInflowCny: 0
  }]));
  const dailyRows = [];

  for (const row of accountRows) {
    for (const id of ids) {
      const aShareDailyPnlCny = row.aShare.dailyPnlCny * weights.aShare[id];
      const usStockDailyPnlCny = row.usStock.dailyPnlCny * weights.usStock[id];
      const fundDailyPnlCny = row.fund.dailyPnlCny * weights.fund[id];
      const dailyPnlCny = aShareDailyPnlCny + usStockDailyPnlCny + fundDailyPnlCny;
      const netInflowCny =
        (row.aShare.depositCny - row.aShare.withdrawalCny) * weights.aShare[id]
        + (row.usStock.depositCny - row.usStock.withdrawalCny) * weights.usStock[id]
        + (row.fund.depositCny - row.fund.withdrawalCny) * weights.fund[id];

      cumulativeByPerson[id].aSharePnlCny += aShareDailyPnlCny;
      cumulativeByPerson[id].usStockPnlCny += usStockDailyPnlCny;
      cumulativeByPerson[id].fundPnlCny += fundDailyPnlCny;
      cumulativeByPerson[id].totalPnlCny += dailyPnlCny;
      cumulativeByPerson[id].netInflowCny += netInflowCny;

      const capitalBase = numberOrZero(data.totalCapitalTargets?.[id]) + cumulativeByPerson[id].netInflowCny;
      dailyRows.push({
        date: row.date,
        personId: id,
        personName: data.fixedAllocationLabels?.[id] ?? data.people.find((person) => person.id === id)?.name ?? id,
        aShareDailyPnlCny,
        usStockDailyPnlCny,
        fundDailyPnlCny,
        dailyPnlCny,
        cumulativePnlCny: cumulativeByPerson[id].totalPnlCny,
        returnRate: safeRate(cumulativeByPerson[id].totalPnlCny, capitalBase)
      });
    }
  }

  const summary = ids.map((id) => {
    const cumulative = cumulativeByPerson[id];
    const initialCapitalCny = numberOrZero(data.totalCapitalTargets?.[id]);
    const currentAllocatedAssetsCny = initialCapitalCny + cumulative.netInflowCny + cumulative.totalPnlCny;
    return {
      personId: id,
      personName: data.fixedAllocationLabels?.[id] ?? data.people.find((person) => person.id === id)?.name ?? id,
      initialCapitalCny,
      cumulativeNetInflowCny: cumulative.netInflowCny,
      currentAllocatedAssetsCny,
      aShareCumulativePnlCny: cumulative.aSharePnlCny,
      usStockCumulativePnlCny: cumulative.usStockPnlCny,
      fundCumulativePnlCny: cumulative.fundPnlCny,
      totalPnlCny: cumulative.totalPnlCny,
      returnRate: safeRate(cumulative.totalPnlCny, initialCapitalCny + cumulative.netInflowCny)
    };
  });

  return { summary, dailyRows };
}

export function calculateDailyPerformance(input) {
  const data = structuredClone(validateInvestmentData(input));
  const accountRows = combineAccountRows(data);
  const memberRows = calculateMemberRows(data, accountRows);
  return {
    accountRows,
    memberSummary: memberRows.summary,
    memberDailyRows: memberRows.dailyRows
  };
}
