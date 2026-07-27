import { formatHex } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import { Badge } from "../../components/Badge";
import { ScopeTag } from "../../components/ScopeTag";
import { payloadTypeVariant } from "../../components/badge-utils";
import { PAYLOAD_TYPE_NAMES, type PayloadTypeValue } from "../../types/enums";
import type { PacketSummary } from "../../types/api";
import { GRID_TEMPLATE } from "./packet-grid";
import { PacketPathLine } from "./PacketPathLine";

interface PacketTableRowProps {
  packet: PacketSummary;
  expanded: boolean;
  isFresh?: boolean;
  onToggle: () => void;
}

// two-line table row: line 1 is the identity grid (shares GRID_TEMPLATE with the header), line 2
// is the latest path. The whole row is the expansion click target.
export function PacketTableRow({ packet, expanded, isFresh, onToggle }: PacketTableRowProps) {
  const observer = packet.latestObserver;

  return (
    <div
      className={`border-b ${
        expanded
          ? "border-primary bg-primary/10"
          : isFresh
            ? "packet-fresh border-border-subtle"
            : "border-border-subtle hover:bg-bg-raised/50"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="grid w-full items-center gap-x-3 px-3 py-1.5 text-left text-[11px] cursor-pointer"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        <span className={`text-text-dim transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden>
          ›
        </span>
        <span className="font-mono text-xs font-semibold text-primary tracking-wider">
          {formatHex(packet.packetHash)}
        </span>
        <span>
          <Badge variant={payloadTypeVariant(packet.payloadType)}>
            {PAYLOAD_TYPE_NAMES[packet.payloadType as PayloadTypeValue] ?? packet.payloadTypeName}
          </Badge>
        </span>
        <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
          {packet.routeTypeName || "Unknown"}
          {packet.scope && <ScopeTag>{packet.scope}</ScopeTag>}
        </span>
        <span className="font-mono text-text-muted">×{packet.observationCount}</span>
        <span className="text-text-normal truncate">
          {observer ? (observer.displayName ?? observer.id.slice(0, 8)) : <span className="text-text-dim">—</span>}
        </span>
        <span className="font-mono font-bold text-primary tracking-wider">
          {observer?.iata ?? <span className="text-text-dim font-normal">—</span>}
        </span>
        <span className="text-right text-text-muted">
          <Timestamp value={packet.lastHeardAt} />
        </span>
      </button>

      <div className="px-3 pb-1.5 pl-[2.25rem]">
        <PacketPathLine packet={packet} />
      </div>
    </div>
  );
}
