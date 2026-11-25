# City States of Italy

This is a boardgame idea digitalized. Inspired by Sid Meiers Civilization, but not a civilization game.

## How to install

1. Install [bun](https://bun.sh) if you don't have it yet.

   macOS, Linux and WSL:

   ```
   curl -fsSL https://bun.sh/install | bash
   ```

   Windows:

   ```
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

2. Install the dependencies.

   ```
   bun i
   ```

3. Set up the env.

   ```
   cp .env.example .env
   ```

4. Set up the database.

   ```
   bun run db:push
   ```

5. Run the game.

   ```
   bun dev
   ```

## How to play

- Create a game
- Name the game, you can ignore the other settings in the dialog
- Wait for others to join
- Press 'Ready' and 'Start game'
## Docker (Synology NAS)

```
scripts/pipeline.sh
```

Runs the tests, builds the image, smoke-tests it and writes `dist/citystates.tar`. On the NAS: Container Manager > Image > Import that tar, then Project > Create with `docker-compose.yml` in a folder (the database goes in `data/` next to it). The game runs at `http://<nas>:5160/games/citystates`. For an ARM NAS use `PLATFORM=linux/arm64 scripts/pipeline.sh`.

It also works behind a reverse proxy that strips a path prefix (Caddy `handle_path /abc123/* { reverse_proxy <nas>:5160 }`): the page works out the prefix from its URL, so the game is at `https://<host>/abc123/games/citystates/` too.
