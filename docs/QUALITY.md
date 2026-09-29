# Brikode quality baseline

## Security

- Never put tokens, API keys, passwords or other production secrets in project JSON or the Pages bundle.
- Exported projects read connector credentials from environment variables.
- Imported project files are limited to 2 MB.
- Webhook request bodies are limited to 1 MB in the self-hosted runtime.
- Browser template evaluation is path-based and does not use `eval`.
- Custom JavaScript is explicitly marked as a self-host-only escape hatch.
- The static app uses a Content Security Policy and renders project-controlled UI text through escaping.

## Accessibility

- All primary controls use native buttons, inputs, dialogs and labels.
- Focus remains browser-native and visible.
- Blocks/Code/Test/Deploy modes are exposed as tabs.
- Layout collapses for narrow screens.
- Color is not the only diagnostic signal: statuses and messages include text.

## Performance budget

Target on a normal desktop connection:

- static shell before editor libraries: under 250 KB application-owned text assets;
- project list interactive without loading a project;
- no project JSON above 2 MB;
- block search remains responsive for the built-in toolbox;
- simulator caps repeat loops at 1000 iterations;
- self-host HTTP timeout is capped at 120 seconds.

Blockly, Monaco and JSZip are loaded from pinned CDN versions and are not bundled into the repository. Future dependency additions should be measured before inclusion.

## Recovery

Every successful save writes a local recovery snapshot before committing the project to IndexedDB. Loading a missing IndexedDB record falls back to that snapshot.

## Release verification

Before syncing `main` to `gh-pages`:

1. run `npm test`;
2. open the static site via an HTTP server;
3. create a project;
4. build a Blocks workflow;
5. switch Blocks → Code → Blocks;
6. run the simulator;
7. export JSON;
8. export Self-host ZIP;
9. inspect the ZIP for secrets;
10. run the exported project for each supported trigger family.
