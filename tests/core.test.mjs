import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createProject,
  normalizeProject,
  validateProject
} from "../assets/ir.js";
import {
  connectorVersionsForProject,
  registerConnector,
  validateConnectorManifest
} from "../assets/connectors.js";
import { parseDsl, projectToDsl } from "../assets/dsl.js";
import { simulateProject } from "../assets/simulator.js";

const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/telegram-price-bot.json", import.meta.url), "utf8")
);

function structural(project) {
  return {
    name: project.name,
    trigger: project.trigger,
    steps: project.steps
  };
}

test("fixture validates without errors", () => {
  const diagnostics = validateProject(fixture);
  assert.deepEqual(
    diagnostics.filter(item => item.severity === "error"),
    []
  );
});

test("DSL round-trip preserves supported workflow structure", () => {
  const source = projectToDsl(fixture);
  const parsed = parseDsl(source, fixture.name);

  assert.equal(parsed.diagnostics.some(item => item.severity === "error"), false);
  assert.deepEqual(structural(parsed.project), structural(normalizeProject(fixture)));
});

test("HTTP validation rejects invalid timeout and query", () => {
  const project = createProject("invalid HTTP");
  project.trigger = { id: "trigger", type: "webhook.incoming", config: { path: "/hook" } };
  project.steps = [{
    id: "request",
    type: "action",
    action: "http.request",
    config: {
      method: "GET",
      url: "https://example.com",
      query: "not-json",
      headers: "{}",
      timeoutMs: 1,
      as: "response"
    }
  }];

  const codes = validateProject(project).map(item => item.code);
  assert.ok(codes.includes("http.query"));
  assert.ok(codes.includes("http.timeout"));
});

test("repeat simulation runs the nested steps the requested number of times", async () => {
  const project = createProject("repeat");
  project.trigger = { id: "trigger", type: "webhook.incoming", config: { path: "/hook" } };
  project.steps = [{
    id: "repeat",
    type: "repeat",
    times: 3,
    steps: [{
      id: "log",
      type: "action",
      action: "core.log",
      config: { message: "index={{vars.loopIndex}}" }
    }]
  }];

  const result = await simulateProject(normalizeProject(project), { body: {} });
  const logRuns = result.logs.filter(item => item.nodeId === "log" && item.status === "success");
  assert.equal(logRuns.length, 3);
  assert.equal(result.scope.vars.loopIndex, 2);
});

test("connector dependency discovery traverses repeat nodes", () => {
  const project = createProject("nested connector");
  project.trigger = { id: "trigger", type: "webhook.incoming", config: { path: "/hook" } };
  project.steps = [{
    id: "repeat",
    type: "repeat",
    times: 2,
    steps: [{
      id: "discord",
      type: "action",
      action: "discord.sendMessage",
      config: { text: "hello", channelId: "123" }
    }]
  }];

  const versions = connectorVersionsForProject(project);
  assert.ok(versions.webhook);
  assert.ok(versions.discord);
});

test("connector manifest validation and registration are fail-closed", () => {
  assert.ok(validateConnectorManifest({ id: "Bad ID" }).length > 0);

  const manifest = {
    id: "fixture_connector",
    label: "Fixture connector",
    version: "1.0.0",
    credentials: [],
    triggers: [{ id: "event", label: "Event", inputs: {}, outputs: {} }],
    actions: [{ id: "send", label: "Send", inputs: {}, outputs: {} }]
  };

  assert.deepEqual(validateConnectorManifest(manifest), []);
  const registered = registerConnector(manifest);
  assert.equal(registered.id, "fixture_connector");
  assert.throws(() => registerConnector(manifest), /already registered/);
});

test("discord reply is rejected outside a Discord trigger", () => {
  const project = createProject("bad reply");
  project.trigger = { id: "trigger", type: "webhook.incoming", config: { path: "/hook" } };
  project.steps = [{
    id: "reply",
    type: "action",
    action: "discord.reply",
    config: { text: "hello" }
  }];

  const diagnostics = validateProject(project);
  assert.ok(diagnostics.some(item => item.code === "discord.reply.context"));
});
