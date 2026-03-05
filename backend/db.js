const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Open the database file
const db = new sqlite3.Database(
  path.join(__dirname, "recruitment.db"),
  (err) => {
    if (err) console.error("❌ Failed to open database:", err.message);
  }
);

// ─── Promise helpers ──────────────────────────────────────────────────────────

/** Run a SELECT that returns multiple rows */
function getAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/** Run a SELECT that returns a single row (or undefined) */
function getOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/** Run an INSERT / UPDATE / DELETE — resolves with { lastID, changes } */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ─── Schema + seed (serialized so CREATE TABLE finishes before SELECT) ────────

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      status TEXT DEFAULT 'uploaded',
      bolna_call_id TEXT,
      years_of_experience INTEGER,
      recent_role TEXT,
      skill_rating INTEGER,
      notice_period TEXT,
      notice_flexible INTEGER,
      expected_ctc TEXT,
      location_comfortable INTEGER,
      call_completed INTEGER,
      candidate_available INTEGER,
      fit_score INTEGER,
      recommendation TEXT,
      notes TEXT,
      transcript TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      screened_at DATETIME
    )
  `, (err) => {
    if (err) {
      console.error("❌ Failed to create table:", err.message);
      return;
    }

    // Seed only if the table is empty
    db.get("SELECT COUNT(*) as cnt FROM candidates", (err, row) => {
      if (err) { console.error("❌ Seed check failed:", err.message); return; }
      if (row.cnt === 0) {
        const sql = "INSERT INTO candidates (name, phone, email) VALUES (?, ?, ?)";
        db.run(sql, ["Priya Sharma", "+911234567890", "priya@test.com"]);
        db.run(sql, ["Rahul Mehta", "+919876543210", "rahul@test.com"]);
        db.run(sql, ["Anita Rao", "+911122334455", "anita@test.com"]);
        console.log("✅ Seeded 3 test candidates");
      }
    });
  });
});

module.exports = { db, getAll, getOne, run };
