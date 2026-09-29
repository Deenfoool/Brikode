export const CONNECTORS = Object.freeze({
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
      { id: "sendFile", label: "Send file", inputs: { url: "string", caption: "string?" }, outputs: { response: "object" } }
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
      { id: "sendMessage", label: "Send message", inputs: { text: "string", channelId: "string?" }, outputs: { response: "object" } }
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
        inputs: { method: "string", url: "string", headers: "object?", body: "any?" },
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
});

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
