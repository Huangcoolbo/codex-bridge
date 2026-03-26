# Development Notes

This document is for people extending `codex-bridge`.

If you want the product overview first, read:
[README.md](/D:/remote-agent-bridge/README.md)

## Structure

- Python bridge:
  [src/remote_agent_bridge](/D:/remote-agent-bridge/src/remote_agent_bridge)
- Electron desktop client:
  [desktop-client](/D:/remote-agent-bridge/desktop-client)
- Gateway API docs:
  [AGENT_GATEWAY.md](/D:/remote-agent-bridge/AGENT_GATEWAY.md)

## Current Core Capabilities

- Windows + SSH + PowerShell
- Android + ADB
- Electron desktop client
- Local HTTP gateway for Codex / agents

## Validation

Python:

```bash
python -m pytest -q
```

Desktop client:

```powershell
cd .\desktop-client
npm run typecheck
node --test --experimental-strip-types .\tests\androidGatewayService.test.ts
npm run build
```

## State and References

- Host registry:
  [data/hosts.json](/D:/remote-agent-bridge/data/hosts.json)
- Real-device validation:
  [REAL_DEVICE_VALIDATION.md](/D:/remote-agent-bridge/REAL_DEVICE_VALIDATION.md)
- Project design:
  [PROJECT_DESIGN.md](/D:/remote-agent-bridge/PROJECT_DESIGN.md)

## Current Documentation Layout

- The repository homepage is now product-first
- Installation and the smallest working flow live in:
  [docs/GETTING_STARTED.md](/D:/remote-agent-bridge/docs/GETTING_STARTED.md)
- Gateway details live in:
  [AGENT_GATEWAY.md](/D:/remote-agent-bridge/AGENT_GATEWAY.md)
