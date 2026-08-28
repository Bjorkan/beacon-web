import { formatHex } from "../../lib/formatters";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { iataQueries } from "../../api/queries";
import { Timestamp } from "../../components/Timestamp";
import { Badge } from "../../components/Badge";
import { ScopeTag } from "../../components/ScopeTag";
import { payloadTypeVariant } from "../../components/badge-utils";
import { PAYLOAD_TYPE_NAMES, type PayloadTypeValue } from "../../types/enums";
import type { PacketSummary } from "../../types/api";
import { GRID_TEMPLATE } from "./packet-grid";

interface PacketTableRowProps {
  packet: PacketSummary;
  expanded: boolean;
  isFresh?: boolean;
  onToggle: () => void;
}

// Single-line table row sharing GRID_TEMPLATE with the sticky header. The observer and the packet's
// endpoints live in the expansion / analyzer instead — endpoint resolution is n/a for most
// packets, so it gets no column of its own. The region column shows the IATA's full display name.
export function PacketTableRow({ packet, expanded, isFresh, onToggle }: PacketTableRowProps) {
  const { t } = useTranslation();
  // Shared cache with MapView's iatas query — one request serves every row.
  const { data: iataNames } = useQuery({
    ...iataQueries.list(),
    select: (rows) => new Map(rows.map((r) => [r.iata, r.displayName ?? r.iata])),
  });
  // ?? not ||, so a legitimate 0-hop direct packet still shows its count
  const pathLength = packet.latestObserver?.pathLength;
  const na = <span className="text-text-dim">n/a</span>;

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
        <span className="flex min-w-0 items-center gap-1 overflow-hidden">
          <span className="truncate">{packet.routeTypeName || t("packets.unknown")}</span>
          {packet.scope && <ScopeTag className="shrink-0">{packet.scope}</ScopeTag>}
        </span>
        <span className="font-mono text-text-muted">×{packet.observationCount}</span>
        <span className="font-mono text-text-muted">{pathLength?.hopCount ?? na}</span>
        <span className="font-mono text-text-muted">{pathLength?.hashSize ?? na}</span>
        <span className="min-w-0 truncate">
          {iataNames?.get(packet.latestObserver?.iata ?? "") ?? packet.latestObserver?.iata ?? (
            <span className="font-normal text-text-muted">{na}</span>
          )}
        </span>
        <span className="text-right text-text-muted">
          <Timestamp value={packet.lastHeardAt} />
        </span>
      </button>
    </div>
  );
}
