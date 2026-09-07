import { BookOpenCheck, Eye, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../api/client';
import { MasteryBadge } from '../components/MasteryBadge';
import { RatingButtons } from '../components/RatingButtons';
import type { Concept, Question, Rating, Relationship, ReviewResponse } from '../types';

type Props = {
  concepts: Concept[];
  relationships: Relationship[];
  focusQuestion: Question | null;
  onReviewed: () => Promise<void>;
};

export function StudyPage({ concepts, relationships, focusQuestion, onReviewed }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [lastReview, setLastReview] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDue() {
    setLoading(true);
    setError(null);
    try {
      const due = await api.dueQuestions();
      setQuestions(focusQuestion ? [focusQuestion, ...due.filter((item) => item.id !== focusQuestion.id)] : due);
      setCurrentIndex(0);
      setRevealed(false);
      setStartedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load study queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDue();
    // focusQuestion intentionally reloads the session when the user chooses a question from the graph.
  }, [focusQuestion?.id]);

  const currentQuestion = questions[currentIndex] ?? null;
  const target = useMemo(() => {
    if (!currentQuestion) return null;
    if (currentQuestion.relationship_id) {
      const relationship = relationships.find((item) => item.id === currentQuestion.relationship_id);
      if (!relationship) return null;
      return {
        label: `${relationship.source_name} ${relationship.relationship_type} ${relationship.target_name}`,
        score: relationship.mastery_score,
        kind: 'relationship',
      };
    }
    if (currentQuestion.concept_id) {
      const concept = concepts.find((item) => item.id === currentQuestion.concept_id);
      if (!concept) return null;
      return { label: concept.name, score: concept.mastery_score, kind: 'concept' };
    }
    return null;
  }, [concepts, currentQuestion, relationships]);

  async function rate(rating: Rating) {
    if (!currentQuestion) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.review({
        question_id: currentQuestion.id,
        rating,
        response_time_ms: Date.now() - startedAt,
      });
      setLastReview(response);
      await onReviewed();
      setCurrentIndex((index) => Math.min(index + 1, questions.length));
      setRevealed(false);
      setStartedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record review');
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return <div className="rounded-md border border-rust/30 bg-red-50 p-4 text-sm text-rust">{error}</div>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-md border border-line bg-panel p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal">Study</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Active Recall</h1>
          </div>
          <button
            type="button"
            onClick={loadDue}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {loading && <p className="mt-4 text-sm text-ink/55">Working...</p>}

        {!currentQuestion ? (
          <div className="mt-8 rounded-md border border-dashed border-line p-8 text-center">
            <BookOpenCheck className="mx-auto h-8 w-8 text-teal" />
            <h2 className="mt-3 text-lg font-bold text-ink">No due questions</h2>
            <p className="mt-2 text-sm text-ink/60">
              Add more linked questions or review a graph reconstruction activity.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-paper px-2 py-1 text-xs font-semibold text-ink/65">
                {currentQuestion.question_type}
              </span>
              <span className="rounded-full bg-paper px-2 py-1 text-xs font-semibold text-ink/65">
                Difficulty {currentQuestion.difficulty}
              </span>
              {target && <MasteryBadge score={target.score} compact />}
            </div>

            <div className="rounded-md bg-paper p-5">
              <p className="text-xl font-bold leading-8 text-ink">{currentQuestion.question_text}</p>
              {target && <p className="mt-3 text-sm text-ink/60">Focus: {target.label}</p>}
            </div>

            {!revealed ? (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90"
              >
                <Eye className="h-4 w-4" />
                Reveal answer
              </button>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border border-line p-4">
                  <h2 className="text-sm font-bold text-ink">Answer</h2>
                  <p className="mt-2 leading-7 text-ink/75">{currentQuestion.answer_text}</p>
                </div>
                <RatingButtons onRate={rate} disabled={loading} />
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="space-y-4 rounded-md border border-line bg-panel p-4">
        <div>
          <h2 className="text-base font-bold text-ink">Queue</h2>
          <p className="mt-1 text-sm text-ink/55">
            {Math.min(currentIndex + 1, questions.length)} of {questions.length}
          </p>
        </div>
        <div className="space-y-2">
          {questions.map((question, index) => (
            <button
              key={question.id}
              type="button"
              onClick={() => {
                setCurrentIndex(index);
                setRevealed(false);
                setStartedAt(Date.now());
              }}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                index === currentIndex ? 'bg-ink text-white' : 'bg-paper hover:bg-line/40'
              }`}
            >
              <span className="line-clamp-2">{question.question_text}</span>
            </button>
          ))}
        </div>
        {lastReview && (
          <div className="rounded-md border border-line p-3 text-sm">
            <p className="font-semibold text-ink">Last rating: {lastReview.attempt.rating}</p>
            {lastReview.concept && (
              <p className="mt-1 text-ink/60">Concept mastery now {Math.round(lastReview.concept.mastery_score * 100)}%</p>
            )}
            {lastReview.relationship && (
              <p className="mt-1 text-ink/60">
                Relationship mastery now {Math.round(lastReview.relationship.mastery_score * 100)}%
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

