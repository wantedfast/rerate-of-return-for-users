import { defaultData } from "./defaultData.js";

const STORAGE_KEY = "investment-returns-mvp:data:v1";

export function loadData() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultData);
  try {
    return { ...structuredClone(defaultData), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultData);
  }
}

export function saveData(data) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearData() {
  window.localStorage.removeItem(STORAGE_KEY);
}
