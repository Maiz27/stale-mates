# Statemates API: Backend for the Chess Platform

This is the backend API for Statemates, a full-stack chess platform. It handles game logic, real-time communication, and serves as the server-side component of the Statemates project.

## Table of Contents

- [Statemates API: Backend for the Chess Platform](#statemates-api-backend-for-the-chess-platform)
  - [Table of Contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Features](#features)
  - [Tech Stack](#tech-stack)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
  - [API Overview](#api-overview)
  - [API Endpoints](#api-endpoints)
  - [WebSocket Events](#websocket-events)
  - [Contributing](#contributing)
  - [License](#license)

## Introduction

The Statemates API provides the backend functionality for the Statemates chess platform. It manages game states, handles player moves, and facilitates real-time communication between players.

## Features

- RESTful API for game management
- WebSocket support for real-time gameplay
- Game state management using chess.js
- Player authentication and session handling
- Time control for chess games

## Tech Stack

- Node.js
- Express.js
- WebSocket (ws)
- chess.js for chess logic
- TypeScript for type-safe development
- dotenv for environment variable management

## Getting Started

Follow these instructions to set up the Statemates API on your local machine for development and testing purposes.

### Prerequisites

- Node.js (v14 or later)
- npm or Bun

### Installation

1. Clone the repository (if you haven't already):

   ```bash
   git clone https://github.com/Maiz27/statemates.git
   cd statemates/api
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

   Or with Bun:

   ```bash
   bun install
   ```

3. Set up environment variables:

   - Copy `.env.example` to `.env`
   - Update the variables in `.env` as needed

4. Start the development server:
   ```bash
   npm run dev
   ```
   Or with Bun:
   ```bash
   bun run dev
   ```

## API Overview

The Statemates API is built around the concept of game rooms, managed by the `GameRoom` class. Here's a high-level overview of how it works:

1. **Game Creation**: When a new game is created, a `GameRoom` instance is instantiated. This class manages the game state, players, and time control.

2. **Player Management**: The `GameRoom` class handles player connections, disconnections, and reconnections. It supports two players per game, identified by their color (white or black).

3. **Game State**: The game state is managed using chess.js, which handles the chess logic, move validation, and game status checks.

4. **Time Control**: Time control is handled within the `GameRoom` class, managing player time remaining and increments.

5. **WebSocket Communication**: Real-time updates are sent to players using WebSocket connections. This includes move updates, game status changes, and time updates.

6. **Move Handling**: When a player makes a move, it's validated by the `GameRoom` class, updated in the game state, and broadcasted to both players.

7. **Game Termination**: The `GameRoom` class also manages game end conditions, such as checkmate, stalemate, or time-out scenarios.

This architecture allows for efficient management of multiple concurrent games, each isolated in its own room with real-time communication capabilities.

## API Endpoints

- `POST /game/create`: Create a new game
- `POST /game/join`: Join an existing game

## WebSocket Events

The API uses the following WebSocket events for real-time communication:

Incoming events (from client to server):

- `move`: Handle a player's move
- `offerRematch`: Offer a rematch to the opponent
- `acceptRematch`: Accept a rematch offer
- `gameOver`: Notify the server about game over (e.g., due to timeout)

Outgoing events (from server to client):

- `connected`: Confirm successful connection and provide player ID
- `opponentMove`: Notify about opponent's move
- `opponentJoined`: Notify when an opponent joins the game
- `opponentReconnected`: Notify when an opponent reconnects
- `gameStart`: Notify about game start with initial state
- `gameOver`: Notify about game end with result
- `gameState`: Provide current game state (used for reconnection)
- `rematchOffer`: Notify about a rematch offer
- `rematchAccepted`: Notify that a rematch has been accepted

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the GNU General Public License v3.0 (GPL-3.0). For more details, see the [LICENSE](../LICENSE) file in the root directory of this repository.
