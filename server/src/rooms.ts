import { GameError, GameRoom } from './game/GameRoom.js';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();

  public generateRoomId(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    throw new GameError('사용 가능한 방 코드를 생성할 수 없습니다.');
  }

  public createRoom(onChange: (room: GameRoom) => void, responseTimeoutMs?: number): GameRoom {
    const roomId = this.generateRoomId();
    const room = new GameRoom(
      roomId,
      () => onChange(room),
      responseTimeoutMs
    );
    this.rooms.set(roomId, room);
    return room;
  }

  public getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId.trim().toUpperCase());
  }

  public deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.dispose();
      this.rooms.delete(roomId);
    }
  }

  public clearAll(): void {
    for (const room of this.rooms.values()) {
      room.dispose();
    }
    this.rooms.clear();
  }
}
