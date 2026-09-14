# Pull Discovery - Vercel Deployment PRD (Exponentials Co-Founder Demo)

## Objective
Refactor the Next.js App Router prototype to perfectly reflect the "Pull Discovery" thesis outlined in the Exponentials job description. The architecture must separate persuasive LLM generation from verifiable retrieval, enforce cross-domain permission boundaries, support multi-model routing, and allow multi-user profile switching.

## 1. Backend (`app/api/discover/route.js`) - The Trust Boundary & Model Router
Shift all verification logic to the server to prove that a "persuasive generated answer is not the same as a verified result."

* **Model Router:** Implement a toggle in the request payload to route the prompt to either Anthropic (`claude-3-5-sonnet-20241022` using the `web_search_20250305` tool) or Google (`gemini-2.5-pro` using Google Search Grounding).
* **Intentional Failure:** Intercept a `forceFail` boolean flag from the client payload. If true, abort the LLM call entirely and immediately return a 200 response with an empty results array and the message: "Discovery intentionally aborted by user."
* **Server-Side URL Harvesting:** After the LLM completes its generation, programmatically extract every URL returned directly by the native search tool's result blocks.
* **Computed Verification (Crucial):** Parse the assistant's generated JSON. For every destination, compute its `tier` server-side before responding to the client:
  * `exact`: The generated URL perfectly matches a search tool URL.
  * `host`: The host matches, but the path was hallucinated.
  * `none`: The URL is entirely unverified.
* **Response Security:** Return the sanitized JSON with the computed `tier` for each result. Do not leak prompt templates (`decomposePrompt`, `retrievePrompt`) to the client; move them into the backend route.

## 2. Frontend (`app/page.jsx`) - Entity Resolution & Ranking
* **Entity Resolution:** Update the deduplication logic in the `retrieve` function. Group results matching both `host + pathname`. Merge duplicate destinations for the same entity into a single card with a "corroboration count" to reduce UI clutter.
* **Evidence-Backed Explanations:** Ensure the `why` field in the result card explicitly maps back to the specific user constraints (e.g., "satisfies [constraint indices]").
* **Remove Client Verification:** Delete the `harvestUrls` and `verifyTier` functions from the client. The client must strictly render the server's computed `tier`.

## 3. Frontend - World Model & Multi-User Profiles
* **Inject Personal Data:** Update the default `MY_PROFILE` array to use the developer's actual context:
  * "Manages FBA and FBM ecommerce on Amazon" (domain: ecommerce, stated, confidence: 0.95, scopes: ecommerce)
  * "Develops React Native/Flutter apps like FadeDex and ProofPay" (domain: education, stated, confidence: 0.9, scopes: education)
  * "Runs Talonica, an agency for trade contractors" (domain: media, stated, confidence: 0.85, scopes: media)
  * "Based in Johns Creek, Georgia" (domain: ecommerce, stated, confidence: 0.95, scopes: ecommerce, healthcare, education, media)
* **Family Profiles:** Add two new hardcoded profile arrays (`PRADEEPA_PROFILE` and `SON_PROFILE`) with dummy data representing distinct family members.
* **Profile Switcher UI:** In the World Model panel, update the "Seed my profile" button area to include three distinct buttons that pass their respective arrays to the `seedProfile` function: "Load My Profile", "Load Pradeepa's Profile", and "Load Son's Profile".
* **Scope Guard:** Maintain the `transferLog` UI. If a fact tagged for the `ecommerce` domain (e.g., a shoe budget) is requested for a `healthcare` query, it must be intercepted and placed in the "Held at the domain boundary" pending state for explicit user approval.
* **User Agency:** Ensure the World Model panel retains full CRUD capabilities, allowing the user to inspect, correct, withhold, export, or delete any piece of context.

## 4. Frontend - Evaluation & Operating Discipline
* **Eval Harness:** Maintain the "Evaluation" tab. Ensure the loop calculates the "resolvable-destination rate" (percentage of `exact` tiers) and latency against a fixed set of queries to demonstrate repeatable testing and observability.