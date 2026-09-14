# Pull Discovery

A Vercel-ready Next.js demo of the Pull Discovery thesis: **a persuasive generated answer is not the same as a verified result.**

Generation happens inside Claude or Gemini. URL verification is computed afterwards on the server. The client only renders the server's `tier`.

## What it shows

- **Model router** — `anthropic` (`claude-3-5-sonnet-20241022` + `web_search_20250305`) or `google` (`gemini-2.5-pro` + Google Search Grounding).
- **Intentional failure** — `forceFail: true` skips the LLM and returns `"Discovery intentionally aborted by user."`
- **Server-side harvest + verification** — every generated destination is tagged `exact`, `host`, or `none` from search-tool URLs. Prompt templates never leave the server.
- **Entity resolution** — client merges `host + pathname` and shows a corroboration count.
- **World model** — load My / Pradeepa / Son profiles, full CRUD, export, withhold.
- **Scope guard** — ecommerce facts (a shoe budget) are held at the domain boundary on a healthcare pull until you approve a transfer.
- **Eval harness** — four fixed queries, resolvable-destination rate (`exact` / total) and latency.

## Setup

```bash
npm install
cp .env.example .env.local
# add ANTHROPIC_API_KEY and/or GEMINI_API_KEY
npm run dev
```

Without keys, the API still returns mixed-tier fixtures so the trust boundary is visible.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

Set `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` in the Vercel project.
