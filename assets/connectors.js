export const CONNECTORS = {
  telegram: {
    id: "telegram",
    label: "Telegram",
    version: "1.0.0",
    credentials: [
      { id: "botToken", env: "TELEGRAM_BOT_TOKEN", label: "Bot token", secret: true }
    ],
    triggers: [
      { id: "message", label: "Message", outputs: { message: "object", text: "string", chatId: "string" } },
      { id: "command", label: "Command", inputs: { command: "string" }, outputs: { message: "object", text: "string", chatId: "string" } },
      { id: "callback", label: "Button callback", outputs: { callback: "object", data: "string", chatId: "string" } }
    ],
    actions: [
      { id: "sendMessage", label: "Send message", inputs: { text: "string", chatId: "string?" }, outputs: { response: "object" } },
      { id: "sendFile", label: "Send file", inputs: { url: "string", caption: "string?" }, outputs: { response: "object" } },
      { id: "sendButtons", label: "Send inline buttons", inputs: { text: "string", buttons: "json" }, outputs: { response: "object" } }
    ]
  },
  discord: {
    id: "discord",
    label: "Discord",
    version: "1.0.0",
    credentials: [
      { id: "botToken", env: "DISCORD_BOT_TOKEN", label: "Bot token", secret: true },
      { id: "applicationId", env: "DISCORD_APPLICATION_ID", label: "Application ID", secret: false }
    ],
    triggers: [
      { id: "message", label: "Message", outputs: { message: "object", text: "string", channelId: "string" } },
      { id: "slash", label: "Slash command", inputs: { command: "string" }, outputs: { interaction: "object", text: "string", channelId: "string" } }
    ],
    actions: [
      { id: "sendMessage", label: "Send message", inputs: { text: "string", channelId: "string?" }, outputs: { response: "object" } },
      { id: "reply", label: "Reply", inputs: { text: "string" }, outputs: { response: "object" } },
      { id: "sendEmbed", label: "Send embed", inputs: { title: "string", description: "string" }, outputs: { response: "object" } }
    ]
  },
  webhook: {
    id: "webhook",
    label: "Webhook",
    version: "1.0.0",
    credentials: [],
    triggers: [
      { id: "incoming", label: "Incoming request", inputs: { path: "string" }, outputs: { body: "any", headers: "object", query: "object" } }
    ],
    actions: []
  },
  http: {
    id: "http",
    label: "HTTP",
    version: "1.0.0",
    credentials: [],
    triggers: [],
    actions: [
      {
        id: "request",
        label: "Request",
        inputs: { method: "string", url: "string", headers: "object?", query: "object?", body: "any?", timeoutMs: "number?" },
        outputs: { status: "number", ok: "boolean", body: "any", headers: "object" }
      }
    ]
  },
  core: {
    id: "core",
    label: "Logic",
    version: "1.0.0",
    credentials: [],
    triggers: [],
    actions: [
      { id: "delay", label: "Delay", inputs: { ms: "number" }, outputs: {} },
      { id: "log", label: "Log", inputs: { message: "string" }, outputs: {} },
      { id: "setVariable", label: "Set variable", inputs: { name: "string", value: "any" }, outputs: {} },
      { id: "customCode", label: "Custom JavaScript", inputs: { source: "string" }, outputs: { result: "any" } }
    ]
  }
};

export function validateConnectorManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return ["Manifest must be an object."];
  if (!/^[a-z][a-z0-9_-]*$/.test(String(manifest.id || ""))) errors.push("Connector id must be lowercase and URL-safe.");
  if (!String(manifest.label || "").trim()) errors.push("Connector label is required.");
  if (!/^\d+\.\d+\.\d+$/.test(String(manifest.version || ""))) errors.push("Connector version must use x.y.z.");
  if (!Array.isArray(manifest.triggers)) errors.push("triggers must be an array.");
  if (!Array.isArray(manifest.actions)) errors.push("actions must be an array.");
  if (!Array.isArray(manifest.credentials)) errors.push("credentials must be an array.");

  const ids = new Set();
  for (const operation of [...(manifest.triggers || []), ...(manifest.actions || [])]) {
    if (!operation?.id || ids.has(operation.id)) errors.push("Operation ids must be present and unique.");
    ids.add(operation?.id);
    if (!String(operation?.label || "").trim()) errors.push("Every operation needs a label.");
  }

  return errors;
}

export function registerConnector(manifest, { replace = false } = {}) {
  const errors = validateConnectorManifest(manifest);
  if (errors.length) throw new Error("Invalid connector manifest: " + errors.join(" "));
  if (CONNECTORS[manifest.id] && !replace) throw new Error("Connector already registered: " + manifest.id);
  CONNECTORS[manifest.id] = structuredClone(manifest);
  return CONNECTORS[manifest.id];
}

export function listConnectors() {
  return Object.values(CONNECTORS).map(connector => structuredClone(connector));
}

export function getConnector(id) {
  return CONNECTORS[id] || null;
}

export function getConnectorOperation(kind, qualifiedId) {
  const [connectorId, operationId] = String(qualifiedId || "").split(".");
  const connector = getConnector(connectorId);
  if (!connector) return null;
  const collection = kind === "trigger" ? connector.triggers : connector.actions;
  return collection.find(item => item.id === operationId) || null;
}

export function connectorVersionsForProject(project) {
  const ids = new Set();
  if (project?.trigger?.type) ids.add(project.trigger.type.split(".")[0]);

  const walk = steps => {
    for (const step of steps || []) {
      if (step.action) ids.add(step.action.split(".")[0]);
      if (step.type === "condition") {
        walk(step.then);
        walk(step.else);
      }
    }
  };

  walk(project?.steps);
  return Object.fromEntries(
    [...ids]
      .filter(id => CONNECTORS[id])
      .sort()
      .map(id => [id, CONNECTORS[id].version])
  );
}

export function requiredEnvForProject(project) {
  const versions = connectorVersionsForProject(project);
  const env = [];
  for (const connectorId of Object.keys(versions)) {
    for (const credential of CONNECTORS[connectorId]?.credentials || []) {
      env.push({
        connector: connectorId,
        ...credential
      });
    }
  }
  return env;
}
