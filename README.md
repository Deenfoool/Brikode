# Brikode

Brikode is a browser-based builder for bots and automations with two ways to work: visual blocks for no-code workflows and a code editor for advanced logic.

The first release is static-first: the editor runs on GitHub Pages, projects are represented by a shared workflow IR, and deployment is provided through **Export / Self-host**. **Cloud Deploy** is intentionally a non-functional “coming soon” entry point until a hosted runtime is introduced.

## Technical thesis

- Static SPA hosted from a Git branch on GitHub Pages; no GitHub Actions required.
- One canonical workflow IR powers both Blocks and Code modes.
- Connectors expose typed triggers, actions, inputs, outputs, and credential requirements.
- MVP connectors: Telegram, Discord, Webhook, and HTTP.
- Export produces a runnable self-hosted project with source, workflow, dependencies, `.env.example`, and generated setup instructions.
- Secrets are never embedded into the Pages bundle or exported workflow data.
- Cloud execution, hosted secrets, schedules, and production logs are future runtime features.

## Licenses

- [Brikode license](LICENSE)
- [Third-party licenses and notices](THIRD_PARTY_LICENSES.md)
