# 6S Issue Management System

## LeeDevKit base context

This repository uses LeeDevKit. Before making changes, read and apply:
`.leedevkit/templates/CLAUDE.base.md`.

## Mandatory Tool Wrappers & Hermetic Execution

Do not run raw ecosystem binaries directly (`go`, `bun`, `sqlc`, `docker-compose`, etc.) when the project provides wrappers.

| Purpose | Canonical Wrapper | Example |
|---|---|---|
| Server Lint | `./leedevkit test server --lint-only` | `./leedevkit test server --lint-only` |
| Server Unit Tests | `./leedevkit test server --unit-only` | `./leedevkit test server --unit-only` |
| Web Lint | `./leedevkit test web --lint-only` | `./leedevkit test web --lint-only` |
| Web Unit Tests | `./leedevkit test web --unit-only` | `./leedevkit test web --unit-only` |
| Full Test Suite | `./leedevkit test all` | `./leedevkit test all` |
| Hermetic Go CLI | `./scripts/_go.sh` | `./scripts/_go.sh test ./...` |
| Hermetic Bun CLI | `./scripts/_bun.sh` | `./scripts/_bun.sh test` |
| Hermetic SQLC CLI | `./scripts/_sqlc.sh` | `./scripts/_sqlc.sh generate` |
| Environment / Infra | `./leedevkit manage <cmd>` | `./leedevkit manage up dev` |

AI agents MUST check for and use these wrappers before running any host command.

## Dev & Test Commands

- Health check:
  ```sh
  ./leedevkit doctor
  ```

- Testing:
  ```sh
  ./leedevkit test server --lint-only  # Go format, go vet & golangci-lint
  ./leedevkit test server --unit-only  # Go unit tests
  ./leedevkit test web --lint-only     # TypeScript & Biome lint checks
  ./leedevkit test web --unit-only     # Bun tests
  ./leedevkit test all                 # Full suite
  ```

- Infrastructure management:
  ```sh
  ./leedevkit manage up dev            # Start dev environment (Go API + Web + Caddy TLS)
  ./leedevkit manage down dev          # Stop dev environment
  ./leedevkit manage ps dev            # Show status of dev containers
  ./leedevkit manage logs dev          # View logs
  ```

## LeeDevKit base context

This repository uses LeeDevKit. Before making changes, read and apply:
`.leedevkit/templates/CLAUDE.base.md`.

The rules below add specific constraints. Apply both.


<!-- leedevkit:begin -->
## LeeDevKit base context

This repository uses LeeDevKit. Before making changes, read and apply:
`.leedevkit/templates/CLAUDE.base.md`.

Source of truth for this project's AI context lives in `.agent/`:

| Purpose | Location |
|---------|----------|
| Rulebooks (lazy-load by domain) | `.agent/rules/*.md` |
| Built-in skills | `.agent/skills/*/SKILL.md` |
| Installed community skills | `.leedevkit/skills.d/*/SKILL.md` |
| Specialist agents | `.agent/agents/*.md` |
| Devkit commands | `./leedevkit --help` |

Capability fallback: if this harness cannot run shell commands, dispatch
subagents, or track todos, follow the skill's prose directly and report the
missing capability. Never invent a tool call the harness does not provide.

### Available skills

| Skill | When to use | Read |
|---|---|---|
| `2d-games` | 2D game development principles. Sprites, tilemaps, physics, camera. | `.leedevkit/.agent/skills/game-development/2d-games/SKILL.md` |
| `3d-games` | 3D game development principles. Rendering, shaders, physics, cameras. | `.leedevkit/.agent/skills/game-development/3d-games/SKILL.md` |
| `api-patterns` | API design principles and decision-making. REST vs GraphQL vs tRPC selection, response formats, versioning, pagination. | `.leedevkit/.agent/skills/api-patterns/SKILL.md` |
| `app-builder` | Main application building orchestrator. Creates full-stack applications from natural language requests. Determines project type, selects tech stack, coordinates agents. | `.leedevkit/.agent/skills/app-builder/SKILL.md` |
| `architecture` | Architectural decision-making framework. Requirements analysis, trade-off evaluation, ADR documentation. Use when making architecture decisions or analyzing system design. | `.leedevkit/.agent/skills/architecture/SKILL.md` |
| `banner-design` | Design banners for social media, ads, website heroes, creative assets, and print. Multiple art direction options with optional generated or supplied visuals. Actions: design, create, generate banner. Platforms: Facebook, Twitter/X, LinkedIn, YouTube, Instagram, Google Display, website hero, print. Styles: minimalist, gradient, bold typography, photo-based, illustrated, geometric, retro, glassmorphism, 3D, neon, duotone, editorial, collage. | `.leedevkit/skills.d/ui-ux-pro-max/.claude/skills/banner-design/SKILL.md` |
| `bash-linux` | Bash/Linux terminal patterns. Critical commands, piping, error handling, scripting. Use when working on macOS or Linux systems. | `.leedevkit/.agent/skills/bash-linux/SKILL.md` |
| `behavioral-modes` | AI operational modes (brainstorm, implement, debug, review, teach, ship, orchestrate). Use to adapt behavior based on task type. | `.leedevkit/.agent/skills/behavioral-modes/SKILL.md` |
| `brainstorming` | Targeted clarification and concise user communication for ambiguous or high-impact work. | `.leedevkit/.agent/skills/brainstorming/SKILL.md` |
| `brand` | Brand voice, visual identity, messaging frameworks, asset management, brand consistency. Activate for branded content, tone of voice, marketing assets, brand compliance, style guides. | `.leedevkit/skills.d/ui-ux-pro-max/.claude/skills/brand/SKILL.md` |
| `clean-code` | Pragmatic coding standards - concise, direct, no over-engineering, no unnecessary comments | `.leedevkit/.agent/skills/clean-code/SKILL.md` |
| `code-review-checklist` | Code review guidelines covering code quality, security, and best practices. | `.leedevkit/.agent/skills/code-review-checklist/SKILL.md` |
| `database-design` | Database design principles and decision-making. Schema design, indexing strategy, ORM selection, serverless databases. | `.leedevkit/.agent/skills/database-design/SKILL.md` |
| `deployment-procedures` | Production deployment principles and decision-making. Safe deployment workflows, rollback strategies, and verification. Teaches thinking, not scripts. | `.leedevkit/.agent/skills/deployment-procedures/SKILL.md` |
| `design` | Comprehensive design skill: brand identity, design tokens, UI styling, logo generation (55 styles, Gemini, Atlas Cloud, or MuAPI AI), corporate identity program (50 deliverables, CIP mockups), HTML presentations (Chart.js), banner design (22 styles, social/ads/web/print), icon design (15 styles, SVG, Gemini 3.1 Pro), social photos (HTML→screenshot, multi-platform). Actions: design logo, create CIP, generate mockups, build slides, design banner, generate icon, create social photos, social media images, brand identity, design system. Platforms: Facebook, Twitter, LinkedIn, YouTube, Instagram, Pinterest, TikTok, Threads, Google Ads. | `.leedevkit/skills.d/ui-ux-pro-max/.claude/skills/design/SKILL.md` |
| `design-system` | Token architecture, component specifications, and slide generation. Three-layer tokens (primitive→semantic→component), CSS variables, spacing/typography scales, component specs, strategic slide creation. Use for design tokens, systematic design, brand-compliant presentations. | `.leedevkit/skills.d/ui-ux-pro-max/.claude/skills/design-system/SKILL.md` |
| `documentation-templates` | Documentation templates and structure guidelines. README, API docs, code comments, and AI-friendly documentation. | `.leedevkit/.agent/skills/documentation-templates/SKILL.md` |
| `frontend-design` | Design thinking and decision-making for web UI. Use when designing components, layouts, color schemes, typography, or creating aesthetic interfaces. Teaches principles, not fixed values. | `.leedevkit/.agent/skills/frontend-design/SKILL.md` |
| `game-art` | Game art principles. Visual style selection, asset pipeline, animation workflow. | `.leedevkit/.agent/skills/game-development/game-art/SKILL.md` |
| `game-audio` | Game audio principles. Sound design, music integration, adaptive audio systems. | `.leedevkit/.agent/skills/game-development/game-audio/SKILL.md` |
| `game-design` | Game design principles. GDD structure, balancing, player psychology, progression. | `.leedevkit/.agent/skills/game-development/game-design/SKILL.md` |
| `game-development` | Game development orchestrator. Routes to platform-specific skills based on project needs. | `.leedevkit/.agent/skills/game-development/SKILL.md` |
| `geo-fundamentals` | Generative Engine Optimization for AI search engines (ChatGPT, Claude, Perplexity). | `.leedevkit/.agent/skills/geo-fundamentals/SKILL.md` |
| `i18n-localization` | Internationalization and localization patterns. Detecting hardcoded strings, managing translations, locale files, RTL support. | `.leedevkit/.agent/skills/i18n-localization/SKILL.md` |
| `intelligent-routing` | Select smallest suitable agent or agent set from task intent, domain, and complexity. | `.leedevkit/.agent/skills/intelligent-routing/SKILL.md` |
| `lint-and-validate` | Automatic quality control, linting, and static analysis procedures. Use after code modifications to ensure syntax correctness and project standards. Triggers on lint, format, check, validate, types, static analysis. | `.leedevkit/.agent/skills/lint-and-validate/SKILL.md` |
| `mcp-builder` | MCP (Model Context Protocol) server building principles. Tool design, resource patterns, best practices. | `.leedevkit/.agent/skills/mcp-builder/SKILL.md` |
| `mobile-design` | Mobile-first design thinking and decision-making for iOS and Android apps. Touch interaction, performance patterns, platform conventions. Teaches principles, not fixed values. Use when building React Native, Flutter, or native mobile apps. | `.leedevkit/.agent/skills/mobile-design/SKILL.md` |
| `mobile-games` | Mobile game development principles. Touch input, battery, performance, app stores. | `.leedevkit/.agent/skills/game-development/mobile-games/SKILL.md` |
| `multiplayer` | Multiplayer game development principles. Architecture, networking, synchronization. | `.leedevkit/.agent/skills/game-development/multiplayer/SKILL.md` |
| `nextjs-react-expert` | React and Next.js performance optimization from Vercel Engineering. Use when building React components, optimizing performance, eliminating waterfalls, reducing bundle size, reviewing code for performance issues, or implementing server/client-side optimizations. | `.leedevkit/.agent/skills/nextjs-react-expert/SKILL.md` |
| `nodejs-best-practices` | Node.js development principles and decision-making. Framework selection, async patterns, security, and architecture. Teaches thinking, not copying. | `.leedevkit/.agent/skills/nodejs-best-practices/SKILL.md` |
| `parallel-agents` | Coordinate specialized subagents for independent analysis, dependent implementation, verification, and synthesis. | `.leedevkit/.agent/skills/parallel-agents/SKILL.md` |
| `pc-games` | PC and console game development principles. Engine selection, platform features, optimization strategies. | `.leedevkit/.agent/skills/game-development/pc-games/SKILL.md` |
| `performance-profiling` | Performance profiling principles. Measurement, analysis, and optimization techniques. | `.leedevkit/.agent/skills/performance-profiling/SKILL.md` |
| `plan-writing` | Structured task planning with clear breakdowns, dependencies, and verification criteria. Use when implementing features, refactoring, or any multi-step work. | `.leedevkit/.agent/skills/plan-writing/SKILL.md` |
| `powershell-windows` | PowerShell Windows patterns. Critical pitfalls, operator syntax, error handling. | `.leedevkit/.agent/skills/powershell-windows/SKILL.md` |
| `python-patterns` | Python development principles and decision-making. Framework selection, async patterns, type hints, project structure. Teaches thinking, not copying. | `.leedevkit/.agent/skills/python-patterns/SKILL.md` |
| `red-team-tactics` | Red team tactics principles based on MITRE ATT&CK. Attack phases, detection evasion, reporting. | `.leedevkit/.agent/skills/red-team-tactics/SKILL.md` |
| `rust-pro` | Master Rust 1.75+ with modern async patterns, advanced type system features, production-ready systems programming, Tokio, axum, and cutting-edge crates. Use proactively for Rust development, performance optimization, or systems programming. | `.leedevkit/.agent/skills/rust-pro/SKILL.md` |
| `seo-fundamentals` | SEO fundamentals, E-E-A-T, Core Web Vitals, and Google algorithm principles. | `.leedevkit/.agent/skills/seo-fundamentals/SKILL.md` |
| `server-management` | Server management principles and decision-making. Process management, monitoring strategy, and scaling decisions. Teaches thinking, not commands. | `.leedevkit/.agent/skills/server-management/SKILL.md` |
| `slides` | Create strategic HTML presentations with Chart.js, design tokens, responsive layouts, copywriting formulas, and contextual slide strategies. | `.leedevkit/skills.d/ui-ux-pro-max/.claude/skills/slides/SKILL.md` |
| `systematic-debugging` | 4-phase systematic debugging methodology with root cause analysis and evidence-based verification. Use when debugging complex issues. | `.leedevkit/.agent/skills/systematic-debugging/SKILL.md` |
| `tailwind-patterns` | Tailwind CSS v4 principles. CSS-first configuration, container queries, modern patterns, design token architecture. | `.leedevkit/.agent/skills/tailwind-patterns/SKILL.md` |
| `tdd-workflow` | Test-Driven Development workflow principles. RED-GREEN-REFACTOR cycle. | `.leedevkit/.agent/skills/tdd-workflow/SKILL.md` |
| `technical-debt-management` | Systematically analyze, assess, and resolve technical debt. Use when the user requests refactoring, legacy-code optimization, or cleanup of obsolete code or architecture. | `.leedevkit/.agent/skills/technical-debt-management/SKILL.md` |
| `templates` | Project scaffolding templates for new applications. Use when creating new projects from scratch. Contains 12 templates for various tech stacks. | `.leedevkit/.agent/skills/app-builder/templates/SKILL.md` |
| `testing-patterns` | Testing patterns and principles. Unit, integration, mocking strategies. | `.leedevkit/.agent/skills/testing-patterns/SKILL.md` |
| `ui-styling` | Create beautiful, accessible user interfaces with shadcn/ui components (built on Radix UI + Tailwind), Tailwind CSS utility-first styling, and canvas-based visual designs. Use when building user interfaces, implementing design systems, creating responsive layouts, adding accessible components (dialogs, dropdowns, forms, tables), customizing themes and colors, implementing dark mode, generating visual designs and posters, or establishing consistent styling patterns across applications. | `.leedevkit/skills.d/ui-ux-pro-max/.claude/skills/ui-styling/SKILL.md` |
| `ui-ux-pro-max` | UI/UX design intelligence for web, mobile, and desktop. This skill should be used when designing, building, reviewing, or fixing interfaces, including pages, components, design systems, accessibility, interaction, responsive layout, typography, color, charts, and stack-specific UI implementation. Searchable local data: 79 searchable styles (50 active), 192 product palettes and reasoning profiles, 74 font pairings, 119 UX guidelines, 105 icons, 17 GSAP presets, 25 chart types, and 22 stacks. | `.leedevkit/skills.d/ui-ux-pro-max/.claude/skills/ui-ux-pro-max/SKILL.md` |
| `vr-ar` | VR/AR development principles. Comfort, interaction, performance requirements. | `.leedevkit/.agent/skills/game-development/vr-ar/SKILL.md` |
| `vulnerability-scanner` | Advanced vulnerability analysis principles. OWASP 2025, Supply Chain Security, attack surface mapping, risk prioritization. | `.leedevkit/.agent/skills/vulnerability-scanner/SKILL.md` |
| `web-design-guidelines` | Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices". | `.leedevkit/.agent/skills/web-design-guidelines/SKILL.md` |
| `web-games` | Web browser game development principles. Framework selection, WebGPU, optimization, PWA. | `.leedevkit/.agent/skills/game-development/web-games/SKILL.md` |
| `webapp-testing` | Web application testing principles. E2E, Playwright, deep audit strategies. | `.leedevkit/.agent/skills/webapp-testing/SKILL.md` |
<!-- leedevkit:end -->
