# Codex task: ISO8583 engine

Read `AGENTS.md`, `agents/ISO8583_AGENT.md`, all `docs/protocols/*`, the selected transaction spec and project reference files.

Implement parsing/packing only for fields whose format is proven by project sources. Add golden-sample round-trip tests. Keep framing separate from ISO payload. Never log sensitive fields unmasked.
