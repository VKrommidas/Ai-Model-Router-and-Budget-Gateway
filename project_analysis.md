# Project Analysis — AI Model Router & Budget Gateway

---

## 1. Overview

This is a **full-stack TypeScript monorepo** that acts as an intelligent, self-governing LLM API gateway. It accepts a natural-language prompt, dynamically classifies its complexity, selects the most cost-appropriate AI provider and model tier, executes the generation with automatic failover and retry, and persists all telemetry to Firestore — all while enforcing a hard monthly budget cap.

The project was originally scaffolded as a Google AI Studio "Applet" (hence `firebase-applet-config.json`, the `APP_URL` env var, and the `DISABLE_HMR` convention), then extended to support multiple providers and a semantic caching subsystem.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM, `"type": "module"`) |
| Language | TypeScript 5.8 |
| Server | Express 4 |
| Frontend | React 19 + Vite 6 + TailwindCSS 4 |
| Dev server | `tsx` (runs `server.ts` directly, no compile step) |
| LLM Providers | Google Gemini, OpenAI, Anthropic Claude, Ollama (local) |
| Persistence | Firebase Firestore (v12 client SDK, server-side) |
| Charting | Recharts |
| Icons | Lucide React |
| Animation | Motion (Framer Motion successor) |
| Styling helpers | clsx + tailwind-merge |

---

## 3. Architecture

### 3.1 Runtime Model (Key Design Decision)

The project runs a **single Express process** that simultaneously:
- Serves the React SPA (in dev: via Vite middleware; in prod: from `/dist`)  
- Exposes all backend REST API routes under `/api/*`

This is a **unified dev-server pattern** — there is no separate frontend dev server port, no CORS configuration needed, and no proxy. The `vite.config.ts` server is mounted as Express middleware via `createViteServer({ server: { middlewareMode: true } })`.

```
http://localhost:3000
    ├── /api/config          → GET  – read global gateway config
    ├── /api/config/global   → POST – update budget / timeout / maxRetries
    ├── /api/config/providers→ POST – toggle / reconfigure a provider
    ├── /api/health          → POST – run health check on all enabled providers
    ├── /api/logs            → GET  – retrieve last 50 log entries (desc)
    ├── /api/route           → POST – the core routing + generation endpoint
    └── /*                  → SPA  – React frontend
```

### 3.2 Provider Abstraction Layer (`/providers`)

All four AI providers implement a single **`LLMProvider` interface** defined in [`llm-provider.ts`](file:///c:/Users/vassi/Downloads/ai-model-router-and-budget-gateway/providers/llm-provider.ts):

```typescript
interface LLMProvider {
  name: string;
  generate(prompt, options: { model, signal? }): Promise<{ text, tokens, model }>;
  estimateCost(tokens: TokenUsage, model: string): number;
  healthCheck(model: string): Promise<boolean>;
}
```

Each provider handles its own HTTP transport, API auth, and token accounting:

| Provider | Transport | Auth env var | Health check method |
|---|---|---|---|
| **Gemini** | `@google/genai` SDK | `GEMINI_API_KEY` | `generateContent('Ping')` |
| **OpenAI** | Native `fetch` | `OPENAI_API_KEY` | `GET /v1/models` |
| **Claude** | Native `fetch` | `CLAUDE_API_KEY` or `ANTHROPIC_API_KEY` | POST with `max_tokens: 1`, accepts 200 or 400 |
| **Ollama** | Native `fetch` | None (localhost) | `GET /api/tags` + model presence check |

Each provider also implements **cost estimation** from real token counts using per-token pricing baked into the source:

| Provider | Cheap model | Cheap price ($/M) | Expert model | Expert price ($/M) |
|---|---|---|---|---|
| Gemini | Flash | $0.075 in / $0.30 out | Pro | $3.50 in / $10.50 out |
| OpenAI | gpt-4o-mini | $0.15 in / $0.60 out | gpt-4o | $2.50 in / $10.00 out |
| Claude | Haiku | $0.80 in / $4.00 out | Sonnet | $3.00 in / $15.00 out |
| Ollama | llama3.2 | $0 (local) | llama3 | $0 (local) |

### 3.3 `GatewayManager` — The Orchestration Core

[`gateway-manager.ts`](file:///c:/Users/vassi/Downloads/ai-model-router-and-budget-gateway/providers/gateway-manager.ts) is the heart of the backend. It owns:

**Config management (`getOrInitConfig`)**  
- Reads `config/global` from Firestore on every request (no in-memory cache).  
- If the document doesn't exist yet, it self-initializes with hardcoded defaults (Gemini enabled, others disabled, `$5.00` budget, `15 s` timeout, `2` retries).  
- Performs a migration pass: if any field is missing (e.g. `failoverOrder`, `timeoutMs`), it adds the field and re-saves. This is a lightweight schema evolution mechanism.

**`generateWithFailover(prompt, tier)`**  
The main generation path. Tier is either `'cheap'` or `'expert'`, which maps to each provider's `cheapModel` / `expertModel` config value.

```
For each provider in failoverOrder (enabled only):
  If provider is marked unhealthy AND there are alternatives → skip (record attempt)
  For attempt in [0 .. maxRetries]:
    Start AbortController timer (timeoutMs)
    If attempt > 0: await exponential backoff (500ms * 2^(attempt-1))
    Call provider.generate(prompt, { model, signal })
    On success:
      Clear timeout
      If was unhealthy → update Firestore to healthy
      Return result
    On failure:
      Clear timeout
      If last attempt → push to attempts[], mark provider unhealthy in Firestore
If all providers exhausted → throw error with full attempts log
```

The backoff sequence is `500ms → 1000ms → 2000ms…` for `maxRetries = 2`, giving up to `~3.5 s` of extra wait per provider before cascade-failing.

### 3.4 Routing Logic (`POST /api/route`)

This is the most complex endpoint in [`server.ts`](file:///c:/Users/vassi/Downloads/ai-model-router-and-budget-gateway/server.ts). It executes a 4-stage pipeline:

**Stage 1 — Difficulty estimation (hybrid heuristic + LLM)**

A base score starts at `0.1` and is incremented by keyword and length heuristics:

| Signal | Score added |
|---|---|
| Prompt length > 500 chars | +0.30 |
| Keywords: "explain", "analyze", "compare" | +0.20 |
| Keywords: "code", "function", "debug" | +0.40 |
| Keywords: "step-by-step", "reasoning" | +0.30 |

The heuristic score (max ~1.3, clamped later) is then blended with an **LLM classification score**. A "cheap" model call is made with a meta-prompt asking for a 0.0–1.0 complexity float. The blend is:

```
final_difficulty = (heuristic * 0.3) + (llm_score * 0.7)
```

If the classifier call fails, it gracefully degrades to heuristics-only. Score is clamped to `[0.0, 1.0]`.

**Stage 2 — Budget enforcement**

```
budgetUsage = totalSpend / monthlyBudget

≥ 1.0  → HTTP 402, hard block
> 0.9  → force 'cheap' tier regardless of difficulty
> 0.6 difficulty → 'expert' tier
else   → 'cheap' tier
```

**Stage 3 — Generation with failover**

Calls `gateway.generateWithFailover(prompt, selectedTier)` — the full retry/failover loop described above.

**Stage 4 — Cost accounting + logging**

- Attempts per-token cost estimation via the provider's `estimateCost()`.
- Falls back to flat-rate constants (`$0.0001` / `$0.0025`) if the token-based estimate is zero and the provider isn't Ollama.
- Appends a log entry to the `logs` Firestore collection.
- Uses Firestore `increment()` to atomically add cost to `config.totalSpend`.
- Returns the full result + `budgetInfo` to the caller.

---

## 4. Frontend (`/src`)

### 4.1 Structure

```
src/
  App.tsx          — Entire frontend (549 lines, single-file SPA)
  main.tsx         — React 19 root mount
  index.css        — Minimal base reset
  services/        — Utilities (not imported by server.ts — see §6)
    cache-manager.ts
    embedding-service.ts
    semantic-search.ts
```

### 4.2 App.tsx — UI Architecture

The SPA is a single monolithic component with **4 tab views**:

| Tab | Route key | Content |
|---|---|---|
| **01 / Overview** | `dashboard` | Routing policy sidebar, budget progress bar, efficiency heatmap, provider load distribution |
| **02 / Playground** | `playground` | Prompt textarea → `POST /api/route` → result card with model, difficulty, cost, latency, response |
| **03 / Archive** | `logs` | Paginated table of last 50 log entries (timestamp, prompt excerpt, provider/model, cost) |
| **04 / Controls** | `controls` | Per-provider toggle cards + global health check trigger |

**Data refresh**: a `setInterval` at 10 000 ms polls `/api/config` and `/api/logs` simultaneously (`Promise.all`). All state lives in React `useState`.

**Styling**: editorial/print-inspired aesthetic — off-white `#F9F8F6` background, near-black `#1A1A1A` text, burnt-orange `#D44D26` accent. TailwindCSS v4 utility classes throughout. Provider identity colors: Gemini `#D44D26`, OpenAI `#10A37F`, Claude `#D97757`, Ollama `#3B82F6`.

**Efficiency Heatmap**: a 4×4 grid of colored cells representing the last 16 requests. Cell color = provider color; opacity = difficulty score. This gives an instant visual of how complex and expensive recent traffic has been.

---

## 5. Persistence (Firestore)

### Collections

| Collection | Document(s) | Purpose |
|---|---|---|
| `config` | `global` | Budget, totalSpend, provider configs, failoverOrder, timeout, retries |
| `logs` | `{auto-id}` | Per-request telemetry (prompt, response, model, provider, cost, tokens, difficulty, duration, timestamp) |
| `semantic_cache` | `{auto-id}` | Cached responses with embedding vectors (feature not yet wired to server) |

### Security Rules

```
/config/global    → read + write: true (no auth — server-side only access)
/logs/{logId}     → read + create: true; update + delete: false
/**               → deny all
```

> [!WARNING]
> `config/global` is fully open to read/write with no authentication. This is acceptable only if Firestore is accessed exclusively from a server-side process that controls network access. Any exposure of the Firebase config to the public web would allow anyone to read or overwrite budget settings.

---

## 6. Semantic Cache Subsystem (`/src/services`)

The three files in `src/services/` form a **complete but currently unconnected** semantic caching layer:

### `EmbeddingService`
- Uses Google GenAI SDK (`embedding-001` model) to generate dense vector embeddings from prompt text.

### `FirestoreCacheProvider` (implements `CacheProvider`)
- Stores `{ prompt, response, embedding[], cost, duration, timestamp }` in the `semantic_cache` Firestore collection.
- On lookup: fetches up to 100 recent entries and computes **cosine similarity** in-process (no vector index).
- Returns the best match if similarity ≥ threshold.

### `SemanticSearchService`
- Orchestrates the full cache read-through: embed → search → TTL check → return hit or miss.
- Configurable via env: `CACHE_ENABLED`, `SEMANTIC_SIMILARITY_THRESHOLD` (default `0.90`), `CACHE_TTL_HOURS` (default `24`).

> [!IMPORTANT]
> This entire subsystem is **scaffolded but not integrated** into `server.ts`. The `POST /api/route` handler does not call the semantic cache. The services currently live in `src/` (client-side tree) but import Node-only APIs and have no browser path — they need to be moved to the server-side codebase and wired into the route handler to become active.

---

## 7. Configuration & Deployment

### Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | **Yes** | — | Gemini provider auth + embedding service |
| `OPENAI_API_KEY` | No | — | OpenAI provider (if enabled) |
| `CLAUDE_API_KEY` / `ANTHROPIC_API_KEY` | No | — | Claude provider (if enabled) |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama endpoint |
| `NODE_ENV` | No | — | `production` disables Vite middleware, serves `dist/` |
| `PORT` | No | `3000` | Listen port |
| `CACHE_ENABLED` | No | `false` | Activates semantic cache lookup |
| `SEMANTIC_SIMILARITY_THRESHOLD` | No | `0.90` | Min cosine similarity for cache hit |
| `CACHE_TTL_HOURS` | No | `24` | Cache entry expiry |

### Scripts

```bash
npm run dev      # tsx server.ts — starts Express + Vite middleware (dev)
npm run build    # vite build   — produces /dist for production
npm run preview  # vite preview — serves built dist
npm run lint     # tsc --noEmit — type-check only, no emit
```

### Firebase

- Config loaded from `firebase-applet-config.json` at startup (not from env).
- The `firestoreDatabaseId` field in that file allows targeting a non-default Firestore database.
- `firestore.rules` and `firebase-blueprint.json` suggest planned Firebase CLI deployment.

---

## 8. Identified Issues & Gaps

### Critical

| # | Issue | Location |
|---|---|---|
| 1 | **Semantic cache is dead code** — implemented but never called | `src/services/*` vs `server.ts` |
| 2 | **Firestore config read on every request** — `getOrInitConfig()` performs a Firestore round-trip at every `/api/route` call, including twice (once for classifier, once for budget check) | `server.ts:140,152`, `gateway-manager.ts:24` |
| 3 | **No deduplication guard in cache** — `store()` contains a comment "Prevent exactly identical prompts from duplicating" but the actual guard code was never implemented | `cache-manager.ts:92` |
| 4 | **Firestore security rules are unauthenticated** — `config/global` is fully open | `firestore.rules:11` |

### Design / Quality

| # | Issue | Location |
|---|---|---|
| 5 | **`db: any` type** — both `GatewayManager` and `FirestoreCacheProvider` use `any` for the Firestore instance instead of `Firestore` from `firebase/firestore` | `gateway-manager.ts:10`, `cache-manager.ts:43` |
| 6 | **Cosine similarity O(N)** — in-process brute-force over 100 cached embeddings; won't scale | `cache-manager.ts:57–84` |
| 7 | **Flat-rate fallback cost** is a demo constant, not accurate for OpenAI/Claude | `server.ts:17–18` |
| 8 | **`lastReset` is never acted upon** — the config stores this field but there is no monthly reset scheduler or budget carryover logic | `gateway-manager.ts:32` |
| 9 | **Quality Score is hardcoded** — the UI displays `94.2%` with no computation backing it | `App.tsx:302` |
| 10 | **Services directory is in wrong place** — `src/services` is in the Vite/browser source tree but the files use server-only APIs (`process.env`) | `src/services/*` |
| 11 | **Model names don't match README** — `server.ts` hardcodes `gemini-3-flash-preview` / `gemini-3.1-pro-preview` but README describes `gemini-1.5-flash` / `gemini-1.5-pro` | `server.ts:21–22` |

---

## 9. Data Flow Diagram

```mermaid
flowchart TD
    U([User Browser]) -->|POST /api/route| S[server.ts\nExpress Handler]
    S -->|getOrInitConfig| FS[(Firestore\nconfig/global)]
    S -->|generateWithFailover cheap| GM[GatewayManager]
    GM -->|classifier call| GP[GeminiProvider]
    GP -->|@google/genai| GAPI[Gemini API]
    GAPI --> GM
    GM --> S
    S -->|budget check| FS
    S -->|generateWithFailover tier| GM
    GM -->|enabled+healthy order| P1[GeminiProvider]
    GM -->|failover| P2[OpenAIProvider]
    GM -->|failover| P3[ClaudeProvider]
    GM -->|failover| P4[OllamaProvider]
    P1 --> GAPI
    P2 --> OAPI[OpenAI API]
    P3 --> CAPI[Anthropic API]
    P4 --> OLAPI[Ollama localhost]
    GM --> S
    S -->|addDoc logs| FS
    S -->|increment totalSpend| FS
    S -->|JSON response| U
    U -->|GET /api/config\nGET /api/logs\nevery 10s| S
    S -->|getDocs| FS
    S --> U
```

---

## 10. Summary Verdict

This is a **well-conceived, architecturally sound prototype** for a multi-provider AI cost gateway. The provider abstraction is clean, the failover logic is production-ready in intent (AbortController, exponential backoff, health state persistence), and the UI is polished with editorial design.

The primary gap is the **semantic cache subsystem**: it is fully implemented in isolation but disconnected from the actual request path — the single feature that would most significantly reduce cost and latency at scale is inactive. The second major concern is **Firestore reads on every request**, which adds latency and cloud read cost per API call. Both are well-defined, scope-contained engineering tasks.
