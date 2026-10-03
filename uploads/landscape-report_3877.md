# Agentic Frontend Landscape (React / Next.js): Gaps and Open-Source Opportunities

*Prepared for Jignesh Dhamecha (GitHub: djig) on Oct 3, 2026. Research and ideation only. No code or repos created.*

**How the numbers were gathered.** GitHub star counts and last-push dates came from the GitHub API on 2026-10-03 PT. npm weekly downloads are for the week of 2026-09-25 to 2026-10-01 (api.npmjs.org). Anything I could not confirm directly is marked **(unverified)**. Descriptions of features come from the linked docs, READMEs, or blog posts.

---

## 0. TL;DR

* **Vercel is taking over the Next.js agent loop itself.** Next.js 16+ ships a built-in MCP endpoint (`/_next/mcp`). 16.2 added docs bundled in `node_modules` plus an auto-managed `AGENTS.md`. 16.3 added first-party Skills (`next-dev-loop`, `next-cache-components-*`, `next-partial-prefetching-adoption`), React introspection in `agent-browser`, and error pages written for agents. Don't build "Next.js knowledge for agents" or a "Next.js dev-loop MCP": Vercel owns that space now.
* **Generic browser and runtime tooling is saturated.** Examples: Playwright MCP (37.8k★), Chrome DevTools MCP (52.9k★, perf traces with CrUX), agent-browser (43.5k★, with React tree, renders, and Suspense inspection), React Doctor (15.0k★, 2.26M dl/wk), axe MCPs (including Deque's official one), aimock for deterministic LLM/AG-UI/MCP mocks, AG-UI DevTools, and AI SDK DevTools.
* **Agentic-UI protocols have mostly settled.** AI SDK 7 / `useChat` dominates React (`ai` 33.7M dl/wk). AG-UI hit **1.0 on Sep 30, 2026**. MCP Apps (SEP-1865) is the official UI-in-chat standard, and ChatGPT supports it. A2UI (16.6k★) handles declarative generative UI. json-render (18.5k★) covers catalog-based generative UI, including MCP Apps output.
* **Gaps that are still open** sit between these layers, where no single vendor owns the problem:
  1. Component awareness for codebases that don't use Storybook or shadcn.
  2. A way to consume AG-UI agents from `useChat` / AI Elements.
  3. Mapping a change to its affected routes for agent and PR verification.
  4. Testing every streaming state of generative-UI components.
  5. Structured design-to-DOM fidelity diffs.
  6. Provider-agnostic security checks on the Server Action / RSC boundary.
  7. Accessibility *testing* of streaming chat UIs.
  8. Design-token enforcement outside Tailwind.

**Top 3 for a solo frontend engineer:** (1) **component-atlas**, (2) **ag-ui-chat-transport**, (3) **route-impact**. Reasoning is in §5.

---

## 1. Coding-agent tooling for React / Next.js

### 1.1 Agent extension formats (the distribution channels)

| Channel | State (Oct 2026) | Source |
|---|---|---|
| **Agent Skills (`SKILL.md`)** | A cross-agent standard. Claude Code, Cursor, Copilot, Codex, Gemini CLI, Windsurf, and Cline all support it. Installed via `npx skills add …`, with skills.sh as the directory. | [skills.sh/topic/react](https://www.skills.sh/topic/react), [Codex skills](https://developers.openai.com/codex/skills), [Copilot skills](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-skills) |
| **AGENTS.md** | The de facto repo-instructions file (agentsmd/agents.md, 24.7k★). Copilot coding agent supports it, including nested files. Next.js 16.3 writes a managed block into it automatically. | [agents.md repo](https://github.com/agentsmd/agents.md), [GitHub changelog](https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/), [Next 16.3 AI post](https://nextjs.org/blog/next-16-3-ai-improvements) |
| **Claude Code plugins** | Official marketplace at `anthropics/claude-plugins-official` (37.3k★). Plugins bundle skills, subagents, hooks, commands, and MCP servers. `anthropics/skills` has 179.5k★. | [repo](https://github.com/anthropics/claude-plugins-official), [docs](https://code.claude.com/docs/en/discover-plugins) |
| **Cursor plugins / Marketplace** | A reviewed marketplace. Plugins bundle skills, subagents, rules, hooks, commands, and MCP servers. | [Cursor plugins docs](https://cursor.com/docs/plugins.md), [blog](https://cursor.com/blog/marketplace) |
| **Codex plugins** | Plugins are the install unit for skills and apps. The skills format matches Claude/Copilot. | [Codex skills](https://developers.openai.com/codex/skills) |
| **Rules sync** | Already solved: ruler (2.9k★) and rulesync (1.5k★). | [ruler](https://github.com/intellectronica/ruler), [rulesync](https://github.com/dyoshikawa/rulesync) |

**Implication:** ship anything new as an **npm CLI + MCP server + SKILL.md**, and optionally as a Claude/Cursor/Codex plugin. One codebase reaches every agent.

### 1.2 Framework- and stack-specific agent tooling

| Tool | What it does | Traction | Notes |
|---|---|---|---|
| **Next.js built-in MCP + `next-devtools-mcp`** (Vercel) | The `/_next/mcp` endpoint provides `get_errors`, `get_logs`, `get_routes`, `get_page_metadata`, `get_server_action_by_id`, `get_compilation_issues`, and `compile_route`. Since v0.4 the npm package is a thin connector that adds docs and browser "gateways". | 822★; 138k dl/wk | [Next MCP guide](https://nextjs.org/docs/app/guides/mcp), [repo](https://github.com/vercel/next-devtools-mcp), [chris.lu walkthrough](https://chris.lu/web_development/tutorials/next-js_16_devtools_mcp) |
| **Next.js 16.3 first-party Skills** | `next-dev-loop`, `next-cache-components-adoption`, `next-cache-components-optimizer`, `next-partial-prefetching-adoption`. Error output now carries labeled fixes and a "Copy prompt" button. Earlier knowledge skills were retired in favor of bundled docs. | first-party | [Next 16.3 AI improvements](https://nextjs.org/blog/next-16-3-ai-improvements) |
| **Vercel agent-skills** | `vercel-react-best-practices` (~70 perf rules), `vercel-composition-patterns`, React Native skills | 31.9k★ | [repo](https://github.com/vercel-labs/agent-skills), [Vercel skills docs](https://vercel.com/docs/agent-resources/skills) |
| **vercel-plugin** | Claude/Cursor plugin covering the Vercel ecosystem | 295★ | [repo](https://github.com/vercel/vercel-plugin) |
| **agent-browser** (Vercel Labs) | Browser CLI for agents with snapshot/ref workflow, diff (snapshot + pixel), and Web Vitals. v0.27 added **React DevTools introspection** (`react tree / inspect / renders / suspense`). Absorbed `next-browser`. | 43.5k★; 2.07M dl/wk | [repo](https://github.com/vercel-labs/agent-browser), [diff docs](https://vercel-labs-agent-browser.mintlify.app/guides/diff-testing) |
| **before-and-after** (Vercel Labs) | Skill + CLI that captures before/after screenshots of URLs you give it into a PR table | 392★ | [repo](https://github.com/vercel-labs/before-and-after) |
| **Chrome DevTools MCP** | Perf traces and insights (LCP breakdown, render-blocking, INP/CLS), CrUX field data since Feb 2026, network, console | 52.9k★; 2.05M dl/wk | [repo](https://github.com/ChromeDevTools/chrome-devtools-mcp), [tool ref](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/HEAD/docs/tool-reference.md) |
| **React DevTools for agents** | A search result points to an official `react-devtools-cdt-mcp` package (component tree, props, hooks, profiling) integrated with chrome-devtools-mcp. **(unverified: README fetch came back empty)** | n/a | [search hit](https://github.com/react/react/tree/main/packages/react-devtools-cdt-mcp) |
| **Playwright MCP** | Accessibility-tree browser control | 37.8k★; 8.76M dl/wk | [repo](https://github.com/microsoft/playwright-mcp) |
| **Storybook MCP** (`@storybook/addon-mcp`) | Component and docs manifests, story generation, interaction and a11y tests, a self-healing loop. Requires Storybook, and the components manifest is opt-in and limited to certain frameworks. | 270★ (storybookjs/mcp); addon 2.87M dl/wk | [docs](https://storybook.js.org/docs/ai/mcp/overview), [npm](https://www.npmjs.com/package/@storybook/addon-mcp) |
| **shadcn MCP + registries** | List, search, view, and install items from any shadcn-compatible registry, including private ones | shadcn 125k★; CLI 12.8M dl/wk | [docs](https://ui.shadcn.com/docs/mcp) |
| **@shadcn/lint** | "Agent-first linter for Tailwind design systems". Covers component contracts, theme tokens, and bans raw colors and arbitrary values. | 3.0k★; 1.44M dl/wk | [repo](https://github.com/shadcn-ui/lint) |
| **Figma MCP** (official, remote) | `get_design_context`, `get_metadata`, `get_screenshot`, `get_variable_defs`, and Code Connect mapping. Its "implement design" skill tells the agent to compare against the screenshot side by side, i.e. visually. | guide repo 2.0k★ | [tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/), [skill](https://developers.figma.com/docs/figma-mcp-server/skill-figma-implement-design/) |
| **Figma-Context-MCP** (Framelink, community) | Figma layout data for agents | 16.0k★ | [repo](https://github.com/GLips/Figma-Context-MCP) |
| **React Doctor** (Million) | Deterministic React linter built for agent-written code. Covers state/effects, perf, architecture, security, a11y, and repeated JSX. Includes a skill installer, a CI diff-only mode, and runtime perf traces. | 15.0k★; 2.26M dl/wk | [repo](https://github.com/millionco/react-doctor) |
| **react-scan** | Detects render performance issues | 21.9k★ | [repo](https://github.com/aidenybai/react-scan) |
| **Element → source pickers** | react-grab (7.6k★), stagewise (6.8k★, now an "agentic IDE"), onlook (26.9k★), domscribe (192★), dev-inspector-mcp (47★) | see repos | [react-grab](https://github.com/aidenybai/react-grab), [onlook](https://github.com/onlook-dev/onlook) |
| **Docs freshness** | Context7 (62.6k★) for hosted docs retrieval. Next.js bundles its docs and appends `.md` to any docs URL. | | [context7](https://github.com/upstash/context7) |
| **Accessibility MCPs** | Deque's official axe MCP, mcp-accessibility-scanner (57★), a11y-mcp (52★), many smaller ones | small but crowded | [deque](https://github.com/dequelabs/axe-mcp-server-public), [scanner](https://github.com/JustasMonkev/mcp-accessibility-scanner) |
| **Visual testing w/ agent surface** | Argos (636★) is OSS with an MCP server, CLI, skills, and "review by agents". Lost Pixel (1.7k★). Both need you to write screenshot tests or list pages. | | [argos](https://argos-ci.com), [lost-pixel](https://github.com/lost-pixel/lost-pixel) |
| **Migrations** | `@next/codemod` (upgrades plus the `agents-md` codemod), codemod.com Pages→App recipe, Blazity next-migration-skills (24★), migrate-bot (commercial, **unverified**) | | [codemod blog](https://codemod.com/blog/dream-migration), [Blazity](https://github.com/Blazity/next-migration-skills), [Next migration guide](https://nextjs.org/docs/app/guides/migrating/app-router-migration) |
| **Agent-config evals** | agents-md-bench (0★) and the arXiv paper "Evaluating AGENTS.md" (2602.11988) | | [bench](https://github.com/fy-06/agents-md-bench), [paper](https://arxiv.org/abs/2602.11988) |

---

## 2. Libraries for building agentic UIs in React / Next.js

| Library / protocol | Role | Traction | Notes |
|---|---|---|---|
| **Vercel AI SDK** (`ai`, `@ai-sdk/react`) | `useChat`, transports, typed tool UI parts, agents (`ToolLoopAgent`), tool approval, MCP client, DevTools. **v6 shipped Dec 22, 2025; v7 shipped Jun 25, 2026.** | 27.1k★; `ai` 33.7M dl/wk, `@ai-sdk/react` 10.7M dl/wk | [AI SDK 6](https://vercel.com/blog/ai-sdk-6), [AI SDK 7](https://vercel.com/changelog/ai-sdk-7), [transport](https://ai-sdk.dev/docs/ai-sdk-ui/transport) |
| **AI Elements** | shadcn-registry components for AI apps (Message, Tool, Confirmation, …) | 2.5k★ | [repo](https://github.com/vercel/ai-elements), [Tool component](https://elements.ai-sdk.dev/components/tool) |
| **Streamdown** | Markdown renderer built for streaming | 5.7k★; 7.9M dl/wk | [repo](https://github.com/vercel/streamdown) |
| **json-render** (Vercel Labs) | Catalog-based generative UI. Defines one catalog that renders in React and can output **MCP Apps** via `@json-render/mcp`. | 18.5k★; core 2.2M dl/wk | [repo](https://github.com/vercel-labs/json-render), [MCP docs](https://json-render.dev/docs/api/mcp) |
| **CopilotKit** | "Frontend stack for agents". The reference AG-UI client for React, Angular, Vue, React Native, and chat platforms. Includes an Inspector and A2UI/MCP Apps rendering. | 37.7k★; react-core 605k dl/wk | [repo](https://github.com/CopilotKit/CopilotKit) |
| **AG-UI protocol** | Agent↔UI event protocol. **1.0 released Sep 30, 2026** with a JSON Schema spec, subagents, interrupts (HITL), multimodal tool results, and token usage. Integrates with LangGraph, Mastra, ADK, Claude Managed Agents, OpenAI Agents SDK, Pydantic AI, and more. | 16.3k★; `@ag-ui/client` 1.71M dl/wk | [AG-UI 1.0](https://www.copilotkit.ai/blog/ag-ui-1.0), [repo](https://github.com/ag-ui-protocol/ag-ui) |
| **assistant-ui** | React chat primitives. Adapters for AI SDK, LangGraph, and **AG-UI** (`@assistant-ui/react-ag-ui`, 94k dl/wk). | 12.4k★; 2.33M dl/wk | [repo](https://github.com/assistant-ui/assistant-ui) |
| **tambo** | Generative UI SDK for React (register components with schemas) | 11.2k★; `@tambo-ai/react` 6.4k dl/wk **(package name may have changed; downloads unverified)** | [repo](https://github.com/tambo-ai/tambo) |
| **TanStack AI** | Type-safe, provider-agnostic AI SDK | 3.2k★; 611k dl/wk | [repo](https://github.com/TanStack/ai) |
| **MCP Apps (SEP-1865)** | Official MCP extension: `ui://` resources rendered in sandboxed iframes over postMessage JSON-RPC. Spec version 2026-01-26. React hook `useApp()`. ChatGPT supports it. | ext-apps 2.9k★; 5.0M dl/wk | [SEP](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp), [ChatGPT compat](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt) |
| **MCP-UI** | Predecessor/companion SDK for UI over MCP | 5.2k★; client 395k dl/wk | [repo](https://github.com/MCP-UI-Org/mcp-ui) |
| **OpenAI Apps SDK** | ChatGPT apps, now aligned with MCP Apps | examples 2.4k★ | [examples](https://github.com/openai/openai-apps-sdk-examples) |
| **Skybridge** | Full-stack TS framework for MCP Apps and ChatGPT Apps | 2.1k★; 77k dl/wk | [repo](https://github.com/alpic-ai/skybridge) |
| **Next.js starters for MCP Apps / ChatGPT apps** | Vercel templates built on `mcp-handler` | 24★ / 253★ | [mcp-apps starter](https://github.com/vercel-labs/mcp-apps-nextjs-starter), [chatgpt starter](https://github.com/vercel-labs/chatgpt-apps-sdk-nextjs-starter) |
| **A2UI** (Google-originated) | Declarative JSONL UI spec rendered with native components. v0.9 is out. Can embed MCP Apps and vice versa. | a2ui-project/a2ui 16.6k★ | [repo](https://github.com/a2ui-project/a2ui), [A2UI in MCP Apps](https://a2ui.org/guides/a2ui-in-mcp-apps/) |
| **Mastra / LangGraph.js** | Agent frameworks with AG-UI adapters (`@ag-ui/mastra`, `@ag-ui/langgraph`) | 28.5k★ / 3.3k★ | [mastra](https://github.com/mastra-ai/mastra), [langgraphjs](https://github.com/langchain-ai/langgraphjs) |
| **Agent Elements** (21st.dev) | shadcn registry of agent chat components | 104★ | [docs](https://agent-elements.21st.dev/docs/mcp) |
| **Testing / devtools** | aimock (957★, 713k dl/wk) mocks LLM, MCP, A2A, AG-UI, and vector DBs with record/replay. AI SDK `MockLanguageModel` + `simulateReadableStream`. AG-UI DevTools (Chrome extension). CopilotKit Inspector. AI SDK DevTools. | | [aimock](https://aimock.copilotkit.dev/), [AI SDK testing](https://ai-sdk.dev/docs/ai-sdk-core/testing), [AG-UI DevTools](https://chromewebstore.google.com/detail/ag-ui-devtools/bfdacpjjmapclfedhocdbogihggpnkob) |
| **Streaming a11y** | generative-a11y (5★, new): paced live-region announcements with AI SDK, assistant-ui, and AG-UI adapters | early | [repo](https://github.com/bhaveshchow20/generative-a11y), [site](https://generativea11y.com/) |

---

## 3. Agent-in-the-loop dev workflows: what's covered and what isn't

| Workflow | Covered by | What's still missing |
|---|---|---|
| Runtime errors, routes, logs (Next) | `/_next/mcp`, next-devtools-mcp, `next-dev-loop` | Little; Vercel owns this. |
| Browser driving, screenshots | agent-browser, Playwright MCP, Chrome DevTools MCP | Little. |
| React runtime state and renders | agent-browser `react *`, react-scan, React Doctor `scan`, react-devtools MCP (unverified) | Little. |
| **Visual verification of a change** | before-and-after (needs URLs), agent-browser diff (needs URLs), Argos/Lost Pixel (needs existing tests or a page list) | **Nothing decides *which* routes a diff affects.** Next 16.3's own fix prompt tells agents to "re-check the sibling routes… a before/after capture of the affected routes" ([source](https://nextjs.org/blog/next-16-3-ai-improvements)), but no tool computes that list. Near-misses are all 0★: affected-ci, component-to-route, and a find-impacted-routes skill. |
| **Design → code fidelity** | Figma MCP (screenshot + context; the agent compares by eye), Code Connect | **No structured diff of design vs. DOM** (spacing, typography, color tokens). Near-misses are 0–7★: figma-proxy-mcp `verify_render`, mcp-component-review, figma-to-code-parity-agent, SoDam-Design-Kit. |
| **Component-library awareness** | Storybook MCP (Storybook users only), shadcn MCP (registry users only), Code Connect (Figma-mapped only) | **Nothing for the common case: an in-house component folder with no Storybook.** Agents hallucinate props and create duplicates. Storybook's own docs tell you to add "CRITICAL: Never hallucinate component properties!" to AGENTS.md ([source](https://storybook.js.org/docs/ai)). Near-misses: agentic-component-manifest (4★), ds-manifest (2★), drykit (0★), duplicalis (8★), doppel-ts (0★), storybook-oversight (15★, Storybook-only). |
| Design-system / token conformance | @shadcn/lint (Tailwind-only), motif skills (1★), ds-skills (8★), ui-tokenize (2★) | **Non-Tailwind stacks** (CSS Modules, vanilla-extract, styled-components, Panda) using W3C DTCG tokens. |
| Accessibility checks | axe MCPs, Storybook a11y tests, React Doctor a11y rules | **Streaming / agentic chat UIs:** no test harness asserts screen-reader announcements, focus, or approval-dialog flows. generative-a11y covers runtime, not testing. |
| Core Web Vitals | Chrome DevTools MCP (+CrUX), agent-browser vitals, Lighthouse MCPs | Per-route perf deltas tied to a PR. Could be a module of route-impact. |
| RSC / caching correctness | Next 16.3 Instant Insights + Cache Components skills, React Doctor | Little for the Next-specific parts. |
| **Server Action / route-handler security** | @clerk/eslint-plugin `require-auth-protection` (Clerk-only), prodlint (15★, broad "vibe-code" scanner), React Doctor "security" category, actionguard repos (0★) | **Provider-agnostic auth-coverage checks** (Auth.js, Better Auth, Supabase, custom) plus detection of RSC→client props over-exposure. |
| Migrations | @next/codemod, codemod.com recipe, Blazity skills, Cache Components adoption skill | **Route-parity verification** (old vs. new build: status codes, redirects, headers, meta/SEO, rendered output). |
| Testing generation | Storybook MCP, Playwright agents, aimock | **Generative-UI components across streaming states:** AI SDK docs describe one story per `ToolUIPart` state, but nothing generates them ([UIMessage ref](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message)). |
| Protocol interop | AG-UI→AI SDK server integration ([ag-ui PR #1626](https://github.com/ag-ui-protocol/ag-ui/pull/1626)), assistant-ui AG-UI adapter, CopilotKit | **No published `ChatTransport` lets `useChat` / AI Elements talk to an AG-UI agent.** I searched npm and GitHub code: one in-app implementation exists inside an unrelated project (laofahai/linchkit), and a third-party issue asks for one ([edgestream/AI.Agent#6](https://github.com/edgestream/AI.Agent/issues/6)). |

---

## 4. Ranked project ideas

Effort assumes one experienced frontend engineer working with coding agents. "Days" means focused build days for v0.1.

### #1. component-atlas: component awareness for any React codebase (MCP + skill + CI guard)
* **Pitch:** "Stop your agent from writing `Button2.tsx`." It builds a live manifest of *your* components (props, variants, usage examples taken from real call sites) and serves it to agents over MCP, a skill, and AGENTS.md, with no Storybook needed.
* **Gap and evidence:** Storybook MCP only helps teams running Storybook with the opt-in manifest on supported frameworks. shadcn MCP only covers registry items. Storybook's docs have to instruct agents "never hallucinate component properties". The search for a standalone manifest or MCP turned up only tiny projects: ACM 4★, ds-manifest 2★, drykit 0★, doppel-ts 0★, duplicalis 8★.
* **Closest alternatives and why they fall short:**
  * Storybook MCP: requires Storybook, which many product repos don't have or keep stale.
  * shadcn MCP: covers vendored primitives, not app-level components.
  * React Doctor's "repeated JSX": finds duplicates after the fact and doesn't steer generation.
  * Figma Code Connect: needs Figma mapping.
* **MVP (v0.1):**
  * `npx component-atlas scan` uses the TS compiler / react-docgen-typescript to extract components, props, JSDoc, `cva` variants, import paths, and `@deprecated` tags.
  * Mines the top-N real usages per component from the repo as examples.
  * Emits `atlas.json`, using Storybook-manifest-compatible fields where possible.
  * MCP server with `search_components`, `get_component`, `find_similar(description|jsx)`.
  * SKILL.md: "search the atlas before creating a component".
  * `atlas check` CI/hook flags new components that look like existing ones (prop-signature + JSX-shape similarity).
* **Effort:** 6–8 days.
* **Adoption / impact:** High. Every team using agents on a mid-size React app has this pain. Fits all agents. Natural follow-ons: a design-system-author mode and shipping `atlas.json` inside npm packages.

### #2. ag-ui-chat-transport: use AI SDK `useChat` / AI Elements with any AG-UI agent
* **Pitch:** One import, `useChat({ transport: new AgUiChatTransport({ url }) })`, and AI Elements / any `useChat` UI can talk to LangGraph, Mastra, ADK, Pydantic AI, Claude Managed Agents, and others.
* **Gap and evidence:** AG-UI 1.0 shipped on Sep 30, 2026, with 1.71M dl/wk for `@ag-ui/client`. `useChat` has 10.7M dl/wk. CopilotKit and assistant-ui both consume AG-UI, but **AI SDK UI does not**. AG-UI's AI SDK work goes the other direction (an AI SDK agent emitting AG-UI events, PR #1626). npm and GitHub code search found no published transport.
* **Closest alternatives:**
  * Switch the UI to CopilotKit or assistant-ui, which means rewriting the UI layer.
  * Write a custom transport by hand. AI SDK docs explain the interface but provide no AG-UI adapter.
* **MVP:**
  * A `ChatTransport` that maps AG-UI events to `UIMessageChunk`s: text, reasoning, tool call start/args/end/result → tool parts, `STATE_DELTA` → data parts, interrupts → AI SDK tool-approval parts, `RUN_FINISHED` usage → message metadata, subagents → part metadata.
  * Reconnect/resume support.
  * An example Next.js app with AI Elements against a Mastra or LangGraph agent.
  * Conformance tests against aimock's AG-UI fixtures.
* **Effort:** 3–5 days.
* **Adoption / impact:** Medium-high, and very timely. It's small and focused, which makes it easy to tweet and easy to upstream. **Risk:** Vercel or the AG-UI team may ship it first. That's acceptable, because upstreaming builds credibility. Worth opening an issue or discussion early.

### #3. route-impact: "TurboSnap for Next.js routes" (agent skill + CI action)
* **Pitch:** Given a git diff, it computes exactly which Next.js routes changed. It then captures before/after screenshots plus axe and Web Vitals deltas for only those routes, for the agent's self-check or as a PR comment.
* **Gap and evidence:** Next 16.3's own agent fix-prompt tells agents to re-check affected sibling routes with before/after captures, but no tool determines that set. before-and-after and agent-browser diff need URLs. Argos and Lost Pixel need existing tests or page lists. Chromatic TurboSnap is Storybook-only and commercial. Near-misses are all 0★: affected-ci, component-to-route, and a find-impacted-routes skill.
* **Closest alternatives:** see above. They stop at capture/review and never select routes.
* **MVP:**
  * Reverse import graph built from the diff (TS path aliases, barrels, CSS modules).
  * Mapping to `app/**/page.tsx` and `pages/**`, expanding layouts, templates, and route groups; middleware and global CSS are treated as "broad".
  * Dynamic-segment sample params read from a config or `generateStaticParams`.
  * Output: JSON for agents.
  * Adapters: agent-browser or Playwright capture → before-and-after table / Argos upload.
  * GitHub Action that compares the preview URL against production.
  * SKILL.md: "after editing a shared component, run route-impact and verify those routes".
* **Effort:** 5–7 days.
* **Adoption / impact:** High for Next.js teams, and agnostic to where you host. Later it becomes the engine for #9 (migration parity) and #8 (guardrails).

### #4. genui-states: auto-generate stories and tests for every streaming state of generative-UI components
* **Pitch:** Point it at your AI SDK tools (Zod schemas) or AG-UI tool renderers. It generates Storybook stories and Vitest tests for `input-streaming` (with progressively partial inputs), `input-available`, `output-available`, `output-error`, and approval states, plus fuzzed edge-case props.
* **Gap and evidence:** AI SDK docs describe the state machine and suggest one story per state, but it's all manual. aimock mocks the network layer, not component states. Storybook MCP writes stories generically and doesn't understand tool-part states. No tool turned up in search.
* **Closest alternatives:** hand-written fixtures; aimock (end-to-end level); zod-fast-check (generic, unaware of streaming).
* **MVP:**
  * CSF factory `toolStories(toolDef, Component)` producing stories per state, including a "streaming replay" story that animates partial JSON.
  * Vitest helper `renderAllStates()` that asserts no crash, no layout overflow, and accessible names.
  * Adapters for AI Elements' `Tool` component and AG-UI tool calls.
* **Effort:** 4–6 days.
* **Adoption / impact:** Medium. A strong niche among AI SDK and AI Elements users (`ai` at 33.7M dl/wk), and a good fit for Storybook's AI push. Could become an official addon.

### #5. fidelity-mcp: structured Figma-vs-DOM design diff for agents
* **Pitch:** Instead of the agent eyeballing two screenshots, it returns "Heading: font-size 24px → expected 28px (token `text-3xl`); Card gap 12px → expected 16px; Button bg #2563EB ≠ token `primary/600`".
* **Gap and evidence:** Figma's official implement-design skill ends with a side-by-side visual comparison. Near-misses are 0–7★ (figma-proxy-mcp, mcp-component-review, figma-to-code-parity-agent, SoDam-Design-Kit).
* **Closest alternatives:** Figma MCP plus pixel diff (noisy, and doesn't say what to fix); Argos (diffs against the previous build, not against design).
* **MVP:**
  * Figma REST (personal token) → node tree with auto-layout, text styles, and variables.
  * Render the target URL or story → DOM tree with computed styles.
  * Heuristic node matching (text content, `data-figma-node`, order/position).
  * Per-property diff with token suggestions, plus an overlay image.
  * Exposed as an MCP tool and a skill loop: "iterate until diff < threshold".
* **Effort:** 8–12 days. Node matching is the hard part.
* **Adoption / impact:** High among design-heavy teams. **Risk:** Figma could build it.

### #6. boundary-guard: provider-agnostic security checks for Server Actions, route handlers, and RSC props
* **Pitch:** Every exported `"use server"` function and route handler must pass an auth guard *you* declare (Auth.js, Better Auth, Supabase, Clerk, or custom) plus input validation, or carry an explicit `@public` tag. It also flags DB records passed whole into client components.
* **Gap and evidence:** Clerk's ESLint rule only works for Clerk. prodlint (15★) is a broad "vibe-code" scanner. React Doctor has a general security category. actionguard repos have 0★. Agent-written Next.js code often leaves Server Actions unprotected. **(Partially covered, hence mid-rank.)**
* **MVP:** An oxc/ts-morph analyzer plus an ESLint plugin, with a config for guard functions and validators, SARIF output for GitHub code scanning, and a SKILL.md for agents.
* **Effort:** 6–8 days.
* **Adoption / impact:** Medium-high. Security sells, but React Doctor or Vercel could add the rule.

### #7. stream-a11y-testing: test matchers for accessible agent chat UIs
* **Pitch:** `expect(chat).toAnnounceOnce(/answer/)`, `toKeepFocusInComposer()`, `toExposeApprovalDialog()`, built with a virtual screen reader and Playwright/Vitest against aimock fixtures.
* **Gap and evidence:** Per-token `aria-live` spam is a known bug. openclaw fixed it in PR #65633, and it's written up in blog posts ([tianpan.co](https://tianpan.co/blog/2026/06/29/streaming-tokens-meet-the-screen-reader)). generative-a11y (5★) fixes runtime behavior but provides no test harness. axe can't catch announcement timing.
* **MVP:** Matchers using `@guidepup/virtual-screen-reader` **(unverified fit)**, recipes for AI Elements, assistant-ui, and CopilotKit, and a CI example.
* **Effort:** 4–6 days.
* **Adoption / impact:** Medium. Needed by regulated and enterprise teams (EU Accessibility Act applies since June 2025). Could also partner with generative-a11y.

### #8. frontend-guardrails: one plugin (Claude / Cursor / Codex) that runs the right checks on changed files after every agent edit
* **Pitch:** A PostToolUse/Stop hook bundle that runs the incremental typecheck, React Doctor on changed files, @shadcn/lint or token-lint, and axe plus screenshots on route-impact-selected routes, then hands back one compact summary the agent can act on.
* **Gap:** Each tool exists on its own. Composing them, selecting by scope, and summarizing output in few tokens is the part nobody has done. vercel-plugin is Vercel-product-oriented.
* **MVP:** A plugin manifest for each agent, a runner, and a summary formatter.
* **Effort:** 3–5 days, more if #3 isn't built first.
* **Adoption / impact:** Medium. A thin wrapper unless paired with #3, so it's best shipped as #3's distribution layer.

### #9. migration-parity: prove a Pages→App Router or Next major upgrade didn't change behavior
* **Pitch:** Build both branches and crawl every route. It diffs status codes, redirects, headers, `<head>`/SEO meta, visible text, and screenshots, and outputs a parity report the agent iterates against.
* **Gap:** Codemods and skills do the transformation, but nothing verifies route by route. Blazity has 24★. migrate-bot is commercial **(unverified)**.
* **MVP:** Builds on #3's capture layer, adds a route crawler and diff report.
* **Effort:** 4–6 days on top of #3.
* **Adoption / impact:** Medium, driven by migration waves (Next 16 / Cache Components, Pages→App).

### #10. token-lint: design-token conformance for non-Tailwind stacks
* **Pitch:** @shadcn/lint-style "agent-verifiable" rules for CSS Modules, vanilla-extract, styled-components, Panda, and inline styles, driven by W3C DTCG token files. Includes auto-fix to the nearest token.
* **Gap:** @shadcn/lint (3.0k★) is Tailwind-only. ui-tokenize (2★) and motif (1★) are tiny.
* **MVP:** A Stylelint plugin plus a TS AST rule for inline styles and CSS-in-JS, a DTCG loader, and a skill.
* **Effort:** 5–7 days.
* **Adoption / impact:** Medium, mostly enterprise design systems.

**Considered and rejected (already well served):**
* Next.js knowledge or dev-loop MCP (Vercel first-party)
* React runtime MCP (agent-browser `react`, react-devtools MCP)
* Axe or Lighthouse MCPs (crowded, Deque official)
* LLM/AG-UI mocking (aimock)
* AG-UI / AI SDK devtools (both exist)
* Generative-UI catalog portability to MCP Apps (json-render)
* Next.js→MCP Apps bridge (Vercel starters, Skybridge, mcp-use)
* Rules sync (ruler, rulesync)
* Agent-config evals (agents-md-bench, early)
* Tailwind design-system lint (@shadcn/lint)
* Shipping docs in npm packages (Next does it natively; agentsources and leadtype exist; Context7 covers retrieval)
* Pages→App codemods (codemod.com, Blazity)

---

## 5. Top 3 for a solo frontend engineer, with reasoning

1. **component-atlas (#1).** This is the most common day-to-day pain of agents in real React codebases: duplicate components and hallucinated props. It has the broadest audience, works in every agent, and no vendor owns it. Vercel focuses on Next.js internals, Storybook on Storybook users, and shadcn on registries. It's a demoable "before/after" story (the agent reuses `<DataTable>` instead of writing a new one), and Jignesh's frontend background is a credibility fit. About 1.5 weeks to v0.1.
2. **ag-ui-chat-transport (#2).** The smallest scope with the best timing. AG-UI 1.0 shipped three days ago, and it bridges the two biggest agent-UI ecosystems (useChat/AI Elements and AG-UI agents). A good chance of early stars and maintainer attention, with a clear upstreaming path. About 1 week. It's also a useful first launch to build an audience for #1 and #3.
3. **route-impact (#3).** Next.js's own 16.3 tooling asks agents to re-verify affected routes, and nobody computes them. That gap is concrete, and the solution is deterministic and testable. It pairs with existing tools (agent-browser, before-and-after, Argos) instead of competing with them, and it becomes the engine for #8 and #9. About 1–1.5 weeks.

**Suggested sequence:** #2 (fast launch, roughly week 1) → #1 (flagship, weeks 2–3) → #3 (weeks 4–5), then fold #8 in as #3's agent plugin.

---

## 6. Key sources

* Next.js: [MCP guide](https://nextjs.org/docs/app/guides/mcp) · [16.3 AI improvements](https://nextjs.org/blog/next-16-3-ai-improvements) · [AI agents guide](https://nextjs.org/docs/app/guides/ai-agents) · [next-devtools-mcp](https://github.com/vercel/next-devtools-mcp) · [npm](https://www.npmjs.com/package/next-devtools-mcp)
* Vercel: [agent-skills](https://github.com/vercel-labs/agent-skills) · [skills docs](https://vercel.com/docs/agent-resources/skills) · [agent-browser](https://github.com/vercel-labs/agent-browser) · [before-and-after](https://github.com/vercel-labs/before-and-after) · [AI SDK 6](https://vercel.com/blog/ai-sdk-6) · [AI SDK 7](https://vercel.com/changelog/ai-sdk-7) · [AI Elements](https://github.com/vercel/ai-elements) · [json-render](https://github.com/vercel-labs/json-render) · [streamdown](https://github.com/vercel/streamdown)
* Storybook: [AI docs](https://storybook.js.org/docs/ai) · [MCP overview](https://storybook.js.org/docs/ai/mcp/overview) · [Manifests](https://storybook.js.org/docs/ai/manifests)
* shadcn: [MCP](https://ui.shadcn.com/docs/mcp) · [lint](https://github.com/shadcn-ui/lint)
* Figma: [MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/) · [implement-design skill](https://developers.figma.com/docs/figma-mcp-server/skill-figma-implement-design/) · [Code Connect](https://developers.figma.com/docs/figma-mcp-server/code-connect-integration/)
* Protocols: [AG-UI 1.0](https://www.copilotkit.ai/blog/ag-ui-1.0) · [SEP-1865 MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp) · [ext-apps spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) · [MCP Apps in ChatGPT](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt) · [A2UI](https://github.com/a2ui-project/a2ui) · [A2UI v0.9 (CopilotKit blog)](https://www.copilotkit.ai/blog/a2ui-whats-new-in-google-generative-ui-spec)
* Agent platforms: [Claude Code plugins](https://code.claude.com/docs/en/discover-plugins) · [Cursor plugins](https://cursor.com/docs/plugins.md) · [Codex skills](https://developers.openai.com/codex/skills) · [Copilot AGENTS.md](https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/)
* Quality tooling: [React Doctor](https://github.com/millionco/react-doctor) · [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) · [Playwright MCP](https://github.com/microsoft/playwright-mcp) · [aimock](https://aimock.copilotkit.dev/) · [Argos](https://argos-ci.com) · [Deque axe MCP](https://github.com/dequelabs/axe-mcp-server-public) · [Clerk ESLint plugin](https://clerk.com/docs/nextjs/reference/eslint-plugin.md) · [prodlint](https://github.com/prodlint/prodlint)
* Near-misses cited: [agentic-component-manifest](https://github.com/xgentic/agentic-component-manifest) · [ds-manifest](https://github.com/designbysuren/ds-manifest) · [drykit](https://github.com/NextBeFirst/drykit) · [duplicalis](https://github.com/pfrankov/duplicalis) · [storybook-oversight](https://github.com/rachelslurs/storybook-oversight) · [affected-ci](https://github.com/Cst2989/affected-ci) · [component-to-route](https://github.com/sambernhardt/component-to-route) · [figma-proxy-mcp](https://github.com/Semmargl/figma-proxy-mcp) · [mcp-component-review](https://github.com/igorvieira/mcp-component-review) · [generative-a11y](https://github.com/bhaveshchow20/generative-a11y) · [Blazity next-migration-skills](https://github.com/Blazity/next-migration-skills) · [ui-tokenize](https://github.com/xiaolai/ui-tokenize) · [ds-skills](https://github.com/igloude/ds-skills) · [ag-ui PR #1626](https://github.com/ag-ui-protocol/ag-ui/pull/1626)

## Appendix: traction snapshot (2026-10-03)

| Repo | ★ | npm pkg | dl/wk |
|---|---|---|---|
| anthropics/skills | 179,499 | | |
| openai/codex | 127,728 | | |
| shadcn-ui/ui | 125,044 | shadcn | 12.77M |
| upstash/context7 | 62,629 | | |
| ChromeDevTools/chrome-devtools-mcp | 52,908 | chrome-devtools-mcp | 2.05M |
| vercel-labs/agent-browser | 43,484 | agent-browser | 2.07M |
| microsoft/playwright-mcp | 37,781 | @playwright/mcp | 8.76M |
| CopilotKit/CopilotKit | 37,705 | @copilotkit/react-core | 605k |
| anthropics/claude-plugins-official | 37,338 | | |
| vercel-labs/agent-skills | 31,876 | | |
| mastra-ai/mastra | 28,530 | | |
| vercel/ai | 27,102 | ai / @ai-sdk/react | 33.67M / 10.71M |
| onlook-dev/onlook | 26,852 | | |
| agentsmd/agents.md | 24,743 | | |
| aidenybai/react-scan | 21,862 | | |
| vercel-labs/json-render | 18,483 | @json-render/core | 2.20M |
| a2ui-project/a2ui | 16,588 | | |
| ag-ui-protocol/ag-ui | 16,283 | @ag-ui/client | 1.71M |
| GLips/Figma-Context-MCP | 15,950 | | |
| millionco/react-doctor | 14,950 | react-doctor | 2.26M |
| assistant-ui/assistant-ui | 12,390 | @assistant-ui/react | 2.33M |
| tambo-ai/tambo | 11,181 | @tambo-ai/react | 6.4k (unverified pkg) |
| aidenybai/react-grab | 7,643 | | |
| stagewise-io/stagewise | 6,824 | | |
| vercel/streamdown | 5,668 | streamdown | 7.95M |
| MCP-UI-Org/mcp-ui | 5,191 | @mcp-ui/client | 395k |
| langchain-ai/langgraphjs | 3,334 | | |
| TanStack/ai | 3,160 | @tanstack/ai | 611k |
| shadcn-ui/lint | 3,015 | @shadcn/lint | 1.44M |
| intellectronica/ruler | 2,940 | | |
| modelcontextprotocol/ext-apps | 2,895 | @modelcontextprotocol/ext-apps | 5.01M |
| vercel/ai-elements | 2,472 | | |
| openai/openai-apps-sdk-examples | 2,353 | | |
| alpic-ai/skybridge | 2,132 | skybridge | 77k |
| figma/mcp-server-guide | 2,043 | | |
| lost-pixel/lost-pixel | 1,682 | | |
| dyoshikawa/rulesync | 1,493 | | |
| CopilotKit/aimock | 957 | @copilotkit/aimock | 713k |
| vercel/next-devtools-mcp | 822 | next-devtools-mcp | 138k |
| argos-ci/argos | 636 | | |
| vercel-labs/before-and-after | 392 | | |
| vercel/vercel-plugin | 295 | | |
| storybookjs/mcp | 270 | @storybook/addon-mcp | 2.87M |
| vercel-labs/chatgpt-apps-sdk-nextjs-starter | 253 | | |
| vercel-labs/next-browser | 205 (merged into agent-browser) | | |
| assistant-ui AG-UI adapter | n/a | @assistant-ui/react-ag-ui | 94k |
