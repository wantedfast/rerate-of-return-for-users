function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const flowEndingAdjustments = {
  aShare: {
    endingField: "endingAssetsCny",
    fields: {
      externalDepositCny: 1,
      externalWithdrawalCny: -1,
      transferInCny: 1,
      transferOutCny: -1
    }
  },
  usStock: {
    endingField: "endingAssetsJpy",
    fields: {
      externalDepositJpy: 1,
      externalWithdrawalJpy: -1,
      transferInJpy: 1,
      transferOutJpy: -1
    }
  },
  fund: {
    endingField: "endingAssetsCny",
    fields: {
      externalDepositCny: 1,
      externalWithdrawalCny: -1,
      transferInCny: 1,
      transferOutCny: -1
    }
  }
};

function addDecimalDelta(value, delta) {
  const next = numberOrZero(value) + delta;
  return Math.round((next + Number.EPSILON) * 1e10) / 1e10;
}

export function updateDailySnapshotDraftField(draft, assetKey, field, value) {
  const currentAsset = draft[assetKey] ?? {};
  const nextAsset = {
    ...currentAsset,
    [field]: value
  };
  const adjustment = flowEndingAdjustments[assetKey];
  const direction = adjustment?.fields[field];

  if (direction) {
    const oldValue = numberOrZero(currentAsset[field]);
    const newValue = numberOrZero(value);
    const delta = (newValue - oldValue) * direction;
    nextAsset[adjustment.endingField] = addDecimalDelta(currentAsset[adjustment.endingField], delta);
  }

  return {
    ...draft,
    [assetKey]: nextAsset
  };
}
