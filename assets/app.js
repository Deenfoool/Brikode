import { createProject, migrateProject, normalizeProject, projectToJson, validateProject } from "./ir.js";
import { listProjects, getProject, saveProject, deleteProject, duplicateProject, getSetting, setSetting } from "./db.js";
import { applyBlockDiagnostics, createBlocksWorkspace, disposeBlocksWorkspace, projectToWorkspace, updateBlockSearch, workspaceToProject } from "./blocks.js";
import { createCodeEditor } from "./code-editor.js";
import { parseDsl, projectToDsl } from "./dsl.js";
import { simulateProject } from "./simulator.js";
import { exportReadiness, exportSelfHosted } from "./exporter.js";
import { debounce, downloadBlob, renderTemplate, uid } from "./utils.js";

const app = document.querySelector("#app");
const cloudDialog = document.querySelector("#cloudDialog");
const settingsDialog = document.querySelector("#settingsDialog");
const dataDialog = document.querySelector("#dataDialog");
const toastRegion = document.querySelector("#toastRegion");

const state = {
  projects: [],
  project: null,
  workspace: null,
  codeEditor: null,
  activeTab: "blocks",
  codeDiagnostics: [],
  dirty: false,
  pendingBlocksRefresh: false,
  theme: "dark"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  toastRegion.appendChild(element);
  setTimeout(() => element.remove(), 3200);
}

function setSaveState(label) {
  const element = document.querySelector("#saveState");
  if (element) element.textContent = label;
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value || "";
  }
}

function triggerLabel(project) {
  const type = project.trigger?.type;
  if (!type) return "No trigger";
  return type;
}

function destroyEditor() {
  disposeBlocksWorkspace(state.workspace);
  state.workspace = null;
  state.codeEditor?.dispose?.();
  state.codeEditor = null;
  state.project = null;
  state.codeDiagnostics = [];
  state.pendingBlocksRefresh = false;
}

async function persistProject() {
  if (!state.project) return;
  state.dirty = true;
  setSaveState("Saving…");
  try {
    state.project = await saveProject(state.project);
    state.dirty = false;
    setSaveState("Saved");
  } catch (error) {
    setSaveState("Save failed");
    toast("Could not save project: " + error.message);
  }
}

const persistDebounced = debounce(persistProject, 180);

function applyTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  state.codeEditor?.setTheme?.(state.theme);
}

async function toggleTheme() {
  const next = state.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  await setSetting("theme", next);
}

function projectCard(project) {
  return `
    <article class="project-card" data-project-id="${escapeHtml(project.id)}">
      <span class="project-type">${escapeHtml(triggerLabel(project))}</span>
      <h3>${escapeHtml(project.name)}</h3>
      <div class="project-meta">Updated ${escapeHtml(formatDate(project.metadata?.updatedAt))}</div>
      <div class="project-card-spacer"></div>
      <div class="project-actions">
        <button class="project-action" data-action="open">Open</button>
        <button class="project-action" data-action="duplicate">Duplicate</button>
        <button class="project-action" data-action="json">JSON</button>
        <button class="project-action button-danger" data-action="delete">Delete</button>
      </div>
    </article>
  `;
}

async function renderHome() {
  destroyEditor();
  state.projects = await listProjects();

  app.innerHTML = `
    <main class="home-shell">
      <header class="home-header">
        <a class="brand" href="./" aria-label="Brikode home">
          <span class="brand-mark">B</span>
          <span>Brikode</span>
        </a>
        <div class="home-actions">
          <button class="icon-button" id="themeButton" title="Toggle theme" aria-label="Toggle theme">◐</button>
          <button class="button" id="settingsButton">Settings</button>
          <a class="button" href="https://github.com/Deenfoool/Brikode/blob/main/ROADMAP.md">Roadmap</a>
        </div>
      </header>

      <section class="hero">
        <div class="eyebrow">BLOCKS + CODE · SELF-HOST FIRST</div>
        <h1>Build the workflow.<br><span>Own the runtime.</span></h1>
        <p>
          Create bots and automations visually or in Brikode DSL.
          Test them in the browser and export a runnable self-hosted project.
        </p>
        <div class="hero-actions">
          <button class="button button-primary" id="newProjectButton">New project</button>
          <button class="button" id="importProjectButton">Import project JSON</button>
          <button class="button" id="cloudHomeButton">Cloud Deploy <span class="tab-hint">Coming soon</span></button>
        </div>
      </section>

      <section>
        <div class="section-heading">
          <div>
            <h2>Your projects</h2>
            <p>Stored locally in this browser with recovery snapshots.</p>
          </div>
          <span class="project-meta">${state.projects.length} project${state.projects.length === 1 ? "" : "s"}</span>
        </div>
        <div class="project-grid" id="projectGrid">
          ${state.projects.length
            ? state.projects.map(projectCard).join("")
            : '<div class="empty-state">No projects yet. Create one and start with a trigger.</div>'}
        </div>
      </section>
    </main>
  `;

  document.querySelector("#themeButton").addEventListener("click", toggleTheme);
  document.querySelector("#settingsButton").addEventListener("click", openSettings);
  document.querySelector("#cloudHomeButton").addEventListener("click", () => cloudDialog.showModal());
  document.querySelector("#newProjectButton").addEventListener("click", async () => {
    const name = prompt("Project name", "My bot");
    if (name === null) return;
    const project = createProject(name);
    await saveProject(project);
    await openProject(project.id);
  });

  document.querySelector("#importProjectButton").addEventListener("click", importProjectFile);

  document.querySelector("#projectGrid").addEventListener("click", async event => {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const card = action.closest("[data-project-id]");
    const id = card?.dataset.projectId;
    const project = state.projects.find(item => item.id === id);
    if (!project) return;

    switch (action.dataset.action) {
      case "open":
        await openProject(id);
        break;
      case "duplicate": {
        const clone = await duplicateProject(project);
        toast("Duplicated " + project.name);
        await openProject(clone.id);
        break;
      }
      case "json":
        downloadBlob(new Blob([projectToJson(project)], { type: "application/json" }), project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".brikode.json");
        break;
      case "delete":
        if (confirm('Delete "' + project.name + '" from this browser?')) {
          await deleteProject(id);
          await renderHome();
        }
        break;
    }
  });
}

function importProjectFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.brikode.json,application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("Project file is larger than the 2 MB import limit.");
      return;
    }

    try {
      const raw = JSON.parse(await file.text());
      const project = migrateProject(raw);
      const existing = await getProject(project.id);
      if (existing) {
        project.id = uid("project");
        project.name += " imported";
        project.metadata.createdAt = new Date().toISOString();
      }
      await saveProject(project);
      toast("Project imported.");
      await openProject(project.id);
    } catch (error) {
      toast("Import failed: " + error.message);
    }
  });
  input.click();
}

function diagnosticsHtml() {
  const all = [...validateProject(state.project), ...state.codeDiagnostics];
  if (!all.length) {
    return '<div class="diagnostic-empty">No current diagnostics. The workflow is structurally valid.</div>';
  }

  return '<div class="diagnostic-list">' + all.map(item => `
    <div class="diagnostic-item ${item.severity === "error" ? "error" : "warning"}">
      <span class="diagnostic-code">${escapeHtml(item.code || ("line " + (item.line || "?")))}</span>
      ${escapeHtml(item.message)}
    </div>
  `).join("") + "</div>";
}

function updateDiagnostics() {
  const projectDiagnostics = state.project ? validateProject(state.project) : [];
  const container = document.querySelector("#diagnosticContent");
  if (container) container.innerHTML = diagnosticsHtml();
  applyBlockDiagnostics(state.workspace, projectDiagnostics);
}

function defaultPayload(project) {
  if (project.trigger?.type?.startsWith("telegram.")) {
    return { text: "hello price", chatId: "123456", message: { id: 1, from: { username: "demo" } } };
  }
  if (project.trigger?.type?.startsWith("discord.")) {
    return { text: "hello price", channelId: "123456", message: { id: "1", authorName: "demo" } };
  }
  if (project.trigger?.type === "webhook.incoming") {
    return { method: "POST", body: { message: "hello price" }, headers: {}, query: {} };
  }
  return { text: "hello price" };
}

function renderEditorShell() {
  app.innerHTML = `
    <div class="editor-shell">
      <header class="editor-topbar">
        <button class="icon-button" id="backButton" title="Projects" aria-label="Back to projects">←</button>
        <div class="editor-project">
          <input class="project-name" id="projectName" value="${escapeHtml(state.project.name)}" aria-label="Project name">
          <span class="save-state" id="saveState">Saved</span>
        </div>
        <div class="editor-top-actions">
          <button class="button" id="rawExportButton">Project JSON</button>
          <button class="icon-button" id="editorThemeButton" title="Toggle theme" aria-label="Toggle theme">◐</button>
        </div>
      </header>

      <div class="workspace-shell">
        <aside class="editor-sidebar">
          <div class="sidebar-label">WORKSPACE</div>
          <div class="tab-list" role="tablist">
            <button class="tab-button" role="tab" data-tab="blocks" aria-selected="true">Blocks <span class="tab-hint">visual</span></button>
            <button class="tab-button" role="tab" data-tab="code" aria-selected="false">Code <span class="tab-hint">DSL</span></button>
            <button class="tab-button" role="tab" data-tab="test" aria-selected="false">Test <span class="tab-hint">mock</span></button>
            <button class="tab-button" role="tab" data-tab="deploy" aria-selected="false">Deploy <span class="tab-hint">export</span></button>
          </div>
          <div class="sidebar-footer">
            One canonical Workflow IR powers every mode. Switching editors does not create a second copy of the bot.
          </div>
        </aside>

        <main class="editor-main">
          <section class="pane pane-blocks" data-pane="blocks">
            <div class="blocks-toolbar">
              <input class="search-input" id="blockSearch" type="search" placeholder="Search blocks…" aria-label="Search blocks">
              <button class="button" id="undoButton">Undo</button>
              <button class="button" id="redoButton">Redo</button>
              <button class="button" id="dataButton">Data paths</button>
            </div>
            <div class="blockly-host" id="blocklyDiv"></div>
          </section>

          <section class="pane code-pane" data-pane="code" hidden>
            <div class="code-toolbar">
              <button class="button" id="formatCodeButton">Format DSL</button>
              <button class="button" id="codeDataButton">Data paths</button>
              <span class="project-meta">Supported DSL round-trips through the same Workflow IR.</span>
            </div>
            <div class="code-host" id="codeEditor"></div>
            <div class="dsl-help">
              Brikode DSL supports <code>TRIGGER</code>, <code>IF / ELSE / END</code>,
              <code>HTTP</code>, <code>SET</code>, <code>DELAY</code>, Telegram and Discord actions.
              <code>RAW_JS</code> is an explicit self-host-only escape hatch.
            </div>
          </section>

          <section class="pane" data-pane="test" hidden>
            <div class="panel-page">
              <div class="eyebrow">LOCAL SIMULATOR</div>
              <h2>Test without secrets</h2>
              <p>Feed a mock trigger payload through the workflow. Network actions are represented by deterministic mocks.</p>
              <div class="panel-card">
                <h3>Trigger payload</h3>
                <textarea class="payload-input" id="testPayload">${escapeHtml(JSON.stringify(defaultPayload(state.project), null, 2))}</textarea>
                <div class="row" style="margin-top:12px">
                  <button class="button button-primary" id="runTestButton">Run test</button>
                  <button class="button" id="resetPayloadButton">Reset payload</button>
                </div>
              </div>
              <div class="test-log" id="testLog"></div>
              <div class="panel-card" id="scopeCard" hidden>
                <h3>Resulting scope</h3>
                <pre class="preview-output" id="testScope"></pre>
              </div>
            </div>
          </section>

          <section class="pane" data-pane="deploy" hidden>
            <div class="panel-page">
              <div class="eyebrow">DEPLOYMENT</div>
              <h2>Export / Self-host</h2>
              <p>Brikode generates a standalone Node.js project. Tokens stay outside the workflow and are loaded from environment variables.</p>
              <div class="panel-card">
                <h3>Readiness</h3>
                <div class="deploy-options" id="readinessList"></div>
                <label class="check-row">
                  <input type="checkbox" id="dockerOption">
                  <span>Include Dockerfile and docker-compose.yml</span>
                </label>
                <div class="row" style="margin-top:16px">
                  <button class="button button-primary" id="exportSelfHostButton">Export / Self-host ZIP</button>
                </div>
              </div>
              <div class="panel-card cloud-card">
                <div class="row-between">
                  <div>
                    <h3>Cloud Deploy</h3>
                    <div class="project-meta">Hosted runtime, encrypted secrets and managed logs.</div>
                  </div>
                  <button class="button" id="cloudDeployButton">Coming soon</button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <aside class="diagnostics">
          <div class="eyebrow">DIAGNOSTICS</div>
          <h2>Workflow health</h2>
          <div id="diagnosticContent"></div>
        </aside>
      </div>
    </div>
  `;
}

const blocksChanged = debounce(async () => {
  if (!state.workspace || !state.project) return;
  try {
    state.project = workspaceToProject(state.project, state.workspace);
    state.pendingBlocksRefresh = false;
    state.codeDiagnostics = [];
    state.codeEditor?.setValue?.(projectToDsl(state.project));
    state.codeEditor?.setDiagnostics?.([]);
    updateDiagnostics();
    updateDeployReadiness();
    persistDebounced();
  } catch (error) {
    toast("Blocks could not be compiled: " + error.message);
  }
}, 140);

const codeChanged = debounce(async source => {
  if (!state.project) return;
  const parsed = parseDsl(source, state.project.name);
  state.codeDiagnostics = parsed.diagnostics;
  state.codeEditor?.setDiagnostics?.(parsed.diagnostics);

  if (!parsed.diagnostics.some(item => item.severity === "error")) {
    parsed.project.id = state.project.id;
    parsed.project.metadata.createdAt = state.project.metadata.createdAt;
    parsed.project.variables = state.project.variables || [];
    state.project = normalizeProject(parsed.project);
    state.pendingBlocksRefresh = true;
    document.querySelector("#projectName").value = state.project.name;
    persistDebounced();
  }

  updateDiagnostics();
  updateDeployReadiness();
}, 220);

async function openProject(id) {
  destroyEditor();
  const project = await getProject(id);
  if (!project) {
    toast("Project was not found.");
    await renderHome();
    return;
  }

  state.project = project;
  state.activeTab = "blocks";
  renderEditorShell();

  document.querySelector("#backButton").addEventListener("click", renderHome);
  document.querySelector("#editorThemeButton").addEventListener("click", toggleTheme);
  document.querySelector("#rawExportButton").addEventListener("click", () => {
    downloadBlob(new Blob([projectToJson(state.project)], { type: "application/json" }), state.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".brikode.json");
  });

  document.querySelector("#projectName").addEventListener("input", event => {
    state.project.name = event.target.value || "Untitled bot";
    state.codeEditor?.setValue?.(projectToDsl(state.project));
    persistDebounced();
  });

  state.workspace = createBlocksWorkspace(document.querySelector("#blocklyDiv"), blocksChanged);
  projectToWorkspace(state.project, state.workspace);

  document.querySelector("#blockSearch").addEventListener("input", event => {
    updateBlockSearch(state.workspace, event.target.value);
  });
  document.querySelector("#undoButton").addEventListener("click", () => state.workspace?.undo?.(false));
  document.querySelector("#redoButton").addEventListener("click", () => state.workspace?.undo?.(true));
  document.querySelector("#dataButton").addEventListener("click", openDataPaths);

  state.codeEditor = await createCodeEditor(
    document.querySelector("#codeEditor"),
    projectToDsl(state.project),
    codeChanged
  );

  document.querySelector("#formatCodeButton").addEventListener("click", () => {
    const parsed = parseDsl(state.codeEditor?.getValue?.() || "", state.project.name);
    if (parsed.diagnostics.some(item => item.severity === "error")) {
      toast("Fix DSL errors before formatting.");
      return;
    }
    parsed.project.id = state.project.id;
    parsed.project.metadata.createdAt = state.project.metadata.createdAt;
    state.codeEditor?.setValue?.(projectToDsl(parsed.project));
    toast("DSL formatted.");
  });
  document.querySelector("#codeDataButton").addEventListener("click", openDataPaths);

  document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  document.querySelector("#runTestButton").addEventListener("click", runTest);
  document.querySelector("#resetPayloadButton").addEventListener("click", () => {
    document.querySelector("#testPayload").value = JSON.stringify(defaultPayload(state.project), null, 2);
  });

  document.querySelector("#exportSelfHostButton").addEventListener("click", async () => {
    try {
      const button = document.querySelector("#exportSelfHostButton");
      button.disabled = true;
      button.textContent = "Building ZIP…";
      const filename = await exportSelfHosted(state.project, {
        docker: document.querySelector("#dockerOption").checked
      });
      toast("Exported " + filename);
    } catch (error) {
      toast("Export failed: " + error.message);
    } finally {
      const button = document.querySelector("#exportSelfHostButton");
      button.disabled = false;
      button.textContent = "Export / Self-host ZIP";
    }
  });

  document.querySelector("#cloudDeployButton").addEventListener("click", () => cloudDialog.showModal());

  updateDiagnostics();
  updateDeployReadiness();

  window.setTimeout(() => {
    globalThis.Blockly?.svgResize?.(state.workspace);
  }, 0);
}

function switchTab(tab) {
  if (!["blocks", "code", "test", "deploy"].includes(tab)) return;
  state.activeTab = tab;

  document.querySelectorAll("[data-tab]").forEach(button => {
    button.setAttribute("aria-selected", String(button.dataset.tab === tab));
  });
  document.querySelectorAll("[data-pane]").forEach(pane => {
    pane.hidden = pane.dataset.pane !== tab;
  });

  if (tab === "blocks") {
    if (state.pendingBlocksRefresh) {
      projectToWorkspace(state.project, state.workspace);
      state.pendingBlocksRefresh = false;
    }
    setTimeout(() => globalThis.Blockly?.svgResize?.(state.workspace), 0);
  }

  if (tab === "code") {
    state.codeEditor?.setValue?.(projectToDsl(state.project));
    state.codeEditor?.layout?.();
    state.codeEditor?.focus?.();
  }

  if (tab === "test") {
    document.querySelector("#testPayload").value = JSON.stringify(defaultPayload(state.project), null, 2);
  }

  if (tab === "deploy") updateDeployReadiness();
}

async function runTest() {
  const logContainer = document.querySelector("#testLog");
  const button = document.querySelector("#runTestButton");
  let payload;

  try {
    payload = JSON.parse(document.querySelector("#testPayload").value);
  } catch (error) {
    logContainer.innerHTML = '<div class="diagnostic-item error">Invalid trigger JSON: ' + escapeHtml(error.message) + "</div>";
    return;
  }

  button.disabled = true;
  button.textContent = "Running…";
  logContainer.innerHTML = "";
  document.querySelector("#scopeCard").hidden = true;

  try {
    const result = await simulateProject(state.project, payload);
    logContainer.innerHTML = result.logs.map(item => `
      <div class="log-row">
        <span class="log-time">+${escapeHtml(item.at)} ms</span>
        <span class="log-status status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
        <code class="log-node">${escapeHtml(item.nodeId || "workflow")}</code>
        <span>${escapeHtml(item.message)}${item.data == null ? "" : "<br><code>" + escapeHtml(JSON.stringify(item.data)) + "</code>"}</span>
      </div>
    `).join("") || '<div class="diagnostic-empty">The workflow produced no log entries.</div>';
    const scopeCard = document.querySelector("#scopeCard");
    document.querySelector("#testScope").textContent = JSON.stringify(result.scope, null, 2);
    scopeCard.hidden = false;
  } catch (error) {
    logContainer.innerHTML = '<div class="diagnostic-item error">' + escapeHtml(error.message) + "</div>";
  } finally {
    button.disabled = false;
    button.textContent = "Run test";
  }
}

function updateDeployReadiness() {
  const container = document.querySelector("#readinessList");
  if (!container || !state.project) return;
  const result = exportReadiness(state.project);
  container.innerHTML = result.checks.map(check => `
    <div class="check-row">
      <span class="check-dot ${check.ok ? "ok" : ""}"></span>
      <span>${escapeHtml(check.label)}</span>
    </div>
  `).join("");

  const button = document.querySelector("#exportSelfHostButton");
  if (button) button.disabled = !result.checks.every(check => check.ok);
}

window.addEventListener("beforeunload", event => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

async function bootstrap() {
  state.theme = await getSetting("theme", "dark");
  applyTheme(state.theme);
  await renderHome();
}

bootstrap().catch(error => {
  console.error(error);
  app.innerHTML = `
    <main class="home-shell">
      <section class="hero">
        <div class="eyebrow">BRIKODE STARTUP ERROR</div>
        <h1>Could not start.</h1>
        <p>${escapeHtml(error.message)}</p>
      </section>
    </main>
  `;
});


function collectDataPaths(project) {
  const paths = new Set(["trigger"]);
  const payload = defaultPayload(project);

  const walkObject = (value, prefix, depth = 0) => {
    if (depth > 4 || value == null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? prefix + "." + key : key;
      paths.add(path);
      walkObject(child, path, depth + 1);
    }
  };
  walkObject(payload, "trigger");

  const walkSteps = steps => {
    for (const step of steps || []) {
      if (step.type === "repeat") {
        paths.add("vars.loopIndex");
        walkSteps(step.steps);
        continue;
      }
      if (step.type === "condition") {
        walkSteps(step.then);
        walkSteps(step.else);
        continue;
      }
      if (step.action === "webhook.respond") {
        ["status", "contentType", "body"].forEach(key => paths.add("vars.__webhookResponse." + key));
      }
      if ((step.action === "core.setVariable" || step.action === "core.convert") && step.config?.name) {
        paths.add("vars." + step.config.name);
      }
      if (step.action === "http.request") {
        const name = step.config?.as || "response";
        ["status", "ok", "body", "headers", "error"].forEach(key => paths.add("vars." + name + "." + key));
      }
      if (step.id) paths.add("steps." + step.id);
    }
  };
  walkSteps(project.steps);
  return [...paths].sort();
}

function openDataPaths() {
  if (!state.project) return;
  const list = document.querySelector("#dataPathList");
  const paths = collectDataPaths(state.project);
  list.innerHTML = paths.map(path =>
    '<button type="button" class="data-chip" data-copy-path="' + escapeHtml(path) + '">' + escapeHtml(path) + "</button>"
  ).join("");

  const input = document.querySelector("#templatePreviewInput");
  const output = document.querySelector("#templatePreviewOutput");
  const refresh = () => {
    output.textContent = renderTemplate(input.value, {
      trigger: defaultPayload(state.project),
      vars: { response: { status: 200, ok: true, body: { demo: true } }, loopIndex: 0 },
      steps: {}
    });
  };

  list.onclick = async event => {
    const button = event.target.closest("[data-copy-path]");
    if (!button) return;
    const template = "{{" + button.dataset.copyPath + "}}";
    try {
      await navigator.clipboard.writeText(template);
      toast("Copied " + template);
    } catch {
      input.value = template;
      refresh();
      input.select();
      toast("Clipboard permission unavailable; path placed in preview field.");
    }
  };

  input.oninput = refresh;
  refresh();
  dataDialog.showModal();
}

function openSettings() {
  const select = document.querySelector("#themeSelect");
  select.value = state.theme;
  select.onchange = async () => {
    applyTheme(select.value);
    await setSetting("theme", select.value);
  };
  settingsDialog.showModal();
}
