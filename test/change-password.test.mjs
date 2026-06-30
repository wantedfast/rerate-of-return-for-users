import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../server/app.js";

const seedDataPath = new URL("../data/investment-data.json", import.meta.url);

async function createTempDataDirectory() {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "investment-returns-password-"));
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
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials)
  });
}

test("user can change own password and must use the new password afterwards", async () => {
  const { tempDirectory, seedContents } = await createTempDataDirectory();
  const server = await startServer(tempDirectory);

  try {
    const loginResponse = await login(server.baseUrl, {
      username: "chen",
      password: "589602",
      scope: "user"
    });
    assert.equal(loginResponse.status, 200);
    const auth = await loginResponse.json();

    const wrongCurrentResponse = await fetch(`${server.baseUrl}/api/user/password`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ currentPassword: "bad-password", newPassword: "newpass1" })
    });
    assert.equal(wrongCurrentResponse.status, 400);

    const tooShortResponse = await fetch(`${server.baseUrl}/api/user/password`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ currentPassword: "589602", newPassword: "123" })
    });
    assert.equal(tooShortResponse.status, 400);

    const changeResponse = await fetch(`${server.baseUrl}/api/user/password`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ currentPassword: "589602", newPassword: "newpass1" })
    });
    assert.equal(changeResponse.status, 200);

    const oldPasswordResponse = await login(server.baseUrl, {
      username: "chen",
      password: "589602",
      scope: "user"
    });
    assert.equal(oldPasswordResponse.status, 401);

    const newPasswordResponse = await login(server.baseUrl, {
      username: "chen",
      password: "newpass1",
      scope: "user"
    });
    assert.equal(newPasswordResponse.status, 200);

    const savedFile = JSON.parse(await fs.readFile(path.join(tempDirectory, "investment-data.json"), "utf8"));
    assert.equal(savedFile.people.find((person) => person.id === "chen").password, "newpass1");
    assert.equal(savedFile.people.find((person) => person.id === "wang").password, "589602");

    const backupEntries = await fs.readdir(path.join(tempDirectory, "backups"));
    assert.equal(backupEntries.length, 1);
    const backupContents = await fs.readFile(path.join(tempDirectory, "backups", backupEntries[0]), "utf8");
    assert.equal(backupContents, seedContents);
  } finally {
    await server.close();
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
