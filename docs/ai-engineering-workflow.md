# AI-Assisted Engineering Workflow & Architecture

This guide explains how **Market Radar Demo** was built from the command line using a structured AI engineering setup—clarifying how the terminal runtime, the **Gentle AI** harness, the **Plan/Execute** model pairing, persistent memory, and specialized skills work together.

## Executive Summary

Modern AI-assisted software engineering is most reliable when **reasoning**, **execution**, **domain knowledge**, and **verification** are separated into explicit layers:

| Layer | What Runs Here | Core Responsibility |
|---|---|---|
| **Runtime Platform** | **Google Antigravity CLI (`agy`)** | Terminal execution engine: sandboxed commands, file tools, MCP servers, and native subagent spawning. |
| **Harness & Methodology** | **Gentle AI — Organic Driven Development (ODD)** | Behavioral rules, authorization gates, context-budget discipline, and risk classification. |
| **Dual-Model Orchestrator** | **Planner:** `Gemini 4 Pro (Medium)`<br>**Executor:** `Gemini 4 Flash (High)` | Separates read-only architectural planning from fast, verified implementation. |
| **Delegation Topology** | **Dynamic Bounded Subagents** | Isolates heavy exploration, parallel independent work units, or high-risk independent verification. |
| **Persistent Memory** | **Engram (MCP Server)** | Stores architectural decisions, root causes, and session handoffs across sessions. |
| **Specialized Skills** | `yahoo-finance`, `modern-web-guidance`, `impeccable`, `web-design-guidelines`, `cognitive-doc-design` | On-demand playbooks that replace guesswork with verified patterns and browser/API standards. |
| **Commit Guardrails** | `agent-secret-guard` (`pre-commit` + `gitleaks`) | Automated secret and private-key scanning on every commit. |

---

## 1. Architecture & Terminology (Runtime vs. Harness vs. Models)

Beginners often conflate the CLI tool, the workflow rules, and the underlying LLM. Separating those three concepts makes it clear why the system stays predictable:

```mermaid
flowchart LR
    U["Developer in Terminal"] --> R["Google Antigravity CLI (agy Runtime)"]
    R --> H["Gentle AI Harness (ODD Protocol)"]
    H --> P["Planner: Gemini 4 Pro (Medium) — Read-Only Plan"]
    P --> E["Executor: Gemini 4 Flash (High) — Code & Verify"]
    E --> S["Bounded Subagents (When Triggered)"]
    H <--> M["Engram MCP (Persistent Memory)"]
    E --> G["Pre-commit Guardrails + pytest + Visual Shots"]
```

### Runtime Platform: Google Antigravity CLI (`agy`)

**Antigravity (`agy`)** is the terminal-based agent runtime—not the methodology itself. It provides:
- **Terminal Sandboxing (`enableTerminalSandbox: true`)**: Commands run inside an isolated sandbox by default; explicit elevation is requested only for host port binding, network fetches, or git lock/SSH operations.
- **Tooling & MCP**: Native file read/edit/write tools, web search, and Model Context Protocol (MCP) connections such as **Engram**.
- **Native Subagent Lifecycle**: Spawns isolated background or read-only workers (`define_subagent` / `invoke_subagent`) without polluting the main conversation context.

### Harness & Methodology: Gentle AI & Organic Driven Development (ODD)

**Gentle AI** is the configuration and orchestration harness layered on top of Antigravity. Its default workflow, **Organic Driven Development (ODD)**, enforces a strict sequence on every request:

1. **Authorize**: Distinguish read-only exploration/questions from mutations before editing any file.
2. **Explore**: Inspect the existing codebase proportionally before proposing changes.
3. **Resolve Uncertainty**: Ask one focused question for real product ambiguities instead of guessing.
4. **Classify**: Size the task (`small` vs. `large`) by whether work can be resumed cleanly from the request and `git diff` alone—not by arbitrary file counts.
5. **Track**: Large multi-session features create a specification/task logbook (`odd/tasks/<feature>.md` + Engram mirror); small understood changes stay inline without ceremony.
6. **Implement & Verify**: Execute step by step, run focused tests and suites, and close every code change with an explicit **Risk line** (`Risk: none` or `Risk: item N`).

### What Is "Orchestration Mode"? (And Why Single-Chat Prompting Fails at Scale)

In naive single-chat prompting, one LLM session reads dozens of files, debates architecture, writes code, and reviews its own output inside an ever-growing context window. As context fills up, signal drowns in noise ("context rot"): earlier constraints get forgotten, edits drift, and the model wastes reasoning capacity on mechanical tasks (or rushes architectural decisions).

**Orchestration Mode** solves this by treating the main session as a **thin coordinator** operating along two axes:

1. **Vertical Orchestration (Plan → Execute Hand-off):**
   - **Planner (`Gemini 4 Pro (Medium)`)** starts every turn in read-only **Plan Mode**. It cannot edit project files; its only job is to inspect evidence, load relevant skills, resolve tradeoffs, and produce an explicit step-by-step contract with verification commands and `"Re-plan if"` triggers.
   - **Executor (`Gemini 4 Flash (High)`)** receives the approved contract via `exit_plan_mode` with Plan Mode disabled. It applies the edits quickly, runs `pytest` and visual checks, and **hands back** to the Planner (`enter_plan_mode`) immediately if a verification check fails twice or an assumption breaks—never guessing past the plan.
2. **Horizontal Orchestration (Parent Thread → Bounded Subagents):**
   - The parent thread enforces a tight inline evidence budget (~10k tokens / small read batches) so it stays focused on decisions and synthesis.
   - Under Gentle AI ODD, subagents (`define_subagent` / `invoke_subagent`) are **never** spawned just because a task feels large—they fire only when deterministic triggers hold:
     - **Mapping trigger**: Understanding requires more than ~5 sequential lookups, so a read-only explorer maps the code and returns concise `path:line` evidence.
     - **Writer trigger**: Two or more genuinely independent units with disjoint files can run in parallel, or the parent context approaches its backstop.
     - **Verification trigger**: A change touches a named **high-risk item** (irreversible data migrations, security/auth, breaking public contracts, concurrency, CI/deploy, or untested paths), earning an independent read-only verifier without the writer's context.

### Persistent Memory: Engram (MCP)

LLMs start every session stateless. **Engram** gives the agent structured, project-scoped long-term memory (`mem_context`, `mem_search`, `mem_save`, `mem_session_summary`) so decisions (such as adopting the botanical sage pastel palette), bug root causes (such as `display: flex` overriding `[hidden]`), and repository publication states survive across sessions and context compactions.

---

## 2. What Are Skills vs. Guardrails? (A Learner's Mental Model)

Newcomers often confuse **skills** and **guardrails** because both shape how an AI agent behaves. In practice, they play opposite, complementary roles:

| Dimension | Skills (Additive Capability) | Guardrails (Preventive Boundaries) |
|---|---|---|
| **Core question** | *"How do we build X to a high standard?"* | *"What must never break, leak, or bypass checks?"* |
| **How they run** | Loaded **on demand** by the agent when a task matches a domain (`SKILL.md` + scripts/CLI). | Enforced **deterministically** by the runtime, sandbox, test runner, or Git hooks—even if the model forgets. |
| **Failure mode prevented** | Outdated APIs, generic "AI-slop" styling, sloppy docs, or wrong domain formulas. | Leaked API keys/private keys, unauthorized file mutations, broken contracts, or unverified regressions. |
| **Examples in this repo** | `yahoo-finance`, `modern-web-guidance`, `impeccable`, `web-design-guidelines`, `cognitive-doc-design` | `enableTerminalSandbox`, read-only Plan Mode lock, `pytest` integrity suite, `pre-commit` + `gitleaks` |

### Specialized Skills Used in This Project

Skills are modular `SKILL.md` instruction packages loaded dynamically when a task matches their domain. Instead of relying on stale training weights, the agent consults authoritative, up-to-date playbooks before editing:

| Skill | Origin / Scope | What It Contributed to Market Radar Demo |
|---|---|---|
| **`yahoo-finance`** | Project skill (`.agents/skills/yahoo-finance`) | Guided safe `yfinance` data extraction, historical price windows, and fundamental fields in `scripts/build_radar.py`. |
| **`modern-web-guidance`** | Global plugin (`modern-web-guidance`) | Enforced Baseline modern web APIs with progressive fallbacks: `<dialog closedby="any">`, HTML Invoker Commands (`commandfor`/`command="--sort"`), `Element.prototype.moveBefore()`, `light-dark()`, and `color-mix(in oklab, ...)` to prevent washed-out or hue-shifted tints. |
| **`impeccable`** | Project skill (`.agents/skills/impeccable`) | Guided visual hierarchy, WCAG AA contrast checks, replacing generic dark-cyan "AI aesthetics" with the **botanical sage & warm paper / deep moss** palette, and running automated headless browser captures (`impeccable shot`) at `1440x900` and `390x844`. |
| **`web-design-guidelines`** | Project skill (`.agents/skills/web-design-guidelines`) | Supplemented accessibility, semantic landmarks, keyboard navigation (`/` search focus, dialog arrow stepping), and responsive table behavior. |
| **`cognitive-doc-design`** | Gentle AI global skill | Structured documentation (`README.md` and this guide) around low cognitive load: lead with the answer, progressive disclosure, tables over dense prose, and scannable sections. |

### Deterministic Guardrails Enforced in This Project

Guardrails do not trust LLM willpower—they are automated gates enforced by the environment and repository tooling:

| Guardrail | Mechanism | What It Protects |
|---|---|---|
| **Terminal Sandbox** | Antigravity `enableTerminalSandbox: true` | Isolates shell commands from arbitrary network access and host state unless the user explicitly approves elevation. |
| **Plan Mode Read-Only Lock** | Orchestrator `enter_plan_mode` / `exit_plan_mode` | Prevents the Planner from mutating files during investigation and forces explicit verification criteria before edits begin. |
| **Commit Secret & Key Guard** | `install-guardrails` (`.pre-commit-config.yaml` + `gitleaks` + `detect-private-key`) | Scans every staged change before `git commit` completes, blocking hardcoded tokens, credentials, or private keys. |
| **Automated Integrity & Factor Suite** | `pytest` (`tests/test_build_radar.py`, `tests/test_site_integrity.py`) | Verifies quantitative formulas, offline snapshot schema, accessibility attributes, favicon presence, and documentation links. |

---

## 3. Key Takeaways for Learners

If you are studying how to build production-grade software with AI agents, four habits from this demo matter most:

- **Concepts > Code**: Know *why* CSS `display: flex` overrides the HTML `[hidden]` attribute, or *why* `color-mix(in oklab, ...)` behaves better than `in oklch` near low chroma—the agent accelerates execution, while you own architectural judgment.
- **Read-Only Planning Before Mutation**: Separating planning (`Gemini 4 Pro`) from execution (`Gemini 4 Flash`) catches mismatched assumptions before files are edited.
- **Automated Verification Gates**: Every UI and pipeline change is backed by deterministic checks (`uv run --with pytest --with pandas --with numpy pytest -v`), integrity assertions (`tests/test_site_integrity.py`), visual viewport captures, and pre-commit secret scanning.
- **Explicit Disclaimers & Ownership**: Public AI-built demos must clearly document data sources, trademark non-affiliation (`Yahoo Finance`, `S&P 500®`, `yfinance`), and non-advisory boundaries.
