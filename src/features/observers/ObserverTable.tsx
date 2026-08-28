import { useState, useCallback, useEffect, useMemo } from "react";
import { type TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { brokerQueries, observerQueries } from "../../api/queries";
import { useRegion } from "../../hooks/useRegion";
import { useScopes } from "../../hooks/useScopes";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { patchInfinitePages } from "../../lib/infinite-pages";
import { useWsObserverStatusHandler } from "../../hooks/useWsHandlers";
import { formatHex, formatRadio } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { DataTable, type Column } from "../../components/DataTable";
import { LoadingPill } from "../../components/LoadingPill";
import { ObserverFilterBar } from "./ObserverFilterBar";
import { patchObserverSummary } from "./observer-updates";
import { deriveObserverStatus } from "./observer-status";
import { useTick } from "../../hooks/useTick";
import type { ObserverSummary } from "./types";
import type { CursorPage } from "../../types/api";
import type { WsManager } from "../../api/ws-manager";
import type { WsObserverStatus } from "../../types/ws";

const observerId = (o: ObserverSummary) => o.id; // stable id accessor for the paged hook's dedup

interface ObserverTableProps {
  wsManager: WsManager;
  selectedObserverId: string | null;
  onSelectObserver: (id: string | null) => void;
}

function observerColumns(t: TFunction): Column<ObserverSummary>[] {
  return [
  {
    header: "Name",
    label: t("entities.name"),
    sortValue: (obs) => obs.displayName ?? formatHex(obs.id),
    cell: (obs) => (
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${deriveObserverStatus(obs) === "online" ? "bg-green" : "bg-text-dim/30"}`} />
        <span className={`truncate ${obs.displayName ? "text-text-normal" : "text-text-dim italic"}`}>
          {obs.displayName ?? formatHex(obs.id)}
        </span>
      </div>
    ),
  },
  {
    header: "Type",
    label: t("entities.type"),
    className: "text-text-muted",
    sortValue: (obs) => obs.observerType ?? null,
    cell: (obs) => obs.observerType ?? "—",
  },
  {
    header: "Radio",
    label: t("entities.radio"),
    className: "text-text-muted",
    sortValue: (obs) => formatRadio(obs.radio) ?? null,
    cell: (obs) => formatRadio(obs.radio) ?? "—",
  },
  {
    header: "IATA",
    className: "text-text-normal",
    sortValue: (obs) => obs.iata,
    cell: (obs) => obs.iata,
  },
  {
    header: "Status",
    label: t("entities.status"),
    sortValue: (obs) => deriveObserverStatus(obs),
    cell: (obs) => {
      const status = deriveObserverStatus(obs);
      return <Badge variant={status === "online" ? "live" : "offline"}>{t(`options.${status}`)}</Badge>;
    },
  },
  ];
}

function renderObserverCard(obs: ObserverSummary, t: TFunction) {
  const status = deriveObserverStatus(obs);
  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status === "online" ? "bg-green" : "bg-text-dim/30"}`} />
          <span className={`flex-1 min-w-0 truncate ${obs.displayName ? "text-text-normal" : "text-text-dim italic"}`}>
            {obs.displayName ?? formatHex(obs.id)}
          </span>
        </div>
        <span className="shrink-0">
          <Badge variant={status === "online" ? "live" : "offline"}>{t(`options.${status}`)}</Badge>
        </span>
      </div>
      <div className="flex items-center gap-2 text-text-muted">
        <span className="text-text-normal">{obs.iata}</span>
        <span>· {obs.observerType ?? "—"}</span>
        <span>· {formatRadio(obs.radio) ?? "—"}</span>
      </div>
    </div>
  );
}

export function ObserverTable({ wsManager, selectedObserverId, onSelectObserver }: ObserverTableProps) {
  const { t } = useTranslation();
  const { iatas, regionKey } = useRegion();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [brokerFilter, setBrokerFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState(""); // "" = Any; applied client-side over the loaded set

  useTick(); // keep recency-derived status badges fresh

  const { data: brokers } = useQuery(brokerQueries.list());

  const brokerNames = useMemo(
    () => brokers?.map((b) => b.name) ?? [],
    [brokers],
  );

  // page the region's observers 50 at a time (filters stay server-side, in the query key); rows
  // stream in as each batch lands. Loads once per filter set — WS status events keep them live.
  const listOptions = useMemo(
    () =>
      observerQueries.list({
        regionKey,
        iatas,
        status: statusFilter,
        type: typeFilter,
        broker: brokerFilter,
        name: search,
        searchField,
      }),
    [regionKey, iatas, statusFilter, typeFilter, brokerFilter, search, searchField],
  );
  const { items: observers, loadedCount, isPaging, isError, isLoading, hasMore, loadMore } = useInfinitePages<ObserverSummary>({
    options: listOptions,
    getId: observerId,
    keepPrevious: true,
    auto: false,
  });

  const typeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const obs of observers) {
      if (obs.observerType) types.add(obs.observerType);
    }
    return [...types].sort();
  }, [observers]);

  // scope options are the configured scopes; the filter itself is applied client-side on obs.scopes
  const scopeOptions = useScopes();

  const displayObservers = useMemo(
    () => (scopeFilter ? observers.filter((o) => o.scopes?.includes(scopeFilter)) : observers),
    [observers, scopeFilter],
  );

  // Scope is client-side because the observers endpoint has no corresponding filter. Keep pulling
  // pages only while an active scope filter has too few visible matches.
  useEffect(() => {
    if (scopeFilter && displayObservers.length < 50 && hasMore && !isPaging) loadMore();
  }, [scopeFilter, displayObservers.length, hasMore, isPaging, loadMore]);
  const columns = useMemo(() => observerColumns(t), [t]);

  // patch the live status into the paged cache (mirrors NodeTable). A brand-new observer not on any
  // loaded page isn't pulled in here — it surfaces on the next reload/region switch (see the
  // beacon-docs ticket about carrying the full summary in WS events for true live insertion).
  const handleObserverStatus = useCallback(
    (data: WsObserverStatus["data"]) => {
      queryClient.setQueryData<InfiniteData<CursorPage<ObserverSummary>>>(
        listOptions.queryKey,
        (old) => patchInfinitePages(old, (items) => patchObserverSummary(items, data) ?? items),
      );
      // refresh detail panel if it's showing this observer
      if (selectedObserverId === data.observerId) {
        queryClient.invalidateQueries({ queryKey: observerQueries.detail(data.observerId).queryKey });
      }
    },
    [queryClient, listOptions, selectedObserverId],
  );

  useWsObserverStatusHandler(wsManager, handleObserverStatus);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="relative flex flex-col flex-1 min-w-0">
        <ObserverFilterBar
          search={search}
          onSearchChange={setSearch}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          typeOptions={typeOptions}
          brokerFilter={brokerFilter}
          onBrokerChange={setBrokerFilter}
          brokerOptions={brokerNames}
          scopeFilter={scopeFilter}
          onScopeChange={setScopeFilter}
          scopeOptions={scopeOptions}
        />

        <DataTable
          columns={columns}
          rows={displayObservers}
          rowKey={(o) => o.id}
          selectedKey={selectedObserverId}
          onSelect={onSelectObserver}
          isLoading={isLoading}
          emptyLabel={t("entities.noObservers")}
          defaultSort={{ header: "Name" }}
          virtualize
          onEndReached={loadMore}
          renderCard={(observer) => renderObserverCard(observer, t)}
        />
        <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun={t("entities.observers")} position="bottom-3 right-3" />
      </div>

    </div>
  );
}
