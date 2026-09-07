import type { Rating } from '../types';

const ratings: { value: Rating; label: string; className: string }[] = [
  { value: 'AGAIN', label: 'Again', className: 'border-rust text-rust hover:bg-red-50' },
  { value: 'HARD', label: 'Hard', className: 'border-amber text-amber hover:bg-amber-50' },
  { value: 'GOOD', label: 'Good', className: 'border-moss text-moss hover:bg-emerald-50' },
  { value: 'EASY', label: 'Easy', className: 'border-teal text-teal hover:bg-cyan-50' },
];

type Props = {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
};

export function RatingButtons({ onRate, disabled = false }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ratings.map((rating) => (
        <button
          key={rating.value}
          type="button"
          disabled={disabled}
          onClick={() => onRate(rating.value)}
          className={`rounded-md border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${rating.className}`}
        >
          {rating.label}
        </button>
      ))}
    </div>
  );
}

