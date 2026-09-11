import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRouter from "./routes/auth";

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.use("/auth", authRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});