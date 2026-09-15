export const DOMAINS = ["ecommerce", "healthcare", "education", "media"];

function fact(id, text, domain, confidence, scopes, extra = {}) {
  return {
    id,
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
    "me-fba",
    "Manages FBA and FBM ecommerce on Amazon",
    "ecommerce",
    0.95,
    ["ecommerce"]
  ),
  fact(
    "me-apps",
    "Develops React Native/Flutter apps like FadeDex and ProofPay",
    "education",
    0.9,
    ["education"]
  ),
  fact(
    "me-talonica",
    "Runs Talonica, an agency for trade contractors",
    "media",
    0.85,
    ["media"]
  ),
  fact(
    "me-location",
    "Based in Johns Creek, Georgia",
    "ecommerce",
    0.95,
    ["ecommerce", "healthcare", "education", "media"]
  ),
  fact(
    "me-shoes",
    "Shoe budget is $120; prefers waterproof trail shoes for Georgia humidity",
    "ecommerce",
    0.88,
    ["ecommerce"]
  ),
  fact(
    "me-linkedin",
    "LinkedIn: https://www.linkedin.com/in/saravanan-palanivelu-74939740/",
    "media",
    0.95,
    ["ecommerce", "education", "media"]
  ),
];

export const PRADEEPA_PROFILE = () => [
  fact(
    "pradeepa-nurse",
    "Pediatric nurse at Northside Hospital — Forsyth",
    "healthcare",
    0.92,
    ["healthcare"]
  ),
  fact(
    "pradeepa-grocery",
    "Manages household grocery budget of $800 per month",
    "ecommerce",
    0.8,
    ["ecommerce"]
  ),
  fact(
    "pradeepa-tamil",
    "Prefers Tamil-language pediatric resources for family health decisions",
    "education",
    0.85,
    ["education", "healthcare"]
  ),
  fact(
    "pradeepa-location",
    "Based in Johns Creek, Georgia",
    "ecommerce",
    0.95,
    ["ecommerce", "healthcare", "education", "media"]
  ),
  fact(
    "pradeepa-urgent-care",
    "Needs after-hours pediatric urgent care within 20 minutes of home",
    "healthcare",
    0.9,
    ["healthcare"]
  ),
];

export const SON_PROFILE = () => [
  fact(
    "son-school",
    "8th grader at River Trail Middle School",
    "education",
    0.95,
    ["education"]
  ),
  fact(
    "son-allergy",
    "Allergic to peanuts; carries an epinephrine auto-injector",
    "healthcare",
    0.99,
    ["healthcare", "education"]
  ),
  fact(
    "son-soccer",
    "Plays travel soccer at United Futbol Academy",
    "education",
    0.8,
    ["education"]
  ),
  fact(
    "son-robotics",
    "Wants a weekend robotics summer camp in north Atlanta",
    "education",
    0.7,
    ["education"]
  ),
  fact(
    "son-location",
    "Lives in Johns Creek, Georgia with family",
    "ecommerce",
    0.9,
    ["ecommerce", "healthcare", "education", "media"]
  ),
];

export const BUILTIN_PROFILES = [
  { id: "me", label: "Load My Profile", factory: MY_PROFILE },
  { id: "pradeepa", label: "Load Pradeepa's Profile", factory: PRADEEPA_PROFILE },
  { id: "son", label: "Load Son's Profile", factory: SON_PROFILE },
];

export const PROFILE_BUTTONS = BUILTIN_PROFILES;

export function builtinById(id) {
  return BUILTIN_PROFILES.find((p) => p.id === id) || null;
}

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
