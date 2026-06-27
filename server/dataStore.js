import fs from "node:fs/promises";
import path from "node:path";
import { normalizeInvestmentData } from "../src/shared/calculations.js";

async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export function createDataStore(dataDirectory) {
  const investmentDataPath = path.join(dataDirectory, "investment-data.json");
  const usersPath = path.join(dataDirectory, "users.json");
  const backupsDirectory = path.join(dataDirectory, "backups");

  return {
    async readUsers() {
      return readJson(usersPath);
    },
    async readInvestmentData() {
      return normalizeInvestmentData(await readJson(investmentDataPath));
    },
    async writeInvestmentData(nextData) {
      await ensureDirectory(backupsDirectory);
      const current = await fs.readFile(investmentDataPath, "utf8");
      const backupName = `investment-data-${new Date().toISOString().replaceAll(":", "-")}.json`;
      await fs.writeFile(path.join(backupsDirectory, backupName), current, "utf8");
      const payload = JSON.stringify(normalizeInvestmentData(nextData), null, 2);
      await fs.writeFile(investmentDataPath, payload, "utf8");
      return { backupPath: path.join(backupsDirectory, backupName) };
    },
    paths: {
      investmentDataPath,
      usersPath,
      backupsDirectory
    }
  };
}

