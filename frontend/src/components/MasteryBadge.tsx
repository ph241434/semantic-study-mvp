import { masteryCategory, masteryPercent, masteryTheme } from '../styles/mastery';

type Props = {
  score: number;
  compact?: boolean;
};

export function MasteryBadge({ score, compact = false }: Props) {
  const category = masteryCategory(score);
  const theme = masteryTheme[category];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ring-1 ${theme.className}`}
      title={`${theme.label}: ${masteryPercent(score)}`}
    >
      <span>{masteryPercent(score)}</span>
      {!compact && <span>{theme.label}</span>}
    </span>
  );
}

