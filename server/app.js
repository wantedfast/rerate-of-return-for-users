import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateAll } from "../src/shared/calculations.js";
import { HOLDER_OPTIONS, PEOPLE } from "../src/shared/model.js";
import { attachCurrentSession, createSessionStore, requireAuth } from "./auth.js";
import { buildResultsCsv } from "./csv.js";
import { createDataStore } from "./dataStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function safeUser(user) {
  return {
    username: user.username,
    role: user.role,
    personId: user.personId ?? null,
    displayName: user.displayName ?? user.username
  };
}

function buildAdminPayload(data, users) {
  const results = calculateAll(data);
  return {
    data,
    users: users.users.map(safeUser),
    meta: {
      people: PEOPLE,
      holderOptions: HOLDER_OPTIONS
    },
    results
  };
}

async function authenticateUser(users, username, password, scope) {
  return users.users.find((user) =>
    user.username === username
    && user.password === password
    && user.role === scope
  ) ?? null;
}

export function createApp(options = {}) {
  const dataDirectory = options.dataDirectory ?? path.resolve(__dirname, "../data");
  const dataStore = options.dataStore ?? createDataStore(dataDirectory);
  const sessionStore = options.sessionStore ?? createSessionStore();
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(attachCurrentSession(sessionStore));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/auth/login", async (request, response) => {
    const { username = "", password = "", scope = "user" } = request.body ?? {};
    const users = await dataStore.readUsers();
    const matchedUser = await authenticateUser(users, username, password, scope);
    if (!matchedUser) {
      response.status(401).json({ error: "Invalid credentials." });
      return;
    }
    const token = sessionStore.create(matchedUser);
    response.json({
      token,
      user: safeUser(matchedUser)
    });
  });

  app.get("/api/auth/me", (request, response) => {
    if (!request.session) {
      response.json({ authenticated: false });
      return;
    }
    response.json({
      authenticated: true,
      user: request.session
    });
  });

  app.post("/api/auth/logout", requireAuth(sessionStore), (request, response) => {
    sessionStore.destroy(request.token);
    response.json({ ok: true });
  });

  app.get("/api/user/summary", requireAuth(sessionStore, "user"), async (request, response) => {
    const data = await dataStore.readInvestmentData();
    const summary = calculateAll(data).summary;
    const person = summary.find((row) => row.personId === request.session.personId);
    if (!person) {
      response.status(404).json({ error: "Person summary not found." });
      return;
    }
    response.json({
      person: {
        personId: person.personId,
        personName: person.personName,
        cashBalance: person.cashBalance,
        fee: person.fee,
        totalProfit: person.totalProfit,
        capital: person.capital,
        returnRate: person.returnRate
      }
    });
  });

  app.get("/api/admin/dashboard", requireAuth(sessionStore, "admin"), async (_request, response) => {
    const [data, users] = await Promise.all([
      dataStore.readInvestmentData(),
      dataStore.readUsers()
    ]);
    response.json(buildAdminPayload(data, users));
  });

  app.put("/api/admin/data", requireAuth(sessionStore, "admin"), async (request, response) => {
    const nextData = request.body?.data;
    if (!nextData) {
      response.status(400).json({ error: "Missing data payload." });
      return;
    }
    const backup = await dataStore.writeInvestmentData(nextData);
    const [savedData, users] = await Promise.all([
      dataStore.readInvestmentData(),
      dataStore.readUsers()
    ]);
    response.json({
      backupPath: backup.backupPath,
      ...buildAdminPayload(savedData, users)
    });
  });

  app.get("/api/admin/export/data", requireAuth(sessionStore, "admin"), async (_request, response) => {
    const data = await dataStore.readInvestmentData();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Disposition", "attachment; filename=\"investment-data.json\"");
    response.send(JSON.stringify(data, null, 2));
  });

  app.get("/api/admin/export/results.csv", requireAuth(sessionStore, "admin"), async (_request, response) => {
    const data = await dataStore.readInvestmentData();
    const csv = buildResultsCsv(calculateAll(data).summary);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", "attachment; filename=\"investment-results.csv\"");
    response.send(csv);
  });

  const distDirectory = path.resolve(__dirname, "../dist");
  app.use(express.static(distDirectory));
  app.get(/^\/($|admin$)/, (_request, response) => {
    response.sendFile(path.join(distDirectory, "index.html"));
  });

  return app;
}
