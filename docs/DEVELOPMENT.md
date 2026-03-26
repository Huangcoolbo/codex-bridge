# Development Notes

This document is for people extending `codex-bridge`.

If you want the product overview first, read:
[README.en.md](../README.en.md)

## Structure

- Python bridge:
  [src/remote_agent_bridge](../src/remote_agent_bridge)
- Electron desktop client:
  [desktop-client](../desktop-client)
- Gateway API docs:
  [AGENT_GATEWAY.md](../AGENT_GATEWAY.md)

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
  `data/hosts.json`
- Real-device validation:
  [REAL_DEVICE_VALIDATION.md](../REAL_DEVICE_VALIDATION.md)
- Project design:
  [PROJECT_DESIGN.md](../PROJECT_DESIGN.md)

## Current Documentation Layout

- The repository homepage is now product-first
- Installation and the smallest working flow live in:
  [docs/GETTING_STARTED.md](./GETTING_STARTED.md)
- Gateway details live in:
  [AGENT_GATEWAY.md](../AGENT_GATEWAY.md)
