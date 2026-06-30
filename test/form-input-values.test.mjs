import assert from "node:assert/strict";
import test from "node:test";
import { inputNumberValue, isDecimalInputText } from "../src/shared/formInputValues.js";

test("amount inputs can hide default zero without adding a leading zero while typing", () => {
  assert.equal(inputNumberValue(0, { emptyZero: true }), "");
  assert.equal(inputNumberValue("24000", { emptyZero: true }), "24000");
});

test("decimal rate inputs preserve raw editing text", () => {
  assert.equal(inputNumberValue(0.042), "0.042");
  assert.equal(inputNumberValue("0."), "0.");
  assert.equal(inputNumberValue("0.05"), "0.05");
});

test("decimal input text accepts editing states and rejects invalid text", () => {
  assert.equal(isDecimalInputText(""), true);
  assert.equal(isDecimalInputText("."), true);
  assert.equal(isDecimalInputText("0."), true);
  assert.equal(isDecimalInputText("900."), true);
  assert.equal(isDecimalInputText("900.5"), true);
  assert.equal(isDecimalInputText("900.55"), true);
  assert.equal(isDecimalInputText("0.01"), true);
  assert.equal(isDecimalInputText("0.05"), true);
  assert.equal(isDecimalInputText("-12.34"), true);
  assert.equal(isDecimalInputText("abc"), false);
  assert.equal(isDecimalInputText("12a"), false);
  assert.equal(isDecimalInputText("1.2.3"), false);
});
