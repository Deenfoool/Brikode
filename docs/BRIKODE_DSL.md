# Brikode DSL v1

Brikode Code mode is a structured DSL over the canonical Workflow IR. It is intentionally smaller than arbitrary JavaScript so supported workflows can round-trip back to Blocks mode.

## Structure

```text
WORKFLOW "Price bot"
TRIGGER telegram.message

# @id node_condition
IF "trigger.text" CONTAINS "price"
  # @id node_reply
  TELEGRAM_SEND "Send product name" TO ""
ELSE
  LOG "No price request"
END
```

Generated `# @id` and `# @trigger-id` comments preserve stable visual node IDs across mode switches.

## Statements

Triggers:

- `TRIGGER telegram.message`
- `TRIGGER telegram.command "/start"`
- `TRIGGER telegram.callback`
- `TRIGGER discord.message`
- `TRIGGER discord.slash "ping"`
- `TRIGGER webhook.incoming "/hook"`

Actions:

- `TELEGRAM_SEND "text" TO "optional-chat-id"`
- `TELEGRAM_FILE "url" CAPTION "text" TO "optional-chat-id"`
- `TELEGRAM_BUTTONS "text" BUTTONS "[[...]]" TO "optional-chat-id"`
- `DISCORD_SEND "text" TO "optional-channel-id"`
- `DISCORD_REPLY "text"`
- `DISCORD_EMBED "title" DESCRIPTION "text" TO "optional-channel-id"`
- `HTTP GET "https://example.com" AS response`
- `SET name = "value"`
- `DELAY 1000`
- `LOG "message"`
- `RAW_JS "return context;"`

Logic:

```text
IF "vars.response.ok" EQUALS "true"
  LOG "success"
ELSE
  LOG "failed"
END

REPEAT 3
  LOG "{{vars.loopIndex}}"
END
```

## Templates

Strings support safe path interpolation:

- `{{trigger.text}}`
- `{{vars.response.body}}`
- `{{vars.loopIndex}}`
- `{{steps.node_id}}`

Template interpolation only reads data paths. It does not evaluate JavaScript.

## Custom JavaScript

`RAW_JS` is an explicit escape hatch. It is skipped by the browser simulator and runs only in the exported self-hosted runtime. Code inside it is no longer representable as richer visual blocks; the editor therefore reports a warning.
