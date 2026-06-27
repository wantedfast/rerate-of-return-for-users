export function inputNumberValue(value, options = {}) {
  if (value === "") {
    return "";
  }
  if (options.emptyZero && value === 0) {
    return "";
  }
  return String(value);
}

export function isDecimalInputText(value) {
  return /^-?\d*(?:\.\d*)?$/.test(String(value));
}
