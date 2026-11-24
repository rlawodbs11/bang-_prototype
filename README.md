# BANG! 온라인 (Phase 1 MVP)

서부 총격 보드게임 BANG!의 웹 멀티플레이어 클론 (Phase 1 MVP)입니다.

## 요구 사항
- Node.js (v20 이상 권장) & npm

## 설치 및 실행

```bash
npm install
npm run dev
```

- 서버: `http://localhost:3001`
- 클라이언트: `http://localhost:5173`

## 로컬 멀티플레이 테스트 방법
1. 브라우저에서 `http://localhost:5173`을 4~7개의 탭으로 엽니다. (각 탭은 `sessionStorage`를 사용하므로 탭마다 별도 플레이어로 동작합니다.)
2. 첫 번째 탭에서 닉네임을 입력하고 **방 만들기**를 클릭합니다.
3. 나머지 탭에서 방 코드를 입력하고 **참가**를 클릭합니다.
4. 4~7명이 모이면 방장이 **게임 시작**을 눌러 플레이합니다.

## 친구들과 원격 플레이 (Cloudflare Quick Tunnel)
다른 네트워크에 있는 친구들과 플레이하려면 `cloudflared`를 한 번 설치한 뒤 `npm run share`로 임시 공개 URL을 발급할 수 있습니다.

1. `cloudflared` 설치 (최초 1회):
   ```bash
   brew install cloudflared
   ```
2. 빌드 + 서버 + 터널 동시 실행 (Mac 잠자기 방지 권장):
   ```bash
   caffeinate -i npm run share
   ```
3. 터미널에 출력되는 `https://xxxx.trycloudflare.com` 주소를 친구들에게 공유합니다.
4. 방장이 방을 만들고 4자리 방 코드를 친구들에게 알려준 뒤 4~7명이 모이면 게임을 시작합니다.

- **로컬 단일 포트 실행**: `npm run start` 후 `http://localhost:3001` 접속
- **주의사항**:
  - 호스트 Mac이 켜져 있고 터미널(`npm run share`)이 실행 중일 때만 접속됩니다. (종료: `Ctrl+C`)
  - `npm run share`를 실행할 때마다 `trycloudflare.com` 공개 주소가 새로 발급됩니다.
  - 게임 중 연결이 잠시 끊기더라도 같은 브라우저 탭에서 새로고침하면 기존 방과 자리로 자동 재접속됩니다.

## 검증 명령어

```bash
npm run typecheck
npm test
npm run smoke -w server
npm run build
```

## Phase 1 구현 범위
- 로비 (4~7인 방 생성/참가/재접속/시작)
- 직업 배정 (보안관, 부관, 무법자, 배신자) 및 엄격한 정보 은닉 필터 (`ClientGameView`)
- 생존자 기준 원형 거리 계산 및 무기 사거리 시스템
- 핵심 카드 5종: `BANG`, `MISSED`, `BEER`, `STAGECOACH`, `WEAPON_VOLCANIC`, `WEAPON_SCHOFIELD`
- 인터럽트 상태 머신 (`WAITING_FOR_RESPONSE`, 20초 응답 타임아웃)
- 사망 처리 (BEER 자동 구명, 무법자 처치 보상 3장, 보안관의 부관 처치 페널티) 및 승리 조건 판정

## Phase 2 구현 범위
- 원작 무늬·숫자 배치를 반영한 62장 덱 (`deck.ts`)
- 무기 3종 추가: `WEAPON_REMINGTON`(사거리 3), `WEAPON_CARABINE`(사거리 4), `WEAPON_WINCHESTER`(사거리 5)
- 파란 장비 카드 5종: `BARREL`(술통), `MUSTANG`(야생마), `SCOPE`(조준경), `JAIL`(감옥), `DYNAMITE`(다이너마이트)
- 판정(draw!) 시스템 및 `CheckResult` 배너 UI, 다중 피해 시 `BEER` 연속 자동 구명 지원

## Phase 3-A 구현 범위 (캐릭터 16종)
- 원작 기본판 캐릭터 16명 전원 구현 (`BART_CASSIDY`, `BLACK_JACK`, `CALAMITY_JANET`, `EL_GRINGO`, `JESSE_JONES`, `JOURDONNAIS`, `KIT_CARLSON`, `LUCKY_DUKE`, `PAUL_REGRET`, `PEDRO_RAMIREZ`, `ROSE_DOOLAN`, `SID_KETCHUM`, `SLAB_THE_KILLER`, `SUZY_LAFAYETTE`, `VULTURE_SAM`, `WILLY_THE_KID`)
- 캐릭터별 고유 체력(3 또는 4, 보안관 +1) 및 패시브/액티브 능력 UI(킷 칼슨 3택2, 페드로/제시 특수 드로우, 시드 케첨 회복, 캘러미티 자넷 카드 호환 등) 지원
