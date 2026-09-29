import { CONNECTORS, connectorVersionsForProject, getConnectorOperation } from "./connectors.js";
import { deepClone, stableStringify, uid } from "./utils.js";

export const SCHEMA_VERSION = 1;

export function createProject(name = "Untitled bot") {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid("project"),
    name: String(name || "Untitled bot").trim() || "Untitled bot",
    connectorVersions: {},
    trigger: null,
    steps: [],
    variables: [],
    metadata: {
      createdAt: now,
      updatedAt: now
    }
  };
}

function migrateV0(raw) {
  const project = createProject(raw?.name || "Imported bot");
  project.id = raw?.id || project.id;
  project.trigger = raw?.trigger || null;
  project.steps = Array.isArray(raw?.steps) ? raw.steps : [];
  project.variables = Array.isArray(raw?.variables) ? raw.variables : [];
  project.metadata = {
    ...project.metadata,
    ...(raw?.metadata || {})
  };
  return project;
}

export function migrateProject(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Project must be a JSON object.");
  let project = deepClone(raw);

  if (!Number.isInteger(project.schemaVersion)) {
    project = migrateV0(project);
  }

  if (project.schemaVersion > SCHEMA_VERSION) {
    throw new Error("This project was created by a newer Brikode version.");
  }

  if (project.schemaVersion < 1) {
    project = migrateV0(project);
  }

  project.schemaVersion = SCHEMA_VERSION;
  project.id ||= uid("project");
  project.name = String(project.name || "Untitled bot");
  project.trigger = project.trigger || null;
  project.steps = Array.isArray(project.steps) ? project.steps : [];
  project.variables = Array.isArray(project.variables) ? project.variables : [];
  project.metadata ||= {};
  project.metadata.createdAt ||= new Date().toISOString();
  project.metadata.updatedAt ||= project.metadata.createdAt;
  project.connectorVersions = project.connectorVersions && typeof project.connectorVersions === "object"
    ? project.connectorVersions
    : connectorVersionsForProject(project);

  return project;
}

function pushDiagnostic(list, severity, code, message, nodeId = null) {
  list.push({ severity, code, message, nodeId });
}

function validateTrigger(trigger, diagnostics) {
  if (!trigger) {
    pushDiagnostic(diagnostics, "error", "trigger.missing", "Add one trigger before testing or exporting.");
    return;
  }
  if (!trigger.id || !trigger.type) {
    pushDiagnostic(diagnostics, "error", "trigger.invalid", "Trigger is missing an id or type.", trigger?.id || null);
    return;
  }
  if (!getConnectorOperation("trigger", trigger.type)) {
    pushDiagnostic(diagnostics, "error", "trigger.unknown", "Unknown trigger: " + trigger.type, trigger.id);
  }
  if (trigger.type === "telegram.command" && !String(trigger.config?.command || "").trim()) {
    pushDiagnostic(diagnostics, "error", "telegram.command.empty", "Telegram command cannot be empty.", trigger.id);
  }
  if (trigger.type === "discord.slash" && !String(trigger.config?.command || "").trim()) {
    pushDiagnostic(diagnostics, "error", "discord.command.empty", "Discord slash command cannot be empty.", trigger.id);
  }
  if (trigger.type === "webhook.incoming" && !String(trigger.config?.path || "").startsWith("/")) {
    pushDiagnostic(diagnostics, "error", "webhook.path", "Webhook path must start with '/'.", trigger.id);
  }
}

function validateStep(step, diagnostics, ids) {
  if (!step || typeof step !== "object") {
    pushDiagnostic(diagnostics, "error", "step.invalid", "Workflow contains an invalid step.");
    return;
  }

  if (!step.id) {
    pushDiagnostic(diagnostics, "error", "step.id", "Every step must have a stable id.");
  } else if (ids.has(step.id)) {
    pushDiagnostic(diagnostics, "error", "step.duplicateId", "Duplicate node id: " + step.id, step.id);
  } else {
    ids.add(step.id);
  }

  if (step.type === "repeat") {
    const times = Number(step.times);
    if (!Number.isInteger(times) || times < 1 || times > 1000) {
      pushDiagnostic(diagnostics, "error", "repeat.times", "Repeat count must be an integer from 1 to 1000.", step.id);
    }
    for (const child of step.steps || []) validateStep(child, diagnostics, ids);
    return;
  }

  if (step.type === "condition") {
    const op = step.expression?.op;
    if (!["equals", "contains", "notEquals", "exists"].includes(op)) {
      pushDiagnostic(diagnostics, "error", "condition.operator", "Unsupported condition operator.", step.id);
    }
    if (!String(step.expression?.left || "").trim()) {
      pushDiagnostic(diagnostics, "error", "condition.left", "Condition needs a left-hand value/path.", step.id);
    }
    for (const child of step.then || []) validateStep(child, diagnostics, ids);
    for (const child of step.else || []) validateStep(child, diagnostics, ids);
    return;
  }

  if (step.type !== "action" || !step.action) {
    pushDiagnostic(diagnostics, "error", "action.invalid", "Step must be an action or condition.", step.id);
    return;
  }

  if (!getConnectorOperation("action", step.action)) {
    pushDiagnostic(diagnostics, "error", "action.unknown", "Unknown action: " + step.action, step.id);
  }

  if (step.action === "telegram.sendButtons") {
    const source = String(step.config?.buttons || "");
    if (source && !source.includes("{{")) {
      try {
        const parsed = JSON.parse(source);
        if (!Array.isArray(parsed)) throw new Error("not array");
      } catch {
        pushDiagnostic(diagnostics, "error", "telegram.buttons", "Telegram inline buttons must be a JSON array.", step.id);
      }
    }
  }

  if (step.action === "discord.reply" && !String(step.action || "").startsWith("discord.")) {
    pushDiagnostic(diagnostics, "error", "discord.reply.context", "Discord reply requires a Discord message or slash-command context.", step.id);
  }

  if (step.action === "http.request") {
    const method = String(step.config?.method || "GET").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      pushDiagnostic(diagnostics, "error", "http.method", "Unsupported HTTP method.", step.id);
    }
    if (!String(step.config?.url || "").trim()) {
      pushDiagnostic(diagnostics, "error", "http.url", "HTTP request needs a URL.", step.id);
    }
    const timeout = Number(step.config?.timeoutMs ?? 10000);
    if (!Number.isFinite(timeout) || timeout < 100 || timeout > 120000) {
      pushDiagnostic(diagnostics, "error", "http.timeout", "HTTP timeout must be between 100 and 120000 ms.", step.id);
    }
    for (const fieldName of ["query", "headers"]) {
      const value = String(step.config?.[fieldName] || "{}");
      if (value.includes("{{")) continue;
      try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
      } catch {
        pushDiagnostic(diagnostics, "error", "http." + fieldName, "HTTP " + fieldName + " must be a JSON object.", step.id);
      }
    }
  }

  if (step.action === "core.delay") {
    const ms = Number(step.config?.ms);
    if (!Number.isFinite(ms) || ms < 0) {
      pushDiagnostic(diagnostics, "error", "delay.value", "Delay must be zero or a positive number.", step.id);
    }
  }

  if (step.action === "core.setVariable") {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(step.config?.name || ""))) {
      pushDiagnostic(diagnostics, "error", "variable.name", "Variable names may contain letters, numbers and underscores and cannot start with a number.", step.id);
    }
  }

  if (step.action === "core.customCode") {
    pushDiagnostic(diagnostics, "warning", "customCode.escapeHatch", "Custom JavaScript runs only in exported self-hosted projects and may not round-trip to richer visual blocks.", step.id);
  }
}

export function validateProject(raw) {
  let project;
  try {
    project = migrateProject(raw);
  } catch (error) {
    return [{ severity: "error", code: "project.migration", message: error.message, nodeId: null }];
  }

  const diagnostics = [];
  if (!project.name.trim()) {
    pushDiagnostic(diagnostics, "warning", "project.name", "Project name is empty.");
  }

  validateTrigger(project.trigger, diagnostics);

  for (const [connectorId, savedVersion] of Object.entries(project.connectorVersions || {})) {
    const currentVersion = CONNECTORS[connectorId]?.version;
    if (currentVersion && savedVersion !== currentVersion) {
      pushDiagnostic(
        diagnostics,
        "warning",
        "connector.version",
        connectorId + " project version " + savedVersion + " differs from editor version " + currentVersion + "."
      );
    }
  }

  const ids = new Set(project.trigger?.id ? [project.trigger.id] : []);
  for (const step of project.steps) validateStep(step, diagnostics, ids);

  const variableNames = new Set();
  for (const variable of project.variables) {
    if (!variable?.name) continue;
    if (variableNames.has(variable.name)) {
      pushDiagnostic(diagnostics, "warning", "variable.duplicate", "Duplicate variable declaration: " + variable.name, variable.id || null);
    }
    variableNames.add(variable.name);
  }

  return diagnostics;
}

export function hasErrors(project) {
  return validateProject(project).some(item => item.severity === "error");
}

export function normalizeProject(raw) {
  const project = migrateProject(raw);
  project.connectorVersions = connectorVersionsForProject(project);
  project.metadata.updatedAt = new Date().toISOString();
  return project;
}

export function projectToJson(project) {
  return stableStringify(normalizeProject(project), 2) + "\n";
}

export function createAction(action, config = {}) {
  return {
    id: uid("node"),
    type: "action",
    action,
    config: deepClone(config)
  };
}

export function createCondition(left = "trigger.text", op = "contains", right = "") {
  return {
    id: uid("node"),
    type: "condition",
    expression: { left, op, right },
    then: [],
    else: []
  };
}

export function knownConnectorIds() {
  return Object.keys(CONNECTORS);
}
