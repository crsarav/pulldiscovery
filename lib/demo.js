import { hostOf } from "./verification.js";

const FIXTURES = {
  ecommerce: {
    constraints: [
      "waterproof",
      "under $120",
      "handles Georgia humidity",
      "verifiable retailer page",
    ],
    harvestedUrls: [
      "https://www.rei.com/product/187218/merrell-moab-3-mid-waterproof-hiking-shoes-mens",
      "https://www.rei.com/product/187217/merrell-moab-3-waterproof-hiking-shoes-mens",
      "https://www.dickssportinggoods.com/p/merrell-mens-moab-3-waterproof-hiking-shoes/20MERMMOAB3WTRPRF",
      "https://www.nike.com/w/mens-trail-shoes-37v7jzy7ok",
    ],
    destinations: [
      {
        name: "Merrell Moab 3 Mid Waterproof",
        url: "https://www.rei.com/product/187218/merrell-moab-3-mid-waterproof-hiking-shoes-mens",
        why: "satisfies [0, 1, 2, 3]",
        constraintIndices: [0, 1, 2, 3],
        note: "REI product page lists waterproof membrane and a live price under the budget.",
      },
      {
        name: "Merrell Moab 3 Waterproof (DSG)",
        url: "https://www.dickssportinggoods.com/p/merrell-mens-moab-3-waterproof-hiking-shoes/20MERMMOAB3WTRPRF",
        why: "satisfies [0, 3]",
        constraintIndices: [0, 3],
        note: "Same entity, second retailer — used to exercise host+pathname corroboration.",
      },
      {
        name: "Nike trail shoe (path hallucinated)",
        url: "https://www.nike.com/t/pegasus-trail-georgia-humidity-special",
        why: "satisfies [2]",
        constraintIndices: [2],
        note: "Host appeared in search; this specific path did not.",
      },
      {
        name: "Unverified roundup",
        url: "https://best-hiking-shoes-blog.example/georgia-top-10",
        why: "satisfies [1]",
        constraintIndices: [1],
        note: "Generated URL never appeared in search tool blocks.",
      },
    ],
  },
  healthcare: {
    constraints: [
      "pediatric",
      "after-hours",
      "near Johns Creek, Georgia",
      "published hours on a real page",
    ],
    harvestedUrls: [
      "https://www.childrenshealthcareofatlanta.org/locations/urgent-care-centers",
      "https://www.northside.com/locations/northside-hospital-forsyth",
      "https://www.choa.org/medical-services/urgent-care",
    ],
    destinations: [
      {
        name: "Children's Healthcare of Atlanta Urgent Care",
        url: "https://www.childrenshealthcareofatlanta.org/locations/urgent-care-centers",
        why: "satisfies [0, 1, 2, 3]",
        constraintIndices: [0, 1, 2, 3],
        note: "Official locations page for CHOA urgent care centers.",
      },
      {
        name: "Northside Hospital Forsyth",
        url: "https://www.northside.com/locations/northside-hospital-forsyth",
        why: "satisfies [2, 3]",
        constraintIndices: [2, 3],
        note: "Hospital campus near Johns Creek with a canonical location URL.",
      },
      {
        name: "Invented clinic microsite",
        url: "https://johnscreek-peds-afterhours.example/walk-in",
        why: "satisfies [0, 1]",
        constraintIndices: [0, 1],
        note: "Persuasive but absent from harvested search URLs.",
      },
    ],
  },
  education: {
    constraints: [
      "robotics",
      "middle school / 8th grade",
      "north Atlanta",
      "real registration page",
    ],
    harvestedUrls: [
      "https://www.theclubhou.se/",
      "https://www.gtri.gatech.edu/education-outreach",
      "https://www.bestbuy.com/site/geek-squad/geek-squad-academy/pcmcat159740050018.c",
    ],
    destinations: [
      {
        name: "Georgia Tech GTRI Education Outreach",
        url: "https://www.gtri.gatech.edu/education-outreach",
        why: "satisfies [0, 2, 3]",
        constraintIndices: [0, 2, 3],
        note: "Official outreach page from harvested search results.",
      },
      {
        name: "Best Buy Geek Squad Academy (path drift)",
        url: "https://www.bestbuy.com/site/geek-squad/atlanta-robotics-camp/fake-path",
        why: "satisfies [0, 1]",
        constraintIndices: [0, 1],
        note: "bestbuy.com was harvested; this path was not.",
      },
      {
        name: "Unverified camp listing",
        url: "https://atlanta-robotics-camps.example/8th-grade",
        why: "satisfies [1, 2]",
        constraintIndices: [1, 2],
        note: "No supporting search-tool URL.",
      },
    ],
  },
  media: {
    constraints: [
      "trade contractors",
      "roofers",
      "lead generation agency",
      "company website",
    ],
    harvestedUrls: [
      "https://www.angi.com/pro/",
      "https://www.homeadvisor.com/pro/",
      "https://talonica.com/",
    ],
    destinations: [
      {
        name: "Angi for Pros",
        url: "https://www.angi.com/pro/",
        why: "satisfies [0, 2, 3]",
        constraintIndices: [0, 2, 3],
        note: "Canonical pro-network page returned by search.",
      },
      {
        name: "Talonica",
        url: "https://talonica.com/",
        why: "satisfies [0, 1, 2, 3]",
        constraintIndices: [0, 1, 2, 3],
        note: "World-model agency with a harvested company URL.",
      },
      {
        name: "HomeAdvisor (host only)",
        url: "https://www.homeadvisor.com/roofer-leads-atlanta-special",
        why: "satisfies [1, 2]",
        constraintIndices: [1, 2],
        note: "Search returned the host, not this path.",
      },
    ],
  },
};

export function runDemo({ query, domain }) {
  const fixture = FIXTURES[domain] || FIXTURES.ecommerce;
  const extraDuplicate = fixture.destinations[0]
    ? {
        ...fixture.destinations[0],
        name: `${fixture.destinations[0].name} (second mention)`,
        note: "Duplicate host+pathname from a second generated mention — should merge.",
      }
    : null;

  return {
    provider: "demo",
    model: "demo-fixtures",
    decomposition: {
      intent: query,
      constraints: fixture.constraints,
      searchQueries: [query],
    },
    parsed: {
      constraints: fixture.constraints,
      destinations: extraDuplicate
        ? [...fixture.destinations, extraDuplicate]
        : fixture.destinations,
    },
    harvestedUrls: fixture.harvestedUrls,
    rawText: "",
  };
}

export function demoNote(domain) {
  return `Demo fixtures for ${domain} mix exact, host, and none tiers so the trust boundary is visible without API keys. ${hostOf(
    FIXTURES[domain]?.harvestedUrls?.[0] || "https://example.com"
  )} is a harvested host.`;
}
