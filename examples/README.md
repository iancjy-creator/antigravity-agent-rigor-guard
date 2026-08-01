# Hook payload examples

These examples can be passed directly to the process-level hook scripts.

## Dangerous command denial

```bash
node scripts/guard-command.mjs < examples/pretool-deny-force-push.json
```

Expected decision:

```json
{
  "decision": "deny"
}
```

## Safe command allowance

```bash
node scripts/guard-command.mjs < examples/pretool-allow-status.json
```

Expected decision:

```json
{
  "decision": "allow"
}
```

The exact response can include a reason field. Each example uses a dedicated conversation ID so its audit ledger is easy to locate under `~/.gemini/antigravity/rigor-ledger/`.
