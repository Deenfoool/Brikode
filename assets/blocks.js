import { deepClone } from "./utils.js";
import { normalizeProject } from "./ir.js";

const DEFINITIONS = [
  {
    type: "brikode_trigger_telegram_message",
    message0: "Telegram  when message received",
    nextStatement: null,
    colour: 205,
    tooltip: "Starts the workflow for every Telegram message."
  },
  {
    type: "brikode_trigger_telegram_command",
    message0: "Telegram  command %1",
    args0: [{ type: "field_input", name: "COMMAND", text: "/start" }],
    nextStatement: null,
    colour: 205
  },
  {
    type: "brikode_trigger_telegram_callback",
    message0: "Telegram  when button is pressed",
    nextStatement: null,
    colour: 205
  },
  {
    type: "brikode_trigger_discord_message",
    message0: "Discord  when message received",
    nextStatement: null,
    colour: 265
  },
  {
    type: "brikode_trigger_discord_slash",
    message0: "Discord  slash command / %1",
    args0: [{ type: "field_input", name: "COMMAND", text: "ping" }],
    nextStatement: null,
    colour: 265
  },
  {
    type: "brikode_trigger_webhook",
    message0: "Webhook  on path %1",
    args0: [{ type: "field_input", name: "PATH", text: "/hook" }],
    nextStatement: null,
    colour: 30
  },
  {
    type: "brikode_webhook_respond",
    message0: "Webhook  respond status %1",
    args0: [{ type: "field_number", name: "STATUS", value: 200, min: 100, max: 599, precision: 1 }],
    message1: "content type %1",
    args1: [{ type: "field_input", name: "CONTENT_TYPE", text: "application/json" }],
    message2: "body %1",
    args2: [{ type: "field_input", name: "BODY", text: "{\"ok\":true}" }],
    previousStatement: null,
    nextStatement: null,
    colour: 30
  },
  {
    type: "brikode_telegram_send",
    message0: "Telegram  send %1",
    args0: [{ type: "field_input", name: "TEXT", text: "Hello {{trigger.text}}" }],
    message1: "chat ID (optional) %1",
    args1: [{ type: "field_input", name: "CHAT", text: "" }],
    previousStatement: null,
    nextStatement: null,
    colour: 205
  },
  {
    type: "brikode_telegram_file",
    message0: "Telegram  send file URL %1",
    args0: [{ type: "field_input", name: "URL", text: "https://example.com/file.pdf" }],
    message1: "caption %1",
    args1: [{ type: "field_input", name: "CAPTION", text: "" }],
    message2: "chat ID (optional) %1",
    args2: [{ type: "field_input", name: "CHAT", text: "" }],
    previousStatement: null,
    nextStatement: null,
    colour: 205
  },
  {
    type: "brikode_telegram_buttons",
    message0: "Telegram  send %1",
    args0: [{ type: "field_input", name: "TEXT", text: "Choose an option" }],
    message1: "inline buttons JSON %1",
    args1: [{ type: "field_input", name: "BUTTONS", text: "[[{\"text\":\"OK\",\"callback_data\":\"ok\"}]]" }],
    message2: "chat ID (optional) %1",
    args2: [{ type: "field_input", name: "CHAT", text: "" }],
    previousStatement: null,
    nextStatement: null,
    colour: 205
  },
  {
    type: "brikode_discord_send",
    message0: "Discord  send %1",
    args0: [{ type: "field_input", name: "TEXT", text: "Hello {{trigger.text}}" }],
    message1: "channel ID (optional) %1",
    args1: [{ type: "field_input", name: "CHANNEL", text: "" }],
    previousStatement: null,
    nextStatement: null,
    colour: 265
  },
  {
    type: "brikode_discord_reply",
    message0: "Discord  reply %1",
    args0: [{ type: "field_input", name: "TEXT", text: "Reply to {{trigger.text}}" }],
    previousStatement: null,
    nextStatement: null,
    colour: 265
  },
  {
    type: "brikode_discord_embed",
    message0: "Discord  embed title %1",
    args0: [{ type: "field_input", name: "TITLE", text: "Brikode" }],
    message1: "description %1",
    args1: [{ type: "field_input", name: "DESCRIPTION", text: "Hello {{trigger.text}}" }],
    message2: "channel ID (optional) %1",
    args2: [{ type: "field_input", name: "CHANNEL", text: "" }],
    previousStatement: null,
    nextStatement: null,
    colour: 265
  },
  {
    type: "brikode_discord_buttons",
    message0: "Discord  send %1",
    args0: [{ type: "field_input", name: "TEXT", text: "Choose an option" }],
    message1: "buttons JSON %1",
    args1: [{ type: "field_input", name: "BUTTONS", text: "[[{\"label\":\"OK\",\"customId\":\"ok\",\"style\":\"primary\"}]]" }],
    message2: "channel ID (optional) %1",
    args2: [{ type: "field_input", name: "CHANNEL", text: "" }],
    previousStatement: null,
    nextStatement: null,
    colour: 265
  },
  {
    type: "brikode_http_request",
    message0: "HTTP %1 %2",
    args0: [
      {
        type: "field_dropdown",
        name: "METHOD",
        options: [["GET", "GET"], ["POST", "POST"], ["PUT", "PUT"], ["PATCH", "PATCH"], ["DELETE", "DELETE"]]
      },
      { type: "field_input", name: "URL", text: "https://api.example.com" }
    ],
    message1: "query JSON %1",
    args1: [{ type: "field_input", name: "QUERY", text: "{}" }],
    message2: "headers JSON %1",
    args2: [{ type: "field_input", name: "HEADERS", text: "{}" }],
    message3: "body / template %1",
    args3: [{ type: "field_input", name: "BODY", text: "" }],
    message4: "timeout %1 ms",
    args4: [{ type: "field_number", name: "TIMEOUT", value: 10000, min: 100, max: 120000, precision: 100 }],
    message5: "save response as %1",
    args5: [{ type: "field_input", name: "AS", text: "response" }],
    previousStatement: null,
    nextStatement: null,
    colour: 25
  },
  {
    type: "brikode_delay",
    message0: "wait %1 ms",
    args0: [{ type: "field_number", name: "MS", value: 1000, min: 0, precision: 1 }],
    previousStatement: null,
    nextStatement: null,
    colour: 165
  },
  {
    type: "brikode_log",
    message0: "log %1",
    args0: [{ type: "field_input", name: "MESSAGE", text: "{{trigger.text}}" }],
    previousStatement: null,
    nextStatement: null,
    colour: 165
  },
  {
    type: "brikode_set_variable",
    message0: "set variable %1 to %2",
    args0: [
      { type: "field_input", name: "NAME", text: "value" },
      { type: "field_input", name: "VALUE", text: "{{trigger.text}}" }
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 165
  },
  {
    type: "brikode_if",
    message0: "if %1 %2 %3",
    args0: [
      { type: "field_input", name: "LEFT", text: "trigger.text" },
      {
        type: "field_dropdown",
        name: "OP",
        options: [["contains", "contains"], ["equals", "equals"], ["not equals", "notEquals"], ["exists", "exists"]]
      },
      { type: "field_input", name: "RIGHT", text: "hello" }
    ],
    message1: "then %1",
    args1: [{ type: "input_statement", name: "THEN" }],
    message2: "else %1",
    args2: [{ type: "input_statement", name: "ELSE" }],
    previousStatement: null,
    nextStatement: null,
    colour: 55
  },
  {
    type: "brikode_convert",
    message0: "convert %1",
    args0: [{ type: "field_input", name: "VALUE", text: "{{trigger.text}}" }],
    message1: "to %1 as variable %2",
    args1: [
      { type: "field_dropdown", name: "TARGET", options: [["string", "string"], ["number", "number"], ["boolean", "boolean"], ["JSON", "json"]] },
      { type: "field_input", name: "NAME", text: "converted" }
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 165
  },
  {
    type: "brikode_repeat",
    message0: "repeat %1 times",
    args0: [{ type: "field_number", name: "TIMES", value: 2, min: 1, max: 1000, precision: 1 }],
    message1: "do %1",
    args1: [{ type: "input_statement", name: "DO" }],
    previousStatement: null,
    nextStatement: null,
    colour: 55
  },
  {
    type: "brikode_custom_js",
    message0: "custom JavaScript %1",
    args0: [{ type: "field_input", name: "SOURCE", text: "return context;" }],
    previousStatement: null,
    nextStatement: null,
    colour: 330,
    tooltip: "Escape hatch. Runs only in the exported self-hosted runtime."
  }
];

const TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Triggers",
      colour: "#7c8cff",
      contents: [
        { kind: "block", type: "brikode_trigger_telegram_message" },
        { kind: "block", type: "brikode_trigger_telegram_command" },
        { kind: "block", type: "brikode_trigger_telegram_callback" },
        { kind: "block", type: "brikode_trigger_discord_message" },
        { kind: "block", type: "brikode_trigger_discord_slash" },
        { kind: "block", type: "brikode_trigger_webhook" }
      ]
    },
    {
      kind: "category",
      name: "Webhook",
      colour: "#c47d34",
      contents: [
        { kind: "block", type: "brikode_webhook_respond" }
      ]
    },
    {
      kind: "category",
      name: "Telegram",
      colour: "#3f9bd8",
      contents: [
        { kind: "block", type: "brikode_telegram_send" },
        { kind: "block", type: "brikode_telegram_file" },
        { kind: "block", type: "brikode_telegram_buttons" }
      ]
    },
    {
      kind: "category",
      name: "Discord",
      colour: "#7757d8",
      contents: [
        { kind: "block", type: "brikode_discord_send" },
        { kind: "block", type: "brikode_discord_reply" },
        { kind: "block", type: "brikode_discord_embed" },
        { kind: "block", type: "brikode_discord_buttons" }
      ]
    },
    {
      kind: "category",
      name: "Web & API",
      colour: "#d58a3a",
      contents: [
        { kind: "block", type: "brikode_http_request" }
      ]
    },
    {
      kind: "category",
      name: "Logic",
      colour: "#48a08b",
      contents: [
        { kind: "block", type: "brikode_if" },
        { kind: "block", type: "brikode_repeat" },
        { kind: "block", type: "brikode_set_variable" },
        { kind: "block", type: "brikode_convert" },
        { kind: "block", type: "brikode_delay" },
        { kind: "block", type: "brikode_log" }
      ]
    },
    {
      kind: "category",
      name: "Advanced",
      colour: "#b24e91",
      contents: [
        { kind: "block", type: "brikode_custom_js" }
      ]
    }
  ]
};

const SEARCH_INDEX = [
  ["telegram message trigger", "brikode_trigger_telegram_message"],
  ["telegram command trigger", "brikode_trigger_telegram_command"],
  ["telegram callback button trigger", "brikode_trigger_telegram_callback"],
  ["discord message trigger", "brikode_trigger_discord_message"],
  ["discord slash command trigger", "brikode_trigger_discord_slash"],
  ["webhook incoming trigger", "brikode_trigger_webhook"],
  ["webhook response status body", "brikode_webhook_respond"],
  ["telegram send message", "brikode_telegram_send"],
  ["telegram send file", "brikode_telegram_file"],
  ["telegram inline buttons callback", "brikode_telegram_buttons"],
  ["discord send message", "brikode_discord_send"],
  ["discord reply message", "brikode_discord_reply"],
  ["discord embed card", "brikode_discord_embed"],
  ["discord buttons components", "brikode_discord_buttons"],
  ["http api request get post put patch delete", "brikode_http_request"],
  ["if condition contains equals", "brikode_if"],
  ["repeat loop times", "brikode_repeat"],
  ["variable set", "brikode_set_variable"],
  ["convert cast type string number boolean json", "brikode_convert"],
  ["delay wait", "brikode_delay"],
  ["log debug", "brikode_log"],
  ["custom javascript code", "brikode_custom_js"]
];

let blocksDefined = false;

function ensureBlockly() {
  if (!globalThis.Blockly) throw new Error("Blockly did not load. Check the network connection and reload Brikode.");
  if (!blocksDefined) {
    Blockly.defineBlocksWithJsonArray(DEFINITIONS);
    blocksDefined = true;
  }
}

export function createBlocksWorkspace(container, onMeaningfulChange) {
  ensureBlockly();

  const workspace = Blockly.inject(container, {
    toolbox: TOOLBOX,
    trashcan: true,
    renderer: "zelos",
    grid: {
      spacing: 24,
      length: 3,
      colour: "#293249",
      snap: true
    },
    zoom: {
      controls: true,
      wheel: true,
      startScale: 0.9,
      maxScale: 1.6,
      minScale: 0.45,
      scaleSpeed: 1.1
    },
    move: {
      scrollbars: true,
      drag: true,
      wheel: true
    },
    sounds: false
  });

  workspace.addChangeListener(event => {
    if (event.isUiEvent || event.type === Blockly.Events.FINISHED_LOADING) return;
    onMeaningfulChange?.(event);
  });

  return workspace;
}

export function updateBlockSearch(workspace, query) {
  ensureBlockly();
  const term = String(query || "").trim().toLowerCase();
  if (!term) {
    workspace.updateToolbox(TOOLBOX);
    return;
  }

  const matches = SEARCH_INDEX
    .filter(([keywords]) => keywords.includes(term))
    .map(([, type]) => ({ kind: "block", type }));

  workspace.updateToolbox({
    kind: "categoryToolbox",
    contents: [{
      kind: "category",
      name: "Search",
      colour: "#8ea2ff",
      contents: matches.length ? matches : [{ kind: "label", text: "No blocks found" }]
    }]
  });
}

function field(block, name, fallback = "") {
  return block.getFieldValue(name) ?? fallback;
}

function triggerFromBlock(block) {
  if (!block) return null;
  const base = { id: block.id, config: {} };

  switch (block.type) {
    case "brikode_trigger_telegram_message":
      return { ...base, type: "telegram.message" };
    case "brikode_trigger_telegram_command":
      return { ...base, type: "telegram.command", config: { command: field(block, "COMMAND", "/start") } };
    case "brikode_trigger_telegram_callback":
      return { ...base, type: "telegram.callback" };
    case "brikode_trigger_discord_message":
      return { ...base, type: "discord.message" };
    case "brikode_trigger_discord_slash":
      return { ...base, type: "discord.slash", config: { command: field(block, "COMMAND", "ping") } };
    case "brikode_trigger_webhook":
      return { ...base, type: "webhook.incoming", config: { path: field(block, "PATH", "/hook") } };
    default:
      return null;
  }
}

function compileChain(firstBlock) {
  const steps = [];
  let block = firstBlock;

  while (block) {
    let node = null;

    switch (block.type) {
      case "brikode_webhook_respond":
        node = {
          id: block.id,
          type: "action",
          action: "webhook.respond",
          config: {
            status: Number(field(block, "STATUS", 200)),
            contentType: field(block, "CONTENT_TYPE", "application/json"),
            body: field(block, "BODY", "{\"ok\":true}")
          }
        };
        break;
      case "brikode_telegram_send":
        node = {
          id: block.id,
          type: "action",
          action: "telegram.sendMessage",
          config: { text: field(block, "TEXT"), chatId: field(block, "CHAT") }
        };
        break;
      case "brikode_telegram_file":
        node = {
          id: block.id,
          type: "action",
          action: "telegram.sendFile",
          config: { url: field(block, "URL"), caption: field(block, "CAPTION"), chatId: field(block, "CHAT") }
        };
        break;
      case "brikode_telegram_buttons":
        node = {
          id: block.id,
          type: "action",
          action: "telegram.sendButtons",
          config: { text: field(block, "TEXT"), buttons: field(block, "BUTTONS", "[]"), chatId: field(block, "CHAT") }
        };
        break;
      case "brikode_discord_send":
        node = {
          id: block.id,
          type: "action",
          action: "discord.sendMessage",
          config: { text: field(block, "TEXT"), channelId: field(block, "CHANNEL") }
        };
        break;
      case "brikode_discord_reply":
        node = {
          id: block.id,
          type: "action",
          action: "discord.reply",
          config: { text: field(block, "TEXT") }
        };
        break;
      case "brikode_discord_embed":
        node = {
          id: block.id,
          type: "action",
          action: "discord.sendEmbed",
          config: { title: field(block, "TITLE"), description: field(block, "DESCRIPTION"), channelId: field(block, "CHANNEL") }
        };
        break;
      case "brikode_discord_buttons":
        node = {
          id: block.id,
          type: "action",
          action: "discord.sendButtons",
          config: { text: field(block, "TEXT"), buttons: field(block, "BUTTONS", "[]"), channelId: field(block, "CHANNEL") }
        };
        break;
      case "brikode_http_request":
        node = {
          id: block.id,
          type: "action",
          action: "http.request",
          config: {
            method: field(block, "METHOD", "GET"),
            url: field(block, "URL"),
            query: field(block, "QUERY", "{}"),
            headers: field(block, "HEADERS", "{}"),
            body: field(block, "BODY", ""),
            timeoutMs: Number(field(block, "TIMEOUT", 10000)),
            as: field(block, "AS", "response")
          }
        };
        break;
      case "brikode_delay":
        node = {
          id: block.id,
          type: "action",
          action: "core.delay",
          config: { ms: Number(field(block, "MS", 0)) }
        };
        break;
      case "brikode_log":
        node = {
          id: block.id,
          type: "action",
          action: "core.log",
          config: { message: field(block, "MESSAGE") }
        };
        break;
      case "brikode_set_variable":
        node = {
          id: block.id,
          type: "action",
          action: "core.setVariable",
          config: { name: field(block, "NAME"), value: field(block, "VALUE") }
        };
        break;
      case "brikode_convert":
        node = {
          id: block.id,
          type: "action",
          action: "core.convert",
          config: { value: field(block, "VALUE"), target: field(block, "TARGET", "string"), name: field(block, "NAME", "converted") }
        };
        break;
      case "brikode_repeat":
        node = {
          id: block.id,
          type: "repeat",
          times: Number(field(block, "TIMES", 1)),
          steps: compileChain(block.getInputTargetBlock("DO"))
        };
        break;
      case "brikode_custom_js":
        node = {
          id: block.id,
          type: "action",
          action: "core.customCode",
          config: { source: field(block, "SOURCE") }
        };
        break;
      case "brikode_if":
        node = {
          id: block.id,
          type: "condition",
          expression: {
            left: field(block, "LEFT"),
            op: field(block, "OP", "contains"),
            right: field(block, "RIGHT")
          },
          then: compileChain(block.getInputTargetBlock("THEN")),
          else: compileChain(block.getInputTargetBlock("ELSE"))
        };
        break;
    }

    if (node) steps.push(node);
    block = block.getNextBlock();
  }

  return steps;
}

export function workspaceToProject(baseProject, workspace) {
  const project = deepClone(baseProject);
  const topBlocks = workspace.getTopBlocks(true);
  const triggerBlock = topBlocks.find(block => block.type.startsWith("brikode_trigger_")) || null;

  project.trigger = triggerFromBlock(triggerBlock);
  project.steps = triggerBlock ? compileChain(triggerBlock.getNextBlock()) : [];
  return normalizeProject(project);
}

const TRIGGER_BLOCKS = {
  "telegram.message": ["brikode_trigger_telegram_message", {}],
  "telegram.command": ["brikode_trigger_telegram_command", { COMMAND: "command" }],
  "telegram.callback": ["brikode_trigger_telegram_callback", {}],
  "discord.message": ["brikode_trigger_discord_message", {}],
  "discord.slash": ["brikode_trigger_discord_slash", { COMMAND: "command" }],
  "webhook.incoming": ["brikode_trigger_webhook", { PATH: "path" }]
};

const ACTION_BLOCKS = {
  "webhook.respond": ["brikode_webhook_respond", { STATUS: "status", CONTENT_TYPE: "contentType", BODY: "body" }],
  "telegram.sendMessage": ["brikode_telegram_send", { TEXT: "text", CHAT: "chatId" }],
  "telegram.sendFile": ["brikode_telegram_file", { URL: "url", CAPTION: "caption", CHAT: "chatId" }],
  "telegram.sendButtons": ["brikode_telegram_buttons", { TEXT: "text", BUTTONS: "buttons", CHAT: "chatId" }],
  "discord.sendMessage": ["brikode_discord_send", { TEXT: "text", CHANNEL: "channelId" }],
  "discord.reply": ["brikode_discord_reply", { TEXT: "text" }],
  "discord.sendEmbed": ["brikode_discord_embed", { TITLE: "title", DESCRIPTION: "description", CHANNEL: "channelId" }],
  "discord.sendButtons": ["brikode_discord_buttons", { TEXT: "text", BUTTONS: "buttons", CHANNEL: "channelId" }],
  "http.request": ["brikode_http_request", { METHOD: "method", URL: "url", QUERY: "query", HEADERS: "headers", BODY: "body", TIMEOUT: "timeoutMs", AS: "as" }],
  "core.delay": ["brikode_delay", { MS: "ms" }],
  "core.log": ["brikode_log", { MESSAGE: "message" }],
  "core.setVariable": ["brikode_set_variable", { NAME: "name", VALUE: "value" }],
  "core.convert": ["brikode_convert", { VALUE: "value", TARGET: "target", NAME: "name" }],
  "core.customCode": ["brikode_custom_js", { SOURCE: "source" }]
};

function createBlock(workspace, type, id) {
  const block = workspace.newBlock(type, id);
  block.initSvg();
  block.render();
  return block;
}

function setMappedFields(block, config, map) {
  for (const [fieldName, configName] of Object.entries(map || {})) {
    const value = config?.[configName];
    if (value !== undefined && value !== null) {
      block.setFieldValue(String(value), fieldName);
    }
  }
}

function renderStep(workspace, step) {
  if (step.type === "repeat") {
    const block = createBlock(workspace, "brikode_repeat", step.id);
    block.setFieldValue(String(step.times || 1), "TIMES");
    const first = renderChain(workspace, step.steps || []);
    if (first?.previousConnection) {
      block.getInput("DO").connection.connect(first.previousConnection);
    }
    return block;
  }

  if (step.type === "condition") {
    const block = createBlock(workspace, "brikode_if", step.id);
    block.setFieldValue(String(step.expression?.left || "trigger.text"), "LEFT");
    block.setFieldValue(String(step.expression?.op || "contains"), "OP");
    block.setFieldValue(String(step.expression?.right ?? ""), "RIGHT");

    const thenFirst = renderChain(workspace, step.then || []);
    const elseFirst = renderChain(workspace, step.else || []);

    if (thenFirst?.previousConnection) {
      block.getInput("THEN").connection.connect(thenFirst.previousConnection);
    }
    if (elseFirst?.previousConnection) {
      block.getInput("ELSE").connection.connect(elseFirst.previousConnection);
    }

    return block;
  }

  const entry = ACTION_BLOCKS[step.action];
  if (!entry) return null;
  const block = createBlock(workspace, entry[0], step.id);
  setMappedFields(block, step.config, entry[1]);
  return block;
}

function renderChain(workspace, steps) {
  let first = null;
  let previous = null;

  for (const step of steps || []) {
    const block = renderStep(workspace, step);
    if (!block) continue;
    if (!first) first = block;
    if (previous?.nextConnection && block.previousConnection) {
      previous.nextConnection.connect(block.previousConnection);
    }
    previous = block;
  }

  return first;
}

export function projectToWorkspace(project, workspace) {
  ensureBlockly();
  Blockly.Events.disable();
  try {
    workspace.clear();
    if (!project?.trigger) return;

    const entry = TRIGGER_BLOCKS[project.trigger.type];
    if (!entry) return;

    const trigger = createBlock(workspace, entry[0], project.trigger.id);
    setMappedFields(trigger, project.trigger.config, entry[1]);

    const firstStep = renderChain(workspace, project.steps || []);
    if (firstStep?.previousConnection) {
      trigger.nextConnection.connect(firstStep.previousConnection);
    }

    trigger.moveBy(48, 42);
  } finally {
    Blockly.Events.enable();
    Blockly.svgResize(workspace);
  }
}

export function disposeBlocksWorkspace(workspace) {
  workspace?.dispose?.();
}


export function applyBlockDiagnostics(workspace, diagnostics) {
  if (!workspace) return;
  for (const block of workspace.getAllBlocks(false)) {
    block.setWarningText(null);
  }
  const grouped = new Map();
  for (const item of diagnostics || []) {
    if (!item.nodeId) continue;
    if (!grouped.has(item.nodeId)) grouped.set(item.nodeId, []);
    grouped.get(item.nodeId).push(item.message);
  }
  for (const [nodeId, messages] of grouped) {
    workspace.getBlockById(nodeId)?.setWarningText(messages.join("\n"));
  }
}
