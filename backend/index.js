require("dotenv").config();
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
});
