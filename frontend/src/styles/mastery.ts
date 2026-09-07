export type MasteryCategory = 'weak' | 'developing' | 'strong' | 'mastered';

export const masteryTheme: Record<
  MasteryCategory,
  {
    label: string;
    className: string;
    nodeBackground: string;
    nodeBorder: string;
    edge: string;
  }
> = {
  weak: {
    label: 'Weak',
    className: 'bg-red-50 text-red-800 ring-red-200',
    nodeBackground: '#fee7de',
    nodeBorder: '#ad3e2e',
    edge: '#ad3e2e',
  },
  developing: {
    label: 'Developing',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    nodeBackground: '#fff0c9',
    nodeBorder: '#b56b25',
    edge: '#b56b25',
  },
  strong: {
    label: 'Strong',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    nodeBackground: '#ddf4df',
    nodeBorder: '#4f6f52',
    edge: '#4f6f52',
  },
  mastered: {
    label: 'Mastered',
    className: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
    nodeBackground: '#dff6f3',
    nodeBorder: '#27746d',
    edge: '#27746d',
  },
};

export function masteryCategory(score: number): MasteryCategory {
  if (score < 0.4) return 'weak';
  if (score < 0.7) return 'developing';
  if (score < 0.9) return 'strong';
  return 'mastered';
}

export function masteryPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

