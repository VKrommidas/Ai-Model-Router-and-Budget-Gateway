# AI Model Router & FinOps Budget Gateway: Portfolio & Career Showcase

This guide provides everything needed to present the **AI Model Router & FinOps Gateway** as a flagship portfolio project for engineering interviews, resumes, LinkedIn, and GitHub.

---

## 🎯 Target Engineering Roles

This project demonstrates cross-disciplinary expertise suitable for:
1. **AI / LLM Platform Engineer** (Model routing, semantic vector search, prompt classification, fallback resilience)
2. **Senior Full-Stack Engineer** (TypeScript, React 19, Express, Vite, dual-layer persistence, automated testing)
3. **FinOps / Cloud Infrastructure Engineer** (LLM cost governance, circuit breakers, automated frugality throttling, token auditing)

---

## 📄 High-Impact Resume & CV Bullet Points

Choose the section that aligns best with your target role. Each bullet uses the **Google XYZ format** (*"Accomplished [X], as measured by [Y], by doing [Z]"*).

### Option 1: AI / Machine Learning Platform Engineer
* **Architected an intelligent LLM routing gateway** in TypeScript and Express that optimizes inference costs by dynamically classifying incoming prompts using a blended scoring algorithm (30% heuristic regex/length + 70% lightweight LLM meta-evaluation).
* **Engineered a sub-millisecond semantic vector caching engine** using Google's `gemini-embedding-001` and normalized cosine similarity ($\ge 0.90$), eliminating redundant LLM API calls and delivering $0-token, zero-cost responses with ~500ms latency.
* **Designed resilient multi-model failover chains** that mitigate Google Gemini free-tier rate limits (HTTP 429 `RESOURCE_EXHAUSTED`) and model deprecations by automatically cascading requests across `flash-lite`, `flash`, and `pro` tiers without client-facing errors.
* **Implemented an automated unit test suite** (20 passing tests across 3 suites) using Node.js native test runner, validating vector geometry, classification thresholds, and financial circuit breakers in under 400ms.

### Option 2: Full-Stack Software Engineer (TypeScript / React 19 / Node.js)
* **Developed a production-grade LLM proxy and telemetry dashboard** featuring an Express.js backend and a modern React 19 / Tailwind CSS v4 frontend with real-time operational metrics and budget burn tracking.
* **Built a dual-layer data architecture** with Firebase Firestore for persistent query logging and an automatic in-memory fallback cache that ensures seamless local operation even under restricted cloud permissions.
* **Created runtime configuration controls** allowing real-time adjustment of monthly spending limits, request timeouts, and model provider mappings without server restarts.
* **Refactored core routing logic** into pure, decoupled domain functions, achieving 100% test coverage on critical path business rules with zero external test framework bloat.

### Option 3: FinOps & Cloud Cost Optimization
* **Built an autonomous LLM budget enforcement gateway** that eliminates surprise cloud bills through real-time, sub-cent token cost tracking and multi-tier governance rules.
* **Implemented a two-tier financial circuit breaker:** automatically triggers **Aggressive Frugality Mode** (>90% budget consumption) by forcing complex queries to low-cost models, and halts outbound traffic with `HTTP 402 Payment Required` upon reaching 100% budget exhaustion.
* **Reduced repeated query API expenditures to zero** by intercepting semantically equivalent prompts via an embedding-based cosine similarity cache before reaching external LLM providers.

---

## 🌐 LinkedIn & GitHub Project Description

### LinkedIn Project Post / Portfolio Summary

> **Title:** Building an Intelligent AI Model Router & FinOps Gateway 🚀
> 
> As LLM adoption grows, two major operational challenges arise: **unpredictable API token costs** and **brittle single-model rate limits**. Sending trivial greetings or simple lookups to high-cost reasoning models burns engineering budgets, while duplicate queries waste both latency and compute.
> 
> To solve this, I designed and built the **AI Model Router & FinOps Gateway** — an intelligent, production-ready proxy and live telemetry control center.
> 
> **Key Architecture Highlights:**
> 1. ⚡ **Semantic Vector Cache:** Generates 768-dimensional embeddings (`gemini-embedding-001`) and computes cosine similarity ($\ge 0.90$) to serve repeated or paraphrased queries at $0 cost and ~500ms latency.
> 2. 🧠 **Dual-Stage Complexity Classifier:** Blends regex/length heuristics (30%) with an ultra-fast LLM meta-evaluator (70%) to route queries to either an efficient tier (`gemini-3.5-flash-lite`) or reasoning tier (`gemini-3.1-pro-preview`).
> 3. 🛡️ **Autonomous FinOps Circuit Breaker:** Dynamically throttles queries into "Aggressive Frugality Mode" when monthly spend exceeds 90%, and suspends traffic with HTTP 402 upon 100% exhaustion.
> 4. 🔄 **Resilient Failover Cascade:** Automatically reroutes requests across model families when hitting API quotas (HTTP 429) or model deprecations.
> 5. 🧪 **100% Native Automated Test Suite:** 20 unit tests covering vector math, classification logic, and budget enforcement executing in under 400ms.
> 
> **Tech Stack:** TypeScript, React 19, Tailwind CSS v4, Express, Node.js, Firebase Firestore, Google Gemini API.
> 
> Check out the architecture diagram and live walkthrough on GitHub: [link to your repo]
> 
> #ArtificialIntelligence #TypeScript #FinOps #ReactJS #FullStack #SoftwareEngineering #CloudCost

---

## 🎥 Demonstration Walkthrough & Recording Script

Use a tool like **ScreenToGif** (Windows), **OBS Studio**, or **CleanShot X** to capture short, crisp clips or an end-to-end 60-second video for your README and LinkedIn.

### Scene 1: Cost-Effective Routing (0:00 - 0:15)
* **Tab:** `02 / Playground`
* **Input Query:** `"What are three healthy sleep habits?"`
* **Action:** Click **Execute Route**.
* **Visual to Highlight:**
  * Selected Terminal shows `gemini-3.5-flash-lite`.
  * Difficulty score is low ($\approx 16\% - 30\%$).
  * Cost displays sub-cent price ($\approx \$0.00010$).

### Scene 2: Reasoning Tier Escalation (0:15 - 0:30)
* **Tab:** `02 / Playground`
* **Input Query:** `"Write a step-by-step Python function to debug memory leaks in a multiprocessing queue and explain garbage collection internals."`
* **Action:** Click **Execute Route**.
* **Visual to Highlight:**
  * Selected Terminal escalates to `gemini-3.1-pro-preview`.
  * Difficulty score rises above the $60\%$ threshold ($\approx 75\% - 95\%$).
  * Response is deep, structured, and includes complete code.

### Scene 3: Semantic Vector Cache Hit (0:30 - 0:45)
* **Tab:** `02 / Playground`
* **Query 1:** `"What is quantum entanglement? Explain in three simple bullet points."` (Execute -> LLM responds).
* **Query 2 (Paraphrased):** `"Can you explain quantum entanglement in 3 simple bullets?"`
* **Action:** Click **Execute Route**.
* **Visual to Highlight:**
  * Animated green banner: **`⚡ SEMANTIC VECTOR CACHE HIT`**.
  * Cosine similarity badge displays $\approx 97.7\%$.
  * Cost displays: **`$0.00000 (Free)`**.
  * Latency drops significantly (zero LLM tokens used).

### Scene 4: FinOps Circuit Breaker (0:45 - 1:00)
* **Tab:** `04 / Controls`
* **Action:** Change **Monthly Budget ($)** to `$0.0001` (below current spend) and click **Save Parameters**.
* **Tab:** Switch to `02 / Playground` and submit any query.
* **Visual to Highlight:**
  * Request is halted with **`HTTP 402 Payment Required`**.
  * Crisp red alert banner: *"Monthly budget exhausted. Service suspended until reset."*
  * Proves financial protection prevents runaway charges.

---

## 🎙️ Interview Talking Points & Technical FAQs

### Q1: "Why did you build a custom semantic cache instead of using an off-the-shelf vector database like Pinecone or Weaviate?"
> *"For an API gateway, minimizing latency and infrastructure overhead is critical. By implementing normalized cosine similarity directly in the service layer using 768-dimensional embeddings from `gemini-embedding-001`, we achieved sub-millisecond similarity scoring without external network hops to a third-party vector DB cluster. Additionally, by designing a dual-layer storage model with Firestore and an in-memory fallback, the gateway operates reliably in local development and restricted cloud environments without external dependencies."*

### Q2: "How does the dual-stage complexity classifier avoid adding noticeable latency?"
> *"We use a two-tiered approach: first, deterministic regex and length heuristics run synchronously in $<1\text{ms}$. Second, for borderline queries, we issue an asynchronous meta-evaluation prompt to the ultra-lightweight `gemini-3.5-flash-lite` model, instructing it to return only a single float. The two scores are combined using a 30/70 weighted formula. The entire classification adds negligible overhead compared to the substantial cost savings of not sending simple queries to expensive reasoning models."*

### Q3: "How do you handle API quota limits and model deprecations in production?"
> *"Public model APIs frequently experience free-tier rate limits (like Gemini's 20 requests/day ceiling on certain models) or version deprecations. I designed a cascading failover mechanism in `gateway-manager.ts` and `gemini-provider.ts` that detects HTTP 429 `RESOURCE_EXHAUSTED` and 404 deprecation errors, seamlessly stepping down through a prioritized list of fallback candidates (`gemini-3.5-flash-lite` $\rightarrow$ `gemini-3-flash-preview` $\rightarrow$ `gemini-3.1-pro-preview`) with exponential backoff before surfacing any error to the user."*

### Q4: "How does the budget circuit breaker work under concurrent traffic?"
> *"Every inbound request checks current cumulative spend against the monthly budget limit stored in global configuration. If spend reaches 100%, the gateway immediately short-circuits with an HTTP 402 before making any provider API calls. Furthermore, to prevent sudden overruns, we built an 'Aggressive Frugality Mode' triggered at 90% budget utilization, which dynamically downgrades all queries to the cheapest tier regardless of complexity score."*
