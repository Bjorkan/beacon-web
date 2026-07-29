import { useClockDrift } from "./useStats";
import { DataTable, type Column } from "../../components/DataTable";
import { Badge } from "../../components/Badge";
import { IataChip } from "../../components/IataChip";
import { Timestamp } from "../../components/Timestamp";
import { formatClockDrift } from "../../lib/formatters";
import type { ClockDriftEntry } from "./types";

// every row is already past the drift threshold; flag the worst (>= 1h off) more urgently
function driftClass(seconds: number) {
  return Math.abs(seconds) >= 3600 ? "text-danger" : "text-warn";
}

const columns: Column<ClockDriftEntry>[] = [
  {
    header: "Node",
    cell: (e) => (
      <div className="flex min-w-0 items-center gap-2">
        <span className={`truncate ${e.nodeName ? "text-text-normal" : "italic text-text-dim"}`}>
          {e.nodeName ?? e.nodeId.slice(0, 8)}
        </span>
        <Badge variant="default">{e.nodeTypeName}</Badge>
      </div>
    ),
    sortValue: (e) => e.nodeName ?? e.nodeId,
  },
  {
    header: "Drift",
    className: "tabular-nums",
    cell: (e) => <span className={driftClass(e.clockDriftSeconds)}>{formatClockDrift(e.clockDriftSeconds)}</span>,
    sortValue: (e) => Math.abs(e.clockDriftSeconds),
  },
  {
    header: "Checked",
    cell: (e) => <Timestamp value={e.clockCheckedAt} />,
    sortValue: (e) => e.clockCheckedAt,
  },
  {
    header: "IATAs",
    cell: (e) => (
      <div className="flex flex-wrap gap-1">
        {(e.iatas ?? []).map((i) => (
          <IataChip key={i.iata}>{i.iata}</IataChip>
        ))}
      </div>
    ),
  },
];

// Repeaters/room servers whose advert-derived clock has drifted past the server threshold, worst
// first. Not time-windowed (each row is the node's latest reading), so there's no range selector.
export function ClockDriftTab() {
  const clockDrift = useClockDrift();
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border bg-bg-surface px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-text-muted">
        Repeaters &amp; room servers out of sync · worst first
      </div>
      <DataTable
        columns={columns}
        rows={clockDrift.data}
        rowKey={(e) => e.nodeId}
        selectedKey={null}
        onSelect={() => {}}
        isLoading={clockDrift.isLoading}
        emptyLabel={clockDrift.isError ? "Failed to load" : "No repeaters out of sync"}
        defaultSort={{ header: "Drift", direction: "desc" }}
      />
    </div>
  );
}
