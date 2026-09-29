# Brikode Roadmap

This roadmap is the working source of truth for product scope. README stays intentionally short.

## Product rules

- Two authoring modes, one project: **Blocks** and **Code**.
- Both modes operate on the same canonical workflow IR.
- MVP is **static-first** and runs on GitHub Pages.
- **Export / Self-host** is the only real deployment path in v1.
- **Cloud Deploy** is visible but must remain an explicit **Coming soon** placeholder until a hosted runtime exists.
- Browser bundles and workflow files must never contain real production secrets.
- New platforms integrate through connector contracts rather than platform-specific editor logic.

---

## R0 — Repository & Pages foundation

**Goal:** make Brikode publicly viewable and establish project rules.

- [x] Initialize `main`.
- [x] Keep README concise.
- [x] Add project and third-party license documents.
- [x] Add a static Pages entry point.
- [x] Add `.nojekyll`.
- [ ] Enable GitHub Pages with **Deploy from a branch**.
- [ ] Verify public project URL and asset paths.
- [ ] Add basic error/404 handling for project-page routing.

**Exit:** opening the Pages URL shows the Brikode shell without Actions.

## R1 — Application shell & local projects

**Goal:** create the usable editor frame before platform integrations.

- [ ] Responsive desktop-first layout.
- [ ] Project list: create, rename, duplicate, delete.
- [ ] Local persistence using IndexedDB.
- [ ] Import/export raw Brikode project JSON.
- [ ] Autosave with schema version.
- [ ] Dirty-state and recovery protection.
- [ ] Basic settings panel.
- [ ] Theme tokens and reusable UI primitives.

**Exit:** users can create and reopen local Brikode projects entirely in-browser.

## R2 — Workflow IR v1

**Goal:** define one stable representation for Blocks, Code, validation and export.

- [ ] Versioned `project.json` schema.
- [ ] Node IDs and stable references.
- [ ] Triggers, actions, conditions and data expressions.
- [ ] Typed ports/values.
- [ ] Variables and scoped values.
- [ ] Branches: if / else.
- [ ] Delays and simple iteration.
- [ ] Connector references.
- [ ] Credential references without credential values.
- [ ] Schema migrations.
- [ ] Deterministic serialization.
- [ ] IR validator with human-readable diagnostics.

**Exit:** representative workflows can round-trip through JSON without losing meaning.

## R3 — Blocks editor

**Goal:** let non-programmers build a complete workflow visually.

- [ ] Integrate Blockly.
- [ ] Brikode block categories.
- [ ] Trigger blocks.
- [ ] Action blocks.
- [ ] Logic blocks: if / else, comparisons, boolean logic.
- [ ] Text, number, JSON and variable blocks.
- [ ] HTTP blocks.
- [ ] Delay block.
- [ ] Typed block inputs where practical.
- [ ] Search in toolbox.
- [ ] Undo / redo.
- [ ] Copy / paste and duplicate.
- [ ] Blocks ↔ IR compiler.
- [ ] Validation markers on invalid blocks.

**Exit:** a meaningful bot can be authored without writing code.

## R4 — Code mode

**Goal:** provide a first-class code authoring experience without breaking visual round-trip.

- [ ] Integrate Monaco Editor.
- [ ] Define the Brikode code surface/DSL.
- [ ] Syntax highlighting and formatting.
- [ ] Autocomplete for triggers, actions and variables.
- [ ] Inline diagnostics.
- [ ] Code → IR parser.
- [ ] IR → Code generator.
- [ ] Blocks → IR → Code synchronization.
- [ ] Code → IR → Blocks synchronization.
- [ ] Define explicit escape hatch for custom code that cannot become visual blocks.
- [ ] Warn before transformations that would lose visual-editability.

**Exit:** supported code constructs can switch between Blocks and Code with deterministic results.

## R5 — Connector SDK

**Goal:** make integrations modular.

Each connector declares:

- metadata and icon;
- triggers;
- actions;
- typed inputs/outputs;
- credential requirements;
- validation;
- runtime package requirements;
- export templates.

Tasks:

- [ ] Connector manifest schema.
- [ ] Connector registry.
- [ ] Trigger/action definition API.
- [ ] Credential descriptors.
- [ ] Typed value mapping.
- [ ] Connector versioning.
- [ ] Compatibility checks.
- [ ] Connector documentation format.
- [ ] Fixture/test format.

**Exit:** adding a connector does not require changing editor core logic.

## R6 — MVP connectors

### Telegram
- [ ] Message trigger.
- [ ] Command trigger.
- [ ] Callback/button trigger.
- [ ] Send message.
- [ ] Send media/file.
- [ ] Inline buttons.
- [ ] Basic error handling.

### Discord
- [ ] Message trigger.
- [ ] Slash-command trigger.
- [ ] Send message.
- [ ] Reply.
- [ ] Embeds/components baseline.

### Webhook
- [ ] Incoming webhook trigger for exported runtime.
- [ ] Request payload mapping.
- [ ] Configurable response.

### HTTP
- [ ] GET / POST / PUT / PATCH / DELETE.
- [ ] Headers/query/body.
- [ ] JSON response mapping.
- [ ] Timeout and error branches.

**Exit:** each connector works in exported self-hosted projects.

## R7 — Variables, expressions & data mapping

**Goal:** make data flow understandable without turning the builder into raw code.

- [ ] Variable browser.
- [ ] Previous-step output picker.
- [ ] Nested JSON path picker.
- [ ] String templates such as `{{message.text}}`.
- [ ] Type-aware conversions.
- [ ] Null/missing-value behavior.
- [ ] Expression preview.
- [ ] Safe expression evaluator.

**Exit:** users can pass data between connectors without manually editing JSON.

## R8 — Test & debug experience

**Goal:** make workflows debuggable before self-hosting.

- [ ] Workflow validation panel.
- [ ] Browser-side simulator.
- [ ] Mock trigger payloads.
- [ ] Step-by-step execution view.
- [ ] Node status: waiting / running / success / failed.
- [ ] Input/output inspector.
- [ ] Local test logs.
- [ ] Error trace linked back to block/code location.
- [ ] Connector mock adapters where live calls are impossible in Pages.

**Exit:** logical errors can be found before export.

## R9 — Export / Self-host

**Goal:** make v1 genuinely useful without Brikode-owned servers.

- [ ] Generate runnable Node.js project.
- [ ] Generate `package.json`.
- [ ] Generate runtime source.
- [ ] Include canonical `workflow.json`.
- [ ] Generate `.env.example`.
- [ ] Generate workflow-specific README.
- [ ] Include only required connector dependencies.
- [ ] ZIP export in browser.
- [ ] Runtime startup command.
- [ ] Graceful shutdown.
- [ ] Structured logs.
- [ ] Secret loading only from environment/runtime configuration.
- [ ] Validate export before download.

Target export:

```text
my-bot/
├─ src/
│  ├─ runtime/
│  └─ generated/
├─ workflow.json
├─ package.json
├─ .env.example
└─ README.md
```

**Exit:** a user can download, configure environment variables, run `npm install` and start the bot without Brikode infrastructure.

## R10 — Deployment UX

- [ ] **Export / Self-host** primary action.
- [ ] Export readiness checklist.
- [ ] Platform-specific self-host instructions.
- [ ] Dockerfile export option.
- [ ] Optional `docker-compose.yml`.
- [ ] **Cloud Deploy** button visible.
- [ ] Cloud Deploy modal clearly states **Coming soon**.
- [ ] Cloud Deploy must not pretend to deploy or collect secrets.

**Exit:** deployment choices are clear and there are no dead-end/fake flows.

## R11 — Quality, security & accessibility

- [ ] No secrets in local telemetry or generated workflow JSON.
- [ ] Dependency/license audit.
- [ ] Content Security Policy compatible with Pages.
- [ ] XSS-safe rendering of workflow data.
- [ ] Import size/depth limits.
- [ ] Malformed-project recovery.
- [ ] Keyboard navigation.
- [ ] Accessible labels and focus states.
- [ ] Responsive layout.
- [ ] Performance budget for editor startup.
- [ ] Unit tests for IR/compiler/parser.
- [ ] Export regression fixtures.

**Exit:** MVP is safe enough for public use and stable across supported browsers.

## R12 — MVP release

MVP ships when all of the following are true:

- [ ] Blocks mode is usable.
- [ ] Code mode is usable.
- [ ] Supported constructs round-trip through IR.
- [ ] Telegram works in self-host export.
- [ ] Discord works in self-host export.
- [ ] Webhook works in self-host export.
- [ ] HTTP works in self-host export.
- [ ] Exported project runs from clean install.
- [ ] Project import/export works.
- [ ] Simulator and diagnostics cover common mistakes.
- [ ] Pages deployment is stable.
- [ ] Cloud Deploy remains an honest placeholder.

---

# Post-MVP

## Connector expansion

Candidates include VK, Slack, email, Google Sheets, CRM systems, SMS, WhatsApp-compatible providers, databases, AI providers and telephony.

## Hosted Brikode Runtime / Cloud Deploy

This is intentionally **not part of v1**.

Future work would require:

- authentication and accounts;
- hosted database;
- encrypted secret storage;
- multi-tenant execution workers;
- webhook ingress;
- scheduling;
- quotas and rate limiting;
- logs and observability;
- billing/limits if needed;
- deployment lifecycle and rollback;
- abuse controls;
- connector credential security.

Only after those foundations exist should the current Cloud Deploy placeholder become functional.
