import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../server/app.js";
import { roundCurrency } from "../src/shared/calculations.js";

const seedDataPath = new URL("../data/investment-data.json", import.meta.url);

async function createTempDataDirectory() {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "investment-returns-mvp-"));
  const seedContents = await fs.readFile(seedDataPath, "utf8");
  await fs.writeFile(path.join(tempDirectory, "investment-data.json"), seedContents, "utf8");
  return { tempDirectory, seedContents };
}

async function startServer(dataDirectory) {
  const app = createApp({ dataDirectory, authSecret: "test-secret" });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function login(baseUrl, credentials) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials)
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("user summary endpoint only returns the authenticated participant and rejects forged tokens", async () => {
  const { tempDirectory } = await createTempDataDirectory();
  const server = await startServer(tempDirectory);

  try {
    const auth = await login(server.baseUrl, {
      username: "wang",
      password: "589602",
      scope: "user"
    });

    const response = await fetch(`${server.baseUrl}/api/user/summary`, {
      headers: { authorization: `Bearer ${auth.token}` }
    });
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(Object.keys(body), ["person"]);
    assert.equal(body.person.personId, "wang");
    assert.equal(body.person.name, "王欣隆");
    assert.equal(roundCurrency(body.person.capital), 20836.37);
    assert.equal(roundCurrency(body.person.aShareProfit), -517.63);
    assert.equal(roundCurrency(body.person.usProfit), -792.75);
    assert.equal(roundCurrency(body.person.fundProfit), -34.54);
    assert.equal(roundCurrency(body.person.totalProfit), -1344.92);
    assert.equal(roundCurrency(body.person.returnRate * 100), -6.45);
    assert.equal(Object.hasOwn(body.person, "currentAllocatedAssetsCny"), false);
    assert.equal(Object.hasOwn(body.person, "cumulativeNetInflowCny"), false);

    const forgedToken = Buffer.from(JSON.stringify({ role: "user", personId: "sugar", name: "Sugar" }), "utf8").toString("base64url");
    const forgedResponse = await fetch(`${server.baseUrl}/api/user/summary`, {
      headers: { authorization: `Bearer ${forgedToken}` }
    });
    assert.equal(forgedResponse.status, 401);
  } finally {
    await server.close();
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("admin save creates a backup before replacing data and rejects invalid payloads without mutating persistence", async () => {
  const { tempDirectory, seedContents } = await createTempDataDirectory();
  const server = await startServer(tempDirectory);

  try {
    const auth = await login(server.baseUrl, {
      username: "admin",
      password: "admin123",
      scope: "admin"
    });

    const updatedData = JSON.parse(seedContents);
    updatedData.fees.wang = 25.5;

    const saveResponse = await fetch(`${server.baseUrl}/api/admin/data`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ data: updatedData })
    });
    assert.equal(saveResponse.status, 200);

    const savedFile = JSON.parse(await fs.readFile(path.join(tempDirectory, "investment-data.json"), "utf8"));
    assert.equal(savedFile.fees.wang, 25.5);
    assert.equal(Object.hasOwn(savedFile.assetSnapshots.usStock, "earlyRealizedOwnerId"), false);

    const backupDirectory = path.join(tempDirectory, "backups");
    const backupEntries = await fs.readdir(backupDirectory);
    assert.equal(backupEntries.length, 1);

    const backupContents = await fs.readFile(path.join(backupDirectory, backupEntries[0]), "utf8");
    assert.equal(backupContents, seedContents);

    const invalidData = JSON.parse(JSON.stringify(updatedData));
    delete invalidData.assetSnapshots.usStock.currentCapitalByPersonCny.sugar;

    const invalidResponse = await fetch(`${server.baseUrl}/api/admin/data`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ data: invalidData })
    });
    assert.equal(invalidResponse.status, 400);

    const backupEntriesAfterFailure = await fs.readdir(backupDirectory);
    assert.equal(backupEntriesAfterFailure.length, 1);

    const fileAfterFailure = JSON.parse(await fs.readFile(path.join(tempDirectory, "investment-data.json"), "utf8"));
    assert.equal(fileAfterFailure.fees.wang, 25.5);
  } finally {
    await server.close();
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
