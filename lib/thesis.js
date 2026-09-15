import { EVAL_QUERIES } from "./profiles";

export const TIER_COPY = {
  exact: {
    label: "Proven",
    hint: "This exact URL appeared in the search-tool harvest.",
  },
  host: {
    label: "Host only",
    hint: "Search saw this site. The specific path was not in the harvest.",
  },
  none: {
    label: "Unverified",
    hint: "The model can sound sure. Search never returned this URL.",
  },
};

export const SOURCE_COPY = {
  stated: "stated",
  inferred: "inferred",
  feedback: "from you",
};

export const THESIS_BEATS = [
  {
    id: "person",
    n: "01",
    title: "Start with the person",
    body: "Load a world model you can inspect. Interests, goals, and constraints stay yours — not a platform’s objectives.",
    cta: "Load my world model",
  },
  {
    id: "pull",
    n: "02",
    title: "Pull what the web can prove",
    body: "Say the need. The model proposes destinations. The server checks whether search actually returned those URLs.",
    cta: "Pull trail shoes",
  },
  {
    id: "boundary",
    n: "03",
    title: "Keep authority at the boundary",
    body: "The same life crosses healthcare. A shoe budget must not silently become a medical constraint. Approve or withhold.",
    cta: "Ask for after-hours care",
  },
];

export const SHOE_QUERY = EVAL_QUERIES[0];
export const CARE_QUERY = EVAL_QUERIES[1];
