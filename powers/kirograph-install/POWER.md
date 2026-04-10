---
name: "kirograph-install"
displayName: "KiroGraph Installer"
description: "Guides Kiro through installing KiroGraph — a semantic code knowledge graph for faster, smarter codebase exploration. Asks each configuration question interactively, writes the config, wires up MCP + hooks + steering, and indexes the project."
keywords: ["kirograph", "knowledge-graph", "code-index", "semantic-search", "mcp-setup"]
author: "kirograph"
---

# KiroGraph Installer

## Overview

KiroGraph gives Kiro a pre-indexed semantic knowledge graph of your codebase. Instead of scanning files with grep and glob on every task, Kiro queries the graph instantly — symbol relationships, call graphs, type hierarchies, impact radius — all in a single MCP tool call.

This power walks you through the full installation interactively:
1. Ask each configuration question (embeddings, engine, docstrings, call sites)
2. Write `.kirograph/config.json` with the chosen options
3. Install any required npm dependencies for the chosen engine
4. Wire up MCP server, auto-sync hooks, and steering file in `.kiro/`
5. Optionally index the project immediately

## Installation Workflow

When the user asks to install KiroGraph, follow these steps **in order**. Ask each question, wait for the answer, then proceed.

---

### Step 0 — Prerequisites check

Verify Node.js >= 18 is available:

```bash
node --version
```

If the version is below 18, tell the user to upgrade Node.js before continuing.

---

### Step 1 — Install the CLI globally

```bash
npm install -g kirograph
```

Verify it worked:

```bash
kirograph --version
```

If this fails (network error, registry issue, offline environment), **stop here and follow the "Fallback: Build and Install Locally" section** at the bottom of this document, then return to Step 2.

---

### Step 2 — Ask: Enable semantic embeddings?

**Ask the user:**

> "Do you want to enable semantic embeddings for similarity-based code search?
>
> This lets KiroGraph understand natural-language queries like 'fix the auth bug' and find relevant symbols even when the exact name isn't mentioned. It requires downloading a local embedding model (~130 MB, one-time) and increases indexing time.
>
> Enable semantic embeddings? (yes / no, default: no)"

- If **no** → set `enableEmbeddings: false`, skip to Step 5.
- If **yes** → set `enableEmbeddings: true`, continue to Step 3.

---

### Step 3 — Ask: Embedding model (only if embeddings enabled)

**Ask the user:**

> "Which HuggingFace embedding model should be used?
>
> Press Enter to use the default: `nomic-ai/nomic-embed-text-v1.5` (~130 MB, downloaded once to `~/.kirograph/models/`).
> Or enter a custom model ID in the format `org/model-name`."

- If empty → use `nomic-ai/nomic-embed-text-v1.5`
- If custom → validate it contains a `/`, otherwise re-ask

Set `embeddingModel` in config accordingly.

---

### Step 4 — Ask: Semantic search engine (only if embeddings enabled)

**Ask the user to choose one of these engines:**

| Choice | Engine | Description |
|--------|--------|-------------|
| 1 | `cosine` | In-process cosine similarity. No extra deps. Best for small/medium projects. **(default)** |
| 2 | `sqlite-vec` | ANN index, sub-linear search. Best for large codebases. Needs native deps. |
| 3 | `orama` | Hybrid full-text + vector. Pure JS. Good result quality. |
| 4 | `pglite` | Hybrid via PostgreSQL + pgvector. Exact results. Pure WASM. |
| 5 | `lancedb` | ANN via Apache Lance columnar format. Pure JS. |
| 6 | `qdrant` | ANN via Qdrant embedded binary (HNSW). Needs `qdrant-local`. |
| 7 | `typesense` | ANN via Typesense (auto-downloaded binary, HNSW). Needs `typesense`. |

Set `semanticEngine` in config to the chosen value.

**If `typesense` chosen** — also ask:
> "Open the Typesense dashboard in your browser after indexing? (yes / no, default: no)"
Set `typesenseDashboard` accordingly.

**If `qdrant` chosen** — also ask:
> "Open the Qdrant Web UI dashboard in your browser after indexing? (yes / no, default: no)"
Set `qdrantDashboard` accordingly.

---

### Step 5 — Ask: Extract docstrings?

**Ask the user:**

> "Extract docstrings and JSDoc comments from source files?
>
> Enriches symbol metadata and improves context quality. Slightly increases indexing time.
>
> Extract docstrings? (yes / no, default: yes)"

Set `extractDocstrings` in config.

---

### Step 6 — Ask: Track call sites?

**Ask the user:**

> "Track call sites to enable caller/callee graph traversal?
>
> This powers the `kirograph_callers` and `kirograph_callees` MCP tools. Increases index size slightly.
>
> Track call sites? (yes / no, default: yes)"

Set `trackCallSites` in config.

---

### Step 7 — Write `.kirograph/config.json`

Create the directory and write the config based on all answers collected above.

```bash
mkdir -p .kirograph
```

Write `.kirograph/config.json`:

```json
{
  "enableEmbeddings": <true|false>,
  "embeddingModel": "<model>",
  "semanticEngine": "<engine>",
  "extractDocstrings": <true|false>,
  "trackCallSites": <true|false>
}
```

Only include `embeddingModel` and `semanticEngine` if `enableEmbeddings` is `true`.

---

### Step 8 — Install engine dependencies (if needed)

Based on the chosen `semanticEngine`, run the appropriate install command:

| Engine | Command |
|--------|---------|
| `cosine` | *(nothing to install)* |
| `sqlite-vec` | `npm install better-sqlite3 sqlite-vec` |
| `orama` | `npm install @orama/orama @orama/plugin-data-persistence` |
| `pglite` | `npm install @electric-sql/pglite` |
| `lancedb` | `npm install @lancedb/lancedb` |
| `qdrant` | `npm install qdrant-local` |
| `typesense` | `npm install typesense` *(binary auto-downloaded on first index run, ~37 MB)* |

---

### Step 9 — Wire up MCP, hooks, and steering

Run the kirograph installer to write the Kiro integration files:

```bash
kirograph install
```

This writes:
- `.kiro/settings/mcp.json` — registers the KiroGraph MCP server with all 12 tools auto-approved
- `.kiro/hooks/kirograph-mark-dirty-on-save.json`
- `.kiro/hooks/kirograph-mark-dirty-on-create.json`
- `.kiro/hooks/kirograph-sync-on-delete.json`
- `.kiro/hooks/kirograph-sync-if-dirty.json`
- `.kiro/steering/kirograph.md` — teaches Kiro to prefer graph tools

> Note: The installer will ask its own questions interactively. Answer them consistently with the choices already made above. If you prefer to skip the interactive installer and write files manually, see the Manual Setup section below.

---

### Step 10 — Ask: Index now?

**Ask the user:**

> "Initialize and index this project now? This will parse all source files and build the knowledge graph. (yes / no, default: yes)"

If **yes**:

```bash
kirograph init --index
```

This creates `.kirograph/kirograph.db` and indexes all source files.

---

### Step 11 — Done

Tell the user:

> "KiroGraph is installed. Restart Kiro for the MCP server to load. After restart, Kiro will automatically use the graph tools for faster codebase exploration."

---

## Fallback: Build and Install Locally (if npm install fails)

Use this workflow when `npm install -g kirograph` fails — e.g. network issues, registry outage, or a private/offline environment.

### Step F1 — Get the source

Ask the user:

> "Where is the KiroGraph source? Options:
> 1. I have a local clone already — provide the path
> 2. Download a zip/tarball from GitHub — provide the URL or tag
> 3. Clone from git — provide the repo URL"

**Option 1 — local path already exists:**

```bash
cd /path/user/provided
```

**Option 2 — download zip from GitHub:**

```bash
# Ask the user for the URL, e.g.:
# https://github.com/owner/kirograph/archive/refs/heads/main.zip
curl -L <url> -o kirograph-src.zip
unzip kirograph-src.zip
cd kirograph-main   # or whatever the extracted folder is named
```

**Option 3 — git clone:**

```bash
# Ask the user for the repo URL
git clone <url> kirograph-src
cd kirograph-src
```

---

### Step F2 — Install build dependencies

From inside the source directory:

```bash
npm install
```

This installs TypeScript and all build-time deps declared in `devDependencies`.

---

### Step F3 — Build

```bash
npm run build
```

This runs `tsc`, copies wasm assets into `dist/`, and marks `dist/bin/kirograph.js` as executable. The output lands in `dist/`.

Verify the build succeeded:

```bash
ls dist/bin/kirograph.js
```

---

### Step F4 — Install globally from local source

```bash
npm install -g .
```

This registers the `kirograph` and `kg` bin aliases globally, pointing at `dist/bin/kirograph.js`.

Verify:

```bash
kirograph --version
```

If `npm install -g` is also blocked (e.g. no write access to the global prefix), use `npm link` instead:

```bash
npm link
```

Or, as a last resort, invoke the CLI directly without a global install by using the full path:

```bash
node /path/to/kirograph-src/dist/bin/kirograph.js --version
```

In that case, replace every `kirograph` command in the rest of the workflow with `node /path/to/kirograph-src/dist/bin/kirograph.js`.

---

### Step F5 — Continue with the normal workflow

Once the CLI is available, resume from **Step 2** of the main Installation Workflow above (ask about embeddings, write config, run `kirograph install`, index).

---

## Manual Setup (Alternative to `kirograph install`)

If you need to write the Kiro integration files manually instead of running the interactive installer:

### MCP Server — `.kiro/settings/mcp.json`

Merge this into the existing file (don't overwrite other servers):

```json
{
  "mcpServers": {
    "kirograph": {
      "command": "kirograph",
      "args": ["serve", "--mcp"],
      "autoApprove": [
        "kirograph_search", "kirograph_context", "kirograph_callers",
        "kirograph_callees", "kirograph_impact", "kirograph_node",
        "kirograph_status", "kirograph_files", "kirograph_dead_code",
        "kirograph_circular_deps", "kirograph_path", "kirograph_type_hierarchy"
      ]
    }
  }
}
```

### Hooks — `.kiro/hooks/`

`kirograph-mark-dirty-on-save.json`:
```json
{
  "name": "KiroGraph Mark Dirty on Save",
  "version": "1.0.0",
  "when": {
    "type": "fileEdited",
    "patterns": ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py", "*.go", "*.rs", "*.java", "*.cs", "*.rb", "*.php", "*.swift", "*.kt", "*.dart"]
  },
  "then": {
    "type": "runCommand",
    "command": "kirograph mark-dirty"
  }
}
```

`kirograph-mark-dirty-on-create.json`:
```json
{
  "name": "KiroGraph Mark Dirty on Create",
  "version": "1.0.0",
  "when": {
    "type": "fileCreated",
    "patterns": ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py", "*.go", "*.rs", "*.java", "*.cs", "*.rb", "*.php", "*.swift", "*.kt", "*.dart"]
  },
  "then": {
    "type": "runCommand",
    "command": "kirograph mark-dirty"
  }
}
```

`kirograph-sync-on-delete.json`:
```json
{
  "name": "KiroGraph Sync on Delete",
  "version": "1.0.0",
  "when": {
    "type": "fileDeleted",
    "patterns": ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py", "*.go", "*.rs", "*.java", "*.cs", "*.rb", "*.php", "*.swift", "*.kt", "*.dart"]
  },
  "then": {
    "type": "runCommand",
    "command": "kirograph sync-if-dirty"
  }
}
```

`kirograph-sync-if-dirty.json`:
```json
{
  "name": "KiroGraph Sync If Dirty",
  "version": "1.0.0",
  "when": {
    "type": "agentStop"
  },
  "then": {
    "type": "runCommand",
    "command": "kirograph sync-if-dirty --quiet"
  }
}
```

---

## Troubleshooting

### `kirograph: command not found`
The global install didn't land in your PATH.
```bash
npm install -g kirograph
# then check:
which kirograph
# if missing, add npm global bin to PATH:
export PATH="$(npm bin -g):$PATH"
```

### Engine dependency install fails
Run the install manually in the project root:
```bash
npm install <package-name>
```
If it still fails, fall back to `cosine` (no deps needed) by editing `.kirograph/config.json`:
```json
{ "enableEmbeddings": true, "semanticEngine": "cosine" }
```

### MCP server not loading after restart
Check `.kiro/settings/mcp.json` exists and contains the `kirograph` entry. If the file already existed with other servers, make sure the merge didn't break the JSON structure.

### Index is stale
```bash
kirograph index --force
```

### Lock file stuck
```bash
kirograph unlock
```
