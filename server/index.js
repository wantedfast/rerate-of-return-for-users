import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3001);
const dataDirectory = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "../data");

const app = createApp({ dataDirectory });

app.listen(port, "127.0.0.1", () => {
  console.log(`Investment backend listening on http://127.0.0.1:${port}`);
});

