const express = require("express");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { scrapeAll } = require("./scraper");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "tournaments.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function loadTournaments() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTournaments(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let lastUpdated = null;
let isRefreshing = false;

// ─── REFRESH FUNCTION ─────────────────────────────────────────────────────────
async function refreshData() {
  if (isRefreshing) return;
  isRefreshing = true;
  console.log("🔄 Starting tournament data refresh...");

  try {
    const scraped = await scrapeAll();

    if (scraped.length > 0) {
      // Merge with existing: scraped data takes priority, keep manually-added entries
      const existing = loadTournaments();
      const manualEntries = existing.filter((t) => t.id?.startsWith("manual-"));
      const merged = [...scraped, ...manualEntries];
      saveTournaments(merged);
      lastUpdated = new Date().toISOString();
      console.log(`✅ Saved ${merged.length} tournaments (${scraped.length} scraped, ${manualEntries.length} manual)`);
    } else {
      // Scraping got nothing — keep existing data, just update timestamp
      console.log("⚠️  Scraping returned 0 results. Keeping existing data.");
      lastUpdated = new Date().toISOString();
    }
  } catch (err) {
    console.error("❌ Refresh failed:", err.message);
  } finally {
    isRefreshing = false;
  }
}

// ─── API ROUTES ───────────────────────────────────────────────────────────────

// GET all tournaments (with optional filters)
app.get("/api/tournaments", (req, res) => {
  let tournaments = loadTournaments();
  const { assoc, age, state, from, to, maxFee } = req.query;

  if (assoc && assoc !== "All") tournaments = tournaments.filter((t) => t.association === assoc);
  if (age && age !== "All") tournaments = tournaments.filter((t) => t.ages?.includes(age));
  if (state) tournaments = tournaments.filter((t) => t.state?.toUpperCase() === state.toUpperCase());
  if (from) tournaments = tournaments.filter((t) => t.date >= from);
  if (to) tournaments = tournaments.filter((t) => t.date <= to);
  if (maxFee) tournaments = tournaments.filter((t) => !t.fee || t.fee <= parseInt(maxFee));

  tournaments.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  res.json({
    tournaments,
    total: tournaments.length,
    lastUpdated,
    isRefreshing,
  });
});

// GET status / health check
app.get("/api/status", (req, res) => {
  const tournaments = loadTournaments();
  res.json({
    status: "ok",
    totalTournaments: tournaments.length,
    lastUpdated,
    isRefreshing,
    nextRefresh: "Daily at 3:00 AM UTC",
  });
});

// POST manually trigger a refresh (admin use)
app.post("/api/refresh", async (req, res) => {
  const key = req.headers["x-admin-key"];
  if (key !== (process.env.ADMIN_KEY || "ztprospects2025")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({ message: "Refresh started" });
  refreshData(); // run in background
});

// POST add a tournament manually
app.post("/api/tournaments", (req, res) => {
  const key = req.headers["x-admin-key"];
  if (key !== (process.env.ADMIN_KEY || "ztprospects2025")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { name, association, date, endDate, city, state, ages, fee, link } = req.body;
  if (!name || !date) return res.status(400).json({ error: "name and date are required" });

  const existing = loadTournaments();
  const newEntry = {
    id: `manual-${Date.now()}`,
    name,
    association: association || "Other",
    date,
    endDate: endDate || date,
    city: city || "TBD",
    state: state || "TBD",
    ages: ages || [],
    fee: fee ? parseInt(fee) : null,
    link: link || "",
  };

  existing.push(newEntry);
  saveTournaments(existing);
  res.json({ message: "Tournament added", tournament: newEntry });
});

// DELETE a manually added tournament
app.delete("/api/tournaments/:id", (req, res) => {
  const key = req.headers["x-admin-key"];
  if (key !== (process.env.ADMIN_KEY || "ztprospects2025")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const existing = loadTournaments();
  const filtered = existing.filter((t) => t.id !== req.params.id);
  saveTournaments(filtered);
  res.json({ message: "Deleted", removed: existing.length - filtered.length });
});

// Catch-all: serve frontend
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── SCHEDULER ────────────────────────────────────────────────────────────────
// Runs every day at 3:00 AM UTC
cron.schedule("0 3 * * *", () => {
  console.log("⏰ Scheduled daily refresh triggered");
  refreshData();
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 ZT Prospects Tournament Finder running on port ${PORT}`);
  console.log(`   Open: http://localhost:${PORT}`);

  // Run initial scrape after 5 seconds (let server fully start first)
  setTimeout(() => {
    console.log("⏳ Running initial data refresh in background...");
    refreshData();
  }, 5000);
});
