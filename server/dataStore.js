import fs from "node:fs/promises";
import path from "node:path";

export function createDataStore(dataDirectory) {
  const dataPath = path.join(dataDirectory, "investment-data.json");
  const backupDirectory = path.join(dataDirectory, "backups");

  async function readData() {
    return JSON.parse(await fs.readFile(dataPath, "utf8"));
  }

  async function writeData(data) {
    await fs.mkdir(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDirectory, `investment-data-${timestamp}.json`);
    const current = await fs.readFile(dataPath, "utf8");
    const next = `${JSON.stringify(data, null, 2)}\n`;
    const tempPath = path.join(dataDirectory, `investment-data.${timestamp}.tmp`);

    await fs.writeFile(backupPath, current, "utf8");
    await fs.writeFile(tempPath, next, "utf8");
    await fs.copyFile(tempPath, dataPath);
    await fs.unlink(tempPath);
    return { backupPath };
  }

  return { readData, writeData, dataPath, backupDirectory };
}
