export const DOMAINS = ["ecommerce", "healthcare", "education", "media"];

function fact(text, domain, confidence, scopes, extra = {}) {
  return {
    id: crypto.randomUUID(),
    text,
    domain,
    source: "stated",
    confidence,
    scopes,
    withheld: false,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

export const MY_PROFILE = () => [
  fact(
    "Manages FBA and FBM ecommerce on Amazon",
    "ecommerce",
    0.95,
    ["ecommerce"]
  ),
  fact(
    "Develops React Native/Flutter apps like FadeDex and ProofPay",
    "education",
    0.9,
    ["education"]
  ),
  fact(
    "Runs Talonica, an agency for trade contractors",
    "media",
    0.85,
    ["media"]
  ),
  fact(
    "Based in Johns Creek, Georgia",
    "ecommerce",
    0.95,
    ["ecommerce", "healthcare", "education", "media"]
  ),
  fact(
    "Shoe budget is $120; prefers waterproof trail shoes for Georgia humidity",
    "ecommerce",
    0.88,
    ["ecommerce"]
  ),
];

export const PRADEEPA_PROFILE = () => [
  fact(
    "Pediatric nurse at Northside Hospital — Forsyth",
    "healthcare",
    0.92,
    ["healthcare"]
  ),
  fact(
    "Manages household grocery budget of $800 per month",
    "ecommerce",
    0.8,
    ["ecommerce"]
  ),
  fact(
    "Prefers Tamil-language pediatric resources for family health decisions",
    "education",
    0.85,
    ["education", "healthcare"]
  ),
  fact(
    "Based in Johns Creek, Georgia",
    "ecommerce",
    0.95,
    ["ecommerce", "healthcare", "education", "media"]
  ),
  fact(
    "Needs after-hours pediatric urgent care within 20 minutes of home",
    "healthcare",
    0.9,
    ["healthcare"]
  ),
];

export const SON_PROFILE = () => [
  fact(
    "8th grader at River Trail Middle School",
    "education",
    0.95,
    ["education"]
  ),
  fact("Allergic to peanuts; carries an epinephrine auto-injector", "healthcare", 0.99, [
    "healthcare",
    "education",
  ]),
  fact(
    "Plays travel soccer at United Futbol Academy",
    "education",
    0.8,
    ["education"]
  ),
  fact(
    "Wants a weekend robotics summer camp in north Atlanta",
    "education",
    0.7,
    ["education"]
  ),
  fact(
    "Lives in Johns Creek, Georgia with family",
    "ecommerce",
    0.9,
    ["ecommerce", "healthcare", "education", "media"]
  ),
];

export const PROFILE_BUTTONS = [
  { id: "me", label: "Load My Profile", factory: MY_PROFILE },
  { id: "pradeepa", label: "Load Pradeepa's Profile", factory: PRADEEPA_PROFILE },
  { id: "son", label: "Load Son's Profile", factory: SON_PROFILE },
];

export const EVAL_QUERIES = [
  {
    id: "shoes",
    domain: "ecommerce",
    query:
      "Waterproof hiking shoes under $120 that handle Georgia humidity, sold by a retailer I can verify.",
  },
  {
    id: "urgent-care",
    domain: "healthcare",
    query:
      "After-hours pediatric urgent care near Johns Creek, Georgia with published hours I can open.",
  },
  {
    id: "robotics",
    domain: "education",
    query:
      "Weekend robotics camp for an 8th grader in north Atlanta with a real registration page.",
  },
  {
    id: "contractors",
    domain: "media",
    query:
      "Lead-generation agencies that specialize in trade contractors and roofers, with a real company site.",
  },
];
