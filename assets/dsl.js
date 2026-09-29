import { createProject, normalizeProject } from "./ir.js";
import { uid } from "./utils.js";

const QUOTED = '"(?:\\\\.|[^"\\\\])*"';

function quote(value) {
  return JSON.stringify(String(value ?? ""));
}

function unquote(value) {
  return JSON.parse(value);
}

function stableId(value, prefix = "node") {
  const clean = String(value || "").replace(/[^A-Za-z0-9_-]/g, "");
  return clean || uid(prefix);
}

function actionToLines(step, indent, lines) {
  const pad = "  ".repeat(indent);
  lines.push(pad + "# @id " + stableId(step.id));

  if (step.type === "condition") {
    const expr = step.expression || {};
    lines.push(
      pad + "IF " +
      quote(expr.left || "") + " " +
      String(expr.op || "contains").toUpperCase() + " " +
      quote(expr.right ?? "")
    );
    for (const child of step.then || []) actionToLines(child, indent + 1, lines);
    if ((step.else || []).length) {
      lines.push(pad + "ELSE");
      for (const child of step.else || []) actionToLines(child, indent + 1, lines);
    }
    lines.push(pad + "END");
    return;
  }

  const config = step.config || {};
  switch (step.action) {
    case "telegram.sendMessage":
      lines.push(pad + "TELEGRAM_SEND " + quote(config.text || ""));
      break;
    case "telegram.sendFile":
      lines.push(pad + "TELEGRAM_FILE " + quote(config.url || "") + " CAPTION " + quote(config.caption || ""));
      break;
    case "discord.sendMessage":
      lines.push(pad + "DISCORD_SEND " + quote(config.text || ""));
      break;
    case "http.request":
      lines.push(
        pad + "HTTP " +
        String(config.method || "GET").toUpperCase() + " " +
        quote(config.url || "") +
        " AS " + String(config.as || "response")
      );
      break;
    case "core.delay":
      lines.push(pad + "DELAY " + String(Number(config.ms) || 0));
      break;
    case "core.log":
      lines.push(pad + "LOG " + quote(config.message || ""));
      break;
    case "core.setVariable":
      lines.push(pad + "SET " + String(config.name || "value") + " = " + quote(config.value ?? ""));
      break;
    case "core.customCode":
      lines.push(pad + "RAW_JS " + quote(config.source || ""));
      break;
    default:
      lines.push(pad + "# Unsupported action " + String(step.action || "unknown"));
  }
}

export function projectToDsl(project) {
  const p = normalizeProject(project);
  const lines = [
    "# Brikode DSL v1",
    "WORKFLOW " + quote(p.name),
    ""
  ];

  if (!p.trigger) {
    lines.push("# Add a trigger in Blocks mode or write one here.");
  } else {
    lines.push("# @trigger-id " + stableId(p.trigger.id, "trigger"));
    const config = p.trigger.config || {};
    switch (p.trigger.type) {
      case "telegram.message":
        lines.push("TRIGGER telegram.message");
        break;
      case "telegram.command":
        lines.push("TRIGGER telegram.command " + quote(config.command || "/start"));
        break;
      case "telegram.callback":
        lines.push("TRIGGER telegram.callback");
        break;
      case "discord.message":
        lines.push("TRIGGER discord.message");
        break;
      case "discord.slash":
        lines.push("TRIGGER discord.slash " + quote(config.command || "ping"));
        break;
      case "webhook.incoming":
        lines.push("TRIGGER webhook.incoming " + quote(config.path || "/hook"));
        break;
      default:
        lines.push("# Unknown trigger " + p.trigger.type);
    }
  }

  lines.push("");
  for (const step of p.steps) actionToLines(step, 0, lines);
  lines.push("");
  return lines.join("\n");
}

function parseAction(line, lineNumber, nodeId) {
  let match;
  const id = stableId(nodeId);

  match = line.match(new RegExp("^TELEGRAM_SEND\\s+(" + QUOTED + ")$", "i"));
  if (match) return { id, type: "action", action: "telegram.sendMessage", config: { text: unquote(match[1]) } };

  match = line.match(new RegExp("^TELEGRAM_FILE\\s+(" + QUOTED + ")\\s+CAPTION\\s+(" + QUOTED + ")$", "i"));
  if (match) return {
    id,
    type: "action",
    action: "telegram.sendFile",
    config: { url: unquote(match[1]), caption: unquote(match[2]) }
  };

  match = line.match(new RegExp("^DISCORD_SEND\\s+(" + QUOTED + ")$", "i"));
  if (match) return { id, type: "action", action: "discord.sendMessage", config: { text: unquote(match[1]) } };

  match = line.match(new RegExp("^HTTP\\s+(GET|POST|PUT|PATCH|DELETE)\\s+(" + QUOTED + ")\\s+AS\\s+([A-Za-z_][A-Za-z0-9_]*)$", "i"));
  if (match) return {
    id,
    type: "action",
    action: "http.request",
    config: { method: match[1].toUpperCase(), url: unquote(match[2]), as: match[3] }
  };

  match = line.match(/^DELAY\s+(\d+)$/i);
  if (match) return { id, type: "action", action: "core.delay", config: { ms: Number(match[1]) } };

  match = line.match(new RegExp("^LOG\\s+(" + QUOTED + ")$", "i"));
  if (match) return { id, type: "action", action: "core.log", config: { message: unquote(match[1]) } };

  match = line.match(new RegExp("^SET\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(" + QUOTED + ")$", "i"));
  if (match) return {
    id,
    type: "action",
    action: "core.setVariable",
    config: { name: match[1], value: unquote(match[2]) }
  };

  match = line.match(new RegExp("^RAW_JS\\s+(" + QUOTED + ")$", "i"));
  if (match) return { id, type: "action", action: "core.customCode", config: { source: unquote(match[1]) } };

  throw new Error("Line " + lineNumber + ": unsupported statement.");
}

export function parseDsl(source, fallbackName = "Untitled bot") {
  const diagnostics = [];
  const project = createProject(fallbackName);
  const stack = [{ steps: project.steps, condition: null }];
  const lines = String(source || "").split(/\r?\n/);
  let sawWorkflow = false;
  let sawTrigger = false;
  let pendingId = null;
  let pendingTriggerId = null;

  const error = (line, message) => diagnostics.push({ severity: "error", line, message });

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index].trim();

    if (!line) continue;

    let match = line.match(/^#\s*@id\s+([A-Za-z0-9_-]+)$/i);
    if (match) {
      pendingId = match[1];
      continue;
    }

    match = line.match(/^#\s*@trigger-id\s+([A-Za-z0-9_-]+)$/i);
    if (match) {
      pendingTriggerId = match[1];
      continue;
    }

    if (line.startsWith("#")) continue;

    match = line.match(new RegExp("^WORKFLOW\\s+(" + QUOTED + ")$", "i"));
    if (match) {
      project.name = unquote(match[1]);
      sawWorkflow = true;
      continue;
    }

    match = line.match(/^TRIGGER\s+telegram\.message$/i);
    if (match) {
      project.trigger = { id: stableId(pendingTriggerId, "trigger"), type: "telegram.message", config: {} };
      pendingTriggerId = null;
      sawTrigger = true;
      continue;
    }

    match = line.match(new RegExp("^TRIGGER\\s+telegram\\.command\\s+(" + QUOTED + ")$", "i"));
    if (match) {
      project.trigger = {
        id: stableId(pendingTriggerId, "trigger"),
        type: "telegram.command",
        config: { command: unquote(match[1]) }
      };
      pendingTriggerId = null;
      sawTrigger = true;
      continue;
    }

    match = line.match(/^TRIGGER\s+telegram\.callback$/i);
    if (match) {
      project.trigger = { id: stableId(pendingTriggerId, "trigger"), type: "telegram.callback", config: {} };
      pendingTriggerId = null;
      sawTrigger = true;
      continue;
    }

    match = line.match(/^TRIGGER\s+discord\.message$/i);
    if (match) {
      project.trigger = { id: stableId(pendingTriggerId, "trigger"), type: "discord.message", config: {} };
      pendingTriggerId = null;
      sawTrigger = true;
      continue;
    }

    match = line.match(new RegExp("^TRIGGER\\s+discord\\.slash\\s+(" + QUOTED + ")$", "i"));
    if (match) {
      project.trigger = {
        id: stableId(pendingTriggerId, "trigger"),
        type: "discord.slash",
        config: { command: unquote(match[1]) }
      };
      pendingTriggerId = null;
      sawTrigger = true;
      continue;
    }

    match = line.match(new RegExp("^TRIGGER\\s+webhook\\.incoming\\s+(" + QUOTED + ")$", "i"));
    if (match) {
      project.trigger = {
        id: stableId(pendingTriggerId, "trigger"),
        type: "webhook.incoming",
        config: { path: unquote(match[1]) }
      };
      pendingTriggerId = null;
      sawTrigger = true;
      continue;
    }

    match = line.match(new RegExp("^IF\\s+(" + QUOTED + ")\\s+(EQUALS|CONTAINS|NOTEQUALS|EXISTS)\\s+(" + QUOTED + ")$", "i"));
    if (match) {
      const condition = {
        id: stableId(pendingId),
        type: "condition",
        expression: {
          left: unquote(match[1]),
          op: match[2].toLowerCase() === "notequals" ? "notEquals" : match[2].toLowerCase(),
          right: unquote(match[3])
        },
        then: [],
        else: []
      };
      pendingId = null;
      stack.at(-1).steps.push(condition);
      stack.push({ steps: condition.then, condition, branch: "then" });
      continue;
    }

    if (/^ELSE$/i.test(line)) {
      if (stack.length === 1 || !stack.at(-1).condition) {
        error(lineNumber, "ELSE has no matching IF.");
        continue;
      }
      const current = stack.pop();
      stack.push({ steps: current.condition.else, condition: current.condition, branch: "else" });
      continue;
    }

    if (/^END$/i.test(line)) {
      if (stack.length === 1) {
        error(lineNumber, "END has no matching IF.");
      } else {
        stack.pop();
      }
      continue;
    }

    if (/^TRIGGER\s+/i.test(line)) {
      error(lineNumber, "Unknown trigger declaration.");
      continue;
    }

    try {
      stack.at(-1).steps.push(parseAction(line, lineNumber, pendingId));
      pendingId = null;
    } catch (parseError) {
      error(lineNumber, parseError.message);
    }
  }

  if (stack.length !== 1) {
    error(lines.length, "One or more IF blocks are missing END.");
  }
  if (!sawWorkflow) {
    diagnostics.push({ severity: "warning", line: 1, message: "WORKFLOW declaration is missing; current project name was kept." });
  }
  if (!sawTrigger) {
    diagnostics.push({ severity: "warning", line: 1, message: "No TRIGGER declaration found." });
  }

  return { project: normalizeProject(project), diagnostics };
}
