import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, CharacterId, ClientGameView, PublicPlayer } from '@bang/shared';
import {
  calculateDistance,
  CARD_META,
  CHARACTER_META,
  CHECK_REASON_LABELS,
  isTargetCard,
  PHASE_LABELS,
  ROLE_META,
  SUIT_SYMBOL,
} from '../utils/gameHelpers';
import { isSoundEnabled, playSound, setSoundEnabled } from '../utils/sound';
import { PlayerSeat, type SeatEffectItem } from './PlayerSeat';
import { Hand } from './Hand';
import { CharacterDetailModal, GuideModal } from './InfoModals';
import { Avatar } from './Avatar';

interface GameProps {
  view: ClientGameView;
  onDraw: () => void;
  onPlayCard: (cardId: string, targetPlayerId?: string) => void;
  onRespond: (cardId: string | null) => void;
  onEndTurn: () => void;
  onDiscardCards: (cardIds: string[]) => void;
  onSpecialDraw: (mode: 'DISCARD' | 'PLAYER', targetPlayerId?: string) => void;
  onPickKitCards: (cardIds: string[]) => void;
  onUseAbility: (type: 'SID_HEAL', cardIds: string[]) => void;
  onLeaveRoom: () => void;
}

interface Projectile {
  id: number;
  fromId: string;
  toId: string;
}

const WINNER_LABELS: Record<NonNullable<ClientGameView['winner']>, string> = {
  SHERIFF_TEAM: '보안관 & 부관 팀 승리!',
  OUTLAW_TEAM: '무법자 팀 승리!',
  RENEGADE: '배신자 단독 승리!',
};

export function Game({
  view,
  onDraw,
  onPlayCard,
  onRespond,
  onEndTurn,
  onDiscardCards,
  onSpecialDraw,
  onPickKitCards,
  onUseAbility,
  onLeaveRoom,
}: GameProps) {
  const [selectedTargetCard, setSelectedTargetCard] = useState<Card | null>(null);
  const [selectedDiscardIds, setSelectedDiscardIds] = useState<string[]>([]);
  const [selectedKitIds, setSelectedKitIds] = useState<string[]>([]);
  const [isJesseMode, setIsJesseMode] = useState(false);
  const [isSidHealMode, setIsSidHealMode] = useState(false);
  const [selectedAbilityIds, setSelectedAbilityIds] = useState<string[]>([]);
  const [visibleCheckSeq, setVisibleCheckSeq] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showMobileLogs, setShowMobileLogs] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  const [seatEffects, setSeatEffects] = useState<Record<string, SeatEffectItem[]>>({});
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [showHitVignette, setShowHitVignette] = useState(false);
  const [showTurnBanner, setShowTurnBanner] = useState(false);
  const [deathBannerText, setDeathBannerText] = useState<string | null>(null);

  const lastSeenEffectSeqRef = useRef(0);
  const prevTurnIdRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const scheduleTimer = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  };

  const isMyTurn =
    view.status === 'PLAYING' && view.currentTurnPlayerId === view.myInfo.id;
  const isDrawPhase = isMyTurn && view.turnPhase === 'DRAW';
  const canAct =
    isMyTurn && view.turnPhase === 'ACTION' && view.pendingAction === null;
  const isDiscardMode = isMyTurn && view.turnPhase === 'DISCARD';
  const excessCount = Math.max(0, view.myInfo.hand.length - view.myInfo.hp);
  const myChar = view.myInfo.character;
  const myCharMeta = myChar ? CHARACTER_META[myChar] : null;
  const kitChoices = view.myInfo.kitChoices ?? null;

  useEffect(() => {
    if (!canAct) {
      setSelectedTargetCard(null);
      setIsSidHealMode(false);
      setSelectedAbilityIds([]);
    }
    if (!isDrawPhase || Boolean(kitChoices)) {
      setIsJesseMode(false);
    }
    if (!isDiscardMode) {
      setSelectedDiscardIds([]);
    }
    if (!kitChoices) {
      setSelectedKitIds([]);
    }
  }, [canAct, isDrawPhase, isDiscardMode, kitChoices]);

  useEffect(() => {
    if (
      selectedTargetCard &&
      !view.myInfo.hand.some((c) => c.id === selectedTargetCard.id)
    ) {
      setSelectedTargetCard(null);
    }
  }, [view.myInfo.hand, selectedTargetCard]);

  useEffect(() => {
    const seq = view.lastCheck?.seq;
    if (!seq) return;
    setVisibleCheckSeq(seq);
    scheduleTimer(() => {
      setVisibleCheckSeq((cur) => (cur === seq ? null : cur));
    }, 6000);
  }, [view.lastCheck?.seq]);

  useEffect(() => {
    if (!view.pendingAction?.responseDeadline) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [view.pendingAction?.responseDeadline]);

  // Turn transition banner + sound
  useEffect(() => {
    if (view.status !== 'PLAYING') {
      prevTurnIdRef.current = null;
      return;
    }
    if (
      prevTurnIdRef.current !== null &&
      prevTurnIdRef.current !== view.currentTurnPlayerId &&
      view.currentTurnPlayerId === view.myInfo.id
    ) {
      setShowTurnBanner(true);
      playSound('TURN');
      scheduleTimer(() => setShowTurnBanner(false), 1600);
    }
    prevTurnIdRef.current = view.currentTurnPlayerId;
  }, [view.currentTurnPlayerId, view.myInfo.id, view.status]);

  // Process newly emitted visual effects
  useEffect(() => {
    const effects = view.effects;
    if (!effects || effects.length === 0) return;

    const unseen = effects.filter((e) => e.seq > lastSeenEffectSeqRef.current);
    if (unseen.length === 0) return;

    lastSeenEffectSeqRef.current = unseen[unseen.length - 1].seq;

    for (const ef of unseen) {
      if (ef.type === 'BANG') {
        playSound('BANG');
        if (ef.sourcePlayerId && ef.targetPlayerId) {
          const projId = ef.seq;
          setProjectiles((prev) => [
            ...prev,
            { id: projId, fromId: ef.sourcePlayerId!, toId: ef.targetPlayerId! },
          ]);
          scheduleTimer(() => {
            setProjectiles((prev) => prev.filter((p) => p.id !== projId));
          }, 450);
        }
        continue;
      }

      if (ef.type === 'HIT') {
        playSound('HIT');
        if (ef.targetPlayerId === view.myInfo.id) {
          setShowHitVignette(true);
          scheduleTimer(() => setShowHitVignette(false), 550);
        }
      } else if (ef.type === 'DYNAMITE_BOOM') {
        playSound('BOOM');
        if (ef.targetPlayerId === view.myInfo.id) {
          setShowHitVignette(true);
          scheduleTimer(() => setShowHitVignette(false), 550);
        }
      } else if (ef.type === 'HEAL') {
        playSound('HEAL');
      } else if (ef.type === 'MISSED') {
        playSound('MISSED');
      } else if (ef.type === 'DEATH') {
        playSound('DEATH');
        const dead = view.players.find((p) => p.id === ef.targetPlayerId);
        if (dead) {
          setDeathBannerText(`💀 ${dead.nickname}님이 사망했습니다!`);
          scheduleTimer(() => setDeathBannerText(null), 2000);
        }
      } else if (ef.type === 'DRAW' && ef.targetPlayerId === view.myInfo.id) {
        playSound('DRAW');
      }

      if (ef.targetPlayerId) {
        const targetId = ef.targetPlayerId;
        const item: SeatEffectItem = {
          id: ef.seq,
          type: ef.type,
          amount: ef.amount,
          label: ef.label,
        };
        setSeatEffects((prev) => ({
          ...prev,
          [targetId]: [...(prev[targetId] ?? []), item],
        }));
        scheduleTimer(() => {
          setSeatEffects((prev) => {
            const list = (prev[targetId] ?? []).filter((x) => x.id !== ef.seq);
            return { ...prev, [targetId]: list };
          });
        }, 1200);
      }
    }
  }, [view.effects, view.myInfo.id, view.players]);

  const sortedPlayers = useMemo(
    () => [...view.players].sort((a, b) => a.seatIndex - b.seatIndex),
    [view.players]
  );

  const mySortedIndex = sortedPlayers.findIndex((p) => p.id === view.myInfo.id);

  const seatLayout = useMemo(() => {
    const n = sortedPlayers.length;
    const rx = n >= 6 ? 39 : 37;
    const ry = 36;
    const coords = new Map<string, { x: number; y: number }>();
    sortedPlayers.forEach((p, idx) => {
      const offset = mySortedIndex >= 0 ? (idx - mySortedIndex + n) % n : idx;
      const angle = Math.PI / 2 + (2 * Math.PI * offset) / n;
      coords.set(p.id, {
        x: 50 + rx * Math.cos(angle),
        y: 50 + ry * Math.sin(angle),
      });
    });
    return coords;
  }, [sortedPlayers, mySortedIndex]);

  const opponents = useMemo(
    () => sortedPlayers.filter((p) => p.id !== view.myInfo.id),
    [sortedPlayers, view.myInfo.id]
  );

  const activeCharacters = useMemo(
    () =>
      sortedPlayers
        .map((p) => p.character)
        .filter((c): c is CharacterId => Boolean(c)),
    [sortedPlayers]
  );

  const currentTurnPlayer = view.players.find(
    (p) => p.id === view.currentTurnPlayerId
  );

  const myRoleInfo = ROLE_META[view.myInfo.role];

  const pending = view.pendingAction;
  const pendingSource = pending
    ? view.players.find((p) => p.id === pending.sourcePlayerId)
    : undefined;
  const pendingTarget = pending
    ? view.players.find((p) => p.id === pending.targetPlayerId)
    : undefined;
  const remainingSeconds = pending?.responseDeadline
    ? Math.max(0, Math.ceil((pending.responseDeadline - now) / 1000))
    : null;

  const missedCard = view.myInfo.hand.find((c) => c.type === 'MISSED');
  const calamityBangCard =
    myChar === 'CALAMITY_JANET'
      ? view.myInfo.hand.find((c) => c.type === 'BANG')
      : undefined;

  const hasHandTarget = view.players.some(
    (p) => p.isAlive && p.id !== view.myInfo.id && p.handCount > 0
  );

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const handleCardClick = (card: Card) => {
    if (isDiscardMode) {
      setSelectedDiscardIds((prev) =>
        prev.includes(card.id)
          ? prev.filter((id) => id !== card.id)
          : prev.length < excessCount
            ? [...prev, card.id]
            : prev
      );
      return;
    }

    if (isSidHealMode) {
      setSelectedAbilityIds((prev) =>
        prev.includes(card.id)
          ? prev.filter((id) => id !== card.id)
          : prev.length < 2
            ? [...prev, card.id]
            : prev
      );
      return;
    }

    if (!canAct) return;

    const isBangCard =
      card.type === 'BANG' ||
      (card.type === 'MISSED' && myChar === 'CALAMITY_JANET');

    if (isBangCard || isTargetCard(card.type)) {
      setSelectedTargetCard((prev) => (prev?.id === card.id ? null : card));
      return;
    }

    if (card.type === 'MISSED') return;

    setSelectedTargetCard(null);
    onPlayCard(card.id);
  };

  const handleSelectTarget = (targetPlayerId: string) => {
    if (isJesseMode) {
      onSpecialDraw('PLAYER', targetPlayerId);
      setIsJesseMode(false);
      return;
    }
    if (!selectedTargetCard) return;
    onPlayCard(selectedTargetCard.id, targetPlayerId);
    setSelectedTargetCard(null);
  };

  const canTargetPlayer = (player: PublicPlayer, dist: number): boolean => {
    if (!player.isAlive || player.id === view.myInfo.id) {
      return false;
    }
    if (isJesseMode) {
      return player.handCount > 0;
    }
    if (!selectedTargetCard) return false;
    if (
      selectedTargetCard.type === 'BANG' ||
      (selectedTargetCard.type === 'MISSED' && myChar === 'CALAMITY_JANET')
    ) {
      return dist <= view.myInfo.weaponRange;
    }
    if (selectedTargetCard.type === 'JAIL') {
      return (
        player.role !== 'SHERIFF' &&
        !player.equipped.some((c) => c.type === 'JAIL')
      );
    }
    return false;
  };

  const handleConfirmDiscard = () => {
    if (selectedDiscardIds.length !== excessCount) return;
    onDiscardCards(selectedDiscardIds);
    setSelectedDiscardIds([]);
  };

  const handleConfirmSidHeal = () => {
    if (selectedAbilityIds.length !== 2) return;
    onUseAbility('SID_HEAL', selectedAbilityIds);
    setIsSidHealMode(false);
    setSelectedAbilityIds([]);
  };

  const handleToggleKitCard = (cardId: string) => {
    setSelectedKitIds((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : prev.length < 2
          ? [...prev, cardId]
          : prev
    );
  };

  const checkBanner =
    view.lastCheck && visibleCheckSeq === view.lastCheck.seq ? (() => {
      const lc = view.lastCheck;
      const checker = view.players.find((p) => p.id === lc.playerId);
      const cardText = lc.card
        ? `${SUIT_SYMBOL[lc.card.suit].symbol}${lc.card.rank} ${CARD_META[lc.card.type].name}`
        : '카드 없음';
      return (
        <div
          key={lc.seq}
          className={`max-w-xs rounded-lg border px-2.5 py-1 text-[11px] font-semibold shadow-md text-center animate-bang-card-pop ${
            lc.success
              ? 'border-emerald-500/60 bg-emerald-950/90 text-emerald-200'
              : 'border-rose-500/60 bg-rose-950/90 text-rose-200'
          }`}
        >
          🎲 {checker?.nickname ?? '플레이어'} {CHECK_REASON_LABELS[lc.reason]} 판정:{' '}
          {cardText} → {lc.success ? '성공' : '실패'}
        </div>
      );
    })() : null;

  return (
    <div className="min-h-screen flex flex-col bg-stone-950 text-stone-100">
      {/* Hit Red Vignette */}
      {showHitVignette && (
        <div className="pointer-events-none fixed inset-0 z-40 animate-bang-vignette shadow-[inset_0_0_95px_32px_rgba(225,29,72,0.6)]" />
      )}

      {/* Turn / Death Banners */}
      {showTurnBanner && (
        <div className="pointer-events-none fixed top-16 left-1/2 z-40 rounded-full border border-amber-400/70 bg-amber-950/95 px-5 py-2 text-sm font-black text-amber-200 shadow-2xl animate-bang-turn-banner">
          🤠 내 턴입니다!
        </div>
      )}
      {deathBannerText && (
        <div className="pointer-events-none fixed top-28 left-1/2 z-40 rounded-full border border-rose-500/70 bg-stone-950/95 px-5 py-2 text-sm font-black text-rose-300 shadow-2xl animate-bang-turn-banner">
          {deathBannerText}
        </div>
      )}

      {/* Top Bar */}
      <header className="border-b border-stone-800 bg-stone-900/95 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
          <span className="font-black text-lg sm:text-xl tracking-wider text-amber-400">
            BANG!
          </span>
          <span className="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-[11px] text-stone-300">
            {view.roomId}
          </span>
          <span
            className={`rounded border px-1.5 sm:px-2 py-0.5 text-[11px] sm:text-xs font-semibold ${myRoleInfo.badgeClass}`}
          >
            {myRoleInfo.name}
          </span>
          {myCharMeta && (
            <button
              type="button"
              onClick={() => setInspectedPlayerId(view.myInfo.id)}
              className="rounded border border-amber-500/40 bg-amber-950/40 px-2 py-0.5 text-[11px] sm:text-xs font-semibold text-amber-200 hover:bg-amber-900/50 cursor-pointer"
            >
              ★ {myCharMeta.name} ⓘ
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="hidden sm:inline text-xs text-stone-300 mr-1">
            턴:{' '}
            <strong className="text-amber-300">
              {currentTurnPlayer?.nickname ?? '-'}
            </strong>{' '}
            · {PHASE_LABELS[view.turnPhase]}
          </span>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="rounded-lg border border-amber-600/40 bg-stone-800 px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-stone-700 cursor-pointer"
          >
            ? 도감
          </button>
          <button
            type="button"
            onClick={toggleSound}
            title={soundOn ? '효과음 끄기' : '효과음 켜기'}
            className="rounded-lg border border-stone-700 bg-stone-800 px-2 py-1 text-xs text-stone-200 hover:bg-stone-700 cursor-pointer"
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button
            type="button"
            onClick={() => setShowMobileLogs(true)}
            className="lg:hidden rounded-lg border border-stone-700 bg-stone-800 px-2 py-1 text-xs text-stone-200 hover:bg-stone-700 cursor-pointer"
          >
            📜 로그
          </button>
          <button
            type="button"
            onClick={onLeaveRoom}
            className="rounded-lg border border-stone-700 px-2 py-1 text-xs text-stone-300 hover:bg-stone-800 cursor-pointer"
          >
            나가기
          </button>
        </div>
      </header>

      {/* Character Ability Quick Strip */}
      {myCharMeta && (
        <div className="border-b border-stone-800/80 bg-stone-900/50 px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs text-stone-300 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="text-amber-300">★ {myCharMeta.name}:</strong>{' '}
            {myCharMeta.desc}
          </span>
          <span className="text-stone-400">🎯 {myRoleInfo.goal}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 p-3 sm:p-4 max-w-7xl w-full mx-auto">
        {/* Table + Controls + Hand */}
        <div className="lg:col-span-3 flex flex-col gap-3 sm:gap-4">
          {/* DESKTOP: Circular Table Arena */}
          <div className="hidden md:block relative h-[490px] lg:h-[520px] rounded-2xl border border-amber-900/40 bg-radial from-amber-950/35 via-stone-900/90 to-stone-950 overflow-hidden shadow-inner">
            {/* Projectile SVG Overlay */}
            {projectiles.length > 0 && (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full z-30"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {projectiles.map((proj) => {
                  const from = seatLayout.get(proj.fromId);
                  const to = seatLayout.get(proj.toId);
                  if (!from || !to) return null;
                  return (
                    <g key={proj.id}>
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="#fbbf24"
                        strokeWidth="0.9"
                        strokeLinecap="round"
                        pathLength={100}
                        className="animate-bang-projectile"
                      />
                      <circle cx={to.x} cy={to.y} r="1.8" fill="#f43f5e" opacity="0.85">
                        <animate
                          attributeName="r"
                          from="0.5"
                          to="3.5"
                          dur="0.4s"
                          fill="freeze"
                        />
                        <animate
                          attributeName="opacity"
                          from="0.9"
                          to="0"
                          dur="0.4s"
                          fill="freeze"
                        />
                      </circle>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Center Deck & Discard */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
              <div className="flex items-center gap-3">
                <div className="w-20 h-24 rounded-xl border border-amber-700/50 bg-stone-900/95 flex flex-col items-center justify-center shadow-lg">
                  <span className="text-xl mb-1">🂠</span>
                  <span className="text-[11px] font-semibold text-stone-300">
                    덱
                  </span>
                  <span className="text-xs font-bold text-amber-300">
                    {view.deckCount}장
                  </span>
                </div>

                <div
                  key={view.discardTop?.id ?? 'empty'}
                  className="w-24 h-24 rounded-xl border border-stone-700 bg-stone-900/95 p-2 flex flex-col items-center justify-center text-center shadow-lg animate-bang-card-pop"
                >
                  {view.discardTop ? (
                    <>
                      <span
                        className={`text-xs font-bold ${
                          SUIT_SYMBOL[view.discardTop.suit].isRed
                            ? 'text-rose-400'
                            : 'text-stone-200'
                        }`}
                      >
                        {SUIT_SYMBOL[view.discardTop.suit].symbol}{' '}
                        {view.discardTop.rank}
                      </span>
                      <span className="mt-1 text-xs font-bold text-amber-200">
                        {CARD_META[view.discardTop.type].name}
                      </span>
                      <span className="text-[10px] text-stone-500">
                        버린 더미
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-stone-500">
                      버린 카드 없음
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-full border border-stone-700/80 bg-stone-950/85 px-3 py-1 text-xs font-medium text-stone-200">
                {isMyTurn ? (
                  <span className="text-amber-300 font-bold">
                    내 턴 · {PHASE_LABELS[view.turnPhase]}
                  </span>
                ) : (
                  <span>
                    {currentTurnPlayer?.nickname}님의 {PHASE_LABELS[view.turnPhase]}
                  </span>
                )}
              </div>

              {checkBanner}
            </div>

            {/* Players positioned in circle */}
            {sortedPlayers.map((player) => {
              const pos = seatLayout.get(player.id) ?? { x: 50, y: 50 };
              const dist = calculateDistance(view.players, view.myInfo.id, player.id);
              const isTargetable = canTargetPlayer(player, dist);

              return (
                <div
                  key={player.id}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
                >
                  <PlayerSeat
                    player={player}
                    isMe={player.id === view.myInfo.id}
                    myRole={view.myInfo.role}
                    isCurrentTurn={player.id === view.currentTurnPlayerId}
                    isPendingTarget={pending?.targetPlayerId === player.id}
                    distanceFromMe={dist}
                    targetingActive={Boolean(selectedTargetCard) || isJesseMode}
                    isTargetable={isTargetable}
                    activeEffects={seatEffects[player.id] ?? []}
                    onSelectTarget={handleSelectTarget}
                    onInspectPlayer={(p) => setInspectedPlayerId(p.id)}
                  />
                </div>
              );
            })}
          </div>

          {/* MOBILE: Compact 2-Column Table + Center Bar + My Status */}
          <div className="md:hidden flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              {opponents.map((player) => {
                const dist = calculateDistance(view.players, view.myInfo.id, player.id);
                const isTargetable = canTargetPlayer(player, dist);
                return (
                  <PlayerSeat
                    key={player.id}
                    player={player}
                    isMe={false}
                    myRole={view.myInfo.role}
                    isCurrentTurn={player.id === view.currentTurnPlayerId}
                    isPendingTarget={pending?.targetPlayerId === player.id}
                    distanceFromMe={dist}
                    targetingActive={Boolean(selectedTargetCard) || isJesseMode}
                    isTargetable={isTargetable}
                    compact
                    activeEffects={seatEffects[player.id] ?? []}
                    onSelectTarget={handleSelectTarget}
                    onInspectPlayer={(p) => setInspectedPlayerId(p.id)}
                  />
                );
              })}
            </div>

            {/* Mobile Center Strip */}
            <div className="rounded-xl border border-amber-900/40 bg-stone-900/80 p-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-stone-800 px-2 py-1 text-amber-300 font-bold">
                  🂠 덱 {view.deckCount}
                </span>
                {view.discardTop ? (
                  <span
                    key={view.discardTop.id}
                    className="rounded border border-stone-700 bg-stone-950 px-2 py-1 font-semibold animate-bang-card-pop"
                  >
                    {SUIT_SYMBOL[view.discardTop.suit].symbol}
                    {view.discardTop.rank} {CARD_META[view.discardTop.type].name}
                  </span>
                ) : (
                  <span className="text-stone-500">버린 더미 비어 있음</span>
                )}
              </div>
              <div className="text-xs font-semibold text-amber-200">
                {isMyTurn
                  ? `내 턴 · ${PHASE_LABELS[view.turnPhase]}`
                  : `${currentTurnPlayer?.nickname}님 · ${PHASE_LABELS[view.turnPhase]}`}
              </div>
              {checkBanner && <div className="w-full flex justify-center">{checkBanner}</div>}
            </div>

            {/* Mobile My Seat Status */}
            <PlayerSeat
              player={view.myInfo}
              isMe
              myRole={view.myInfo.role}
              isCurrentTurn={view.myInfo.id === view.currentTurnPlayerId}
              isPendingTarget={pending?.targetPlayerId === view.myInfo.id}
              distanceFromMe={0}
              targetingActive={false}
              isTargetable={false}
              compact
              activeEffects={seatEffects[view.myInfo.id] ?? []}
              onInspectPlayer={(p) => setInspectedPlayerId(p.id)}
            />
          </div>

          {/* Kit Carlson 3-pick-2 Panel */}
          {kitChoices && kitChoices.length > 0 && isMyTurn && (
            <div className="rounded-xl border border-amber-500/60 bg-amber-950/30 p-3.5 animate-bang-card-pop">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <p className="font-bold text-sm sm:text-base text-amber-200">
                    ★ 킷 칼슨: 3장 중 가져갈 2장을 선택하세요
                  </p>
                  <p className="text-xs text-stone-300 mt-0.5">
                    선택하지 않은 1장은 덱 맨 위로 되돌아갑니다 ({selectedKitIds.length}/2).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={selectedKitIds.length !== 2}
                  onClick={() => onPickKitCards(selectedKitIds)}
                  className="min-h-[44px] rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  2장 선택 완료
                </button>
              </div>
              <div className="flex flex-wrap gap-2.5 justify-center">
                {kitChoices.map((card) => {
                  const meta = CARD_META[card.type];
                  const suit = SUIT_SYMBOL[card.suit];
                  const selected = selectedKitIds.includes(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => handleToggleKitCard(card.id)}
                      className={`w-32 sm:w-36 rounded-xl border p-2.5 text-left transition cursor-pointer ${
                        selected
                          ? 'border-amber-400 ring-2 ring-amber-400 bg-amber-950/60 -translate-y-1'
                          : 'border-stone-700 bg-stone-900/95 hover:border-amber-400/70'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold mb-1">
                        <span className={suit.isRed ? 'text-rose-400' : 'text-stone-200'}>
                          {suit.symbol} {card.rank}
                        </span>
                        {selected && (
                          <span className="rounded bg-amber-500 px-1 text-[10px] text-stone-950">
                            선택
                          </span>
                        )}
                      </div>
                      <div className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold mb-1 ${meta.badgeColor}`}>
                        {meta.name}
                      </div>
                      <p className="text-[11px] text-stone-400">{meta.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending Action / Interrupt Panel */}
          {pending && view.status === 'PLAYING' && (
            <div
              className={`rounded-xl border p-3.5 sm:p-4 animate-bang-card-pop ${
                pending.targetPlayerId === view.myInfo.id
                  ? 'border-rose-500 bg-rose-950/40'
                  : 'border-amber-700/50 bg-stone-900/90'
              }`}
            >
              {pending.targetPlayerId === view.myInfo.id ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-rose-200">
                      {pendingSource?.nickname ?? '상대방'}님이 BANG!을 쏘았습니다!
                    </p>
                    <p className="text-xs text-rose-300/80 mt-0.5">
                      {(pending.requiredCount ?? 1) > 1
                        ? `빗나감! ${pending.requiredCount}장이 필요합니다.`
                        : '빗나감! 카드를 내거나 피해를 입으세요.'}
                      {remainingSeconds !== null && ` (${remainingSeconds}초 남음)`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={!missedCard}
                      onClick={() => missedCard && onRespond(missedCard.id)}
                      className="flex-1 sm:flex-none min-h-[44px] rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {missedCard ? '빗나감! 내기' : '빗나감 카드 없음'}
                    </button>
                    {calamityBangCard && (
                      <button
                        type="button"
                        onClick={() => onRespond(calamityBangCard.id)}
                        className="flex-1 sm:flex-none min-h-[44px] rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-500 cursor-pointer"
                      >
                        BANG!으로 빗나감
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRespond(null)}
                      className="flex-1 sm:flex-none min-h-[44px] rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-600 cursor-pointer"
                    >
                      맞기 (-1 HP)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center text-sm text-amber-200">
                  ⏳ {pendingTarget?.nickname ?? '대상'}님의 BANG! 응답 대기 중...
                  {(pending.requiredCount ?? 1) > 1 &&
                    ` (남은 필요 회피 ${pending.requiredCount}장)`}
                  {remainingSeconds !== null && ` (${remainingSeconds}초)`}
                </div>
              )}
            </div>
          )}

          {/* Action Controls */}
          {view.status === 'PLAYING' && (
            <div className="rounded-xl border border-stone-800 bg-stone-900/80 p-3 flex flex-wrap items-center justify-between gap-2.5">
              <div className="text-xs text-stone-300">
                {!view.myInfo.isAlive ? (
                  <span className="text-rose-400 font-semibold">
                    사망했습니다. 관전 중입니다.
                  </span>
                ) : !isMyTurn ? (
                  <span>{currentTurnPlayer?.nickname}님의 턴을 기다리는 중입니다.</span>
                ) : kitChoices ? (
                  <span className="text-amber-300 font-semibold">
                    위 패널에서 가져갈 카드 2장을 선택하세요.
                  </span>
                ) : isJesseMode ? (
                  <span className="text-amber-300 font-semibold">
                    손패에서 카드 1장을 가져올 상대를 클릭하세요.
                  </span>
                ) : view.turnPhase === 'DRAW' ? (
                  <span className="text-amber-300 font-semibold">
                    카드를 뽑아 턴을 시작하세요.
                  </span>
                ) : isSidHealMode ? (
                  <span className="text-emerald-300 font-semibold">
                    체력 1 회복을 위해 버릴 카드 2장을 선택하세요 ({selectedAbilityIds.length}/2).
                  </span>
                ) : selectedTargetCard?.type === 'JAIL' ? (
                  <span className="text-blue-300 font-semibold">
                    감옥에 가둘 대상을 클릭하세요 (보안관 제외, 거리 무관).
                  </span>
                ) : selectedTargetCard ? (
                  <span className="text-rose-300 font-semibold">
                    사거리({view.myInfo.weaponRange}) 내 대상을 클릭하세요.
                  </span>
                ) : isDiscardMode ? (
                  <span className="text-amber-300 font-semibold">
                    체력({view.myInfo.hp}) 초과 카드 {excessCount}장을 버리세요 ({selectedDiscardIds.length}/{excessCount}).
                  </span>
                ) : view.turnPhase === 'WAITING_FOR_RESPONSE' ? (
                  <span>상대방의 응답을 기다리고 있습니다.</span>
                ) : (
                  <span>
                    카드를 선택하거나 턴을 종료하세요. (BANG!{' '}
                    {view.bangPlayedThisTurn ? '사용함' : '미사용'})
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isDrawPhase && !kitChoices && (
                  <>
                    <button
                      type="button"
                      onClick={onDraw}
                      className="min-h-[44px] rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-500 cursor-pointer"
                    >
                      {myChar === 'KIT_CARLSON' ? '카드 3장 보기' : '카드 2장 뽑기'}
                    </button>

                    {myChar === 'PEDRO_RAMIREZ' && view.discardTop !== null && (
                      <button
                        type="button"
                        onClick={() => onSpecialDraw('DISCARD')}
                        className="min-h-[44px] rounded-lg border border-amber-500/60 bg-amber-950/60 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-900/60 cursor-pointer"
                      >
                        버린 더미 맨 위 + 1장
                      </button>
                    )}

                    {myChar === 'JESSE_JONES' && hasHandTarget && (
                      <button
                        type="button"
                        onClick={() => setIsJesseMode((v) => !v)}
                        className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer ${
                          isJesseMode
                            ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                            : 'border-amber-500/60 bg-amber-950/60 text-amber-200 hover:bg-amber-900/60'
                        }`}
                      >
                        {isJesseMode ? '상대 선택 취소' : '상대 손패에서 1장'}
                      </button>
                    )}
                  </>
                )}

                {selectedTargetCard && (
                  <button
                    type="button"
                    onClick={() => setSelectedTargetCard(null)}
                    className="min-h-[44px] rounded-lg border border-stone-600 px-3 py-2 text-xs font-semibold text-stone-300 hover:bg-stone-800 cursor-pointer"
                  >
                    선택 취소
                  </button>
                )}

                {canAct &&
                  myChar === 'SID_KETCHUM' &&
                  view.myInfo.hp < view.myInfo.maxHp &&
                  view.myInfo.hand.length >= 2 &&
                  (!isSidHealMode ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTargetCard(null);
                        setSelectedAbilityIds([]);
                        setIsSidHealMode(true);
                      }}
                      className="min-h-[44px] rounded-lg border border-emerald-500/60 bg-emerald-950/50 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-900/60 cursor-pointer"
                    >
                      2장 버리고 회복
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={selectedAbilityIds.length !== 2}
                        onClick={handleConfirmSidHeal}
                        className="min-h-[44px] rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-stone-950 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        체력 +1 회복
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSidHealMode(false);
                          setSelectedAbilityIds([]);
                        }}
                        className="min-h-[44px] rounded-lg border border-stone-600 px-3 py-2 text-xs font-semibold text-stone-300 hover:bg-stone-800 cursor-pointer"
                      >
                        회복 취소
                      </button>
                    </>
                  ))}

                {canAct && (
                  <button
                    type="button"
                    onClick={onEndTurn}
                    className="min-h-[44px] rounded-lg border border-amber-600/60 bg-amber-950/50 px-4 py-2 text-sm font-bold text-amber-300 hover:bg-amber-900/60 cursor-pointer"
                  >
                    턴 종료
                  </button>
                )}

                {isDiscardMode && (
                  <button
                    type="button"
                    disabled={selectedDiscardIds.length !== excessCount}
                    onClick={handleConfirmDiscard}
                    className="min-h-[44px] rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {excessCount}장 버리기
                  </button>
                )}
              </div>
            </div>
          )}

          {/* My Hand */}
          <div className="rounded-xl border border-stone-800 bg-stone-900/70 p-3">
            <div className="flex items-center justify-between text-xs text-stone-400 mb-2">
              <span>내 손패 ({view.myInfo.hand.length}장)</span>
              <span>
                체력 {view.myInfo.hp}/{view.myInfo.maxHp} · 사거리{' '}
                {view.myInfo.weaponRange}
              </span>
            </div>
            <Hand
              hand={view.myInfo.hand}
              canAct={canAct}
              isDiscardMode={isDiscardMode}
              myCharacter={myChar}
              isSidHealMode={isSidHealMode}
              selectedAbilityIds={selectedAbilityIds}
              selectedTargetCardId={selectedTargetCard?.id ?? null}
              selectedDiscardIds={selectedDiscardIds}
              onCardClick={handleCardClick}
            />
          </div>
        </div>

        {/* Desktop Logs Sidebar */}
        <aside className="hidden lg:flex rounded-2xl border border-stone-800 bg-stone-900/80 p-4 flex-col max-h-[760px]">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">
            게임 기록
          </h2>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs scrollbar-thin">
            {[...view.logs].reverse().map((log, i) => (
              <div
                key={`${i}-${log}`}
                className="rounded-lg bg-stone-950/70 px-2.5 py-1.5 text-stone-300 leading-relaxed"
              >
                {log}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Mobile Logs Drawer */}
      {showMobileLogs && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4"
          onClick={() => setShowMobileLogs(false)}
        >
          <div
            className="w-full sm:max-w-md h-[70vh] rounded-t-2xl sm:rounded-2xl border border-stone-700 bg-stone-900 p-4 flex flex-col animate-bang-card-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-amber-300">게임 기록</h2>
              <button
                type="button"
                onClick={() => setShowMobileLogs(false)}
                className="rounded-lg border border-stone-700 px-2.5 py-1 text-xs text-stone-300 cursor-pointer"
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 text-xs scrollbar-thin">
              {[...view.logs].reverse().map((log, i) => (
                <div
                  key={`${i}-${log}`}
                  className="rounded-lg bg-stone-950/70 px-2.5 py-2 text-stone-300 leading-relaxed"
                >
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Character Detail & Guide Modals */}
      {(() => {
        const target = inspectedPlayerId
          ? view.players.find((p) => p.id === inspectedPlayerId) ?? null
          : null;
        if (!target) return null;
        const resolved =
          target.id === view.myInfo.id
            ? { ...target, role: view.myInfo.role }
            : target;
        return (
          <CharacterDetailModal
            player={resolved}
            isMe={target.id === view.myInfo.id}
            onClose={() => setInspectedPlayerId(null)}
          />
        );
      })()}

      {showGuide && (
        <GuideModal
          activeCharacters={activeCharacters}
          onClose={() => setShowGuide(false)}
        />
      )}

      {/* Victory Overlay */}
      {view.status === 'FINISHED' && view.winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/50 bg-stone-900 p-6 shadow-2xl text-center animate-bang-card-pop">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-1">
              게임 종료
            </p>
            <h2 className="text-2xl font-black text-stone-100 mb-4">
              {WINNER_LABELS[view.winner]}
            </h2>

            <div className="space-y-2 text-left mb-6">
              {sortedPlayers.map((p) => {
                const role = p.id === view.myInfo.id ? view.myInfo.role : p.role;
                const roleMeta = role ? ROLE_META[role] : null;
                const charMeta = p.character ? CHARACTER_META[p.character] : null;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-stone-800 bg-stone-950/70 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar nickname={p.nickname} avatar={p.avatar} size="sm" />
                      <span className="truncate font-semibold text-stone-100">
                        {p.nickname} {p.id === view.myInfo.id ? '(나)' : ''}
                      </span>
                      {charMeta && (
                        <span className="shrink-0 text-xs text-amber-300/80">
                          ({charMeta.name})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!p.isAlive && (
                        <span className="text-xs text-rose-400">사망</span>
                      )}
                      {roleMeta && (
                        <span
                          className={`rounded border px-2 py-0.5 text-xs font-semibold ${roleMeta.badgeClass}`}
                        >
                          {roleMeta.name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onLeaveRoom}
              className="w-full min-h-[44px] rounded-xl bg-amber-600 px-4 py-3 font-bold text-stone-950 hover:bg-amber-500 cursor-pointer"
            >
              홈으로 돌아가기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
