# Thoughtcraft coding expectations

Human readability is a first-class requirement. The owner reads the code to learn from it.

- Use consistent indentation and one logical operation per line.
- Never compress multiple statements or JSX into dense one-line expressions.
- Use descriptive names, short focused functions, and whitespace between concepts.
- Extract complex conditions into named helpers when that makes intent clearer.
- Prefer explicit, straightforward code over clever shortcuts.
- Avoid speculative frameworks, unnecessary abstractions, factories, inheritance, complex generics, and extra architectural layers. Introduce them only when the current feature needs them.
- Explain non-obvious intent, constraints, or behavior in comments; do not restate the code.
- Apply the same readability standards to tests.
- Improve dense legacy code locally when touching it. Avoid unrelated repository-wide refactors.
- Keep Markdown authoritative and use Obsidian APIs for vault/frontmatter changes.
- Preserve unrelated frontmatter and Markdown bodies. Do not store entities in plugin settings.
- Keep changes within the requested milestone. Run build, lint and relevant tests; record real Obsidian validation where requested.
