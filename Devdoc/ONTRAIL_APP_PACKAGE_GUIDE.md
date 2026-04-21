# OnTrail App Package Guide — `.app` Format

> **AI instruction document.** Use this as the complete reference when asked to create a new OnTrail app package.
> A `.app` file is simply a ZIP archive renamed to `.app`. It is uploaded in Admin → App Installer, parsed, and installed by the OnTrail backend.

---

## 1. Package Structure

```
my-app.app   (ZIP renamed to .app)
├── manifest.json          ← REQUIRED
├── install.sql            ← optional — runs on Install
├── uninstall.sql          ← optional — runs on full uninstall (drops data)
├── uninstall_keep.sql     ← optional — runs on uninstall-keep-data (truncates only)
└── icon.svg               ← optional — SVG icon shown in the installer UI
```

**Limits**
| File | Max size |
|------|----------|
| Entire `.app` ZIP | 10 MB |
| Any single SQL file | 512 KB |

---

## 2. `manifest.json` — Full Specification

```json
{
  "id": "my-app",
  "name": "My App",
  "version": "1.0.0",
  "description": "A one-line description shown in the installer.",
  "author": "Your Name or Org",
  "tables_created": ["my_app_items", "my_app_config"],
  "settings_schema": [
    {
      "key": "api_key",
      "label": "API Key",
      "type": "text",
      "placeholder": "sk-...",
      "required": true,
      "description": "Obtain from your provider dashboard."
    },
    {
      "key": "webhook_url",
      "label": "Webhook URL",
      "type": "text",
      "placeholder": "https://example.com/hook"
    },
    {
      "key": "max_items",
      "label": "Max Items",
      "type": "number",
      "placeholder": "100"
    },
    {
      "key": "enabled",
      "label": "Enable Feature",
      "type": "boolean"
    },
    {
      "key": "mode",
      "label": "Mode",
      "type": "select",
      "options": [
        { "label": "Production", "value": "production" },
        { "label": "Sandbox", "value": "sandbox" }
      ]
    },
    {
      "key": "notes",
      "label": "Notes",
      "type": "textarea",
      "placeholder": "Internal notes…"
    },
    {
      "key": "brand_color",
      "label": "Brand Color",
      "type": "color"
    }
  ]
}
```

### Required fields
| Field | Type | Rule |
|-------|------|------|
| `id` | `string` | Unique slug, lowercase, hyphens OK. Cannot conflict with an already-installed app. |
| `name` | `string` | Display name shown in the installer. |
| `version` | `string` | Semver recommended (`1.0.0`). |

### Optional fields
| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | Short one-liner shown in the app list. |
| `author` | `string` | Author name or organisation. |
| `tables_created` | `string[]` | Table names your `install.sql` creates. Used by the auto-uninstall fallback (DROP/TRUNCATE) when no SQL file is provided. **Always list them.** |
| `settings_schema` | `SettingsField[]` | Drives the CMS form in the installer detail panel. See field types below. |

### `settings_schema` — Field Types
| `type` | Renders as |
|--------|-----------|
| `text` | Single-line text input |
| `number` | Numeric input |
| `boolean` | Toggle switch |
| `select` | Drop-down; requires `options: [{label, value}]` |
| `textarea` | Multi-line text |
| `color` | Colour picker + hex input |

Every field supports:
- `key` — the key saved in `settings` JSON (required)
- `label` — display label (required)
- `placeholder` — hint text (optional)
- `description` — helper text rendered below label (optional)
- `required` — marks the label with a red asterisk (visual only, not enforced server-side)

---

## 3. SQL Files

### `install.sql`
Executed **once** when the admin clicks **Install**. Use it for:
- `CREATE TABLE IF NOT EXISTS` statements
- Index creation
- Seed / initial data inserts

```sql
CREATE TABLE IF NOT EXISTS my_app_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    body        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_my_app_items_created
    ON my_app_items (created_at DESC);

INSERT INTO my_app_items (title, body)
VALUES ('Welcome', 'Your first item from My App.');
```

**Rules:**
- Separate statements with `;`
- Lines starting with `--` are treated as comments and skipped
- Keep idempotent where possible (`IF NOT EXISTS`)
- Max 512 KB

### `uninstall.sql`
Executed when the admin uninstalls and chooses **Remove all data**. Typically DROP TABLE:

```sql
DROP TABLE IF EXISTS my_app_items CASCADE;
DROP TABLE IF EXISTS my_app_config CASCADE;
```

### `uninstall_keep.sql`
Executed when the admin uninstalls and chooses **Keep data**. Typically TRUNCATE or drop only auxiliary objects:

```sql
-- Keep rows but reset sequences if needed
TRUNCATE TABLE my_app_items RESTART IDENTITY CASCADE;
TRUNCATE TABLE my_app_config RESTART IDENTITY CASCADE;
```

**Auto-fallback:** If you omit `uninstall.sql` and `uninstall_keep.sql`, the backend will auto-generate DROP TABLE / TRUNCATE statements from `tables_created[]` in the manifest. It is still better practice to include explicit SQL files.

---

## 4. `icon.svg`
- Plain SVG text (no `<script>` tags — the backend strips nothing, but browsers sandbox `dangerouslySetInnerHTML`)
- Rendered at 40 × 40 px in the installer list and detail panel
- If omitted, a coloured initials avatar is generated from the app name

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
  <path d="M2 17l10 5 10-5"/>
  <path d="M2 12l10 5 10-5"/>
</svg>
```

---

## 5. Step-by-Step: Building a `.app` File

### 5.1 Create the folder
```
my-app/
├── manifest.json
├── install.sql
├── uninstall.sql
├── uninstall_keep.sql
└── icon.svg
```

### 5.2 Write `manifest.json`
Use the template in §2. Set a unique `id` (e.g. `"leaderboard-plugin"`).

### 5.3 Write SQL
- `install.sql` → create tables, indexes, seed data
- `uninstall.sql` → drop tables
- `uninstall_keep.sql` → truncate tables

### 5.4 Pack into a ZIP
```bash
# Linux / macOS
cd my-app
zip -r ../my-app.zip .
mv ../my-app.zip ../my-app.app

# Windows (PowerShell)
Compress-Archive -Path my-app\* -DestinationPath my-app.zip
Rename-Item my-app.zip my-app.app
```

The ZIP must contain the files **at the root level**, not inside a sub-folder.

### 5.5 Upload & Install
1. Open **Admin → App Installer**
2. Drag-and-drop `my-app.app` into the upload zone (or click to browse)
3. The app appears with status **uploaded** — click it to open the detail panel
4. Click **Install** — `install.sql` runs and status changes to **installed**
5. Fill in any settings fields and click **Save Settings**

### 5.6 Uninstall
1. Click the app in the installer list
2. Click **Uninstall**
3. Choose:
   - **Remove all data** — runs `uninstall.sql` (or auto-drops tables)
   - **Keep data** — runs `uninstall_keep.sql` (or auto-truncates tables)
4. Confirm — the app record is deleted from the installer

---

## 6. Complete Minimal Example

### `manifest.json`
```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "A minimal demo app.",
  "author": "OnTrail",
  "tables_created": ["hello_world_messages"],
  "settings_schema": [
    {
      "key": "greeting",
      "label": "Greeting Text",
      "type": "text",
      "placeholder": "Hello, World!",
      "description": "The greeting shown to users."
    },
    {
      "key": "active",
      "label": "Active",
      "type": "boolean"
    }
  ]
}
```

### `install.sql`
```sql
CREATE TABLE IF NOT EXISTS hello_world_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO hello_world_messages (message)
VALUES ('Hello from the Hello World app!');
```

### `uninstall.sql`
```sql
DROP TABLE IF EXISTS hello_world_messages CASCADE;
```

### `uninstall_keep.sql`
```sql
TRUNCATE TABLE hello_world_messages CASCADE;
```

### Pack it
```powershell
Compress-Archive -Path hello-world\* -DestinationPath hello-world.zip
Rename-Item hello-world.zip hello-world.app
```

---

## 7. AI Prompt Template

When asking an AI to generate a new `.app` package, use this prompt:

```
Create an OnTrail .app package for: [DESCRIBE YOUR APP]

Requirements:
- App ID (slug): [e.g. my-plugin]
- Tables needed: [list table names]
- Settings the admin should configure: [list key/label/type]
- Any seed data: [yes/no + description]

Follow the ONTRAIL_APP_PACKAGE_GUIDE.md spec exactly.
Output all files:
1. manifest.json
2. install.sql
3. uninstall.sql
4. uninstall_keep.sql
5. icon.svg (optional)

Then provide PowerShell commands to zip them into my-plugin.app.
```

---

## 8. Constraints & Gotchas

| Constraint | Detail |
|-----------|--------|
| App `id` must be unique | Uploading a duplicate `id` returns HTTP 409. Uninstall first to reinstall. |
| Files must be at ZIP root | `manifest.json` not inside a sub-folder, or the installer rejects it. |
| SQL is split on `;` | Do not use `;` inside string literals in your SQL (use `$$` quoting if needed). |
| No stored procedures with `$` | Dollar-quoting in `install.sql` may confuse the simple splitter — test first. |
| Max 10 MB total | Keep SQL concise; for large seed datasets use a separate migration. |
| `icon.svg` is rendered via `dangerouslySetInnerHTML` | Do not include `<script>`, `<iframe>`, or event attributes in the SVG. |
| Settings are stored as JSON | All values are strings/numbers/booleans — no nested objects in settings values. |
| `tables_created` list order matters | List in dependency order (parent tables first) for auto-DROP to work correctly (it reverses the list). |
