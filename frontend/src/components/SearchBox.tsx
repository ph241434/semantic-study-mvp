import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '../api/client';
import type { Concept } from '../types';

type Props = {
  onSelect: (concept: Concept) => void;
};

export function SearchBox({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Concept[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      api
        .search(query)
        .then((items) => {
          setResults(items);
          setOpen(true);
        })
        .catch(() => setResults([]));
    }, 160);
    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <div className="relative w-full min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/45" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search concepts"
        className="h-10 w-full rounded-md border border-line bg-panel pl-9 pr-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/15"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-md border border-line bg-panel shadow-soft">
          {results.map((concept) => (
            <button
              key={concept.id}
              type="button"
              onClick={() => {
                onSelect(concept);
                setQuery(concept.name);
                setOpen(false);
              }}
              className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-paper"
            >
              <span className="font-semibold text-ink">{concept.name}</span>
              <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-xs text-ink/60">
                {concept.concept_type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

