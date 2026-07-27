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
    <span className={`font-mono text-[10px] px-1.5 py-px rounded-sm ${CONFIDENCE_CLASSES[chip.confidence]}`}>
      {chip.label}
    </span>
  );
}

// Line 2 of a packet row: always the latest observation's path, never the selected one.
export function PacketPathLine({ packet }: { packet: PacketSummary }) {
  const summary = buildPathSummary(packet);

  if (summary.isNa) {
    return <span className="text-[11px] text-text-dim">n/a</span>;
  }

  return (
    <div className="flex items-center gap-x-1 text-[11px]">
      <span className="text-text-dim uppercase tracking-wider text-[9px] mr-1">latest</span>
      <span className="text-text-muted mr-2">{summary.hopLabel}</span>
      {summary.chips.map((chip, i) => <Chip key={i} chip={chip} />)}
      {summary.overflow > 0 && (
        <span className="font-mono text-[10px] text-primary bg-primary/8 px-1.5 py-px rounded-sm">
          +{summary.overflow} more
        </span>
      )}
      {(summary.source || summary.destination) && (
        <span className="flex items-center gap-x-1 ml-8">
          {summary.source ? <Chip chip={summary.source} /> : <span className="text-text-dim">n/a</span>}
          <span className="text-text-dim px-0.5" aria-hidden>→</span>
          {summary.destination ? <Chip chip={summary.destination} /> : <span className="text-text-dim">n/a</span>}
        </span>
      )}
    </div>
  );
}
