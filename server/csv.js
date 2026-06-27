import { roundCurrency } from "../src/shared/calculations.js";

function escapeCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function buildResultsCsv(summary) {
  const rows = [
    ["person", "aShareProfit", "fundProfit", "usProfit", "totalProfit", "capital", "returnRate"]
  ];

  for (const row of summary) {
    rows.push([
      row.personName,
      roundCurrency(row.aShareProfit).toFixed(2),
      roundCurrency(row.fundProfit).toFixed(2),
      roundCurrency(row.usProfit).toFixed(2),
      roundCurrency(row.totalProfit).toFixed(2),
      roundCurrency(row.capital).toFixed(2),
      row.returnRate === null ? "--" : (row.returnRate * 100).toFixed(2)
    ]);
  }

  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}
