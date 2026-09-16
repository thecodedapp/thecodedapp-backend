import express from "express";
import cors from "cors";
import helmet from "helmet";

import { prisma } from "./lib/prisma";
import authRouter from "./routes/auth";
import progressRouter from "./routes/progress";

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.use("/auth", authRouter);
app.use("/progress", progressRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ ok: true, database: "ready" });
  } catch (error) {
    console.error("Readiness check failed:", error);
    return res.status(503).json({ ok: false, database: "unavailable" });
  }
});

export default app;
