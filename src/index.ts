import "dotenv/config";

import app from "./app";
import { loadConfig } from "./lib/config";

const { port } = loadConfig();

app.listen(port, "0.0.0.0", () => {
  console.log(`API running on port ${port}`);
});
