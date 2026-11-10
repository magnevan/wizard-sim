# Servers

A terminal view of the game's local servers across every worktree, so orphans are easy to find and end. Windows only, no dependencies.

Run it from `game/` in any worktree with `npm run servers`, or use `node tools/servers/servers.mjs`. `--json` prints the list once, and `--json --all` includes every local runtime.

| Key | Action |
|---|---|
| up/down, j/k | Select |
| n | Start a server: worktree, then kind (dev, dev + LAN, preview), then port |
| x | Kill the selected server and its npm launcher, after asking |
| X | Kill every idle orphan, after listing them |
| o | Open in the browser |
| a | Also show other local node and python listeners |
| r | Refresh now |
| q | Quit. Servers keep running |

## Reading the table

- **Clients** counts open connections to the port. On a dev server each open tab holds a hot-reload connection, so this is close to the number of tabs. A preview server holds no open connection, so an open tab shows nothing there; "seen 2m ago" is the last time this tool saw traffic. Co-op play goes peer to peer and never touches these servers.
- **Owner** is the nearest live program that launched the server: vscode, claude, terminal, desktop, or `servers` for ones started here. `orphan` means nothing up the parent chain is alive. A server left behind under a Claude or VS Code process that is still running shows that owner, so check Age and Clients as well.
- **Worktree** comes from the path in the command line. `(deleted)` means the server outlived its worktree.

Servers started here run in the background with their output in `~/.wizard-sim-servers/logs/`, which also holds the list of what was started. Those logs are never cleaned up automatically. New preview servers start at 4188 because the browser check scripts need 4187 free.

Tests: `node --test tools/servers/core.test.mjs`.
