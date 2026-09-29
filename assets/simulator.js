import { getPath, renderTemplate, sleep } from "./utils.js";

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

export async function simulateProject(project, payload = {}) {
  const started = performance.now();
  const logs = [];
  const scope = {
    trigger: payload,
    vars: {},
    steps: {}
  };

  const push = (nodeId, status, message, data = null) => {
    logs.push({
      at: Math.round(performance.now() - started),
      nodeId,
      status,
      message,
      data
    });
  };

  if (!project.trigger) {
    push(null, "error", "No trigger configured.");
    return { logs, scope };
  }

  push(project.trigger.id, "success", "Mock trigger received.", payload);

  const execute = async steps => {
    for (const step of steps || []) {
      if (step.type === "repeat") {
        const times = Math.min(1000, Math.max(0, Number(step.times) || 0));
        push(step.id, "running", "Repeat ×" + times);
        for (let index = 0; index < times; index++) {
          scope.vars.loopIndex = index;
          await execute(step.steps);
        }
        push(step.id, "success", "Repeat completed ×" + times);
        continue;
      }

      if (step.type === "condition") {
        const result = testCondition(step.expression, scope);
        push(step.id, "success", "Condition → " + String(result), step.expression);
        await execute(result ? step.then : step.else);
        continue;
      }

      const config = step.config || {};
      push(step.id, "running", step.action);

      switch (step.action) {
        case "telegram.sendMessage":
          push(step.id, "success", "Telegram message (simulated)", {
            text: renderTemplate(config.text, scope)
          });
          break;

        case "telegram.sendFile":
          push(step.id, "success", "Telegram file (simulated)", {
            url: renderTemplate(config.url, scope),
            caption: renderTemplate(config.caption, scope)
          });
          break;

        case "telegram.sendButtons":
          push(step.id, "success", "Telegram inline buttons (simulated)", {
            text: renderTemplate(config.text, scope),
            buttons: config.buttons
          });
          break;

        case "discord.sendMessage":
          push(step.id, "success", "Discord message (simulated)", {
            text: renderTemplate(config.text, scope)
          });
          break;

        case "discord.reply":
          push(step.id, "success", "Discord reply (simulated)", {
            text: renderTemplate(config.text, scope)
          });
          break;

        case "discord.sendEmbed":
          push(step.id, "success", "Discord embed (simulated)", {
            title: renderTemplate(config.title, scope),
            description: renderTemplate(config.description, scope)
          });
          break;

        case "http.request": {
          const result = {
            status: 200,
            ok: true,
            body: {
              simulated: true,
              method: String(config.method || "GET"),
              url: renderTemplate(config.url, scope),
              query: config.query || "{}",
              requestBody: renderTemplate(config.body || "", scope),
              timeoutMs: Number(config.timeoutMs) || 10000
            },
            headers: { "content-type": "application/json" }
          };
          const name = config.as || "response";
          scope.vars[name] = result;
          scope.steps[step.id] = result;
          push(step.id, "success", "HTTP " + String(config.method || "GET") + " (mocked)", result);
          break;
        }

        case "core.setVariable": {
          const value = scopedValue(config.value, scope);
          scope.vars[config.name] = value;
          push(step.id, "success", "Variable " + config.name + " updated.", value);
          break;
        }

        case "core.delay": {
          const requested = Math.max(0, Number(config.ms) || 0);
          await sleep(Math.min(requested, 120));
          push(step.id, "success", "Delay simulated (" + requested + " ms requested).");
          break;
        }

        case "core.log":
          push(step.id, "success", renderTemplate(config.message, scope));
          break;

        case "core.customCode":
          push(step.id, "warning", "Custom JavaScript skipped in browser simulator.");
          break;

        default:
          push(step.id, "error", "Unsupported action: " + step.action);
      }
    }
  };

  await execute(project.steps);
  return { logs, scope };
}
