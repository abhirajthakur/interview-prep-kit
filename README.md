# AI Interview Prep Kit

Paste in a job description and a company website, and this builds you an interview prep kit you can edit: a company brief, a breakdown of the role, a question bank sorted by category, flashcards, and a day-by-day study schedule. It researches the open web, generates the kit in steps, and checks the results in code instead of trusting a single model call.

**Live app:** <https://interview-prep-kit-mu.vercel.app>

**Backend API:** <https://interview-prep-kit-c3rn.onrender.com>

**Walkthrough video:** <https://youtu.be/zD51FCL3BiI>

> The backend runs on Render's free tier, which spins down when nobody's using it. If it's been idle for a while, the first request can take 30 to 60 seconds to wake it up. That's normal, not a bug. After that first request everything is fast.

## Table of contents

- [Tech stack](#tech-stack)
- [Setup](#setup)
- [Architecture](#architecture)
- [Retrieval approach](#retrieval-approach)
- [Research and generation sequencing](#research-and-generation-sequencing)
- [The second pass (coverage)](#the-second-pass-coverage)
- [Representing generated, edited and pinned state](#representing-generated-edited-and-pinned-state)
- [Schedule allocation](#schedule-allocation)
- [Security](#security)
- [Testing](#testing)
- [Possible next steps](#possible-next-steps)
- [Known limitations](#known-limitations)

## Tech stack

| Layer      | Choice                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Frontend   | Next.js (App Router) + Tailwind CSS                                                                             |
| Backend    | Node.js + Express + TypeScript                                                                                  |
| Database   | MongoDB (Atlas free tier) + Mongoose                                                                            |
| LLM        | Groq, free tier                                                                                                 |
| Scraping   | Hand-rolled fetcher + `cheerio` + `robots-parser`                                                               |
| Validation | Zod, end to end. One schema shape checks LLM output, API requests, and the final kit before anything gets saved |
| Testing    | Vitest                                                                                                          |

It's all JavaScript and TypeScript. No other language shows up in the pipeline or the app.

## Setup

### Local

You'll need Node 20+, a MongoDB connection string (a local `mongod` or a free Atlas cluster works), and a free Groq API key from <https://console.groq.com/keys>.

```bash
git clone <this-repo-url>
cd interview-prep-kit
npm install                     # installs both workspaces (backend, frontend) from the root

cp backend/.env.example backend/.env
# edit backend/.env: set GROQ_API_KEY and MONGODB_URI at minimum

cp frontend/.env.local.example frontend/.env.local
# edit frontend/.env.local: BACKEND_URL=http://localhost:4000

npm run dev:backend             # terminal 1 — http://localhost:4000
npm run dev:frontend            # terminal 2 — http://localhost:3000
```

To run the tests:

```bash
npm test
```

### The batch entry point

This runs the full pipeline over a file of cases with no server or browser involved. It's the same code the API uses, not a second implementation.

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

For example, from a clean clone with only `npm install` done and `backend/.env` filled in:

```bash
npm install
npm run evaluate -- --input backend/samples/cases.json --output out/kits.json
```

The input is a JSON array of `{ id, jd, company_url, days }`. The output is `{ version, generated_at, kits: [{ id, status, kit, error }] }`, with one entry per input case, and it gets written even when some cases fail. A few things about how the command behaves:

- It reads credentials only from `backend/.env` (documented in `backend/.env.example`).
- It treats `company_url` hosts as possibly local (`http://localhost:PORT/...`) and doesn't hard-code any host, so it works against locally served test sites too.
- Five cases finish well inside 15 minutes on the free Groq tier. A real run of 8 cases against live company sites took about 370s, roughly 46s per case. The token-budget math is in [Known limitations](#known-limitations).
- If one case fails, it keeps going and records the failure in the output instead of aborting.

## Architecture

```
backend/
  src/
    pipeline/         # framework-free core: no Express, no Mongoose, fully unit-testable
      llm/             # provider client: retry, 429 handling, json-schema mode
      retrieval/        # SSRF-safe fetcher, crawler, link ranking, robots.txt, sitemap
      extraction/       # requirement extraction from the pasted JD
      research/         # hiring-signal extraction, public discussion search, role hints
      generation/        # question generation, flashcards, company brief, regeneration
      coverage/          # deterministic gap-finding (no LLM)
      scheduling/         # deterministic day allocator (no LLM)
      kit.schema.ts        # the kit's JSON contract, as Zod — the single source of truth
      build-kit.ts          # orchestrates the above into one kit; used by both the API
                             #   and the batch CLI, so they can never drift apart
    auth/              # password hashing, opaque session tokens
    db/models/         # Mongoose schemas (User, Session, Kit)
    kits/              # Express layer: routes, controllers, thin Mongo-facing services
    cli/
      evaluate.ts       # the batch entry point
      llm-smoke.ts        # manual connectivity check against the real API key
      research-smoke.ts    # manual pipeline check without the DB/server

frontend/
  src/app/             # Next.js App Router pages
    api/[...path]/       # same-origin proxy to the backend (see below)
    kits/[id]/            # kit detail: tabs for Brief / Questions / Flashcards /
                             #   Schedule / Practice, each backed by its own component
  src/lib/               # typed API client, auth context, polling hook
  src/components/          # shared inline-edit, requirement chips, progress list
```

**Why the pipeline has no framework in it.** `buildKit()` takes `{ jd, companyUrl, days }` plus an injected `{ llm, fetcher }` and returns a validated kit. There's no Express `req`/`res` and no Mongoose anywhere in it. That's what lets the exact same function run as a background job inside the HTTP API and inside the standalone `evaluate` CLI. The two paths can't quietly drift apart because there's only one path.

**Why the frontend proxies through its own API route.** The browser only talks to the Next.js app's own origin. `/api/*` turns into a server-side `fetch` to Render. From the browser's point of view the session cookie stays same-site in dev and in production, and there's no CORS setup to do on the client. The backend still runs its `cors` middleware, but only server-to-server calls cross that boundary, and CORS is enforced by browsers, so it doesn't apply to them anyway.

**Generation runs as a background job.** `POST /kits` validates the input, creates a `pending` kit document, and returns `202` right away. Then `buildKit()` runs via `setImmediate`, writing each step's start, done, or skip event into the document's `progress` array as it goes. Those writes are chained through a promise rather than fired in parallel, so they land in the order they were emitted, even though the request handler never awaits them. The frontend polls `GET /kits/:id` every 1.5s and shows that array as a live step list. This answers the obvious question of what happens when generation takes ninety seconds or dies halfway: the connection was never held open in the first place, and a mid-run failure gets saved as `status: "failed"` with a structured `error` instead of a hung request.

## Retrieval approach

**There's no fixed list of paths.** The crawler starts at the homepage, reads `robots.txt` and any declared sitemap, and scores every link it finds using keywords in the path and anchor text. `interview` and `hiring-process` score highest, `careers` and `jobs` come next, `about` and `handbook` sit lower, and things like `login`, `checkout`, and pagination get penalties. It fetches the top few. Once it has actually found a hiring page, it follows that page's own links one level deeper, limited to links relevant to the posting's role. A "Senior Backend Engineer" search won't waste a fetch on an `exec-hiring` or `sales-hiring` page just because it happens to be there.

I tested this against `posthog.com` for real, with no special-casing. The crawler found `handbook/people/hiring-process/engineering-hiring`, `.../engineering-superday`, and `.../engineering-tech-screen`. Nobody could guess those paths, and none were on a hard-coded list. It skipped `exec-hiring`, `design-hiring`, and `sales-cs-hiring`, which exist on the same site.

**Sources used:**

- The company's own website, crawled as described above.
- Hacker News, through Algolia's free public search API (`hn.algolia.com`), for frank discussion of interview processes. I looked at Reddit and Glassdoor and left them out, since both either block automated access or restrict it in their terms.

**Safety on untrusted input.** Every fetch validates the target URL, resolves DNS, and rejects private and loopback addresses (`checkUrl` in `retrieval/net-guard.ts`) unless `ALLOW_PRIVATE_HOSTS=true`. That flag is only set for the batch CLI so it can reach locally served test sites. The deployed web API always has it off. Responses are capped by size and limited to expected content types. Every redirect hop gets re-validated, so a redirect can't be used to sneak a request through to a private address. Failures like a 404, a timeout, a robots.txt block, an oversized response, or the wrong content type are recorded as skipped sources and never abort the run. See [Known limitations](#known-limitations).

## Research and generation sequencing

The kit comes out of a series of steps that react to what was actually found, not one big prompt that returns everything. `buildKit()` runs them in this order, and each step's output changes what the next step does, beyond just changing what data it can see:

1. **Extract requirements** from the pasted JD (LLM). No retrieval is needed since pasted text is already text. Each requirement has to come with a verbatim quote from the JD, and code checks that the quote really appears in the text before accepting it (see the [anti-invention guard](#known-limitations) note). Then code, not the model, fixes must-have versus nice-to-have based on the nearest heading ("Nice to have:" versus "Requirements:"). The model's own label is treated as a first guess that the text can override. A short posting produces a `thin: true` result instead of being padded with guessed items.
2. **Crawl the company site** (code, plus one light LLM tie-break when the link ordering is ambiguous). The extracted role title's keywords bias which links get followed, as described above.
3. **Extract hiring-process signals** from whichever pages were classified as hiring pages (LLM). If no hiring page turned up, this step is skipped entirely with no LLM call. Its output shapes step 6. If the company's own page says "take-home, then system design," the questions are written to rehearse that format. If nothing was found, they follow the role in general terms.
4. **Search public discussion** (HN Algolia) for the company's interview process. Results are scoped by matching the company name against interview keywords in the same passage. Just requiring the word "interview" somewhere in a comment that also mentions the company pulled in a lot of unrelated noise during testing.
5. **Generate the company brief** (LLM), grounded only in the pages fetched in step 2. It never draws on the model's own knowledge of the company, even if the model recognises the name.
6. **Generate questions, one LLM call per category.** The categories are technical, behavioural, system design, and company fit. System design is only offered for non-junior, non-thin roles, or always if the company's own process names a design round. Company-fit questions are grounded only in the brief and culture notes and never invent facts about the employer. Requirements like "5 years of React" and "mentors junior engineers" deliberately never go to the same prompt with the same instructions, because a good technical question and a good behavioural question need different framing.
7. **Coverage check and gap-fill.** See the next section.
8. **Flashcards** (LLM), one card per requirement.
9. **Schedule.** Pure arithmetic, no LLM. See [Schedule allocation](#schedule-allocation).
10. **Validate** the assembled kit against its Zod schema. Two extra checks run as well: every scheduled `question_id` has to resolve, and no must-have requirement can be missing from the schedule. All of this happens before the kit is saved.

Steps 3 and 5 fail gently. If the LLM call breaks in either one, the error is caught, recorded as a warning on the kit, and the pipeline carries on. They improve the kit but a usable kit doesn't depend on them. Steps 1, 6, 8, and 9 do carry weight. A hard failure in any of those fails the case, and the batch CLI records it as `status: "failed"` with a typed error instead of crashing the whole run.

## The second pass (coverage)

**Deterministic on purpose.** `findUncovered()` (in `pipeline/coverage/`) compares the extracted requirement IDs against every question's `requirement_ids` and returns whatever has zero matches. It has no LLM dependency and is unit-tested directly.

The loop goes like this. Generate (pass 1), check coverage, and if there are gaps, generate only for the missing requirement IDs (pass 2). Check again and repeat, up to **3 passes total**, or stop early if a pass makes no progress. After that, any _must-have_ requirement that's still uncovered gets a deterministic template question (`fallback-question.ts`). It's generic, but it's honest, and the kit records exactly which requirement IDs needed one. Nice-to-have gaps stay as an honest gap in `coverage.uncovered_requirement_ids` instead of being forced. I also persist `coverage.history`, which is the uncovered-ID list after each individual pass, so you can see a gap close and not just get a final pass count.

I picked 3 as the cap because in testing a second pass closed the vast majority of gaps. The third is mostly a safety margin, and the template-question fallback is the real guarantee that a must-have never ships uncovered. The cap is there to bound worst-case token spend per kit. I'm not claiming 3 is the right number for every posting.

## Representing generated, edited and pinned state

This was the trickiest state-management problem in the whole app, so I want to be precise about how it works.

Every question and flashcard carries three fields on top of the base contract:

```ts
origin: "generated" | "manual"; // written by the pipeline, or added by hand in the UI
edited: boolean; // has a human ever changed this item since it was generated?
pinned: boolean; // explicitly protected from ever being replaced
```

**The rule regeneration follows.** For the target category (or all flashcards), keep every item where `pinned === true`, `edited === true`, or `origin === "manual"`, untouched and exactly as stored. Throw away the rest of that category, and only that category. Everything in other categories, and everything outside the regenerated section, is never read or rewritten. Then run the same generate, coverage-check, gap-fill, must-have-fallback loop described above, scoped to that category's requirement pool, using the kept items' prompts to avoid near-duplicates. Fresh sequential IDs go only to the newly generated items. Kept items hold on to their original IDs, which matters because the schedule references question IDs and a kept item has to stay resolvable.

**Where "edited" gets set.** Any successful `PATCH` on a question or flashcard sets `edited: true` on the server (`kits-items.service.ts`). The frontend never sets the flag itself, so a user can't protect something by accident just by looking at it. An earlier bug did exactly that. An auto-save effect fired on mount under React Strict Mode's double-invoke and marked every item "edited" with no real user action. I fixed it by switching to an explicit Save/Cancel flow that only calls the API when the draft differs from what's stored.

**Concurrency.** Every kit document carries a `version` counter that goes up on every save. Regeneration requests have to include the version the client last saw (`kits.controller.ts` / `regenerate.service.ts`). If it doesn't match, the server returns `409 Conflict` instead of silently overwriting whatever changed in between. I saw this happen for real in testing: generation bumps the version from 0 to 1 the moment it finishes, so a client still holding the pre-generation version gets a 409 and has to re-fetch. That's proof the guard actually fires and isn't only there on paper.

## Schedule allocation

This is **pure code with no LLM** (`pipeline/scheduling/schedule.ts`), because it's arithmetic and allocation and there's no reason to hand it to a model. Every question is scored by `(priority tier, difficulty)`. Must-have comes before nice-to-have, which comes before unlinked company-fit questions, and within a tier harder comes before easier. Then:

- **More questions than days:** the sorted list is split into `days` contiguous chunks, balanced by estimated study minutes per chunk (10, 15, or 20 minutes depending on difficulty), so no single day is wildly longer than another.
- **Fewer questions than days:** each question gets its own study day first. The remaining days become spaced review days that revisit earlier questions, with must-haves showing up in the rotation more often than nice-to-haves. The last day is a "final run-through" of the hardest material.
- **Exactly one question, many days:** that question repeats on every day. It's a real case worth testing explicitly, and it isn't just an edge of the general formula.
- **Zero questions:** you get placeholder days with 0 minutes, not a crash and not an invented schedule.

`days_available` always equals exactly what was requested. The allocator's own logic checks it, and the final Zod schema check checks it again. Every must-have requirement is guaranteed to be reachable through the schedule, too. `mustNotScheduled()` verifies this, and if it's ever violated the pipeline fails validation instead of quietly shipping.

## Security

- **SSRF guard** on every fetch (see [Retrieval approach](#retrieval-approach)). Private, loopback, and link-local addresses are rejected by resolved IP, not by matching hostname strings, and every redirect hop is re-checked.
- **Content-type and size limits** on every response the crawler reads.
- **Prompt-injection posture.** Any scraped or pasted text handed to the LLM is wrapped in an explicit `<untrusted_...>` fence, with a system-prompt instruction to treat what's inside as data to analyse and never as instructions. This applies across JD extraction, hiring-signal extraction, and the company brief, since all three read text the application didn't write.
- **Sessions.** Opaque random tokens (32 bytes, base64url) live in an httpOnly, `SameSite=Lax` cookie. Only the SHA-256 hash of the token is stored in MongoDB, with a TTL index so expired sessions clean themselves up.
- **Passwords.** bcrypt with 12 salt rounds.

## Testing

I wrote automated tests for the parts most worth protecting: schedule allocation (1-day, 60-day, single-question, and zero-question cases), coverage and gap-finding, kit structure validation (including referential integrity between questions, flashcards, and requirement IDs), the SSRF guard, the crawler's link ranking and its robots.txt and sitemap handling, the evidence-quote anti-invention check in requirement extraction, the LLM client's 429, retry, and repair logic, and the regeneration keep-versus-replace logic.

**Known gap, stated plainly:** the Express/Mongoose-facing layer has no automated tests. That's `kits-items.service.ts`, which backs the per-item PATCH, DELETE, and reorder endpoints behind the builder UI. I only checked it manually through the UI. I put my testing time into the pipeline logic, since it's framework-independent and the highest-value target, and left the thin Mongo glue around it. With more time this is where I'd add tests next, probably with `mongodb-memory-server` so they hit a real in-memory database and not a mocked Mongoose query builder.

To run everything: `npm test` (from the repo root or `backend/`).

## Possible next steps

The smallest addition that would give real value is a "weak spots" report. It would group low practice-confidence flashcards by requirement, and the link it needs (`flashcard → requirement_ids → confidence`) already exists in the data model. After that I'd add automated tests for the Mongo-facing item endpoints (see [Testing](#testing)).

## Known limitations

- **Requirement extraction trusts a quote match, not semantic correctness.** The anti-invention guard checks that the model's cited evidence appears verbatim in the JD. It can catch a fully invented requirement, but not a real quote attached to a wrong or overstated one.
- **Role-hint link ranking is a crude keyword stem match** on the job title (for example "Senior Backend Engineer" becomes `backen`, `engine`). A title like "Member of Technical Staff" gives no useful hints, and the crawler falls back to generic scoring.
- **Public discussion search is Hacker News only.** A quiet result for a smaller or non-tech-adjacent company is expected and gets reported as such. It isn't a search failure.
- **The company brief is grounded in at most 3 non-hiring pages, about 1.8K characters each.** A JavaScript-rendered site with no server-rendered content produces an honest "intentionally minimal" brief and not a guessed one, since no headless browser is run.
- **The token budget is real but manageable on Groq's free tier.** One measured production run (8 real companies plus 1 edge case) used about 57K tokens over roughly 370 seconds. That's around 7K tokens and 45s per kit, comfortably inside a 5-cases-in-15-minutes budget, even with the dozens of 429s that same run hit and absorbed through retry.
- **Batch case reuse is exact-match.** Two cases with identical `{jd, company_url, days}` are computed once and the result is copied for the duplicate case-id. A JD that differs by even one character counts as a distinct case.
- **The Next.js proxy forwards a single `Set-Cookie` header.** That's enough today because the backend only ever sets one cookie (`session`). If a second cookie is ever added, it'd need `getSetCookie()` instead of a single header read.
- **Reordering in the builder UI uses up/down buttons, not drag-and-drop.** It does the same job and was a fair bit faster to build well.
- **Render's free tier cold-starts after inactivity** The first request after idle time can take 30 to 60 seconds.
