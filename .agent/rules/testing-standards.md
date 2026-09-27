# 🧪 Testing Standards

> `development-workflow.md` defines the mandatory development–testing loop and test-impact matrix. This rulebook defines test execution and quality gates.

## 1. Post-Implementation Test Gate (MANDATORY)

> 🔴 **Every code implementation or behavior change MUST pass this gate before the task is reported complete.**

After implementing a change, the AI agent MUST:

1. Identify the new or changed observable behaviors, failure paths, and regression risks.
2. Inspect the existing tests that cover those behaviors.
3. Decide autonomously whether tests must be added or updated; do not defer this engineering decision to the user.
4. Record one explicit outcome in the final report:
   - **Tests added/updated:** list the scenarios covered; or
   - **No test change needed:** give a concrete, behavior-based justification.
5. Run the focused checks needed for fast feedback, then run the **full regression gate** `./leedevkit test all` before completion. A task is unverified and MUST NOT be reported complete until this command passes.
6. Reconcile the completed tests against every applicable dimension in the pre-implementation Test Impact Matrix from `development-workflow.md`.

The full regression gate MUST run for every change that can affect runtime, build output, generated code, persistence, API contracts, configuration, dependencies, or shared infrastructure. It covers all configured server, web, integration, and E2E targets. A narrower target, `--unit-only`, `--lint-only`, `--e2e-only`, `--pattern`, or a manual smoke test MAY supplement full regression but MUST NOT replace it.

If `./leedevkit test all` cannot run or fails, the task remains incomplete. Report the exact failure and blocker; do not claim completion based on passing focused checks.

Documentation-only, comment-only, deterministic formatting-only, or generated-artifact-only changes MAY omit full regression only when they cannot alter runtime or build behavior. The final report MUST state that reason.

Tests MUST be added or updated for:
- New or changed business logic or externally observable behavior
- Bug fixes and regressions (the test MUST fail without the fix)
- Validation, authorization, persistence, API contract, concurrency, and error-path changes
- Boundary values, empty or malformed input, partial state, dependency failure, timeout, cancellation, retry exhaustion, compatibility, and resource limits when applicable

A test change MAY be unnecessary for documentation-only, comment-only, formatting-only, or generated-artifact changes that cannot alter behavior. The agent must still state this conclusion and its reason.

## 2. Test Execution Commands

> [!WARNING]
> Prefer the project-local LeeDevKit target or documented repository wrapper. Do not assume language-specific wrappers exist. Follow the discovery order in `ai-agent-governance.md`.

| Scope | Command | Purpose |
|---|---|---|
| **Fast feedback** | `./leedevkit test <target> --unit-only` | Focused unit-test iteration |
| **Applicable target** | `./leedevkit test <target>` | Required verification before completion |
| **Coverage** | `./leedevkit test <target> --coverage` | Coverage verification for changed logic |
| **Full suite** | `./leedevkit test all` | Cross-target regression verification |
| **Release packaging** | `python3 scripts/_release_build.py ...` then `python3 scripts/_release_acceptance.py ...` | Required for packaging/install/bootstrap/update changes in LeeDevKit itself |

Use the narrowest target that fully covers the change. Run the full suite when the change crosses targets or affects shared infrastructure. Do not use background execution (`&`). Follow `execution-pty-safety.md` for output handling.

When the change affects LeeDevKit packaging, bootstrap, install, update, versioning, or release artifacts, also run the release acceptance gate from `devkit-internals.md`. Passing source unit tests alone does **not** complete packaging work.

## 3. Core Testing Principles

- **Testing Pyramid:** Prioritize Unit > Integration > E2E.
- **Pattern:** Use AAA Pattern (Arrange-Act-Assert).
- **Behavior First:** Test public behavior and regression risk, not implementation details.
- **Edge Cases Are Required:** Happy-path coverage alone is insufficient for changed behavior.
- **Negative Assertions:** Verify both the returned failure and the absence of unauthorized or partial side effects.
- **Skipped Tests:** New skips, ignores, retries, or quarantines require a linked issue, owner, reason, and expiry condition.
- **Code Coverage:** Do not reduce repository-enforced coverage. When no threshold is configured, 80% changed-logic coverage is a RECOMMENDED baseline; prioritize meaningful branch and failure-path coverage over a numeric target.
- **Mandatory Pass:** A code task is NOT complete until the Post-Implementation Test Gate passes.

## 4. Verification Pipeline

> 🔴 **Execution Priority:** Security → Lint → Schema → Tests → UX → SEO → Performance

The LeeDevKit target command orchestrates the applicable type, lint, schema, and test phases:

```bash
./leedevkit test <target>
```

Use `--lint-only`, `--unit-only`, `--e2e-only`, `--pattern`, or `--coverage` only for focused iteration. Focused checks do not replace the applicable target verification required before completion.

Security, compatibility, migration, reliability, and release risks require the additional verification defined in their respective rulebooks; the standard test target does not replace those gates.
