import { GraphCanvas, type StudyHidden } from './GraphCanvas';
import type { GraphResponse } from '../types';

type DescriptionPopover = { id: number; name: string; description: string };

type Props = {
  loading: boolean;
  error: string | null;
  graph: GraphResponse | null;
  isLeaf: boolean;
  rootId: number;
  rootConcept: GraphResponse['nodes'][number] | null;
  hidden: StudyHidden | null;
  linkedConceptIds: Set<number>;
  onSelectConcept: (conceptId: number) => void;
  onAddToPersonalView: (conceptId: number) => void;
  descriptionPopover: DescriptionPopover | null;
  onCloseDescriptionPopover: () => void;
};

export function SourceGraphPane({
  loading,
  error,
  graph,
  isLeaf,
  rootId,
  rootConcept,
  hidden,
  linkedConceptIds,
  onSelectConcept,
  onAddToPersonalView,
  descriptionPopover,
  onCloseDescriptionPopover,
}: Props) {
  return (
    <section className="proto-pane proto-pane-source" data-testid="source-graph-pane">
      {error && (
        <p className="proto-status proto-status-error" data-testid="graph-error">
          {error}
        </p>
      )}
      {!error && loading && (
        <p className="proto-status" data-testid="graph-loading">
          Loading…
        </p>
      )}
      {!error && !loading && graph && isLeaf && rootConcept && (
        <div className="proto-leaf" data-testid="graph-leaf">
          <h1 className="proto-leaf-title">{rootConcept.name}</h1>
          <p className="proto-leaf-desc">{rootConcept.description || 'No description yet.'}</p>
        </div>
      )}
      {!error && !loading && graph && !isLeaf && (
        <GraphCanvas
          graph={graph}
          rootId={rootId}
          hidden={hidden}
          linkedConceptIds={linkedConceptIds}
          onSelectConcept={onSelectConcept}
          onAddToPersonalView={onAddToPersonalView}
        />
      )}

      {descriptionPopover && (
        <div className="proto-description-panel" data-testid="graph-description-panel">
          <div className="proto-description-panel-header">
            <h2>{descriptionPopover.name}</h2>
            <button type="button" className="proto-description-panel-close" onClick={onCloseDescriptionPopover} aria-label="Close">
              {'×'}
            </button>
          </div>
          <p>{descriptionPopover.description || 'No description yet.'}</p>
        </div>
      )}
    </section>
  );
}
