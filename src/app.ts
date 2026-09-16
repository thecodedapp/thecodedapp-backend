import express from "express";
import cors from "cors";
import helmet from "helmet";
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

export default app;
