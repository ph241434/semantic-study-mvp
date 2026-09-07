import { BarChart3, BookOpenCheck, BrainCircuit, GitFork, RefreshCw, TimerReset } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { api } from '../api/client';
import { MasteryBadge } from '../components/MasteryBadge';
import { masteryPercent } from '../styles/mastery';
import type { Concept, Dashboard, Relationship } from '../types';

type Props = {
  concepts: Concept[];
  relationships: Relationship[];
  onOpenConcept: (conceptId: number) => void;
  onOpenRelationship: (relationship: Relationship) => void;
  refreshKey: number;
};

export function DashboardPage({ concepts, relationships, onOpenConcept, onOpenRelationship, refreshKey }: Props) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .dashboard()
      .then((data) => {
        setDashboard(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Dashboard unavailable'));
  }, [refreshKey]);

  if (error) {
    return <div className="rounded-md border border-rust/30 bg-red-50 p-4 text-sm text-rust">{error}</div>;
  }

  if (!dashboard) {
    return <div className="rounded-md border border-line bg-panel p-4 text-sm text-ink/60">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<BrainCircuit />} label="Concepts" value={dashboard.concepts_count} />
        <Metric icon={<GitFork />} label="Relationships" value={dashboard.relationships_count} />
        <Metric icon={<BookOpenCheck />} label="Questions" value={dashboard.questions_count} />
        <Metric icon={<TimerReset />} label="Due today" value={dashboard.due_today_count} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        <div className="rounded-md border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Mastery</h2>
            <BarChart3 className="h-5 w-5 text-teal" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MasteryMeter label="Concept average" score={dashboard.average_concept_mastery} />
            <MasteryMeter label="Relationship average" score={dashboard.average_relationship_mastery} />
          </div>
          <p className="mt-4 text-sm text-ink/60">
            Reviews today: <span className="font-semibold text-ink">{dashboard.reviews_today_count}</span>
          </p>
        </div>

        <div className="rounded-md border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Recently Studied</h2>
            <RefreshCw className="h-5 w-5 text-plum" />
          </div>
          <div className="mt-3 space-y-2">
            {dashboard.recently_studied.length === 0 ? (
              <p className="text-sm text-ink/55">No reviews yet.</p>
            ) : (
              dashboard.recently_studied.map((review) => (
                <div key={review.id} className="rounded-md bg-paper px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{review.target_label}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink/65">
                      {review.rating}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-ink/60">{review.question_text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <WeakList
          title="Weakest Concepts"
          items={dashboard.weakest_concepts}
          onOpen={(id) => onOpenConcept(id)}
        />
        <WeakList
          title="Weakest Relationships"
          items={dashboard.weakest_relationships}
          onOpen={(id) => {
            const relationship = relationships.find((item) => item.id === id);
            if (relationship) onOpenRelationship(relationship);
          }}
          relationshipMode
        />
      </section>

      {concepts.length === 0 && (
        <div className="rounded-md border border-line bg-panel p-4 text-sm text-ink/60">
          Start by adding a concept, then connect it to another concept with a labeled relationship.
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-panel p-4">
      <div className="flex items-center justify-between text-ink/55">
        <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-bold text-ink">{value}</p>
    </div>
  );
}

function MasteryMeter({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-md bg-paper p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <MasteryBadge score={score} compact />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-teal" style={{ width: masteryPercent(score) }} />
      </div>
    </div>
  );
}

function WeakList({
  title,
  items,
  onOpen,
  relationshipMode = false,
}: {
  title: string;
  items: Dashboard['weakest_concepts'];
  onOpen: (id: number) => void;
  relationshipMode?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-4">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-ink/55">Nothing to show yet.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              className="w-full rounded-md border border-transparent bg-paper px-3 py-2 text-left text-sm transition hover:border-line hover:bg-white"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold leading-5 text-ink">{item.label}</span>
                <MasteryBadge score={item.mastery_score} compact />
              </div>
              {item.subtitle && (
                <p className={`mt-1 text-xs text-ink/60 ${relationshipMode ? 'line-clamp-2' : ''}`}>
                  {item.subtitle}
                </p>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
