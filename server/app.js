import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateAll } from "../src/shared/calculations.js";
import { InvestmentDataValidationError, validateInvestmentData } from "../src/shared/investmentData.js";
import { decodeToken, encodeToken } from "./auth.js";
import { createDataStore } from "./dataStore.js";

function requireRole(role, authSecret) {
  return (request, response, next) => {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const session = decodeToken(token, authSecret);
    if (!session || session.role !== role) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    request.session = session;
    next();
  };
}

function isValidNewPassword(value) {
  return typeof value === "string" && value.length >= 6 && value.length <= 128;
}

export function createApp(options = {}) {
  const dataDirectory = options.dataDirectory ?? fileURLToPath(new URL("../data", import.meta.url));
  const authSecret = options.authSecret ?? process.env.AUTH_SECRET ?? crypto.randomBytes(32).toString("hex");
  const store = createDataStore(dataDirectory);
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/auth/login", async (request, response) => {
    const { username, password, scope } = request.body ?? {};
    const data = await store.readData();

    if (scope === "admin" && username === data.admin?.username && password === data.admin?.password) {
      response.json({ token: encodeToken({ role: "admin", personId: "admin", name: "Admin" }, authSecret), role: "admin" });
      return;
    }

    const person = (data.people ?? []).find((item) => item.id === username && item.password === password);
    if (scope === "user" && person) {
      response.json({ token: encodeToken({ role: "user", personId: person.id, name: person.name }, authSecret), role: "user" });
      return;
    }

    response.status(401).json({ error: "Invalid credentials" });
  });

  app.get("/api/admin/data", requireRole("admin", authSecret), async (_request, response) => {
    const data = await store.readData();
    response.json({ data, calculations: calculateAll(data) });
  });

  app.put("/api/admin/data", requireRole("admin", authSecret), async (request, response) => {
    const candidateData = request.body?.data;
    if (!candidateData) {
      response.status(400).json({ error: "Invalid investment data" });
      return;
    }

    try {
      const data = validateInvestmentData(candidateData);
      const calculations = calculateAll(data);
      const { backupPath } = await store.writeData(data);
      response.json({ ok: true, backupPath, calculations });
    } catch (error) {
      if (error instanceof InvestmentDataValidationError) {
        response.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.get("/api/user/summary", requireRole("user", authSecret), async (request, response) => {
    const data = await store.readData();
    const calculations = calculateAll(data);
    const person = calculations.summary.find((row) => row.personId === request.session.personId);
    if (!person) {
      response.status(404).json({ error: "Person not found" });
      return;
    }
    response.json({ person });
  });

  app.put("/api/user/password", requireRole("user", authSecret), async (request, response) => {
    const { currentPassword, newPassword } = request.body ?? {};
    if (!isValidNewPassword(newPassword)) {
      response.status(400).json({ error: "New password must be 6-128 characters" });
      return;
    }

    const data = await store.readData();
    const personIndex = (data.people ?? []).findIndex((item) => item.id === request.session.personId);
    if (personIndex < 0) {
      response.status(404).json({ error: "Person not found" });
      return;
    }

    if (data.people[personIndex].password !== currentPassword) {
      response.status(400).json({ error: "Current password is incorrect" });
      return;
    }

    data.people[personIndex] = {
      ...data.people[personIndex],
      password: newPassword
    };

    try {
      const validatedData = validateInvestmentData(data);
      await store.writeData(validatedData);
      response.json({ ok: true });
    } catch (error) {
      if (error instanceof InvestmentDataValidationError) {
        response.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  const distDirectory = fileURLToPath(new URL("../dist", import.meta.url));
  const basePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");
  app.use(express.static(distDirectory));
  if (basePath) {
    app.use(basePath, express.static(distDirectory));
  }
  app.get(/^\/($|admin$)/, (_request, response) => {
    response.sendFile(path.join(distDirectory, "index.html"));
  });
  if (basePath) {
    const escapedBasePath = basePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    app.get(new RegExp(`^${escapedBasePath}\\/($|admin$)`), (_request, response) => {
      response.sendFile(path.join(distDirectory, "index.html"));
    });
  }

  app.use((error, _request, response, _next) => {
    if (error instanceof InvestmentDataValidationError) {
      response.status(400).json({ error: error.message });
      return;
    }

    console.error("Unhandled application error", error);
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}
