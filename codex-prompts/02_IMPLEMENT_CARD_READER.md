# Codex task: HID OMNIKEY 5422

Read `AGENTS.md`, `agents/CARD_READER_AGENT.md` and `docs/hardware/OMNIKEY_5422.md`.

Implement a `CardReaderAdapter` abstraction with a Windows PC/SC adapter and a fake adapter for tests/CI. Detect reader, card present/removed, ATR/ATS and expose only sanitized card metadata. Do not invent EMV data extraction behavior not documented by project evidence.
