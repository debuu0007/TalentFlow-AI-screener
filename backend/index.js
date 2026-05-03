const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database (side effect: creates tables + seeds data)
require("./db");

// Routes
const candidatesRouter = require("./routes/candidates");
const webhookRouter = require("./routes/webhook");

app.use("/api/candidates", candidatesRouter);
app.use("/api/webhook", webhookRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  console.log("✅ Database initialized");
  const bolnaOk = Boolean(
    process.env.BOLNA_API_KEY?.trim() && process.env.BOLNA_AGENT_ID?.trim()
  );
  console.log(
    bolnaOk
      ? "✅ Bolna env: BOLNA_API_KEY and BOLNA_AGENT_ID loaded from backend/.env"
      : "⚠️  Bolna env missing: set BOLNA_API_KEY and BOLNA_AGENT_ID in backend/.env (Screen Now will fail until fixed)"
  );
});
