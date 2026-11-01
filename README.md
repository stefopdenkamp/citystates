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

4. Set up the database. This creates the tables, and needs the `.env` from the previous step.

   ```
   bun run db:push
   ```

5. Run the game.

   ```
   bun dev
   ```

## How to play

- Create a game
- You don't need to change any setting is the start up dialog
- Wait for others to join
- Press 'Ready' and 'Start game'