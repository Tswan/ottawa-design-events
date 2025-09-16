// fetch-events.js
import fs from "fs/promises";
import {load} from "cheerio";
import dotenv from "dotenv";
dotenv.config();

const SOURCES = [
//   { name: "Eventbrite - Ottawa design", url: "https://www.eventbrite.com/d/canada--ottawa/design-events/" },
  { name: "Ottawa Tourism calendar", url: "https://ottawatourism.ca/en/event-calendar" },
  { name: "Ottawa Design Club", url: "https://ottdesign.club/event.html" },
  { name: "Invest Ottawa events", url: "https://www.investottawa.ca/events/" },
  // { name: "ORSA events", url: "https://orsa.ca/events" },
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

function parseOttawaDesignClub(html, baseUrl) {
	const $ = load(html);
	const events = [];
	$('.blog-post').each((i, el) => {
		let title = $(el).find('a').text().trim();
		// Remove leading "+" and whitespace/newlines
		title = title.replace(/^\+[\s\n]*/, "");
		const url = `https://ottdesign.club/${$(el).find('a').attr('href')}`;
		const dateStr = $(el).find('.author').text().trim();
		let date = "";
		let longDate = "";
		let shortDate = "";
		// Try to parse date string
		// Examples: "September 4, 2025", "October 2, 2025"
		if (dateStr) {
			const parsed = new Date(dateStr);
			date = !isNaN(parsed) ? parsed.toISOString() : dateStr;
			// Format longDate as "Month Day, Year", e.g., "September 4, 2025"
			if (!isNaN(parsed)) {
				const options = { month: "long", day: "numeric" };
				longDate = parsed.toLocaleDateString("en-US", options);
			} else {
				longDate = dateStr;
			}
			// Format shortDate as "Mon Day", e.g., "Sep 4"
			if (!isNaN(parsed)) {
				const options = { month: "short", day: "numeric" };
				shortDate = parsed.toLocaleDateString("en-US", options);
			} else {
				shortDate = dateStr;
			}
		}
		const img = `https://ottdesign.club/${$(el).find('img').attr('src')}`;

		// Only push events of this month or next month
		if (date) {
			const eventDate = new Date(date);
			if (!isNaN(eventDate)) {
				const now = new Date();
				const currentMonth = now.getMonth();
				const currentYear = now.getFullYear();
				const nextMonth = (currentMonth + 1) % 12;
				const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;

				const eventMonth = eventDate.getMonth();
				const eventYear = eventDate.getFullYear();

				if (
					(eventYear === currentYear && eventMonth === currentMonth) ||
					(eventYear === nextMonthYear && eventMonth === nextMonth)
				) {
					events.push({ title, url, longDate: longDate, shortDate: shortDate, image: img });
				}
			}
		}
	});

	return events;
}

function parseCapCHI(html, baseUrl) {
  const $ = load(html);
  const events = [];
  $("article").each((i, el) => {
		let title = $(el).find("h1").text().trim();
		// Remove date from the beginning, e.g. "2025-09-16 Event Title"
		title = title.replace(/^\d{4}-\d{2}-\d{2}\s*/, "");
		const img = $(el).find("img").attr("src");
    const url = $(el).find("a").attr("href");
    let date = "";
    $(el).find("p").each((i, p) => {
      const text = $(p).text().trim();
			if (text.startsWith("DATE TIME")) {
				// Example: "DATE TIME: Tuesday September 16, 2025, 6:00-8:00 pm."
				const match = text.match(/DATE TIME:\s*(.+?),\s*([\d:apm\- ]+)/i);
				if (match) {
					// match[1]: "Tuesday September 16, 2025"
					// match[2]: "6:00-8:00 pm"
					// Try to parse date and time
					const dateStr = match[1].replace(/^\w+\s/, ""); // Remove weekday
					const timeStr = match[2].split('-')[0].trim(); // Start time only
					const fullStr = `${dateStr} ${timeStr}`;
					const parsed = new Date(fullStr);
					if (!isNaN(parsed)) {
				date = parsed.toISOString();
					} else {
				date = `${dateStr} ${timeStr}`; // fallback
					}
				} else {
					date = text;
				}
				return false; // break out of .each loop
			}
    });
		let longDate = date;
		let shortDate = date;
		if (date) {
			const parsed = new Date(date);
			if (!isNaN(parsed)) {
				const longOptions = { month: "long", day: "numeric" };
				longDate = parsed.toLocaleDateString("en-US", longOptions);
				const shortOptions = { month: "short", day: "numeric" };
				shortDate = parsed.toLocaleDateString("en-US", shortOptions);
			}
		}
    if (title) {
      events.push({ title, url: new URL(url, baseUrl).toString(), longDate: longDate, shortDate: shortDate, image: img });
    }
  });
  return events;
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
						longDate: c.startDate || c.start || "",
						shortDate: c.startDate || c.start || "",
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
      let events = parseJsonLdEvents(html, s.url);
			if (!events.length && s.name === "CapCHI") {
				events = parseCapCHI(html, s.url);
			} else if (!events.length && s.name === "Ottawa Design Club") {
				events = parseOttawaDesignClub(html, s.url);
			}
      if (events.length) {
        console.log(` → ${events.length} events from JSON-LD at ${s.name}`);
        all.push(...events);
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
