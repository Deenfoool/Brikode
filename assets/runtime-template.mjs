import fs from "node:fs";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

const workflowUrl = new URL("../workflow.json", import.meta.url);
const workflow = JSON.parse(fs.readFileSync(workflowUrl, "utf8"));

function log(level, message, data) {
  const record = {
    time: new Date().toISOString(),
    level,
    message,
    ...(data === undefined ? {} : { data })
  };
  process.stdout.write(JSON.stringify(record) + "\n");
}

function getPath(source, path) {
  if (!path) return source;
  return String(path).split(".").reduce((value, key) => value == null ? undefined : value[key], source);
}

function renderTemplate(template, scope) {
  return String(template ?? "").replace(/{{\s*([^}]+?)\s*}}/g, (_, path) => {
    const value = getPath(scope, path.trim());
    if (value === undefined || value === null) return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}

function scopedValue(value, scope) {
  if (typeof value !== "string") return value;
  const exact = value.match(/^{{\s*([^}]+)\s*}}$/);
  if (exact) return getPath(scope, exact[1].trim());
  return renderTemplate(value, scope);
}

function conditionValue(path, scope) {
  const cleaned = String(path || "").replace(/^{{\s*|\s*}}$/g, "");
  return getPath(scope, cleaned);
}

function testCondition(expression, scope) {
  const left = conditionValue(expression?.left, scope);
  const right = scopedValue(expression?.right, scope);

  switch (expression?.op) {
    case "equals":
      return String(left ?? "") === String(right ?? "");
    case "notEquals":
      return String(left ?? "") !== String(right ?? "");
    case "exists":
      return left !== undefined && left !== null && left !== "";
    case "contains":
    default:
      return String(left ?? "").includes(String(right ?? ""));
  }
}

function parseMaybeJson(value, scope) {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return value;
  const rendered = renderTemplate(value, scope);
  try {
    return JSON.parse(rendered);
  } catch {
    return rendered;
  }
}

async function telegramApi(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required.");
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error("Telegram API " + method + " failed: " + JSON.stringify(data));
  }
  return data.result;
}

async function runAction(step, scope, adapters) {
  const config = step.config || {};

  switch (step.action) {
    case "telegram.sendMessage": {
      const chatId = renderTemplate(config.chatId || scope.trigger.chatId || "", scope);
      if (!chatId) throw new Error("Telegram chat id is missing.");
      const result = await telegramApi("sendMessage", {
        chat_id: chatId,
        text: renderTemplate(config.text, scope)
      });
      scope.steps[step.id] = result;
      return result;
    }

    case "telegram.sendFile": {
      const chatId = renderTemplate(config.chatId || scope.trigger.chatId || "", scope);
      if (!chatId) throw new Error("Telegram chat id is missing.");
      const result = await telegramApi("sendDocument", {
        chat_id: chatId,
        document: renderTemplate(config.url, scope),
        caption: renderTemplate(config.caption || "", scope)
      });
      scope.steps[step.id] = result;
      return result;
    }

    case "telegram.sendButtons": {
      const chatId = renderTemplate(config.chatId || scope.trigger.chatId || "", scope);
      if (!chatId) throw new Error("Telegram chat id is missing.");
      let buttons;
      try {
        buttons = JSON.parse(renderTemplate(config.buttons || "[]", scope));
      } catch {
        throw new Error("Telegram buttons must be valid JSON.");
      }
      const result = await telegramApi("sendMessage", {
        chat_id: chatId,
        text: renderTemplate(config.text, scope),
        reply_markup: { inline_keyboard: buttons }
      });
      scope.steps[step.id] = result;
      return result;
    }

    case "discord.sendMessage": {
      const text = renderTemplate(config.text, scope);
      if (adapters.interaction) {
        const result = adapters.interaction.replied || adapters.interaction.deferred
          ? await adapters.interaction.followUp(text)
          : await adapters.interaction.reply(text);
        scope.steps[step.id] = result;
        return result;
      }

      if (adapters.discordChannel) {
        const result = await adapters.discordChannel.send(text);
        scope.steps[step.id] = result;
        return result;
      }

      const channelId = renderTemplate(config.channelId || scope.trigger.channelId || "", scope);
      if (!channelId || !adapters.discordClient) {
        throw new Error("Discord channel is unavailable.");
      }
      const channel = await adapters.discordClient.channels.fetch(channelId);
      const result = await channel.send(text);
      scope.steps[step.id] = result;
      return result;
    }

    case "discord.reply": {
      const text = renderTemplate(config.text, scope);
      if (adapters.interaction) {
        const result = adapters.interaction.replied || adapters.interaction.deferred
          ? await adapters.interaction.followUp(text)
          : await adapters.interaction.reply(text);
        scope.steps[step.id] = result;
        return result;
      }
      if (!adapters.discordMessage) throw new Error("Discord reply requires a message or interaction trigger.");
      const result = await adapters.discordMessage.reply(text);
      scope.steps[step.id] = result;
      return result;
    }

    case "discord.sendEmbed": {
      const payload = {
        embeds: [{
          title: renderTemplate(config.title || "", scope),
          description: renderTemplate(config.description || "", scope)
        }]
      };
      let result;
      if (adapters.interaction) {
        result = adapters.interaction.replied || adapters.interaction.deferred
          ? await adapters.interaction.followUp(payload)
          : await adapters.interaction.reply(payload);
      } else if (adapters.discordChannel) {
        result = await adapters.discordChannel.send(payload);
      } else {
        const channelId = renderTemplate(config.channelId || scope.trigger.channelId || "", scope);
        if (!channelId || !adapters.discordClient) throw new Error("Discord channel is unavailable.");
        const channel = await adapters.discordClient.channels.fetch(channelId);
        result = await channel.send(payload);
      }
      scope.steps[step.id] = result;
      return result;
    }

    case "discord.sendButtons": {
      let rows;
      try {
        rows = JSON.parse(renderTemplate(config.buttons || "[]", scope));
      } catch {
        throw new Error("Discord buttons must be valid JSON.");
      }
      const styleMap = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
      const components = rows.map(row => ({
        type: 1,
        components: row.map(button => {
          const style = styleMap[String(button.style || "primary").toLowerCase()] || 1;
          const component = {
            type: 2,
            label: String(button.label || "Button").slice(0, 80),
            style,
            disabled: Boolean(button.disabled)
          };
          if (style === 5) component.url = String(button.url || "");
          else component.custom_id = String(button.customId || button.custom_id || "button").slice(0, 100);
          return component;
        })
      }));
      const payload = { content: renderTemplate(config.text || "", scope), components };
      let result;
      if (adapters.interaction) {
        result = adapters.interaction.replied || adapters.interaction.deferred
          ? await adapters.interaction.followUp(payload)
          : await adapters.interaction.reply(payload);
      } else if (adapters.discordChannel) {
        result = await adapters.discordChannel.send(payload);
      } else {
        const channelId = renderTemplate(config.channelId || scope.trigger.channelId || "", scope);
        if (!channelId || !adapters.discordClient) throw new Error("Discord channel is unavailable.");
        const channel = await adapters.discordClient.channels.fetch(channelId);
        result = await channel.send(payload);
      }
      scope.steps[step.id] = result;
      return result;
    }

    case "http.request": {
      const method = String(config.method || "GET").toUpperCase();
      const headers = parseMaybeJson(config.headers, scope) || {};
      const bodyValue = parseMaybeJson(config.body, scope);
      const query = parseMaybeJson(config.query, scope) || {};
      const url = new URL(renderTemplate(config.url, scope));

      if (query && typeof query === "object" && !Array.isArray(query)) {
        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
        }
      }

      const timeoutMs = Math.min(120000, Math.max(100, Number(config.timeoutMs) || 10000));
      const options = { method, headers, signal: AbortSignal.timeout(timeoutMs) };

      if (!["GET", "HEAD"].includes(method) && bodyValue !== undefined) {
        if (typeof bodyValue === "string") {
          options.body = bodyValue;
        } else {
          options.body = JSON.stringify(bodyValue);
          if (!Object.keys(headers).some(key => key.toLowerCase() === "content-type")) {
            options.headers = { ...headers, "content-type": "application/json" };
          }
        }
      }

      let result;
      try {
        const response = await fetch(url, options);
        const contentType = response.headers.get("content-type") || "";
        const body = contentType.includes("application/json")
          ? await response.json()
          : await response.text();

        result = {
          status: response.status,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
          body,
          error: null
        };
      } catch (error) {
        result = {
          status: 0,
          ok: false,
          headers: {},
          body: null,
          error: error.message
        };
      }

      const name = config.as || "response";
      scope.vars[name] = result;
      scope.steps[step.id] = result;
      return result;
    }

    case "core.setVariable": {
      const value = scopedValue(config.value, scope);
      scope.vars[config.name] = value;
      scope.steps[step.id] = value;
      return value;
    }

    case "core.convert": {
      const source = scopedValue(config.value, scope);
      let value;
      switch (config.target) {
        case "number":
          value = Number(source);
          if (!Number.isFinite(value)) throw new Error("Cannot convert value to number.");
          break;
        case "boolean":
          value = typeof source === "boolean"
            ? source
            : ["true", "1", "yes", "on"].includes(String(source).trim().toLowerCase());
          break;
        case "json":
          value = typeof source === "string" ? JSON.parse(source) : source;
          break;
        case "string":
        default:
          value = source == null ? "" : String(source);
      }
      scope.vars[config.name] = value;
      scope.steps[step.id] = value;
      return value;
    }

    case "core.delay":
      await sleep(Math.max(0, Number(config.ms) || 0));
      return null;

    case "core.log":
      log("info", renderTemplate(config.message, scope), { nodeId: step.id });
      return null;

    case "core.customCode": {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction("context", "variables", "fetch", "renderTemplate", String(config.source || ""));
      const result = await fn(scope.trigger, scope.vars, fetch, renderTemplate);
      scope.steps[step.id] = result;
      return result;
    }

    default:
      throw new Error("Unsupported action: " + step.action);
  }
}

async function executeSteps(steps, scope, adapters) {
  for (const step of steps || []) {
    try {
      if (step.type === "repeat") {
        const times = Math.min(1000, Math.max(0, Number(step.times) || 0));
        log("debug", "Repeat " + step.id + " ×" + times);
        for (let index = 0; index < times; index++) {
          scope.vars.loopIndex = index;
          await executeSteps(step.steps, scope, adapters);
        }
        continue;
      }

      if (step.type === "condition") {
        const result = testCondition(step.expression, scope);
        log("debug", "Condition " + step.id + " → " + result);
        await executeSteps(result ? step.then : step.else, scope, adapters);
        continue;
      }

      log("debug", "Running " + step.action, { nodeId: step.id });
      await runAction(step, scope, adapters);
      log("debug", "Completed " + step.action, { nodeId: step.id });
    } catch (error) {
      log("error", error.message, { nodeId: step.id, action: step.action });
      throw error;
    }
  }
}

async function execute(payload, adapters = {}) {
  const scope = {
    trigger: payload,
    vars: {},
    steps: {}
  };
  await executeSteps(workflow.steps, scope, adapters);
  return scope;
}

function telegramPayload(update) {
  if (update.callback_query) {
    return {
      raw: update,
      callback: update.callback_query,
      data: update.callback_query.data || "",
      chatId: String(update.callback_query.message?.chat?.id || "")
    };
  }
  const message = update.message || update.edited_message || {};
  return {
    raw: update,
    message,
    text: message.text || "",
    chatId: String(message.chat?.id || "")
  };
}

function telegramMatches(update) {
  const type = workflow.trigger?.type;
  if (type === "telegram.callback") return Boolean(update.callback_query);
  if (!update.message && !update.edited_message) return false;
  if (type === "telegram.command") {
    const command = String(workflow.trigger.config?.command || "").trim();
    const text = String(update.message?.text || update.edited_message?.text || "");
    return Boolean(command) && (text === command || text.startsWith(command + " "));
  }
  return type === "telegram.message";
}

async function startTelegram() {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required.");
  let offset = 0;
  let stopped = false;

  const stop = () => { stopped = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  log("info", "Telegram polling started.");

  while (!stopped) {
    try {
      const updates = await telegramApi("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message", "edited_message", "callback_query"]
      });

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        if (!telegramMatches(update)) continue;

        if (update.callback_query?.id) {
          telegramApi("answerCallbackQuery", { callback_query_id: update.callback_query.id }).catch(() => {});
        }

        execute(telegramPayload(update)).catch(error => {
          log("error", "Workflow failed for Telegram update.", { error: error.message });
        });
      }
    } catch (error) {
      log("error", "Telegram polling error.", { error: error.message });
      await sleep(1500);
    }
  }

  log("info", "Telegram polling stopped.");
}

async function registerDiscordSlash(REST, Routes, commandName) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  if (!applicationId) throw new Error("DISCORD_APPLICATION_ID is required for slash commands.");

  const rest = new REST({ version: "10" }).setToken(token);
  const route = Routes.applicationCommands(applicationId);
  const existing = await rest.get(route);
  const found = Array.isArray(existing) ? existing.find(command => command.name === commandName) : null;
  if (!found) {
    await rest.post(route, {
      body: {
        name: commandName,
        description: "Brikode command"
      }
    });
    log("info", "Registered Discord slash command /" + commandName + ".");
  }
}

async function startDiscord() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is required.");

  const {
    Client,
    GatewayIntentBits,
    REST,
    Routes
  } = await import("discord.js");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once("ready", async () => {
    log("info", "Discord connected as " + client.user.tag + ".");
    if (workflow.trigger?.type === "discord.slash") {
      const command = String(workflow.trigger.config?.command || "ping")
        .replace(/^\//, "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .slice(0, 32);
      try {
        await registerDiscordSlash(REST, Routes, command);
      } catch (error) {
        log("error", "Could not register Discord slash command.", { error: error.message });
      }
    }
  });

  client.on("messageCreate", message => {
    if (workflow.trigger?.type !== "discord.message" || message.author.bot) return;
    execute({
      raw: message.toJSON?.() || {},
      message: {
        id: message.id,
        authorId: message.author.id,
        authorName: message.author.username
      },
      text: message.content || "",
      channelId: message.channelId
    }, {
      discordClient: client,
      discordChannel: message.channel,
      discordMessage: message
    }).catch(error => log("error", "Discord workflow failed.", { error: error.message }));
  });

  client.on("interactionCreate", interaction => {
    if (workflow.trigger?.type !== "discord.slash" || !interaction.isChatInputCommand()) return;
    const expected = String(workflow.trigger.config?.command || "ping").replace(/^\//, "").toLowerCase();
    if (interaction.commandName !== expected) return;

    execute({
      interaction: { id: interaction.id, commandName: interaction.commandName },
      text: interaction.options?.getString?.("text") || "",
      channelId: interaction.channelId
    }, {
      discordClient: client,
      discordChannel: interaction.channel,
      interaction
    }).catch(async error => {
      log("error", "Discord slash workflow failed.", { error: error.message });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Workflow failed.", ephemeral: true }).catch(() => {});
      }
    });
  });

  const stop = async () => {
    log("info", "Discord shutdown requested.");
    client.destroy();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  await client.login(token);
}

function readRequestBody(request, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body exceeds 1 MB."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function startWebhook() {
  const configuredPath = String(workflow.trigger?.config?.path || "/hook");
  const port = Number(process.env.PORT || 3000);

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname !== configuredPath) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: false, error: "Not found" }));
        return;
      }

      const rawBody = await readRequestBody(request);
      let body = rawBody;
      if ((request.headers["content-type"] || "").includes("application/json")) {
        try { body = rawBody ? JSON.parse(rawBody) : null; } catch {}
      }

      await execute({
        method: request.method || "GET",
        body,
        headers: request.headers,
        query: Object.fromEntries(url.searchParams.entries())
      });

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      log("error", "Webhook workflow failed.", { error: error.message });
      if (!response.headersSent) response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "Workflow failed" }));
    }
  });

  server.listen(port, () => {
    log("info", "Webhook server listening.", { port, path: configuredPath });
  });

  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

async function main() {
  if (!workflow.trigger?.type) throw new Error("Workflow has no trigger.");

  if (workflow.trigger.type.startsWith("telegram.")) {
    await startTelegram();
    return;
  }

  if (workflow.trigger.type.startsWith("discord.")) {
    await startDiscord();
    return;
  }

  if (workflow.trigger.type === "webhook.incoming") {
    await startWebhook();
    return;
  }

  throw new Error("Unsupported trigger: " + workflow.trigger.type);
}

main().catch(error => {
  log("error", "Brikode runtime failed to start.", { error: error.message });
  process.exitCode = 1;
});
