# Brikode Connector SDK

Brikode connectors are data manifests. The editor core does not contain platform-specific trigger/action logic; it consumes connector metadata and the runtime/export layer implements matching adapters.

## Manifest

A connector must provide:

```js
{
  id: "example",
  label: "Example",
  version: "1.0.0",
  credentials: [
    {
      id: "apiToken",
      env: "EXAMPLE_API_TOKEN",
      label: "API token",
      secret: true
    }
  ],
  triggers: [
    {
      id: "event",
      label: "Event",
      inputs: {},
      outputs: { text: "string" }
    }
  ],
  actions: [
    {
      id: "send",
      label: "Send",
      inputs: { text: "string" },
      outputs: { response: "object" }
    }
  ]
}
```

Operation IDs are unique inside one connector. Connector IDs are lowercase and URL-safe. Versions use semantic `x.y.z` form.

## Registration

`assets/connectors.js` exports:

- `validateConnectorManifest(manifest)`
- `registerConnector(manifest, { replace })`
- `listConnectors()`
- `getConnector(id)`
- `getConnectorOperation(kind, qualifiedId)`

A connector may be registered at startup before a project is opened. Replacing an existing connector requires `replace: true`; silent replacement is intentionally rejected.

## Qualified operations

The canonical workflow IR references operations as:

- `example.event`
- `example.send`

Credentials are referenced by metadata only. Secret values must never be stored in a Brikode project file.

## Compatibility

Projects persist the connector versions with which they were last normalized. The validator emits a warning when a saved connector version differs from the editor version. A connector that changes workflow semantics must ship an explicit project migration before its new manifest is treated as compatible.

## Runtime adapters

A manifest describes capabilities; it does not execute them. To make a connector deployable, add matching runtime handling for its trigger/action IDs and include only the dependencies needed by that connector in the exporter.

## Test fixture

Every connector should have at least one fixture that covers:

1. project validation;
2. IR → DSL → IR round-trip;
3. simulator behavior where browser-safe;
4. generated runtime/export dependency requirements.
