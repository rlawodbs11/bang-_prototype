interface AvatarProps {
  nickname: string;
  avatar?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
};

export function Avatar({ nickname, avatar, size = 'sm' }: AvatarProps) {
  const initial = nickname.trim().charAt(0).toUpperCase() || '?';
  const sizeCls = SIZE_CLASSES[size];

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={`${nickname} 프로필`}
        className={`${sizeCls} shrink-0 rounded-full object-cover border border-amber-500/50 bg-stone-800`}
      />
    );
  }

  return (
    <div
      className={`${sizeCls} shrink-0 rounded-full border border-amber-600/40 bg-amber-950/60 flex items-center justify-center font-bold text-amber-200 select-none`}
    >
      {initial}
    </div>
  );
}
