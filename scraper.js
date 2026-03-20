const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function scrapeUSSSA() {
  console.log("🔄 Scraping USSSA...");
  try {
    const data = await fetchJson("https://usssa.com/api/v1/events?sport=baseball&type=tournament&limit=200");
    if (data && Array.isArray(data.events)) {
      return data.events.map((e) => ({
        id: `usssa-${e.id || e.eventId}`,
        name: e.name || e.eventName,
        association: "USSSA",
        date: e.startDate?.slice(0, 10),
        endDate: e.endDate?.slice(0, 10),
        city: e.city, state: e.state,
        ages: parseAges(e.ageGroups || e.divisions || ""),
        fee: parseFee(e.entryFee || e.fee || ""),
        link: `https://usssa.com/baseball/event/${e.id || e.eventId}`,
      })).filter(validTournament);
    }
    throw new Error("Unexpected format");
  } catch (err) {
    console.warn("⚠️  USSSA API failed, trying HTML:", err.message);
    return scrapeUSSSAHtml();
  }
}

async function scrapeUSSSAHtml() {
  try {
    const html = await fetchHtml("https://usssa.com/baseball/eventsearch");
    const $ = cheerio.load(html);
    const tournaments = [];
    $(".event-row, .tournament-row, [class*='event-item']").each((_, el) => {
      const name = $(el).find("[class*='name'], h3, h4").first().text().trim();
      const dateText = $(el).find("[class*='date']").first().text().trim();
      const location = $(el).find("[class*='location'], [class*='city']").first().text().trim();
      const fee = $(el).find("[class*='fee'], [class*='price']").first().text().trim();
      const ages = $(el).find("[class*='age'], [class*='division']").first().text().trim();
      const href = $(el).find("a").first().attr("href") || "";
      if (name && dateText) {
        tournaments.push({
          id: `usssa-${slugify(name + dateText)}`, name, association: "USSSA",
          ...parseDateRange(dateText), ...parseLocation(location),
          ages: parseAges(ages), fee: parseFee(fee),
          link: href.startsWith("http") ? href : `https://usssa.com${href}`,
        });
      }
    });
    console.log(`✅ USSSA HTML: ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ USSSA failed:", err.message);
    return [];
  }
}

async function scrapePerfectGame() {
  console.log("🔄 Scraping Perfect Game...");
  try {
    const html = await fetchHtml("https://www.perfectgame.org/Schedule/Tournaments/Default.aspx");
    const $ = cheerio.load(html);
    const tournaments = [];
    $("table tr").each((_, el) => {
      const cells = $(el).find("td");
      if (cells.length >= 3) {
        const name = $(cells[0]).text().trim();
        const dateText = $(cells[1]).text().trim();
        const location = $(cells[2]).text().trim();
        const fee = $(cells[3])?.text().trim() || "";
        const href = $(el).find("a").first().attr("href") || "";
        if (name && name.length > 3 && dateText) {
          tournaments.push({
            id: `pg-${slugify(name + dateText)}`, name, association: "Perfect Game",
            ...parseDateRange(dateText), ...parseLocation(location),
            ages: parseAges(name), fee: parseFee(fee),
            link: href.startsWith("http") ? href : `https://www.perfectgame.org${href}`,
          });
        }
      }
    });
    console.log(`✅ Perfect Game: ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ Perfect Game failed:", err.message);
    return [];
  }
}

async function scrapeGMB() {
  console.log("🔄 Scraping GMB...");
  try {
    const html = await fetchHtml("https://www.gmbbattlezone.com/tournaments");
    const $ = cheerio.load(html);
    const tournaments = [];
    $("[class*='tournament'], [class*='event'], article").each((_, el) => {
      const name = $(el).find("h2, h3, h4, [class*='title']").first().text().trim();
      const dateText = $(el).find("[class*='date']").first().text().trim();
      const location = $(el).find("[class*='location'], [class*='city']").first().text().trim();
      const fee = $(el).find("[class*='fee'], [class*='price']").first().text().trim();
      const href = $(el).find("a").first().attr("href") || "";
      if (name && dateText) {
        tournaments.push({
          id: `gmb-${slugify(name + dateText)}`, name, association: "GMB",
          ...parseDateRange(dateText), ...parseLocation(location),
          ages: parseAges(name), fee: parseFee(fee),
          link: href.startsWith("http") ? href : `https://www.gmbbattlezone.com${href}`,
        });
      }
    });
    console.log(`✅ GMB: ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ GMB failed:", err.message);
    return [];
  }
}

async function scrapeRipken() {
  console.log("🔄 Scraping Ripken...");
  try {
    const html = await fetchHtml("https://www.ripkenbaseball.com/tournaments");
    const $ = cheerio.load(html);
    const tournaments = [];
    $("[class*='tournament'], [class*='event'], article, .card").each((_, el) => {
      const name = $(el).find("h2, h3, h4, [class*='title']").first().text().trim();
      const dateText = $(el).find("[class*='date'], time").first().text().trim();
      const location = $(el).find("[class*='location'], [class*='venue']").first().text().trim();
      const fee = $(el).find("[class*='fee'], [class*='price']").first().text().trim();
      const href = $(el).find("a").first().attr("href") || "";
      if (name && name.length > 4) {
        tournaments.push({
          id: `ripken-${slugify(name + dateText)}`, name, association: "Ripken Experience",
          ...parseDateRange(dateText), ...parseLocation(location || "Aberdeen, MD"),
          ages: parseAges(name), fee: parseFee(fee),
          link: href.startsWith("http") ? href : `https://www.ripkenbaseball.com${href}`,
        });
      }
    });
    console.log(`✅ Ripken: ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ Ripken failed:", err.message);
    return [];
  }
}

async function scrapeGame7() {
  console.log("🔄 Scraping Game7...");
  try {
    const html = await fetchHtml("https://www.game7sports.com/tournaments");
    const $ = cheerio.load(html);
    const tournaments = [];
    $("[class*='tournament'], [class*='event'], article, .card").each((_, el) => {
      const name = $(el).find("h2, h3, h4, [class*='title']").first().text().trim();
      const dateText = $(el).find("[class*='date'], time").first().text().trim();
      const location = $(el).find("[class*='location'], [class*='city']").first().text().trim();
      const fee = $(el).find("[class*='fee'], [class*='price']").first().text().trim();
      const href = $(el).find("a").first().attr("href") || "";
      if (name && name.length > 4) {
        tournaments.push({
          id: `game7-${slugify(name + dateText)}`, name, association: "Game7",
          ...parseDateRange(dateText), ...parseLocation(location),
          ages: parseAges(name), fee: parseFee(fee),
          link: href.startsWith("http") ? href : `https://www.game7sports.com${href}`,
        });
      }
    });
    console.log(`✅ Game7: ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ Game7 failed:", err.message);
    return [];
  }
}

async function scrapePlayLocal() {
  console.log("🔄 Scraping PlayLocal...");
  try {
    const html = await fetchHtml("https://www.playlocalsports.com/baseball/tournaments");
    const $ = cheerio.load(html);
    const tournaments = [];
    $("[class*='tournament'], [class*='event'], article, .card").each((_, el) => {
      const name = $(el).find("h2, h3, h4, [class*='title']").first().text().trim();
      const dateText = $(el).find("[class*='date'], time").first().text().trim();
      const location = $(el).find("[class*='location'], [class*='city']").first().text().trim();
      const fee = $(el).find("[class*='fee'], [class*='price']").first().text().trim();
      const href = $(el).find("a").first().attr("href") || "";
      if (name && name.length > 4) {
        tournaments.push({
          id: `playlocal-${slugify(name + dateText)}`, name, association: "PlayLocal",
          ...parseDateRange(dateText), ...parseLocation(location),
          ages: parseAges(name), fee: parseFee(fee),
          link: href.startsWith("http") ? href : `https://www.playlocalsports.com${href}`,
        });
      }
    });
    console.log(`✅ PlayLocal: ${tournaments.length} tournaments`);
    return tournaments.filter(validTournament);
  } catch (err) {
    console.error("❌ PlayLocal failed:", err.message);
    return [];
  }
}

async function scrapeAll() {
  const results = await Promise.allSettled([
    scrapeUSSSA(), scrapePerfectGame(), scrapeGMB(),
    scrapeRipken(), scrapeGame7(), scrapePlayLocal(),
  ]);
  const all = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
  console.log(`✅ Total scraped: ${all.length} tournaments`);
  return all;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40);
}
function parseFee(str) {
  if (!str) return null;
  const m = str.match(/\$?([\d,]+)/);
  return m ? parseInt(m[1].replace(",", "")) : null;
}
function parseAges(str) {
  if (!str) return [];
  const m = str.match(/\b(\d{1,2})U\b/gi) || [];
  return [...new Set(m.map((x) => x.toUpperCase()))];
}
function parseLocation(str) {
  if (!str) return { city: "TBD", state: "TBD" };
  const m = str.match(/([A-Za-z\s]+),\s*([A-Z]{2})/);
  if (m) return { city: m[1].trim(), state: m[2] };
  const sm = str.match(/\b([A-Z]{2})\b/);
  return { city: str.split(",")[0].trim() || "TBD", state: sm ? sm[1] : "TBD" };
}
function parseDateRange(str) {
  if (!str) return { date: null, endDate: null };
  const iso = str.match(/\d{4}-\d{2}-\d{2}/g);
  if (iso) return { date: iso[0], endDate: iso[1] || iso[0] };
  const range = str.match(/(\w+ \d{1,2})[-–](\d{1,2}),?\s*(\d{4})/);
  if (range) {
    const year = range[3];
    const start = new Date(`${range[1]}, ${year}`);
    const end = new Date(`${range[1].replace(/\d+$/, "")}${range[2]}, ${year}`);
    return { date: toISO(start), endDate: toISO(isNaN(end) ? start : end) };
  }
  const single = str.match(/(\w+ \d{1,2},?\s*\d{4})/);
  if (single) { const d = new Date(single[1]); return { date: toISO(d), endDate: toISO(d) }; }
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
