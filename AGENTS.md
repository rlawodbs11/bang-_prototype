# Project: Online Card Game (BANG! Clone)

## Tech Stack
- **Monorepo**: `shared/` (TypeScript interfaces), `server/` (Node.js + Socket.io), `client/` (React + Vite + Tailwind CSS)
- **State Management**: Server-authoritative in-memory state (No DB required for MVP).

## Critical Architecture Rules
1. **Strict Information Hiding (Security)**:
   - NEVER broadcast the raw `ServerGameState` to clients.
   - Before emitting `game_state_update`, filter the state per `socket.id` into `ClientGameView`.
   - Hide other players' `role` (unless `role === 'SHERIFF'` or player is dead) and `hand` (send only `handCount`).
2. **Interrupt / Pending Action State Machine**:
   - When a card requires another player's reaction (e.g., `BANG!`, `DUEL`, `INDIANS`), transition `turnPhase` to `WAITING_FOR_RESPONSE` and populate `pendingAction`.
   - Block normal turn actions until `pendingAction` is resolved or timed out.
3. **Circular Distance Calculation**:
   - Compute seat distance only among `isAlive === true` players: `min(|i - j|, aliveCount - |i - j|)`.
   - Apply equipment modifiers (`MUSTANG`: +1 distance from others, `SCOPE`: -1 distance to others).

## Development Phases
- **Phase 1 (MVP)**: Lobby (4~7 players), Role assignment, Turn loop with 5 core cards (`BANG`, `MISSED`, `BEER`, `STAGECOACH`, `VOLCANIC/SCHOFIELD`).
- **Phase 2**: Blue equipment cards (`BARREL`, `MUSTANG`, `SCOPE`, `JAIL`, `DYNAMITE`).
- **Phase 3**: Multi-target & interrupt cards (`INDIANS`, `GATLING`, `DUEL`, `GENERAL_STORE`, `PANIC`, `CAT_BALOU`) + Character passives.

