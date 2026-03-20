const axios = require("axios");
const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

// ─── USSSA ────────────────────────────────────────────────────────────────────
async function scrapeUSSSA() {
  console.log("🔄 Scraping USSSA...");
  try {
    // USSSA exposes a JSON endpoint for event searches
    const url = "https://usssa.com/api/v1/events?sport=baseball&type=tournament&limit=200";
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });

    if (res.data && Array.isArray(res.data.events)) {
      return res.data.events.map((e) => ({
        id: `usssa-${e.id || e.eventId}`,
        name: e.name || e.eventName,
        association: "USSSA",
        date: e.startDate?.slice(0, 10),
        endDate: e.endDate?.slice(0, 10),
        city: e.city,
        state: e.state,
        ages: parseAges(e.ageGroups || e.divisions || ""),
        fee: parseFee(e.entryFee || e.fee || ""),
        link: `https://usssa.com/baseball/event/${e.id || e.eventId}`,
      })).filter(validTournament);
    }
    throw new Error("Unexpected USSSA response format");
  } catch (err) {
    console.warn("⚠️  USSSA API failed, trying HTML scrape:", err.message);
    return scrapeUSSSAHtml();
  }
}

async function scrapeUSSSAHtml() {
  try {
    const res = await axios.get("https://usssa.com/baseball/eventsearch", {
      headers: HEADERS,
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const tournaments = [];

    // USSSA event rows — selector may need updating if their HTML changes
    $(".event-row, .tournament-row, [class*='event-item']").each((_, el) => {
      const name = $(el).find("[class*='name'], h3, h4").first().text().trim();
      const dateText = $(el).find("[class*='date']").first().text().trim();
      const location = $(el).find("[class*='location'], [class*='city']").first().text().trim();
      const fee = $(el).find("[class*='fee'], [class*='price']").first().text().trim();
      const ages = $(el).find("[class*='age'], [class*='division']").first().text().trim();
      const href = $(el).find("a").first().attr("href") || "";

      if (name && dateText) {
        tournaments.push({
          id: `usssa-${slugify(name + dateText)}`,
          name,
          association: "USSSA",
          ...parseDateRange(dateText),
          ...parseLocation(location),
          ages: parseAges(ages),
          fee: parseFee(fee),
          link: href.startsWith("http") ? href : `https://usssa.com${href}`,
        });
      }
    });

    console.log(`✅ USSSA HTML: found ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ USSSA scrape failed:", err.message);
    return [];
  }
}

// ─── PERFECT GAME ─────────────────────────────────────────────────────────────
async function scrapePerfectGame() {
  console.log("🔄 Scraping Perfect Game...");
  try {
    // Perfect Game has a tournament search page
    const res = await axios.get(
      "https://www.perfectgame.org/Schedule/Tournaments/Default.aspx",
      { headers: HEADERS, timeout: 15000 }
    );
    const $ = cheerio.load(res.data);
    const tournaments = [];

    // Parse tournament table rows
    $("table tr, .tournament-item, [class*='event']").each((_, el) => {
      const cells = $(el).find("td");
      if (cells.length >= 3) {
        const name = $(cells[0]).text().trim() || $(el).find("a").first().text().trim();
        const dateText = $(cells[1]).text().trim();
        const location = $(cells[2]).text().trim();
        const fee = $(cells[3])?.text().trim() || "";
        const href = $(el).find("a").first().attr("href") || "";

        if (name && name.length > 3 && dateText) {
          tournaments.push({
            id: `pg-${slugify(name + dateText)}`,
            name,
            association: "Perfect Game",
            ...parseDateRange(dateText),
            ...parseLocation(location),
            ages: parseAges(name + " " + ($(el).find("[class*='age']").text() || "")),
            fee: parseFee(fee),
            link: href.startsWith("http") ? href : `https://www.perfectgame.org${href}`,
          });
        }
      }
    });

    console.log(`✅ Perfect Game: found ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ Perfect Game scrape failed:", err.message);
    return [];
  }
}

// ─── GMB ──────────────────────────────────────────────────────────────────────
async function scrapeGMB() {
  console.log("🔄 Scraping GMB...");
  try {
    const res = await axios.get("https://www.gmbbattlezone.com/tournaments", {
      headers: HEADERS,
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const tournaments = [];

    $("[class*='tournament'], [class*='event'], article").each((_, el) => {
      const name = $(el).find("h2, h3, h4, [class*='title'], [class*='name']").first().text().trim();
      const dateText = $(el).find("[class*='date']").first().text().trim();
      const location = $(el).find("[class*='location'], [class*='city']").first().text().trim();
      const fee = $(el).find("[class*='fee'], [class*='price'], [class*='cost']").first().text().trim();
      const href = $(el).find("a").first().attr("href") || "";

      if (name && dateText) {
        tournaments.push({
          id: `gmb-${slugify(name + dateText)}`,
          name,
          association: "GMB",
          ...parseDateRange(dateText),
          ...parseLocation(location),
          ages: parseAges(name + " " + $(el).find("[class*='age']").text()),
          fee: parseFee(fee),
          link: href.startsWith("http") ? href : `https://www.gmbbattlezone.com${href}`,
        });
      }
    });

    console.log(`✅ GMB: found ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ GMB scrape failed:", err.message);
    return [];
  }
}

// ─── RIPKEN ───────────────────────────────────────────────────────────────────
async function scrapeRipken() {
  console.log("🔄 Scraping Ripken Experience...");
  try {
    const res = await axios.get("https://www.ripkenbaseball.com/tournaments", {
      headers: HEADERS,
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const tournaments = [];

    $("[class*='tournament'], [class*='event'], [class*='camp'], article, .card").each((_, el) => {
      const name = $(el).find("h2, h3, h4, [class*='title']").first().text().trim();
      const dateText = $(el).find("[class*='date'], time").first().text().trim();
      const location = $(el).find("[class*='location'], [class*='venue']").first().text().trim();
      const fee = $(el).find("[class*='fee'], [class*='price']").first().text().trim();
      const href = $(el).find("a").first().attr("href") || "";

      if (name && name.length > 4) {
        tournaments.push({
          id: `ripken-${slugify(name + dateText)}`,
          name,
          association: "Ripken Experience",
          ...parseDateRange(dateText),
          ...parseLocation(location || "Aberdeen, MD"),
          ages: parseAges(name + " " + $(el).text()),
          fee: parseFee(fee),
          link: href.startsWith("http") ? href : `https://www.ripkenbaseball.com${href}`,
        });
      }
    });

    console.log(`✅ Ripken: found ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ Ripken scrape failed:", err.message);
    return [];
  }
}

// ─── GAME7 ────────────────────────────────────────────────────────────────────
async function scrapeGame7() {
  console.log("🔄 Scraping Game7...");
  try {
    const res = await axios.get("https://www.game7sports.com/tournaments", {
      headers: HEADERS,
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const tournaments = [];

    $("[class*='tournament'], [class*='event'], article, .card").each((_, el) => {
      const name = $(el).find("h2, h3, h4, [class*='title']").first().text().trim();
      const dateText = $(el).find("[class*='date'], time").first().text().trim();
      const location = $(el).find("[class*='location'], [class*='city']").first().text().trim();
      const fee = $(el).find("[class*='fee'], [class*='price']").first().text().trim();
      const href = $(el).find("a").first().attr("href") || "";

      if (name && name.length > 4) {
        tournaments.push({
          id: `game7-${slugify(name + dateText)}`,
          name,
          association: "Game7",
          ...parseDateRange(dateText),
          ...parseLocation(location),
          ages: parseAges(name + " " + $(el).text()),
          fee: parseFee(fee),
          link: href.startsWith("http") ? href : `https://www.game7sports.com${href}`,
        });
      }
    });

    console.log(`✅ Game7: found ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ Game7 scrape failed:", err.message);
    return [];
  }
}

// ─── PLAYLOCAL ────────────────────────────────────────────────────────────────
async function scrapePlayLocal() {
  console.log("🔄 Scraping PlayLocal...");
  try {
    const res = await axios.get("https://www.playlocalsports.com/baseball/tournaments", {
      headers: HEADERS,
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const tournaments = [];

    $("[class*='tournament'], [class*='event'], article, .card").each((_, el) => {
      const name = $(el).find("h2, h3, h4, [class*='title']").first().text().trim();
      const dateText = $(el).find("[class*='date'], time").first().text().trim();
      const location = $(el).find("[class*='location'], [class*='city']").first().text().trim();
      const fee = $(el).find("[class*='fee'], [class*='price']").first().text().trim();
      const href = $(el).find("a").first().attr("href") || "";

      if (name && name.length > 4) {
        tournaments.push({
          id: `playlocal-${slugify(name + dateText)}`,
          name,
          association: "PlayLocal",
          ...parseDateRange(dateText),
          ...parseLocation(location),
          ages: parseAges(name + " " + $(el).text()),
          fee: parseFee(fee),
          link: href.startsWith("http") ? href : `https://www.playlocalsports.com${href}`,
        });
      }
    });

    console.log(`✅ PlayLocal: found ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ PlayLocal scrape failed:", err.message);
    return [];
  }
}

// ─── RUN ALL SCRAPERS ─────────────────────────────────────────────────────────
async function scrapeAll() {
  const results = await Promise.allSettled([
    scrapeUSSSA(),
    scrapePerfectGame(),
    scrapeGMB(),
    scrapeRipken(),
    scrapeGame7(),
    scrapePlayLocal(),
  ]);

  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  console.log(`✅ Total scraped: ${all.length} tournaments`);
  return all;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40);
}

function parseFee(str) {
  if (!str) return null;
  const match = str.match(/\$?([\d,]+)/);
  return match ? parseInt(match[1].replace(",", "")) : null;
}

function parseAges(str) {
  if (!str) return [];
  const matches = str.match(/\b(\d{1,2})U\b/gi) || [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
}

function parseLocation(str) {
  if (!str) return { city: "TBD", state: "TBD" };
  // Try "City, ST" format
  const m = str.match(/([A-Za-z\s]+),\s*([A-Z]{2})/);
  if (m) return { city: m[1].trim(), state: m[2] };
  // Try just a state abbrev
  const stateM = str.match(/\b([A-Z]{2})\b/);
  return { city: str.split(",")[0].trim() || "TBD", state: stateM ? stateM[1] : "TBD" };
}

function parseDateRange(str) {
  if (!str) return { date: null, endDate: null };
  // Try ISO dates first
  const isoMatches = str.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoMatches) return { date: isoMatches[0], endDate: isoMatches[1] || isoMatches[0] };

  // Try "Month D-D, YYYY" or "Month D, YYYY"
  const rangeMatch = str.match(/(\w+ \d{1,2})[-–](\d{1,2}),?\s*(\d{4})/);
  if (rangeMatch) {
    const year = rangeMatch[3];
    const start = new Date(`${rangeMatch[1]}, ${year}`);
    const end = new Date(`${rangeMatch[1].replace(/\d+$/, "")}${rangeMatch[2]}, ${year}`);
    return {
      date: toISO(start),
      endDate: toISO(isNaN(end) ? start : end),
    };
  }

  const singleMatch = str.match(/(\w+ \d{1,2},?\s*\d{4})/);
  if (singleMatch) {
    const d = new Date(singleMatch[1]);
    return { date: toISO(d), endDate: toISO(d) };
  }

  return { date: null, endDate: null };
}

function toISO(d) {
  if (!d || isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

function validTournament(t) {
  return t.name && t.name.length > 3 && t.date;
}

module.exports = { scrapeAll };
