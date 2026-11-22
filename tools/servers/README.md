# Servers

A terminal view of the game's local servers across every worktree, so orphans are easy to find and end. Windows only, no dependencies.

Run it from `game/` in any worktree with `npm run servers`, or use `node tools/servers/servers.mjs`. `--json` prints the list once, and `--json --all` includes every local runtime.

| Key | Action |
|---|---|
| up/down, j/k | Select |
| n | Start a server: worktree, then kind (dev, dev + LAN, preview rebuilt on save, preview), then port |
| b | Build the selected server's worktree once; a preview server on it serves the new build on the next refresh |
| x | Kill the selected server and its npm launcher, after asking |
| X | Kill every idle orphan, after listing them |
| o | Open in the browser |
| a | Also show other local node and python listeners |
| r | Refresh now |
| q | Quit. Servers keep running |

## Kinds of server

- **dev** and **dev + LAN**: Vite's dev server. Every save hot-reloads the open page; LAN also listens on the network.
- **preview, rebuilt on save** (`fresh` in the table): `fresh.mjs` runs `vite build --watch` and `vite preview` as one process. A save rebuilds `dist/` in about 2 s, and the page shows it when you refresh it; nothing reloads by itself. This is the production build, so it runs at real speed and shows build-only bugs. While a rebuild runs, a refresh can catch a half-written `dist/`; refresh again. The commit shown in bug reports is the one from when the server started.
- **preview**: `vite preview` on whatever is in `dist/` already. Press `b` to rebuild it.

## Reading the table

- **Build** says how far a preview server's build is behind its worktree: `current`, `3 commits` (commits under `game/` since the build's commit), `2 edits` (files under `game/` changed since it was built), or both as `3c+2e`. The build records its commit in `dist/build-info.json`; a build older than that counts commits by date, and `?` means the commit is unknown here. Dev servers show `live`.
- **Clients** counts open connections to the port. On a dev server each open tab holds a hot-reload connection, so this is close to the number of tabs. A preview server holds no open connection, so an open tab shows nothing there; "seen 2m ago" is the last time this tool saw traffic. Co-op play goes peer to peer and never touches these servers.
- **Owner** is the nearest live program that launched the server: vscode, claude, terminal, desktop, or `servers` for ones started here. `orphan` means nothing up the parent chain is alive. A server left behind under a Claude or VS Code process that is still running shows that owner, so check Age and Clients as well.
- **Worktree** comes from the path in the command line. `(deleted)` means the server outlived its worktree.

Servers started here run in the background with their output in `~/.wizard-sim-servers/logs/`, which also holds the list of what was started. Those logs are never cleaned up automatically. New preview servers start at 4188 because the browser check scripts need 4187 free.

Tests: `node --test tools/servers/core.test.mjs`.
