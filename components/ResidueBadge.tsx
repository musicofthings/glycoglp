'use client';

type ResidueBadgeProps = {
  position: number;
  residue: string;
  selected?: boolean;
  annotated?: boolean;
  glycosylated?: boolean;
  badge?: string;
  tooltip?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

export default function ResidueBadge({
  position,
  residue,
  selected,
  annotated,
  glycosylated,
  badge,
  tooltip,
  onClick,
  onMouseEnter,
  onMouseLeave
}: ResidueBadgeProps) {
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={[
        'min-w-16 rounded-md border px-2 py-1 text-left text-xs transition-colors',
        selected
          ? 'border-blue-500 bg-blue-100 text-blue-800'
          : glycosylated
            ? 'border-purple-400 bg-purple-100 text-purple-800'
            : annotated
              ? 'border-orange-400 bg-orange-100 text-orange-800'
              : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
      ].join(' ')}
    >
      <span className="font-mono">{position}</span>
      <span className="ml-1 font-semibold">{residue}</span>
      {badge ? <span className="ml-1">{badge}</span> : null}
    </button>
  );
}
