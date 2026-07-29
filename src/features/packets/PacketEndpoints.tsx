import type { PacketSummary } from "../../types/api";
import type { PathConfidence } from "../../types/enums";
import { buildPathSummary, type PathChip } from "./path-summary";

// Same three-state vocabulary PathData uses in the analyzer.
const CONFIDENCE_CLASSES: Record<PathConfidence, string> = {
  high: "bg-green/8 text-green",
  ambiguous: "bg-warn/8 text-warn",
  none: "bg-text-muted/8 text-text-dim",
};

function Chip({ chip }: { chip: PathChip }) {
  if (chip.kind === "hex") {
    return <span className="font-mono text-[10px] text-text-dim tracking-wider px-1">{chip.label}</span>;
  }
  if (chip.kind === "unresolved-run") {
    return (
      <span className={`font-mono text-[10px] px-1.5 py-px rounded-sm ${CONFIDENCE_CLASSES.none}`}>
        {chip.count === 1 ? "?" : `?×${chip.count}`}
      </span>
    );
  }
  return (
    <span className={`font-mono text-[10px] px-1.5 py-px rounded-sm truncate ${CONFIDENCE_CLASSES[chip.confidence]}`}>
      {chip.label}
    </span>
  );
}

const Na = () => <span className="text-text-dim">n/a</span>;

// The packet's logical endpoints. beacon-server resolves these on the WS feed only and leaves them
// nil on the REST list, so scrollback rows read n/a — as do payload types with no addressed
// endpoint at all (GRP_TXT/GRP_DATA/TRACE).
export function PacketEndpoints({ packet }: { packet: PacketSummary }) {
  const { source, destination } = buildPathSummary(packet);
  // One n/a for the pair reads better than "n/a → n/a" on every historical row.
  if (!source && !destination) return <Na />;

  return (
    <span className="flex items-center gap-x-1 min-w-0">
      {source ? <Chip chip={source} /> : <Na />}
      <span className="text-text-dim px-0.5" aria-hidden>→</span>
      {destination ? <Chip chip={destination} /> : <Na />}
    </span>
  );
}
