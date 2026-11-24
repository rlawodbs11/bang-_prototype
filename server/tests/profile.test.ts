import { describe, expect, it, vi } from 'vitest';
import { GameError, GameRoom } from '../src/game/GameRoom.js';
import { toClientView } from '../src/game/view.js';

const VALID_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAA==';

describe('Profile avatar validation and propagation', () => {
  it('stores valid PNG/JPEG avatars and exposes them in LobbyView and ClientGameView', () => {
    const room = new GameRoom('AVT1', vi.fn(), 20000);
    room.addPlayer('p1', 'Alice', VALID_PNG);
    room.addPlayer('p2', 'Bob', null);
    room.addPlayer('p3', 'Carol');
    room.addPlayer('p4', 'Dave');

    const lobby = room.toLobbyView();
    expect(lobby.players.find((p) => p.id === 'p1')?.avatar).toBe(VALID_PNG);
    expect(lobby.players.find((p) => p.id === 'p2')?.avatar).toBeNull();

    // Update avatar in lobby
    room.updateAvatar('p2', VALID_JPEG);
    expect(room.toLobbyView().players.find((p) => p.id === 'p2')?.avatar).toBe(
      VALID_JPEG
    );

    // Clear avatar
    room.updateAvatar('p2', null);
    expect(room.toLobbyView().players.find((p) => p.id === 'p2')?.avatar).toBeNull();

    room.start('p1');
    const view = toClientView(room.state, 'p2');
    expect(view.players.find((p) => p.id === 'p1')?.avatar).toBe(VALID_PNG);
    expect(view.myInfo.avatar).toBeNull();
  });

  it('rejects SVG data URLs, non-image schemes, and oversized avatars', () => {
    const room = new GameRoom('AVT2', vi.fn(), 20000);
    const svg = 'data:image/svg+xml;base64,PHN2Zy8+';
    expect(() => room.addPlayer('p1', 'Alice', svg)).toThrow(GameError);

    room.addPlayer('p1', 'Alice', VALID_PNG);
    expect(() =>
      room.updateAvatar('p1', 'https://example.com/evil.png')
    ).toThrow(GameError);

    const huge = `data:image/jpeg;base64,${'A'.repeat(33000)}`;
    expect(() => room.updateAvatar('p1', huge)).toThrow(GameError);
  });
});
