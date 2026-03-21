const puppeteer = require("puppeteer");

// ─── BROWSER HELPER ───────────────────────────────────────────────────────────
async function getBrowser() {
  return puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  });
}

async function getPageContent(browser, url, waitFor, timeout = 20000) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle2", timeout });
    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => {});
    }
    // Let JS finish rendering
    await new Promise((r) => setTimeout(r, 2000));
    return await page.content();
  } finally {
    await page.close();
  }
}

// ─── USSSA ────────────────────────────────────────────────────────────────────
async function scrapeUSSSA(browser) {
  console.log("🔄 Scraping USSSA...");
  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    
    // USSSA has a search API we can call directly
    const response = await page.goto(
      "https://usssa.com/api/v2/programs?sportId=2&programTypeId=2&page=1&pageSize=100",
      { waitUntil: "networkidle2", timeout: 20000 }
    );
    
    let tournaments = [];
    
    try {
      const text = await page.evaluate(() => document.body.innerText);
      const data = JSON.parse(text);
      const items = data.data || data.programs || data.results || data || [];
      if (Array.isArray(items) && items.length > 0) {
        tournaments = items.map((e) => ({
          id: `usssa-${e.id || e.programId || slugify(e.name || "")}`,
          name: e.name || e.programName || e.title,
          association: "USSSA",
          date: parseISODate(e.startDate || e.start),
          endDate: parseISODate(e.endDate || e.end),
          city: e.city || e.location?.city,
          state: e.state || e.location?.state,
          ages: parseAges(e.ageGroups || e.divisions || e.name || ""),
          fee: parseFee(e.entryFee || e.fee || e.cost || ""),
          link: e.registrationUrl || e.url || `https://usssa.com/baseball/event/${e.id}`,
        })).filter(validTournament);
      }
    } catch {}
    
    await page.close();
    
    // If API didn't work, scrape the search page
    if (tournaments.length === 0) {
      const html = await getPageContent(browser, "https://usssa.com/baseball/eventsearch", "[class*='event']");
      tournaments = parseGenericTournaments(html, "USSSA", "https://usssa.com");
    }
    
    console.log(`✅ USSSA: ${tournaments.length} tournaments`);
    return tournaments;
  } catch (err) {
    console.error("❌ USSSA failed:", err.message);
    return [];
  }
}

// ─── PERFECT GAME ─────────────────────────────────────────────────────────────
async function scrapePerfectGame(browser) {
  console.log("🔄 Scraping Perfect Game...");
  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    await page.goto("https://www.perfectgame.org/Schedule/Tournaments/Default.aspx", {
      waitUntil: "networkidle2", timeout: 25000,
    });
    await new Promise((r) => setTimeout(r, 3000));

    const tournaments = await page.evaluate(() => {
      const results = [];
      // Try table rows
      document.querySelectorAll("table tr").forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 3) {
          const name = cells[0]?.innerText?.trim();
          const date = cells[1]?.innerText?.trim();
          const location = cells[2]?.innerText?.trim();
          const fee = cells[3]?.innerText?.trim() || "";
          const link = row.querySelector("a")?.href || "";
          if (name && name.length > 3 && date) {
            results.push({ name, date, location, fee, link });
          }
        }
      });
      // Try card/list format if no table
      if (results.length === 0) {
        document.querySelectorAll("[class*='tournament'], [class*='event'], [class*='game']").forEach((el) => {
          const name = el.querySelector("h2, h3, h4, [class*='name'], [class*='title']")?.innerText?.trim();
          const date = el.querySelector("[class*='date'], time")?.innerText?.trim();
          const location = el.querySelector("[class*='location'], [class*='city'], [class*='venue']")?.innerText?.trim() || "";
          const fee = el.querySelector("[class*='fee'], [class*='price'], [class*='cost']")?.innerText?.trim() || "";
          const link = el.querySelector("a")?.href || "";
          if (name && date) results.push({ name, date, location, fee, link });
        });
      }
      return results;
    });

    await page.close();

    const mapped = tournaments.map((t) => ({
      id: `pg-${slugify(t.name + t.date)}`,
      name: t.name,
      association: "Perfect Game",
      ...parseDateRange(t.date),
      ...parseLocation(t.location),
      ages: parseAges(t.name),
      fee: parseFee(t.fee),
      link: t.link || "https://www.perfectgame.org",
    })).filter(validTournament);

    console.log(`✅ Perfect Game: ${mapped.length} tournaments`);
    return mapped;
  } catch (err) {
    console.error("❌ Perfect Game failed:", err.message);
    return [];
  }
}

// ─── GMB ──────────────────────────────────────────────────────────────────────
async function scrapeGMB(browser) {
  console.log("🔄 Scraping GMB...");
  try {
    const html = await getPageContent(browser, "https://www.gmbbattlezone.com/tournaments", "[class*='tournament'], article, .event");
    const tournaments = parseGenericTournaments(html, "GMB", "https://www.gmbbattlezone.com");
    console.log(`✅ GMB: ${tournaments.length} tournaments`);
    return tournaments;
  } catch (err) {
    console.error("❌ GMB failed:", err.message);
    return [];
  }
}

// ─── RIPKEN ───────────────────────────────────────────────────────────────────
async function scrapeRipken(browser) {
  console.log("🔄 Scraping Ripken...");
  try {
    const html = await getPageContent(browser, "https://www.ripkenbaseball.com/tournaments", "[class*='tournament'], [class*='event'], .card");
    const tournaments = parseGenericTournaments(html, "Ripken Experience", "https://www.ripkenbaseball.com");
    console.log(`✅ Ripken: ${tournaments.length} tournaments`);
    return tournaments;
  } catch (err) {
    console.error("❌ Ripken failed:", err.message);
    return [];
  }
}

// ─── GAME7 ────────────────────────────────────────────────────────────────────
async function scrapeGame7(browser) {
  console.log("🔄 Scraping Game7...");
  try {
    const html = await getPageContent(browser, "https://www.game7sports.com/tournaments", "[class*='tournament'], article");
    const tournaments = parseGenericTournaments(html, "Game7", "https://www.game7sports.com");
    console.log(`✅ Game7: ${tournaments.length} tournaments`);
    return tournaments;
  } catch (err) {
    console.error("❌ Game7 failed:", err.message);
    return [];
  }
}

// ─── PLAYLOCAL ────────────────────────────────────────────────────────────────
async function scrapePlayLocal(browser) {
  console.log("🔄 Scraping PlayLocal...");
  try {
    const html = await getPageContent(browser, "https://www.playlocalsports.com/baseball/tournaments", "[class*='tournament'], article");
    const tournaments = parseGenericTournaments(html, "PlayLocal", "https://www.playlocalsports.com");
    console.log(`✅ PlayLocal: ${tournaments.length} tournaments`);
    return tournaments;
  } catch (err) {
    console.error("❌ PlayLocal failed:", err.message);
    return [];
  }
}

// ─── GENERIC HTML PARSER ──────────────────────────────────────────────────────
function parseGenericTournaments(html, association, baseUrl) {
  // Simple regex-based parser — no cheerio needed
  const tournaments = [];
  
  // Extract blocks that look like tournament entries
  const blockPatterns = [
    /<(?:article|div|li|tr)[^>]*class="[^"]*(?:tournament|event|game|camp)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li|tr)>/gi,
    /<(?:article|div)[^>]*>([\s\S]*?)<\/(?:article|div)>/gi,
  ];
  
  for (const pattern of blockPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const block = match[1];
      const name = extractText(block, ["h2", "h3", "h4"]);
      const dateText = extractByClass(block, ["date", "time", "when"]);
      const location = extractByClass(block, ["location", "city", "venue", "where"]);
      const fee = extractByClass(block, ["fee", "price", "cost", "entry"]);
      const link = extractHref(block, baseUrl);
      const ages = parseAges(name + " " + block);
      
      if (name && name.length > 4 && dateText) {
        const parsed = parseDateRange(dateText);
        if (parsed.date) {
          tournaments.push({
            id: `${association.toLowerCase().replace(/\s/g,"-")}-${slugify(name + dateText)}`,
            name: cleanText(name),
            association,
            ...parsed,
            ...parseLocation(location),
            ages,
            fee: parseFee(fee),
            link,
          });
        }
      }
    }
    if (tournaments.length > 0) break;
  }
  
  return tournaments.filter(validTournament);
}

function extractText(html, tags) {
  for (const tag of tags) {
    const m = html.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, "i"));
    if (m) return m[1].trim();
  }
  return "";
}

function extractByClass(html, classNames) {
  for (const cls of classNames) {
    const m = html.match(new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>([^<]+)`, "i"));
    if (m) return m[1].trim();
  }
  return "";
}

function extractHref(html, baseUrl) {
  const m = html.match(/href="([^"]+)"/i);
  if (!m) return baseUrl;
  return m[1].startsWith("http") ? m[1] : baseUrl + m[1];
}

function cleanText(str) {
  return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// ─── RUN ALL ──────────────────────────────────────────────────────────────────
async function scrapeAll() {
  let browser;
  try {
    console.log("🚀 Launching headless browser...");
    browser = await getBrowser();
    
    const results = await Promise.allSettled([
      scrapeUSSSA(browser),
      scrapePerfectGame(browser),
      scrapeGMB(browser),
      scrapeRipken(browser),
      scrapeGame7(browser),
      scrapePlayLocal(browser),
    ]);
    
    const all = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
    console.log(`✅ Total scraped: ${all.length} tournaments`);
    return all;
  } catch (err) {
    console.error("❌ Scrape failed:", err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40);
}
function parseFee(str) {
  if (!str) return null;
  const m = String(str).match(/\$?([\d,]+)/);
  return m ? parseInt(m[1].replace(",", "")) : null;
}
function parseAges(str) {
  if (!str) return [];
  const m = String(str).match(/\b(\d{1,2})U\b/gi) || [];
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
  const range = str.match(/(\w+\.?\s+\d{1,2})[-–](\d{1,2}),?\s*(\d{4})/);
  if (range) {
    const year = range[3];
    const start = new Date(`${range[1]}, ${year}`);
    const end = new Date(`${range[1].replace(/\d+$/, "")}${range[2]}, ${year}`);
    return { date: toISO(start), endDate: toISO(isNaN(end) ? start : end) };
  }
  const single = str.match(/(\w+\.?\s+\d{1,2},?\s*\d{4})/);
  if (single) { const d = new Date(single[1]); return { date: toISO(d), endDate: toISO(d) }; }
  return { date: null, endDate: null };
}
function parseISODate(str) {
  if (!str) return null;
  return String(str).slice(0, 10);
}
function toISO(d) {
  if (!d || isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}
function validTournament(t) {
  return t.name && t.name.length > 3 && t.date;
}

module.exports = { scrapeAll };
