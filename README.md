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

- Node.js (v18.18.0 or later)
- Bun

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

The `package.json` includes several scripts for common tasks:

```json
{
	"scripts": {
		"dev": "vite dev",
		"build": "vite build",
		"preview": "vite preview",
		"check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
		"check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
		"test:integration": "playwright test",
		"test:unit": "vitest",
		"lint": "prettier --check . && eslint .",
		"format": "prettier --write .",
		"api": "cd api && bun run dev",
		"api:build": "cd api && bun run build",
		"dev:all": "concurrently \"bun run dev\" \"bun run api\""
	}
}
```

- `dev`: Runs the SvelteKit development server.
- `build`: Builds the application for production.
- `preview`: Previews the production build locally.
- `check`: Runs type checking and syncs SvelteKit files.
- `lint`: Runs Prettier and ESLint to check code style.
- `format`: Formats code using Prettier.
- `api`: Runs the Express.js API development server.
- `api:build`: Builds the API for production.
- `dev:all`: Runs both the frontend and backend concurrently for development.

To run both the frontend and backend concurrently:

```bash
bun run dev:all
```

## Deployment

Stalemates ships as **two separate deployment targets** that must be deployed independently.

### Two-Target Split

| Target | Code | Host | How |
| --- | --- | --- | --- |
| Frontend | repo root (SvelteKit) | Vercel | `adapter-vercel` |
| Backend | `api/` (Express + `ws`) | A stateful host such as [Fly.io](https://fly.io) | `api/Dockerfile` |

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

Please make sure to comply with all license terms when using or modifying this software.
