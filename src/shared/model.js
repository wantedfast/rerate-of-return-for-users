export const PEOPLE = [
  { id: "wang", name: "王欣隆" },
  { id: "chen", name: "chen" },
  { id: "nanjing", name: "南京哥" },
  { id: "garlicm", name: "garlicm" },
  { id: "sugar", name: "糖" }
];

export const PERSON_IDS = PEOPLE.map((person) => person.id);

export const PERSON_NAME_BY_ID = Object.fromEntries(
  PEOPLE.map((person) => [person.id, person.name])
);

export const ASSET_TYPES = ["ashare", "us", "fund"];
export const FLOW_TYPES = ["deposit", "withdrawal"];
export const FLOW_TIMINGS = ["pre", "post"];

export const ASSET_LABEL = {
  ashare: "A股",
  us: "美股",
  fund: "基金"
};

export const FLOW_TYPE_LABEL = {
  deposit: "入金",
  withdrawal: "出金"
};

export const FLOW_TIMING_LABEL = {
  pre: "盘前",
  post: "盘后"
};

export const HOLDER_OPTIONS = [
  ...PEOPLE.map((person) => ({
    value: person.id,
    label: person.name,
    holderType: "person",
    holderId: person.id
  })),
  {
    value: "common",
    label: "三人共同池",
    holderType: "pool",
    holderId: "common"
  }
];

const commonPrincipal = {
  wang: 14136.37,
  chen: 5000,
  nanjing: 7000
};

const commonTotal = Object.values(commonPrincipal).reduce((sum, value) => sum + value, 0);

export const COMMON_POOL_ID = "common";
export const COMMON_POOL_MEMBERS = Object.keys(commonPrincipal);
export const COMMON_POOL_RATIO = Object.fromEntries(
  Object.entries(commonPrincipal).map(([personId, principal]) => [personId, principal / commonTotal])
);

export const ASSET_CURRENCY = {
  ashare: "CNY",
  fund: "CNY",
  us: "JPY"
};
