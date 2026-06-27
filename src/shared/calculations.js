import { blankByPerson, listPersonIds, validateInvestmentData } from "./investmentData.js";

export function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function commonPoolWeights(data) {
  const opening = data.assetSnapshots?.ashare?.openingCapitalCny ?? {};
  const configuredIds = data.assetSnapshots?.ashare?.commonPoolPersonIds;
  const commonIds = (Array.isArray(configuredIds) && configuredIds.length > 0 ? configuredIds : listPersonIds(data))
    .filter((id) => numberOrZero(opening[id]) > 0);
  const total = commonIds.reduce((sum, id) => sum + numberOrZero(opening[id]), 0);
  return Object.fromEntries(commonIds.map((id) => [id, total ? numberOrZero(opening[id]) / total : 0]));
}

function applyFlowToBalances(data, balances, flow) {
  const amount = numberOrZero(flow.amountCny);
  if (flow.personId === "common") {
    const weights = commonPoolWeights(data);
    for (const [id, weight] of Object.entries(weights)) {
      balances[id] = numberOrZero(balances[id]) + amount * weight;
    }
    return;
  }
  balances[flow.personId] = numberOrZero(balances[flow.personId]) + amount;
}

function calculateAshareTimelineInternal(data) {
  const balances = { ...blankByPerson(data), ...(data.assetSnapshots?.ashare?.openingCapitalCny ?? {}) };
  const profitByPerson = blankByPerson(data);
  const sortedRows = [...(data.dailyBalances ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const flows = (data.flows ?? []).filter((flow) => flow.asset === "ashare");
  const rows = [];

  for (const row of sortedRows) {
    for (const flow of flows.filter((item) => item.date === row.date && item.timing === "pre")) {
      applyFlowToBalances(data, balances, flow);
    }

    const totalBalance = Object.values(balances).reduce((sum, value) => sum + numberOrZero(value), 0);
    const profit = numberOrZero(row.ashareProfitCny);
    const allocations = blankByPerson(data);

    if (totalBalance !== 0 && profit !== 0) {
      for (const id of listPersonIds(data)) {
        allocations[id] = profit * numberOrZero(balances[id]) / totalBalance;
        profitByPerson[id] += allocations[id];
      }
    }

    rows.push({
      date: row.date,
      profit,
      preProfitBalances: { ...balances },
      allocations
    });

    for (const id of listPersonIds(data)) {
      balances[id] = numberOrZero(balances[id]) + numberOrZero(allocations[id]);
    }

    for (const flow of flows.filter((item) => item.date === row.date && item.timing === "post")) {
      applyFlowToBalances(data, balances, flow);
    }
  }

  return {
    rows,
    endingCapitalByPerson: balances,
    profitByPerson
  };
}

function calculateFundInternal(data) {
  const fund = data.assetSnapshots?.fund ?? {};
  const capitalByPerson = blankByPerson(data);
  const profitByPerson = blankByPerson(data);
  const ownerId = fund.ownerId ?? "wang";
  capitalByPerson[ownerId] = numberOrZero(fund.principalCny);
  profitByPerson[ownerId] = numberOrZero(fund.currentAssetCny) - numberOrZero(fund.principalCny);
  return { capitalByPerson, profitByPerson };
}

function calculateUsStockInternal(data) {
  const us = data.assetSnapshots?.usStock ?? {};
  const rate = numberOrZero(us.jpyCnyRate);
  const capitalByPerson = blankByPerson(data);
  const profitByPerson = blankByPerson(data);
  for (const id of listPersonIds(data)) {
    capitalByPerson[id] = numberOrZero(us.currentCapitalByPersonCny?.[id]);
  }

  if (Object.hasOwn(profitByPerson, "sugar")) {
    profitByPerson.sugar += numberOrZero(us.earlyRealizedPnlJpy) * rate;
  }

  const laterProfitCny = (numberOrZero(us.laterRealizedPnlJpy) + numberOrZero(us.floatingPnlJpy)) * rate;
  const laterCapitalTotal = Object.values(capitalByPerson).reduce((sum, value) => sum + numberOrZero(value), 0);
  if (laterCapitalTotal !== 0) {
    for (const id of listPersonIds(data)) {
      profitByPerson[id] += laterProfitCny * capitalByPerson[id] / laterCapitalTotal;
    }
  }

  return { capitalByPerson, profitByPerson };
}

export function calculateAshareTimeline(input) {
  return calculateAshareTimelineInternal(structuredClone(validateInvestmentData(input)));
}

export function calculateFund(input) {
  return calculateFundInternal(structuredClone(validateInvestmentData(input)));
}

export function calculateUsStock(input) {
  return calculateUsStockInternal(structuredClone(validateInvestmentData(input)));
}

export function calculateAll(input) {
  const data = structuredClone(validateInvestmentData(input));
  const aShare = calculateAshareTimelineInternal(data);
  const usStock = calculateUsStockInternal(data);
  const fund = calculateFundInternal(data);
  const summary = (data.people ?? []).map((person) => {
    const cashBalance = numberOrZero(data.cashBalances?.[person.id]);
    const fee = numberOrZero(data.fees?.[person.id]);
    const calculatedCapital =
      numberOrZero(aShare.endingCapitalByPerson[person.id]) +
      numberOrZero(usStock.capitalByPerson[person.id]) +
      numberOrZero(fund.capitalByPerson[person.id]);
    const capital = Number.isFinite(data.totalCapitalTargets?.[person.id])
      ? numberOrZero(data.totalCapitalTargets[person.id])
      : calculatedCapital;
    const aShareProfit = numberOrZero(aShare.profitByPerson[person.id]);
    const usProfit = numberOrZero(usStock.profitByPerson[person.id]);
    const fundProfit = numberOrZero(fund.profitByPerson[person.id]);
    const totalProfit = aShareProfit + usProfit + fundProfit + cashBalance - fee;

    return {
      personId: person.id,
      name: person.name,
      capital,
      aShareCapital: numberOrZero(aShare.endingCapitalByPerson[person.id]),
      aShareProfit,
      usProfit,
      fundProfit,
      cashBalance,
      fee,
      totalProfit,
      returnRate: capital ? totalProfit / capital : 0
    };
  });

  const totals = summary.reduce((acc, row) => {
    acc.capital += row.capital;
    acc.aShareProfit += row.aShareProfit;
    acc.usProfit += row.usProfit;
    acc.fundProfit += row.fundProfit;
    acc.cashBalance += row.cashBalance;
    acc.fee += row.fee;
    acc.totalProfit += row.totalProfit;
    return acc;
  }, { capital: 0, aShareProfit: 0, usProfit: 0, fundProfit: 0, cashBalance: 0, fee: 0, totalProfit: 0 });

  return {
    summary,
    totals,
    aShareTimeline: aShare.rows,
    inputs: data
  };
}
