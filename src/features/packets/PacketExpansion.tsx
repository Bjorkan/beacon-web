import type { PacketSummary } from "../../types/api";
import { formatPropagation } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import { usePacketDetail } from "./usePacketDetail";
import { ObservationTable } from "./ObservationTable";

// Roughly what fits the scroll cap; observations are unbounded server-side.
const SKELETON_ROW_CAP = 12;

const ACTION_BUTTON_CLASS =
  "border border-border rounded-sm px-2 py-0.5 bg-bg-raised text-text-normal hover:bg-text-normal/3 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors";

interface Props {
  packet: PacketSummary;
  onOpenAnalyzer: () => void;
  onViewPath: () => void;
  selectedObservationId: number | null;
  onSelectObservation: (id: number) => void;
}

// Expanded region under a packet row: a summary-driven timing strip (instant, no fetch wait) plus
// the per-observer table, which does wait on usePacketDetail.
export function PacketExpansion({ packet, onOpenAnalyzer, onViewPath, selectedObservationId, onSelectObservation }: Props) {
  const { data, isLoading, isError, refetch } = usePacketDetail(packet.packetHash);
  // firstHeardAt/lastHeardAt are epoch ms (same unit Timestamp expects), so the difference is
  // already in ms for formatPropagation -- no *1000 here.
  const spread = packet.lastHeardAt - packet.firstHeardAt;
  const ready = !isLoading && !isError;
  // The summary already knows the count is zero, so skip the fetch-driven states entirely rather
  // than showing a blank (0-row) skeleton while it loads.
  const noObservations = packet.observationCount === 0;
  const emptyState = <div className="text-[10px] text-text-dim py-2">No observations</div>;

  return (
    <div className="bg-bg-surface border-l-2 border-primary pl-6 pr-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-text-muted pb-2">
        <span>first <Timestamp value={packet.firstHeardAt} /></span>
        <span>last <Timestamp value={packet.lastHeardAt} /></span>
        <span>spread {formatPropagation(spread)}</span>
        <button type="button" onClick={onOpenAnalyzer} disabled={!ready} className={ACTION_BUTTON_CLASS}>
          Open analyzer
        </button>
        <button type="button" onClick={onViewPath} disabled={!ready} className={ACTION_BUTTON_CLASS}>
          View path on map
        </button>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        {isError ? (
          <div className="flex items-center gap-3 text-[10px] text-danger py-2">
            <span>Failed to load observations</span>
            <button type="button" onClick={() => refetch()} className="border border-border rounded-sm px-2 py-0.5 bg-bg-raised cursor-pointer">
              Retry
            </button>
          </div>
        ) : noObservations ? (
          emptyState
        ) : isLoading ? (
          <div>
            {Array.from({ length: Math.min(packet.observationCount, SKELETON_ROW_CAP) }).map((_, i) => (
              <div
                key={i}
                data-testid="observation-skeleton"
                className="h-[22px] border-t border-border-subtle animate-pulse bg-bg-raised/30"
              />
            ))}
          </div>
        ) : data && data.observations.length === 0 ? (
          emptyState
        ) : data ? (
          <ObservationTable observations={data.observations} selectedId={selectedObservationId} onSelect={onSelectObservation} />
        ) : null}
      </div>
    </div>
  );
}
