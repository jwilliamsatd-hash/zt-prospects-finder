const cheerio = require("cheerio");

// All state pages available on tournamentlinks.com
const STATE_PAGES = [
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/tennessee-baseball-tournaments/", state: "TN" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/texas-baseball-tournaments/", state: "TX" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/missouri-baseball-tournaments/", state: "MO" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/illinois-baseball-tournaments/", state: "IL" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/ohio-baseball-tournaments/", state: "OH" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/indiana-baseball-tournaments/", state: "IN" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/kentucky-baseball-tournaments/", state: "KY" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/georgia-baseball-tournaments/", state: "GA" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/florida-baseball-tournaments/", state: "FL" },  // note: different URL pattern
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/arkansas-baseball-tournaments/", state: "AR" },
  { url: "https://tournamentlinks.com/north-carolina-baseball-tournaments/", state: "NC" },
  { url: "https://tournamentlinks.com/south-carolina-baseball-tournaments/", state: "SC" },
  { url: "https://tournamentlinks.com/virginia-baseball-tournaments/", state: "VA" },
  { url: "https://tournamentlinks.com/alabama-baseball-tournaments/", state: "AL" },
  { url: "https://tournamentlinks.com/mississippi-baseball-tournaments/", state: "MS" },
  { url: "https://tournamentlinks.com/oklahoma-baseball-tournaments/", state: "OK" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/kansas-baseball-tournaments/", state: "KS" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/iowa-baseball-tournaments/", state: "IA" },
  { url: "https://tournamentlinks.com/tournaments/baseball-tournaments/wisconsin-baseball-tournaments/", state: "WI" },
  { url: "https://tournamentlinks.com/michigan-baseball-tournaments/", state: "MI" },
  { url: "https://tournamentlinks.com/minnesota-baseball-tournaments/", state: "MN" },
  { url: "https://tournamentlinks.com/nebraska-baseball-tournaments/", state: "NE" },
  { url: "https://tournamentlinks.com/pennsylvania-baseball-tournaments/", state: "PA" },
  { url: "https://tournamentlinks.com/new-york-baseball-tournaments/", state: "NY" },
  { url: "https://tournamentlinks.com/arizona-baseball-tournaments/", state: "AZ" },
  { url: "https://tournamentlinks.com/washington-baseball-tournaments/", state: "WA" },
];

// Map organization names found on tournamentlinks to our association names
const ASSOC_MAP = {
  "perfect game": "Perfect Game",
  "usssa": "USSSA",
  "gmb": "GMB",
  "ripken": "Ripken Experience",
  "game 7": "Game7",
  "game7": "Game7",
  "play local": "PlayLocal",
  "playlocal": "PlayLocal",
};

function detectAssociation(text) {
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(ASSOC_MAP)) {
    if (lower.includes(key)) return val;
  }
  return "Other";
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseStatePage(html, defaultState) {
  const $ = cheerio.load(html);
  const tournaments = [];

  // tournamentlinks uses a single big article/post body
  // Tournaments are separated by <hr> tags or bold date headers
  // Format is typically:
  //   Date line (bold or heading)
  //   Tournament name (bold, often a link)
  //   Association name (bold link)
  //   Location
  //   Ages line
  //   Fee line
  //   Contact line

  // Get the main content area
  const content = $(".entry-content, .post-content, article, main").first();
  const rawHtml = content.html() || $("body").html() || "";

  // Split by <hr> or double <br> or <h4> — each block is one tournament
  const blocks = rawHtml
    .split(/<hr\s*\/?>|<h4[^>]*>|(?:<br\s*\/?>){2,}/gi)
    .map((b) => cheerio.load(b))
    .map(($b) => $b.text().replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 30);

  for (const block of blocks) {
    // Skip blocks that are just navigation or contact info
    if (
      block.includes("Tournament Links") ||
      block.includes("Skip to content") ||
      block.includes("Privacy") ||
      block.includes("Copyright") ||
      block.length < 30
    ) continue;

    // Try to extract date
    const dateMatch = block.match(
      /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^,]*,\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^–\-\d]*\d{1,2})\s*[-–]\s*(?:(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[^,]*,\s*)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^,\d]*\d{1,2}),?\s*(\d{4})/i
    ) || block.match(
      /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2})\s*[-–]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}),?\s*(\d{4})/i
    ) || block.match(
      /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}),?\s*(\d{4})/i
    );

    if (!dateMatch) continue;

    // Parse dates
    let startDate, endDate;
    try {
      if (dateMatch[3] && dateMatch[3].length === 4) {
        // Full range match: "Mar 7 - Mar 8, 2026"
        const year = dateMatch[3];
        startDate = toISO(new Date(`${dateMatch[1]}, ${year}`));
        endDate = toISO(new Date(`${dateMatch[2]}, ${year}`));
      } else if (dateMatch[2] && dateMatch[2].length === 4) {
        // Single date: "Mar 7, 2026"
        startDate = toISO(new Date(`${dateMatch[1]}, ${dateMatch[2]}`));
        endDate = startDate;
      } else {
        // Fallback - assume 2026
        startDate = toISO(new Date(`${dateMatch[1]}, 2026`));
        endDate = startDate;
      }
    } catch {
      continue;
    }

    if (!startDate) continue;
    // Skip past events (before today roughly)
    if (startDate < "2026-03-01") continue;

    // Extract tournament name — usually the first bold/capitalized phrase after the date
    const lines = block.split(/\n|  /).map(l => l.trim()).filter(Boolean);
    let name = "";
    let assocRaw = "";
    let location = "";
    let fee = null;
    let ages = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Name is usually the first non-date line that's long enough and has capitals
      if (!name && line.length > 5 && !/^\$|^contact|^ages|^phone|^\d{3}/i.test(line) && !line.match(/^\w{3},?\s+\w{3}/)) {
        // Skip the date line itself
        if (!line.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)) {
          name = line.replace(/\*+/g, "").trim();
        } else if (!name) {
          // Try the next line
          continue;
        }
      }

      // Detect association
      if (!assocRaw) {
        for (const key of Object.keys(ASSOC_MAP)) {
          if (line.toLowerCase().includes(key)) {
            assocRaw = line;
            break;
          }
        }
      }

      // Ages
      if (line.match(/\d{1,2}U/i) && !ages.length) {
        ages = parseAges(line);
      }

      // Fee
      if (!fee && line.includes("$")) {
        fee = parseFee(line);
      }

      // Location — "City, ST" pattern
      if (!location) {
        const locMatch = line.match(/([A-Za-z\s]+(?:,\s*[A-Z]{2})?)/);
        if (locMatch && line.match(/,\s*[A-Z]{2}/) && !line.match(/^\$/)) {
          location = locMatch[0].trim();
        }
      }
    }

    // If we couldn't extract a name from line parsing, grab the biggest chunk
    if (!name || name.length < 4) {
      const cleaned = block.replace(/\$[\d,.-]+/g, "").replace(/\d{1,2}U[-–]\d{1,2}U/gi, "").trim();
      const nameMatch = cleaned.match(/\b[A-Z][A-Za-z\s]{8,50}(?:Tournament|Classic|Series|Championship|Bash|Blast|Invitational|Open|Cup|Showdown|Challenge)/);
      if (nameMatch) name = nameMatch[0].trim();
    }

    if (!name || name.length < 4) continue;

    // Detect association from full block text
    const association = detectAssociation(assocRaw || block);

    // Parse location
    const { city, state } = parseLocation(location || block);

    tournaments.push({
      id: `tl-${slugify(name + startDate)}`,
      name: name.slice(0, 100),
      association,
      date: startDate,
      endDate: endDate || startDate,
      city,
      state: state !== "TBD" ? state : defaultState,
      ages,
      fee,
      link: detectLink(block, association),
    });
  }

  return tournaments.filter(validTournament);
}

function detectLink(block, association) {
  const links = {
    "Perfect Game": "https://www.perfectgame.org",
    "USSSA": "https://usssa.com/baseball/eventsearch",
    "GMB": "https://playgmb.com/tournaments/",
    "Ripken Experience": "https://ripkenbaseball.com/find-an-event/",
    "Game7": "https://game7baseball.com/baseball",
    "PlayLocal": "https://www.playlocalsports.com",
    "Other": "https://tournamentlinks.com",
  };
  return links[association] || "https://tournamentlinks.com";
}

async function scrapeAll() {
  console.log("🔄 Scraping tournamentlinks.com...");
  const all = [];

  for (const { url, state } of STATE_PAGES) {
    try {
      console.log(`  Fetching ${state}...`);
      const html = await fetchPage(url);
      const tournaments = parseStatePage(html, state);
      console.log(`  ✅ ${state}: ${tournaments.length} tournaments`);
      all.push(...tournaments);
      // Small delay to be respectful
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.warn(`  ⚠️  ${state} failed: ${err.message}`);
    }
  }

  // Deduplicate by id
  const seen = new Set();
  const deduped = all.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  console.log(`✅ Total from tournamentlinks: ${deduped.length} tournaments`);
  return deduped;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 50);
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
  const m = str.match(/([A-Za-z][A-Za-z\s.]{1,30}),\s*([A-Z]{2})/);
  if (m) return { city: m[1].trim(), state: m[2] };
  return { city: "TBD", state: "TBD" };
}
function toISO(d) {
  if (!d || isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}
function validTournament(t) {
  return t.name && t.name.length > 4 && t.date;
}

module.exports = { scrapeAll };
