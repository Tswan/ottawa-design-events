// fetch-events.js
import fs from "fs/promises";
import {load} from "cheerio";
import dotenv from "dotenv";
dotenv.config();

const SOURCES = [
  { name: "Eventbrite - Ottawa design", url: "https://www.eventbrite.com/d/canada--ottawa/design-events/" },
  { name: "Ottawa Tourism calendar", url: "https://ottawatourism.ca/en/event-calendar" },
  { name: "Ottawa Design Club", url: "https://ottdesign.club/event.html" },
  { name: "Invest Ottawa events", url: "https://www.investottawa.ca/events/" },
  { name: "ORSA events", url: "https://orsa.ca/events" },
  { name: "CapCHI", url: "https://capchi.org/category/upcoming-events/" },
];

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      // polite UA and contact info helps if site owners reach out
      "User-Agent": "ottawa-events-scraper/1.0 (+https://ottawadesignmeetups.framer.website/)",
      Accept: "text/html,application/xhtml+xml"
    },
    // don't follow super-aggressively; defaults are fine
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

// parse JSON-LD nodes that are Events
function parseJsonLdEvents(html, sourceUrl) {
  const $ = load(html);
  const scripts = $('script[type="application/ld+json"]').toArray();
  const events = [];
  for (const s of scripts) {
    let text = $(s).contents().text().trim();
    if (!text) continue;
    try {
      const obj = JSON.parse(text);
      // obj can be array, or an object, or graph
      const candidates = [];
      if (Array.isArray(obj)) candidates.push(...obj);
      else candidates.push(obj);

      for (const c of candidates) {
        // some pages wrap data in @graph
        if (c["@graph"] && Array.isArray(c["@graph"])) {
          c["@graph"].forEach(g => candidates.push(g));
        }
      }

      // scan candidates for Event types
      for (const c of candidates) {
        if (!c || typeof c !== "object") continue;
        const types = (c["@type"] || c["@type"]?.toString() || "").toString();
        if (types.toLowerCase().includes("event")) {
          // normalize
          events.push({
            title: c.name || c.headline || "",
            start: c.startDate || c.start || "",
            end: c.endDate || c.end || "",
            url: c.url || sourceUrl,
            location: c.location?.name || (c.location?.address?.streetAddress ? `${c.location.address.streetAddress} ${c.location.address.addressLocality ?? ""}` : ""),
            description: c.description || "",
            source: sourceUrl,
          });
        }
      }
    } catch (err) {
      // JSON parse failed; ignore
    }
  }
  return events;
}

// fallback: find anchor links that look like events (e.g. Eventbrite '/e/' links)
function fallbackExtract(html, baseUrl) {
  const $ = load(html);
  const out = [];
  $('a[href*="/e/"]').slice(0, 60).each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const text = $(el).text().trim().replace(/\s+/g, " ");
    const url = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    if (text.length > 2) {
      out.push({ title: text, url, source: baseUrl });
    }
  });
  return out;
}

async function gather() {
  const all = [];
  for (const s of SOURCES) {
    try {
      console.log("Fetching", s.url);
      const html = await fetchHtml(s.url);
      // prefer JSON-LD parsing
      const fromLd = parseJsonLdEvents(html, s.url);
      if (fromLd.length) {
        console.log(` → ${fromLd.length} events from JSON-LD at ${s.name}`);
        all.push(...fromLd);
        continue;
      }
      // fallback heuristics
      const fallback = fallbackExtract(html, s.url);
      console.log(` → ${fallback.length} fallback candidates at ${s.name}`);
      all.push(...fallback);
    } catch (err) {
      console.warn(`Skipping ${s.url} —`, err.message);
    }
    // small delay to be polite
    await new Promise(r => setTimeout(r, 900));
  }

  // dedupe by URL or title+start
  const map = new Map();
  for (const e of all) {
    const key = e.url || `${(e.title||"").slice(0,80)}|${e.start || ""}`;
    if (!map.has(key)) map.set(key, e);
  }
  const result = Array.from(map.values());

  await fs.writeFile("events.json", JSON.stringify(result, null, 2), "utf8");
  console.log("Wrote events.json with", result.length, "unique items");
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  gather().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { gather };
