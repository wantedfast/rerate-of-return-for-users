function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function ratio(value, total) {
  return total === 0 ? 0 : numberOrZero(value) / total;
}

function sumAshareProfitBeforeDate(data, transferDate) {
  return (data.dailyBalances ?? [])
    .filter((row) => String(row.date) < transferDate)
    .reduce((sum, row) => sum + numberOrZero(row.ashareProfitCny), 0);
}

export function buildFixedAllocationRows(data, people) {
  if (!data) {
    return [];
  }

  const ashare = data.assetSnapshots?.ashare ?? {};
  const commonIds = ashare.commonPoolPersonIds ?? [];
  const openingCapital = ashare.openingCapitalCny ?? {};
  const specialCapital = ashare.specialPrincipalCny ?? {};
  const usByPerson = data.assetSnapshots?.usStock?.currentCapitalByPersonCny ?? {};
  const transferDate = ashare.commonPoolToUsStockDate;
  if (!transferDate) {
    throw new Error("assetSnapshots.ashare.commonPoolToUsStockDate is required");
  }
  if (ashare.commonPoolToUsStockCny === undefined) {
    throw new Error("assetSnapshots.ashare.commonPoolToUsStockCny is required");
  }
  const commonTotal = commonIds.reduce((sum, id) => sum + numberOrZero(openingCapital[id]), 0);
  const preTransferAsharePnl = sumAshareProfitBeforeDate(data, transferDate);
  const preTransferCommonPoolValue = commonTotal + preTransferAsharePnl;
  const commonUsPrincipal = numberOrZero(ashare.commonPoolToUsStockCny);
  const retainedAshareEquity = preTransferCommonPoolValue - commonUsPrincipal;
  const usTotal = commonUsPrincipal
    + (people ?? [])
      .filter((person) => !commonIds.includes(person.id))
      .reduce((sum, person) => sum + numberOrZero(usByPerson[person.id]), 0);
  const peopleById = Object.fromEntries((people ?? []).map((person) => [person.id, person]));
  const displayNameById = data.fixedAllocationLabels ?? {};

  const commonRows = commonIds.map((id) => {
    const commonPoolRatio = ratio(openingCapital[id], commonTotal);
    const usPrincipal = commonUsPrincipal * commonPoolRatio;
    return {
      id,
      name: displayNameById[id] ?? peopleById[id]?.name ?? id,
      commonInitialPrincipal: numberOrZero(openingCapital[id]),
      commonPoolRatio,
      preTransferAsharePnl: preTransferAsharePnl * commonPoolRatio,
      preTransferCommonPoolValue: preTransferCommonPoolValue * commonPoolRatio,
      commonPoolToUsStockCny: commonUsPrincipal * commonPoolRatio,
      transferredUsPrincipal: usPrincipal,
      retainedAshareEquity: retainedAshareEquity * commonPoolRatio,
      specialASharePrincipal: 0,
      usPrincipal,
      usRatio: ratio(usPrincipal, usTotal),
      note: "共同池内部分摊"
    };
  });

  const specialRows = (people ?? [])
    .filter((person) => !commonIds.includes(person.id))
    .map((person) => ({
      id: person.id,
      name: displayNameById[person.id] ?? person.name,
      commonInitialPrincipal: 0,
      commonPoolRatio: 0,
      preTransferAsharePnl: 0,
      preTransferCommonPoolValue: 0,
      commonPoolToUsStockCny: 0,
      transferredUsPrincipal: numberOrZero(usByPerson[person.id]),
      retainedAshareEquity: 0,
      specialASharePrincipal: numberOrZero(specialCapital[person.id]),
      usPrincipal: numberOrZero(usByPerson[person.id]),
      usRatio: ratio(usByPerson[person.id], usTotal),
      note: "专项A股 + 专项美股"
    }));

  return [
    {
      id: "common-pool-total",
      name: "三人共同池",
      commonInitialPrincipal: commonTotal,
      commonPoolRatio: commonTotal === 0 ? 0 : 1,
      preTransferAsharePnl,
      preTransferCommonPoolValue,
      commonPoolToUsStockCny: commonUsPrincipal,
      transferredUsPrincipal: commonUsPrincipal,
      retainedAshareEquity,
      specialASharePrincipal: 0,
      usPrincipal: commonUsPrincipal,
      usRatio: ratio(commonUsPrincipal, usTotal),
      note: "三人共同池总账户"
    },
    ...commonRows,
    ...specialRows
  ];
}
