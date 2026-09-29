# Third-party licenses

Brikode pins third-party versions so a static deployment does not silently change behavior.

## Browser dependencies

- **Blockly 13.2.0** — Apache License 2.0  
  License: https://github.com/google/blockly/blob/master/LICENSE
- **Monaco Editor 0.57.0** — MIT License  
  License: https://github.com/microsoft/monaco-editor/blob/main/LICENSE
- **JSZip 3.10.2** — dual MIT / GPLv3 licensing; Brikode uses JSZip under the MIT option  
  License: https://github.com/Stuk/jszip/blob/main/LICENSE.markdown

These browser libraries are loaded from pinned jsDelivr URLs by the static GitHub Pages application.

## Exported runtime dependency

- **discord.js 14.27.0** — Apache License 2.0  
  License: https://github.com/discordjs/discord.js/blob/14.27.0/LICENSE

`discord.js` is added only to an exported self-hosted project that actually uses a Discord connector. Telegram, Webhook and HTTP support use Node.js built-ins/web APIs and do not add a Telegram framework dependency.

When a dependency or pinned version changes, update this file in the same commit.
