import {
  ASSET_CURRENCY,
  ASSET_TYPES,
  COMMON_POOL_ID,
  COMMON_POOL_MEMBERS,
  COMMON_POOL_RATIO,
  PERSON_IDS,
  PERSON_NAME_BY_ID
} from "./model.js";

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function zeroByPerson() {
  return Object.fromEntries(PERSON_IDS.map((personId) => [personId, 0]));
}

function cloneByPerson(source) {
  return Object.fromEntries(PERSON_IDS.map((personId) => [personId, source[personId] ?? 0]));
}

function compareDate(a, b) {
  return String(a).localeCompare(String(b));
}

export function roundCurrency(value) {
  return Math.round((numberOrZero(value) + Number.EPSILON) * 100) / 100;
}

function normalizeByPerson(source = {}) {
  return Object.fromEntries(PERSON_IDS.map((personId) => [personId, numberOrZero(source[personId])]));
}

export function normalizeInvestmentData(input = {}) {
  const assetSnapshots = input.assetSnapshots ?? {};
  return {
    cashBalances: normalizeByPerson(input.cashBalances),
    fees: normalizeByPerson(input.fees),
    assetSnapshots: {
      usStock: {
        principalJpy: numberOrZero(assetSnapshots.usStock?.principalJpy),
        currentAssetJpy: numberOrZero(assetSnapshots.usStock?.currentAssetJpy),
        jpyCnyRate: numberOrZero(assetSnapshots.usStock?.jpyCnyRate)
      },
      fund: {
        principalCny: numberOrZero(assetSnapshots.fund?.principalCny),
        currentAssetCny: numberOrZero(assetSnapshots.fund?.currentAssetCny)
      },
      aShareDaily: [...(assetSnapshots.aShareDaily ?? [])]
        .map((row, index) => ({
          id: row.id ?? `a-share-${index + 1}`,
          date: String(row.date ?? ""),
          totalCny: row.totalCny === undefined ? null : numberOrZero(row.totalCny),
          profit: row.profit === undefined ? null : numberOrZero(row.profit)
        }))
        .filter((row) => row.date)
        .sort((a, b) => compareDate(a.date, b.date))
    },
    flows: [...(input.flows ?? [])]
      .map((flow, index) => {
        const holderValue = String(flow.holder ?? flow.holderId ?? "");
        const holderType = holderValue === COMMON_POOL_ID || flow.holderType === "pool" ? "pool" : "person";
        return {
          id: flow.id ?? `flow-${index + 1}`,
          date: String(flow.date ?? ""),
          assetType: String(flow.assetType ?? "ashare"),
          type: String(flow.type ?? "deposit"),
          amount: numberOrZero(flow.amount),
          timing: String(flow.timing ?? "pre"),
          holderType,
          holderId: holderType === "pool" ? COMMON_POOL_ID : holderValue
        };
      })
      .filter((flow) => flow.date && flow.holderId && ASSET_TYPES.includes(flow.assetType))
      .sort((a, b) => compareDate(a.date, b.date) || String(a.id).localeCompare(String(b.id)))
  };
}

export function getRecordDates(data) {
  return [...new Set((data.assetSnapshots.aShareDaily ?? []).map((row) => row.date))].sort(compareDate);
}

export function resolveEffectiveDate(flow, recordDates) {
  if (!recordDates.length) {
    return null;
  }
  const targetIndex = flow.timing === "post"
    ? recordDates.findIndex((date) => compareDate(date, flow.date) > 0)
    : recordDates.findIndex((date) => compareDate(date, flow.date) >= 0);
  return targetIndex === -1 ? null : recordDates[targetIndex];
}

function signedFlowAmount(flow) {
  return flow.type === "withdrawal" ? -numberOrZero(flow.amount) : numberOrZero(flow.amount);
}

function buildFlowBreakdown(flow) {
  const signedAmount = signedFlowAmount(flow);
  if (flow.holderType === "pool") {
    return PERSON_IDS.map((personId) => ({
      personId,
      amount: COMMON_POOL_RATIO[personId] ? signedAmount * COMMON_POOL_RATIO[personId] : 0
    })).filter((row) => row.amount !== 0);
  }
  return [{ personId: flow.holderId, amount: signedAmount }];
}

export function getEffectiveFlows(input) {
  const data = normalizeInvestmentData(input);
  const recordDates = getRecordDates(data);
  return data.flows
    .map((flow) => ({
      ...flow,
      effectiveDate: resolveEffectiveDate(flow, recordDates),
      currency: ASSET_CURRENCY[flow.assetType] ?? "CNY",
      personBreakdown: buildFlowBreakdown(flow)
    }))
    .filter((flow) => flow.effectiveDate);
}

function allocatePoolDeposit(balances, signedAmount) {
  for (const personId of COMMON_POOL_MEMBERS) {
    balances[personId] += signedAmount * (COMMON_POOL_RATIO[personId] ?? 0);
  }
}

function allocatePoolWithdrawal(balances, signedAmount) {
  for (const personId of COMMON_POOL_MEMBERS) {
    balances[personId] += signedAmount * (COMMON_POOL_RATIO[personId] ?? 0);
  }
}

function applyAshareFlow(balances, flow) {
  const signedAmount = signedFlowAmount(flow);
  if (flow.holderType === "pool") {
    if (signedAmount >= 0) {
      allocatePoolDeposit(balances, signedAmount);
    } else {
      allocatePoolWithdrawal(balances, signedAmount);
    }
    return;
  }
  balances[flow.holderId] += signedAmount;
}

export function calculateAshareTimeline(input) {
  const data = normalizeInvestmentData(input);
  const groupedFlows = new Map();
  for (const flow of data.flows.filter((item) => item.assetType === "ashare")) {
    const list = groupedFlows.get(flow.date) ?? [];
    list.push(flow);
    groupedFlows.set(flow.date, list);
  }

  const balances = zeroByPerson();
  const profitByPerson = zeroByPerson();
  const rows = [];
  let previousTotal = 0;

  for (const row of data.assetSnapshots.aShareDaily) {
    const flows = groupedFlows.get(row.date) ?? [];
    const deposits = flows.filter((flow) => flow.type === "deposit").reduce((sum, flow) => sum + numberOrZero(flow.amount), 0);
    const withdrawals = flows.filter((flow) => flow.type === "withdrawal").reduce((sum, flow) => sum + numberOrZero(flow.amount), 0);
    const dailyProfit = row.totalCny === null
      ? numberOrZero(row.profit)
      : numberOrZero(row.totalCny) - previousTotal - deposits + withdrawals;

    for (const flow of flows.filter((item) => item.timing === "pre")) {
      applyAshareFlow(balances, flow);
    }

    const preBalances = cloneByPerson(balances);
    const preTotal = PERSON_IDS.reduce((sum, personId) => sum + balances[personId], 0);
    const allocations = zeroByPerson();

    for (const personId of PERSON_IDS) {
      const allocation = preTotal === 0 ? 0 : dailyProfit * (balances[personId] / preTotal);
      allocations[personId] = allocation;
      profitByPerson[personId] += allocation;
      balances[personId] += allocation;
    }

    for (const flow of flows.filter((item) => item.timing === "post")) {
      applyAshareFlow(balances, flow);
    }

    rows.push({
      id: row.id,
      date: row.date,
      dailyProfit,
      totalCny: row.totalCny,
      deposits,
      withdrawals,
      preTotal,
      preBalances,
      allocations
    });

    previousTotal = row.totalCny === null
      ? previousTotal + deposits - withdrawals + dailyProfit
      : numberOrZero(row.totalCny);
  }

  return {
    byPerson: profitByPerson,
    finalBalances: balances,
    rows
  };
}

export function calculateAssetCapital(input, assetType) {
  const data = normalizeInvestmentData(input);
  const capital = zeroByPerson();
  const rate = assetType === "us" ? numberOrZero(data.assetSnapshots.usStock.jpyCnyRate) : 1;
  for (const flow of getEffectiveFlows(data)) {
    if (flow.assetType !== assetType) {
      continue;
    }
    for (const row of flow.personBreakdown) {
      capital[row.personId] += row.amount * rate;
    }
  }
  return capital;
}

function allocateProfit(totalProfit, capitalByPerson) {
  const totalCapital = PERSON_IDS.reduce((sum, personId) => sum + Math.max(0, capitalByPerson[personId]), 0);
  const profitByPerson = zeroByPerson();
  for (const personId of PERSON_IDS) {
    profitByPerson[personId] = totalCapital === 0 ? 0 : totalProfit * (Math.max(0, capitalByPerson[personId]) / totalCapital);
  }
  return profitByPerson;
}

export function calculateFund(input) {
  const data = normalizeInvestmentData(input);
  const capitalByPerson = calculateAssetCapital(data, "fund");
  const totalProfit = numberOrZero(data.assetSnapshots.fund.currentAssetCny) - numberOrZero(data.assetSnapshots.fund.principalCny);
  return {
    byPerson: allocateProfit(totalProfit, capitalByPerson),
    capitalByPerson,
    totalProfit
  };
}

export function calculateUsStocks(input) {
  const data = normalizeInvestmentData(input);
  const capitalByPerson = calculateAssetCapital(data, "us");
  const totalProfit = (
    numberOrZero(data.assetSnapshots.usStock.currentAssetJpy) - numberOrZero(data.assetSnapshots.usStock.principalJpy)
  ) * numberOrZero(data.assetSnapshots.usStock.jpyCnyRate);
  return {
    byPerson: allocateProfit(totalProfit, capitalByPerson),
    capitalByPerson,
    totalProfit
  };
}

export function calculateSummary(input) {
  const data = normalizeInvestmentData(input);
  const ashare = calculateAshareTimeline(data);
  const fund = calculateFund(data);
  const us = calculateUsStocks(data);
  const capitalByAsset = {
    ashare: calculateAssetCapital(data, "ashare"),
    fund: fund.capitalByPerson,
    us: us.capitalByPerson
  };

  return PERSON_IDS.map((personId) => {
    const aShareProfit = ashare.byPerson[personId] ?? 0;
    const fundProfit = fund.byPerson[personId] ?? 0;
    const usProfit = us.byPerson[personId] ?? 0;
    const cashBalance = data.cashBalances[personId] ?? 0;
    const fee = data.fees[personId] ?? 0;
    const investmentProfit = aShareProfit + fundProfit + usProfit;
    const totalProfit = investmentProfit - fee;
    const capital = capitalByAsset.ashare[personId] + capitalByAsset.fund[personId] + capitalByAsset.us[personId] + cashBalance;
    return {
      personId,
      personName: PERSON_NAME_BY_ID[personId] ?? personId,
      aShareProfit,
      fundProfit,
      usProfit,
      cashBalance,
      fee,
      investmentProfit,
      totalProfit,
      capital,
      returnRate: capital === 0 ? null : totalProfit / capital
    };
  });
}

export function calculateAll(input) {
  const data = normalizeInvestmentData(input);
  const summary = calculateSummary(data);
  const ashare = calculateAshareTimeline(data);
  const fund = calculateFund(data);
  const us = calculateUsStocks(data);
  const effectiveFlows = getEffectiveFlows(data).map((flow) => ({
    ...flow,
    holder: flow.holderType === "pool" ? `${flow.holderId}-pool` : flow.holderId,
    personBreakdown: flow.personBreakdown.map((row) => ({
      ...row,
      personName: PERSON_NAME_BY_ID[row.personId] ?? row.personId
    }))
  }));

  const totals = summary.reduce(
    (acc, row) => {
      acc.aShareProfit += row.aShareProfit;
      acc.fundProfit += row.fundProfit;
      acc.usProfit += row.usProfit;
      acc.cashBalance += row.cashBalance;
      acc.fee += row.fee;
      acc.totalProfit += row.totalProfit;
      acc.capital += row.capital;
      return acc;
    },
    { aShareProfit: 0, fundProfit: 0, usProfit: 0, cashBalance: 0, fee: 0, totalProfit: 0, capital: 0 }
  );

  return {
    data,
    summary,
    totals,
    splits: {
      ashare: {
        byPerson: ashare.byPerson,
        finalBalances: ashare.finalBalances,
        rows: ashare.rows,
        capitalByPerson: calculateAssetCapital(data, "ashare")
      },
      fund: {
        byPerson: fund.byPerson,
        capitalByPerson: fund.capitalByPerson,
        totalProfit: fund.totalProfit
      },
      us: {
        byPerson: us.byPerson,
        capitalByPerson: us.capitalByPerson,
        totalProfit: us.totalProfit
      }
    },
    flowDetails: effectiveFlows
  };
}
