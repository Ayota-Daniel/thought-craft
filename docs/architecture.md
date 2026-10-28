# Thought Craft architecture at M3

## Responsibilities and scope

`Entity` is an instance identified by UUID, regardless of its path or type. `EntityIndex` is the existing single UUID map: it follows vault events, provides Inbox and directed relation queries, and never stores schema configuration. M3 adds no path-to-ID map, reverse-edge database or workspace engine.

`EntityTypeDefinition` is reusable vault configuration. Its stable string `id` matches Markdown `bs_type`. `label` is presentation, `folderName` controls future file creation, `builtIn` protects the five seeds, `retired` controls creation availability, and `properties` is an ordered collection of reusable schemas. No per-type classes or special creation methods exist.

`EntityTypeRegistry` owns definitions and their mutations. It receives persistence explicitly and is injected into Focus, the Type Manager, relation target search, Create From and the repository. It maintains its own small ID map and change subscriptions. It has no knowledge of workspace IDs; M3 definitions are global within one vault/plugin configuration. This separate boundary permits future workspace selection without changing note identity or property-value validation.

`PropertySchema` defines a stable snake_case `key`, label, one of the existing five types, retirement state and optional default/max/options. Keys and types are immutable after creation. `resolveSchemaField()` projects raw stored values into explicit/default/missing state and an optional incompatibility issue. It does not write notes. Raw values remain on Entity so unknown, retired, orphaned and malformed data survive schema/configuration changes.

## Two persistence boundaries

| Data | Authority | Write route |
| --- | --- | --- |
| UUID, type ID, workspace, status, timestamps | Markdown frontmatter | Vault / FileManager |
| Content | Markdown body | Native Obsidian editor |
| Local property definitions and values | `bs_properties` | Existing M1 mapper |
| Directed UUID edges | `bs_relations` | Existing M2 mapper |
| Explicit reusable property values | `bs_schema_values` | M3 schema-value mapper |
| Types, reusable property definitions, capture settings | Plugin `data.json` | Serialized plugin configuration writes |

`data.json` retains the existing capture keys and adds `configVersion: 3` and `entityTypes`. Notes contain readable property keys rather than property UUIDs. Schemas are never duplicated into notes. There is no eager schema migration of Markdown.

Initialization loads capture settings and registry before repository creation. Missing built-ins are seeded with empty property lists; existing IDs are not duplicated. The legacy Idea destination remains authoritative when upgrading. Missing type configuration yields built-in seeds; custom notes still parse with unknown type IDs. Unreadable individual definitions are reported and retained for manual recovery. A malformed root type-list or newer config version stops plugin loading instead of replacing configuration.

Registry changes are serialized, validated and persisted before publishing to subscribers. Configuration writes merge into current saved data, preserving unrelated fields and preventing capture settings from erasing schemas. The Idea definition’s folder name and the legacy capture destination are synchronized; the destination’s parent remains controlled by capture settings.

## Reading and editing

Vault create/modify/rename/delete processing stays unchanged. The frontmatter mapper validates identity metadata but accepts any safe type ID, independently of registry availability. It retains `bs_schema_values` unmodified. Focus subscribes to both index and registry, so adding a field refreshes existing tabs without rereading or rewriting every note. Its body remains an Obsidian MarkdownRenderer preview; native editing opens the real file.

One M1 `PropertyEditor` serves local and reusable values. A small schema context captures source/default/raw value and definition at draft start; domain validation and persistence stay outside the visual control. Controls show missing/default/explicit state and incompatibility text. Invalid stored values remain visible for correction; boolean fields use an indeterminate state when missing or incompatible. Text/number/rating commit on Enter or blur; boolean/select on change. Escape discards drafts. Reset requires confirmation and removes only the explicit schema value.

Schema values share the existing repository’s per-entity metadata queue. At commit, the repository re-resolves UUID to current file, checks identity inside `processFrontMatter()`, finds the current type/property schema, and compares expected schema/source/value. The pure mapper validates replacements before changing only the requested key. Local properties, relations, neighboring values and user metadata remain intact; successful value writes update `bs_updated`. The host API preserves the exact body. Malformed root containers require native Markdown repair rather than destructive replacement.

## Lifecycle and preservation

Built-ins cannot retire. Custom type retirement keeps definitions, schemas and existing note access, while active creation choices exclude them. Restoration is supported. Property retirement retains the definition and hides its normal editor; any explicit value appears in the stored/orphaned section. Restoration reactivates the same stable key. No destructive type/property deletion is exposed.

Select option removal and rating maximum reductions affect validation, not stored values. Incompatible values are reported and can be replaced or explicitly reset. Defaults remain virtual; explicit empty text, false and zero override defaults correctly. Losing configuration cannot erase Markdown values: unknown types keep UUID, content, properties, values, relations and native-note access.

All entities use generic Create From. The registry supplies active types and their folders; the repository validates again before creation. New notes receive a new UUID, inherited workspace and one source-owned `originated-from` edge, with no source rewrite or eager defaults. Non-Idea folders are relative to the capture folder’s parent; existing M2 paths remain defaults. Changing a definition never moves old notes.

## Deferred

Workspace-specific type/property definitions, custom relation schemas, formulas, evaluations, boards, timeline, graph views and specialized entity UI are outside M3. Relation kinds remain the five fixed M2 kinds, with no type restrictions. M4 has not been started.
