# Statemates: A Full-Stack Chess Platform

Welcome to Statemates, a full-stack chess platform built with SvelteKit, Express.js, WebSockets, and the Stockfish engine. This project showcases real-time multiplayer gameplay and adjustable AI difficulty.

## Table of Contents

- [Statemates: A Full-Stack Chess Platform](#statemates-a-full-stack-chess-platform)
  - [Table of Contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Features](#features)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
  - [Scripts](#scripts)
  - [Contributing](#contributing)
  - [License](#license)
    - [Third-Party Licenses](#third-party-licenses)

## Introduction

Statemates is a chess platform that demonstrates the power of modern web technologies in creating interactive, real-time applications. You can read a detailed breakdown of the project's development journey in our [blog post](link-to-your-blog-post).

This project was born out of a passion for chess and a desire to explore the capabilities of SvelteKit and WebSocket technology in creating a seamless gaming experience.

## Features

- **SvelteKit Frontend**: Utilizing the latest features for a responsive and efficient UI.
- **Express.js Backend**: Robust server-side logic for game management.
- **WebSockets**: Enabling real-time multiplayer gameplay.
- **Stockfish.js Integration**: Providing a challenging AI opponent with adjustable difficulty.
- **chess.js**: Handling game logic and move validation.
- **Customizable UI**: Built with Tailwind CSS for easy styling.
- **Hint System**: Get assistance during gameplay.
- **Take-back Moves**: Undo moves in AI games for learning and practice.

## Getting Started

Follow these instructions to get Statemates up and running on your local machine for development and testing purposes.

### Prerequisites

- Node.js (v14 or later)
- npm or Bun

### Installation

1. **Clone the repository:**

   ```
   git clone https://github.com/your-username/statemates.git
   cd statemates
   ```

2. **Install dependencies:**

   ```
   npm install
   # or with Bun
   bun install
   ```

3. **Set up environment variables:**

   - Copy `.env.example` to `.env` in the root directory
   - Copy `api/.env.example` to `api/.env`

4. **Install API dependencies:**
   ```
   cd api
   npm install
   # or with Bun
   bun install
   ```

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
		"api": "cd api && npm run dev",
		"api:build": "cd api && npm run build",
		"dev:all": "concurrently \"npm run dev\" \"npm run api\""
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

```
npm run dev:all
# or with Bun
bun run dev:all
```

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
