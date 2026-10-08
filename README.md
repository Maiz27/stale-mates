# Stalemates: A Full-Stack Chess Platform

Stalemates is an interactive chess platform where users can play against AI or other players in real-time, showcasing the power of modern web technologies in creating engaging, multiplayer experiences. [Play Stalemates Now](https://stalemates.magedfaiz.xyz/)

![Portfolio Website Overview](https://drive.google.com/thumbnail?id=1KQZ-_uU-5ii0VdVfKHqHwvgC8G5luN5X&sz=w1024&t=1681358800&mime=image/png)

## Table of Contents

- [Stalemates: A Full-Stack Chess Platform](#stalemates-a-full-stack-chess-platform)
  - [Table of Contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Features](#features)
  - [Tech Stack](#tech-stack)
    - [Frontend](#frontend)
    - [Backend](#backend)
    - [Chess Logic](#chess-logic)
    - [Build Tools](#build-tools)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
  - [Scripts](#scripts)
  - [Deployment](#deployment)
    - [Two-Target Split](#two-target-split)
    - [Why the Backend Can't Be Serverless](#why-the-backend-cant-be-serverless)
    - [Environment Variables](#environment-variables)
    - [Deploying the Frontend (Vercel)](#deploying-the-frontend-vercel)
    - [Deploying the Backend (Fly.io / Docker)](#deploying-the-backend-flyio--docker)
  - [Contributing](#contributing)
  - [License](#license)
    - [Third-Party Licenses](#third-party-licenses)

## Introduction

Stalemates was born out of a passion for chess and a desire to explore the capabilities of SvelteKit and WebSocket technology in creating a seamless gaming experience. You can read a detailed breakdown of the project's development journey [here](https://www.magedfaiz.xyz/projects/stalemates).

## Features

- Play against an AI opponent with adjustable difficulty levels
- Engage in real-time multiplayer chess games
- Receive hints to improve your game play
- Take back moves in AI games for learning and practice
- Enjoy a responsive and intuitive chessboard interface

## Tech Stack

### Frontend

- SvelteKit: For building a responsive and efficient user interface
- Tailwind CSS: For rapid and customizable styling
- shadcn-svelte: For pre-built, customizable UI components
- svelte-chessground: For the interactive chessboard component

### Backend

- Express.js: Powering the server-side logic and API
- WebSockets: Enabling real-time communication for multiplayer games

### Chess Logic

- chess.js: Handling game rules, move validation, and board state
- Stockfish.js: Providing the AI opponent with adjustable difficulty

### Build Tools

- Vite: For fast development and optimized production builds
- TypeScript: For type-safe JavaScript development

## Getting Started

Follow these instructions to get Stalemates up and running on your local machine for development and testing purposes.

### Prerequisites

- Node.js 22 (see `.nvmrc`; `package.json` `engines` accepts 20.19+ up to 24)
- Bun 1.2+ (the lockfiles are text `bun.lock`; CI pins Bun 1.4.2)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Maiz27/stale-mates.git
   cd stale-mates
   ```

2. **Install dependencies:**

   ```bash
   bun i
   ```

3. **Set up environment variables:**

   - Copy `.env.example` to `.env` in the root directory
   - Copy `api/.env.example` to `api/.env`

4. **Install API dependencies:**

   ```bash
   cd api
   bun i
   ```

5. Stockfish.js setup:
   The Stockfish.js file is located in the static folder of the project. No additional setup is required as it's already in the correct location for the application to use.

## Scripts

Frontend (repo root):

| Script              | What it does                                                          |
| ------------------- | --------------------------------------------------------------------- |
| `bun run dev`       | SvelteKit dev server (http://localhost:5173)                          |
| `bun run build`     | Production build (adapter-vercel, `nodejs22.x` runtime)               |
| `bun run preview`   | Serve the production build locally (http://localhost:4173)            |
| `bun run check`     | `svelte-kit sync` + `svelte-check` type checking                      |
| `bun run lint`      | `prettier --check .` and `eslint .`                                   |
| `bun run format`    | Format everything with Prettier                                       |
| `bun run test:unit` | Vitest unit tests (`src/**/*.test.ts`)                                |
| `bun run test:e2e`  | Playwright end-to-end tests (builds + previews the app, starts `api`) |
| `bun run api`       | Run the backend in watch mode                                         |
| `bun run dev:all`   | Frontend + backend together                                           |

Backend (`api/`): `bun run dev`, `bun run build`, `bun run start`, `bun run test`,
`bun run lint`, `bun run format`.

### Testing

- **Unit (frontend):** `bunx vitest run` — pure chess core, game model, formatting
  helpers, the WebSocket manager and the game modes (with fake engine/socket).
- **Unit (backend):** `cd api && bunx vitest run` — `GameRoom` (moves, clocks,
  reconnects, draw offers, rematch), the clock/outcome modules, env validation, the
  rate limiter, the room sweep and the inbound message validator.
- **End-to-end:** `bun run test:e2e`. The Playwright config builds and previews the
  frontend and starts the API on :3000, so `VITE_API_URL`/`VITE_API_WS_URL` must point
  at `http://localhost:3000` / `ws://localhost:3000` (copy `.env.example` to `.env`).
  Install a browser once with `bunx playwright install chromium`.

## Deployment

Stalemates ships as **two separate deployment targets** that must be deployed independently.

### Two-Target Split

| Target   | Code                    | Host                                             | How              |
| -------- | ----------------------- | ------------------------------------------------ | ---------------- |
| Frontend | repo root (SvelteKit)   | Vercel                                           | `adapter-vercel` |
| Backend  | `api/` (Express + `ws`) | A stateful host such as [Fly.io](https://fly.io) | `api/Dockerfile` |

The frontend is a stateless SvelteKit app and deploys cleanly to Vercel's serverless platform. The backend is a long-lived, single-instance Express + WebSocket server and must run on a host that keeps a persistent process alive.

### Why the Backend Can't Be Serverless

The backend stores active game rooms in an **in-memory `Map`** inside a single long-lived process. Serverless platforms (including Vercel) spin up short-lived, horizontally-scaled instances with no shared memory and no persistent WebSocket connections, so game state would be lost or split across instances. The backend therefore runs as **exactly one always-on instance**. The provided `api/fly.toml` enforces this with `auto_stop_machines = false` and `min_machines_running = 1`.

### Environment Variables

**Frontend (Vercel project env):**

- `VITE_API_URL` — HTTPS base URL of the deployed backend (e.g. `https://stalemates-api.fly.dev`)
- `VITE_API_WS_URL` — WebSocket base URL of the deployed backend (e.g. `wss://stalemates-api.fly.dev`)

**Backend (Fly secrets / container env):**

- `ORIGIN` — the deployed frontend origin, used for CORS (e.g. `https://stalemates.magedfaiz.xyz`)
- `PORT` — port the server listens on (defaults to `3000`)
- `ROOM_TTL_MS` — how long an empty room is kept before the sweep reaps it (ms,
  default `1800000` = 30 min). Disconnected players can rejoin until then.

### Deploying the Frontend (Vercel)

Connect the repository to a Vercel project, set `VITE_API_URL` and `VITE_API_WS_URL` in the project's environment variables, and deploy. `adapter-vercel` handles the build.

### Deploying the Backend (Fly.io / Docker)

The backend deploys from `api/Dockerfile` (multi-stage: `tsc` build, production-only runtime). A `HEALTHCHECK` hitting `/health` is built in.

Using Fly.io (config in `api/fly.toml`, app name `stalemates-api`):

```bash
cd api
fly launch --copy-config --no-deploy   # first time only; reuses fly.toml
fly secrets set ORIGIN=https://stalemates.magedfaiz.xyz
fly deploy
```

Or build and run the container directly with Docker:

```bash
cd api
docker build -t stalemates-api .
docker run -p 3000:3000 \
  -e ORIGIN=https://stalemates.magedfaiz.xyz \
  -e PORT=3000 \
  stalemates-api
```

The health endpoint is available at `GET /health` and returns `{ "status": "ok", "rooms": <count> }`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the GNU General Public License v3.0 (GPL-3.0). This license has been chosen to comply with the licensing requirements of some of our key dependencies:

- chess.js is licensed under the BSD 2-Clause license.
- Chessground is licensed under the GPL-3.0 license.

As per the requirements of the GPL-3.0 license:

1. The source code of this project must be made available when distributing the software.
2. Modifications of this project must be released under the same license.
3. Changes made to the code must be documented.

For the full license text, please see the [LICENSE](LICENSE) file in this repository.

### Third-Party Licenses

This project incorporates third-party software. The licenses for these are included in their respective repositories:

- chess.js: [BSD 2-Clause License](https://github.com/jhlywa/chess.js/blob/master/LICENSE)
- Chessground: [GPL-3.0 License](https://github.com/lichess-org/chessground/blob/master/LICENSE)
- Stockfish (shipped as `static/stockfish.js`, an Emscripten build of the engine):
  [GPL-3.0 License](https://github.com/official-stockfish/Stockfish/blob/master/Copying.txt).
  Its source is available from the [Stockfish project](https://github.com/official-stockfish/Stockfish)
  and the [stockfish.js port](https://github.com/nmrugg/stockfish.js).

Please make sure to comply with all license terms when using or modifying this software.
