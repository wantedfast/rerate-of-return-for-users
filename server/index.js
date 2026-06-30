import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const app = createApp({ dataDirectory: process.env.DATA_DIR });

app.listen(port, "127.0.0.1", () => {
  console.log(`API server listening on http://127.0.0.1:${port}`);
});
