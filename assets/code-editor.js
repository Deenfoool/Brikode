const MONACO_VERSION = "0.57.0";
const MONACO_BASE = "https://cdn.jsdelivr.net/npm/monaco-editor@" + MONACO_VERSION + "/min/";
let monacoPromise = null;
let languageRegistered = false;

function loadMonaco() {
  if (globalThis.monaco?.editor) return Promise.resolve(globalThis.monaco);
  if (monacoPromise) return monacoPromise;

  monacoPromise = new Promise((resolve, reject) => {
    if (!globalThis.require?.config) {
      reject(new Error("Monaco loader is unavailable."));
      return;
    }

    globalThis.MonacoEnvironment = {
      getWorkerUrl() {
        const source =
          "self.MonacoEnvironment={baseUrl:'" + MONACO_BASE + "'};" +
          "importScripts('" + MONACO_BASE + "vs/base/worker/workerMain.js');";
        return "data:text/javascript;charset=utf-8," + encodeURIComponent(source);
      }
    };

    globalThis.require.config({ paths: { vs: MONACO_BASE + "vs" } });
    globalThis.require(
      ["vs/editor/editor.main"],
      () => resolve(globalThis.monaco),
      error => reject(error)
    );
  });

  return monacoPromise;
}

function registerLanguage(monaco) {
  if (languageRegistered) return;
  languageRegistered = true;

  monaco.languages.register({ id: "brikode" });
  monaco.languages.setMonarchTokensProvider("brikode", {
    tokenizer: {
      root: [
        [/^\s*#.*/, "comment"],
        [/\b(WORKFLOW|TRIGGER|TELEGRAM_SEND|TELEGRAM_FILE|TELEGRAM_BUTTONS|BUTTONS|CAPTION|DISCORD_SEND|DISCORD_REPLY|DISCORD_EMBED|DISCORD_BUTTONS|DESCRIPTION|HTTP|AS|WITH|DELAY|LOG|SET|CONVERT|TO|RAW_JS|IF|ELSE|END|REPEAT)\b/, "keyword"],
        [/\b(GET|POST|PUT|PATCH|DELETE|EQUALS|CONTAINS|NOTEQUALS|EXISTS)\b/, "type.keyword"],
        [/"([^"\\]|\\.)*"/, "string"],
        [/\b\d+\b/, "number"],
        [/[A-Za-z_][A-Za-z0-9_.]*/, "identifier"]
      ]
    }
  });

  monaco.languages.registerCompletionItemProvider("brikode", {
    provideCompletionItems(model, position) {
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: model.getWordUntilPosition(position).startColumn,
        endColumn: position.column
      };

      const values = [
        ["TRIGGER telegram.message", "Telegram message trigger"],
        ['TRIGGER telegram.command "/start"', "Telegram command trigger"],
        ["TRIGGER discord.message", "Discord message trigger"],
        ['TRIGGER discord.slash "ping"', "Discord slash command trigger"],
        ['TRIGGER webhook.incoming "/hook"', "Incoming webhook trigger"],
        ['TELEGRAM_SEND "Hello {{trigger.text}}"', "Send Telegram message"],
        ['TELEGRAM_BUTTONS "Choose" BUTTONS "[[{\\\"text\\\":\\\"OK\\\",\\\"callback_data\\\":\\\"ok\\\"}]]"', "Telegram inline buttons"],
        ['DISCORD_SEND "Hello {{trigger.text}}"', "Send Discord message"],
        ['DISCORD_REPLY "Got it"', "Reply to Discord message"],
        ['DISCORD_EMBED "Title" DESCRIPTION "Description" TO ""', "Discord embed"],
        ['DISCORD_BUTTONS "Choose" BUTTONS "[[{\\\"label\\\":\\\"OK\\\",\\\"customId\\\":\\\"ok\\\",\\\"style\\\":\\\"primary\\\"}]]" TO ""', "Discord buttons"],
        ['HTTP GET "https://api.example.com" AS response', "HTTP request"],
        ['REPEAT 3\n  LOG "{{vars.loopIndex}}"\nEND', "Repeat loop"],
        ['IF "trigger.text" CONTAINS "hello"\n  LOG "matched"\nELSE\n  LOG "not matched"\nEND', "Condition"],
        ['SET value = "{{trigger.text}}"', "Set variable"],
        ['CONVERT "{{trigger.text}}" TO NUMBER AS numericValue', "Convert value"],
        ["DELAY 1000", "Delay"],
        ['LOG "{{trigger.text}}"', "Log value"]
      ];

      return {
        suggestions: values.map(([insertText, detail], index) => ({
          label: insertText.split(/\s+/)[0] + " · " + detail,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText,
          range,
          sortText: String(index).padStart(3, "0")
        }))
      };
    }
  });
}

function createFallback(container, initialValue, onChange) {
  const textarea = document.createElement("textarea");
  textarea.className = "code-fallback";
  textarea.spellcheck = false;
  textarea.value = initialValue;
  container.replaceChildren(textarea);

  let suppress = false;
  textarea.addEventListener("input", () => {
    if (!suppress) onChange?.(textarea.value);
  });

  return {
    kind: "textarea",
    getValue: () => textarea.value,
    setValue(value) {
      if (textarea.value === value) return;
      suppress = true;
      textarea.value = value;
      suppress = false;
    },
    setDiagnostics(diagnostics) {
      textarea.setAttribute(
        "aria-description",
        diagnostics.map(item => "Line " + (item.line || 1) + ": " + item.message).join(". ")
      );
    },
    layout() {},
    focus() { textarea.focus(); },
    dispose() { textarea.remove(); }
  };
}

export async function createCodeEditor(container, initialValue, onChange) {
  try {
    const monaco = await loadMonaco();
    registerLanguage(monaco);

    container.replaceChildren();
    const editor = monaco.editor.create(container, {
      value: initialValue,
      language: "brikode",
      theme: document.documentElement.dataset.theme === "light" ? "vs" : "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      lineHeight: 22,
      wordWrap: "on",
      tabSize: 2,
      insertSpaces: true,
      padding: { top: 16, bottom: 16 },
      scrollBeyondLastLine: false,
      renderWhitespace: "selection"
    });

    let suppress = false;
    const subscription = editor.onDidChangeModelContent(() => {
      if (!suppress) onChange?.(editor.getValue());
    });

    return {
      kind: "monaco",
      getValue: () => editor.getValue(),
      setValue(value) {
        if (editor.getValue() === value) return;
        suppress = true;
        editor.setValue(value);
        suppress = false;
      },
      setDiagnostics(diagnostics) {
        monaco.editor.setModelMarkers(
          editor.getModel(),
          "brikode",
          diagnostics.map(item => ({
            startLineNumber: Math.max(1, item.line || 1),
            endLineNumber: Math.max(1, item.line || 1),
            startColumn: 1,
            endColumn: Number.MAX_SAFE_INTEGER,
            severity: item.severity === "error"
              ? monaco.MarkerSeverity.Error
              : monaco.MarkerSeverity.Warning,
            message: item.message
          }))
        );
      },
      setTheme(theme) {
        monaco.editor.setTheme(theme === "light" ? "vs" : "vs-dark");
      },
      layout: () => editor.layout(),
      focus: () => editor.focus(),
      dispose() {
        subscription.dispose();
        editor.dispose();
      }
    };
  } catch (error) {
    console.warn("[Brikode] Monaco unavailable; using textarea fallback.", error);
    return createFallback(container, initialValue, onChange);
  }
}
