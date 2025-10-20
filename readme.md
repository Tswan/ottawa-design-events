# Ottawa Design Events

A web scraper that automatically collects upcoming design events in Ottawa from various sources and outputs them to a JSON file.

The collected events are displayed on a user-friendly website: [Ottawa Design Meetups](https://ottawadesignmeetups.framer.website/)

![Mockup of Ottawa Design Events JSON in use](assets/image.png)

## Overview

This project scrapes design-related events from multiple Ottawa-based websites and consolidates them into a single [`events.json`](events.json) file. The scraper runs automatically every Monday via GitHub Actions and can also be triggered manually.

## Event Sources

- [Ottawa Tourism calendar](https://ottawatourism.ca/en/event-calendar)
- [Ottawa Design Club](https://ottdesign.club/event.html)
- [Invest Ottawa events](https://www.investottawa.ca/events/)
- [CapCHI](https://capchi.org/category/upcoming-events/)

## Usage

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the scraper:
   ```bash
   npm run fetch
   ```
   or
   ```bash
   node fetch-events.js
   ```

### Automated Updates

The project uses GitHub Actions to automatically update events every Monday at midnight UTC. The workflow is defined in [`.github/workflows/update-events.yml`](.github/workflows/update-events.yml).

## Output

Events are saved to [`events.json`](events.json) with the following structure:

```json
{
  "title": "Event Title",
  "url": "https://example.com/event",
  "longDate": "October 16",
  "shortDate": "Oct 16",
  "image": "https://example.com/image.jpg"
}
```

The JSON file is consumed by the [Ottawa Design Meetups website](https://ottawadesignmeetups.framer.website/) to display events in a clean, accessible format.

## Features

- Parses JSON-LD structured data when available
- Custom parsers for specific event sources
- Deduplication of events
- Filters events to current and next month only
- Polite scraping with delays between requests