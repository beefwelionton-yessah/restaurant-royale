# Restaurant Royale: First Kitchen

A browser-based multiplayer food battle royale starter project.

## Files
- `index.html` — screens and interface
- `style.css` — cover, lobby, selection screen and game styling
- `game.js` — fighters, controls, realtime rooms and battle logic
- `netlify.toml` — Netlify publish settings
- `supabase-setup.sql` — notes for the realtime service

## Run in GitHub Codespaces
1. Open your GitHub repository in a Codespace.
2. In the Codespaces terminal, run `pwd` and `ls` to make sure you are in the folder containing `index.html`.
3. Start a preview server with:
   `python3 -m http.server 8000 --bind 0.0.0.0`
4. Open the **Ports** tab in Codespaces and click the forwarded port 8000.
5. If friends need to test the preview, change port visibility to **Public**. Do not use the Codespaces preview as the permanent public host.

Stop the server with `Ctrl+C` in the terminal.

## Run locally
Open this folder in VS Code and use the Live Server extension, or run `python3 -m http.server 8000` and open `http://localhost:8000`.

## Enable real multiplayer
The frontend is hosted on Netlify, but separate devices need a realtime service to share rooms and game state.

1. Create a free Supabase project at https://supabase.com/.
2. In the Supabase dashboard, open **Project Settings → API**.
3. Copy the **Project URL** and **anon/public key**.
4. Open `game.js` and replace:
   - `YOUR_SUPABASE_URL`
   - `YOUR_SUPABASE_ANON_KEY`
5. Ensure Realtime is enabled in the Supabase project.
6. Deploy this folder to Netlify.

Do not put a Supabase `service_role` key in browser code. Only use the anon/public key.

## Play
- Host: Create room, choose a fighter, press READY, share the six-character code.
- Friends: Open the Netlify URL, enter the room code, choose a fighter, press READY.
- Host: Press DEPLOY when everyone is ready.
- Controls: WASD to move, mouse to aim, left click or Space to attack.

## Current starter build notes
- Designed for up to 10 human players per room; extra seats are filled with easier kitchen bots when the host deploys.
- A join attempt checks for an active host and rejects a room with no host or more than 10 present players.
- Host simulates the battle and broadcasts snapshots to the other players.
- This is a prototype foundation, not production-secure multiplayer. The host browser currently acts as the match authority, so a host disconnect ends the match and a determined player could manipulate game state. Before a public competitive launch, move match simulation to a trusted server and add reconnection handling, matchmaking protections and anti-cheat controls.
