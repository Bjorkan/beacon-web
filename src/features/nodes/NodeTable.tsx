import { useState, useCallback, useMemo } from "react";
import { type TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { nodeQueries } from "../../api/queries";
import { useRegion } from "../../hooks/useRegion";
import { useScopes } from "../../hooks/useScopes";
import { useTick } from "../../hooks/useTick";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { patchInfinitePages } from "../../lib/infinite-pages";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { formatHex, timeAgoMs, formatRadio } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { Tooltip } from "../../components/Tooltip";
import { ObserverIcon } from "../../components/ObserverIcon";
import { DataTable, type Column, type SortState } from "../../components/DataTable";
import { LoadingPill } from "../../components/LoadingPill";
import { NodeFilterBar, type MultibyteFilter } from "./NodeFilterBar";
import { nodeSearchParams } from "./node-search";
import { nodeListUpdateRequiresRefetch, patchNodeTableSummary } from "./node-updates";
import type { NodeSummary } from "./types";
import type { CursorPage } from "../../types/api";
import type { WsManager } from "../../api/ws-manager";
import type { WsNodeUpdate } from "../../types/ws";

const nodeId = (n: NodeSummary) => n.id; // stable id accessor for the paged hook's dedup

const NODE_SORT_BY_HEADER = {
  Name: "name",
  Type: "type",
  Radio: "radio",
  Neighbors: "neighbors",
} as const;

interface NodeTableProps {
  wsManager: WsManager;
  // shared with the Map tab (lifted to AppInner) so the detail panel persists across tab switches
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

function nodeColumns(t: TFunction): Column<NodeSummary>[] {
  return [
  {
    header: "Name",
    label: t("entities.name"),
    sortValue: (node) => node.name ?? formatHex(node.id),
    cell: (node) => (
      <span className={`truncate ${node.name ? "text-text-normal" : "text-text-dim italic"}`}>
        {node.name ?? formatHex(node.id)}
      </span>
    ),
  },
  {
    header: "Type",
    label: t("entities.type"),
    sortValue: (node) => node.nodeTypeName,
    cell: (node) => (
      <Badge variant="default">
        {node.isObserver && (
          <Tooltip label={t("entities.observer")} className="mr-1"><ObserverIcon /></Tooltip>
        )}
        {node.nodeTypeName}
      </Badge>
    ),
  },
  {
    header: "Radio",
    label: t("entities.radio"),
    className: "text-text-muted",
    sortValue: (node) => formatRadio(node.radio) ?? null,
    cell: (node) => formatRadio(node.radio) ?? "—",
  },
  {
    header: "IATAs",
    label: t("entities.iatas"),
    cell: (node) =>
      node.iatas && node.iatas.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {node.iatas.map((entry) => (
            <Tooltip key={entry.iata} label={t("entities.lastHeardAgo", { age: timeAgoMs(entry.lastHeard) })}>
              <Badge variant="default">{entry.iata}</Badge>
            </Tooltip>
          ))}
        </div>
      ) : (
        <span className="text-text-dim">—</span>
      ),
  },
  {
    header: "Neighbors",
    label: t("entities.neighbors"),
    className: "text-text-muted",
    sortValue: (node) => node.knownNeighborCount,
    cell: (node) => node.knownNeighborCount.toLocaleString(),
  },
  {
    header: "Location",
    label: t("entities.location"),
    className: "text-text-muted",
    cell: (node) =>
      node.lat != null && node.lng != null
        ? `${node.lat.toFixed(2)}, ${node.lng.toFixed(2)}`
        : "—",
  },
  ];
}

function renderNodeCard(node: NodeSummary, t: TFunction) {
  const location =
    node.lat != null && node.lng != null
      ? `${node.lat.toFixed(2)}, ${node.lng.toFixed(2)}`
      : null;
  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex-1 min-w-0 truncate ${node.name ? "text-text-normal" : "text-text-dim italic"}`}>
          {node.name ?? formatHex(node.id)}
        </span>
        <span className="shrink-0">
          <Badge variant="default">
            {node.isObserver && (
              <Tooltip label={t("entities.observer")} className="mr-1"><ObserverIcon /></Tooltip>
            )}
            {node.nodeTypeName}
          </Badge>
        </span>
      </div>
      <div className="flex items-center gap-2 text-text-muted">
        <span>{formatRadio(node.radio) ?? "—"}</span>
        {location && <span>· {location}</span>}
        {node.knownNeighborCount > 0 && <span>· {t("entities.neighborCount", { count: node.knownNeighborCount })}</span>}
      </div>
      {node.iatas && node.iatas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {node.iatas.map((entry) => (
            <Tooltip key={entry.iata} label={t("entities.lastHeardAgo", { age: timeAgoMs(entry.lastHeard) })}>
              <Badge variant="default">{entry.iata}</Badge>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

export function NodeTable({ wsManager, selectedNodeId, onSelectNode }: NodeTableProps) {
  const { t } = useTranslation();
  const { iatas, regionKey } = useRegion();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");
  const [pathsFilter, setPathsFilter] = useState<MultibyteFilter>("");
  const [tracesFilter, setTracesFilter] = useState<MultibyteFilter>("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [sort, setSort] = useState<SortState>({ header: "Name", direction: "asc" });
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");

  useTick();

  // switching the field flips what the box means (a name vs a hex prefix), so stale text mustn't carry over
  const handleSearchFieldChange = useCallback((field: string) => {
    setSearchField(field);
    setSearch("");
  }, []);

  // derive the actual server params (name vs pubkeyPrefix, hex-guarded) and key the query on THOSE,
  // so toggling the field with an empty box is a no-op and a name never gets sent as a hex prefix
  const { name: nameParam, pubkeyPrefix: pubkeyPrefixParam } = nodeSearchParams(searchField, search);

  const serverSort = NODE_SORT_BY_HEADER[sort.header as keyof typeof NODE_SORT_BY_HEADER] ?? "name";

  const listOptions = useMemo(
    () =>
      nodeQueries.list({
        regionKey,
        iatas,
        type: typeFilter,
        name: nameParam,
        pubkeyPrefix: pubkeyPrefixParam,
        supportsMultibytePaths: pathsFilter || undefined,
        supportsMultibyteTraces: tracesFilter || undefined,
        scope: scopeFilter || undefined,
        sort: serverSort,
        direction: sort.direction,
      }),
    [regionKey, iatas, typeFilter, nameParam, pubkeyPrefixParam, pathsFilter, tracesFilter, scopeFilter, serverSort, sort.direction],
  );

  // Page the region's nodes 50 at a time. Filtering and ordering are server-side, so every page is
  // globally sorted without eagerly downloading the rest of the result set.
  const { items: nodes, loadedCount, isPaging, isError, isLoading, loadMore } = useInfinitePages<NodeSummary, string | number | undefined>({
    options: listOptions,
    getId: nodeId,
    auto: false,
  });

  const scopeOptions = useScopes();
  const columns = useMemo(() => nodeColumns(t), [t]);

  const handleNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      const cached = queryClient.getQueryData<InfiniteData<CursorPage<NodeSummary>>>(listOptions.queryKey);
      const previous = cached?.pages.flatMap((page) => page.items).find((node) => node.id === data.nodeId);
      if (previous && nodeListUpdateRequiresRefetch(previous, data, {
        sort: serverSort,
        type: typeFilter || undefined,
        name: nameParam || undefined,
        pubkeyPrefix: pubkeyPrefixParam || undefined,
        scope: scopeFilter || undefined,
        iatas,
      })) {
        // Server owns ordering/filter membership. Rare changes to either invalidate this exact
        // active list rather than leaving a keyset-paginated cache in an impossible order.
        void queryClient.invalidateQueries({ queryKey: listOptions.queryKey, exact: true });
      } else {
        queryClient.setQueryData<InfiniteData<CursorPage<NodeSummary>>>(
          listOptions.queryKey,
          (old) => patchInfinitePages(old, (items) => patchNodeTableSummary(items, data) ?? items),
        );
      }
      if (selectedNodeId === data.nodeId) {
        void queryClient.invalidateQueries({ queryKey: nodeQueries.detail(data.nodeId).queryKey });
      }
    },
    [queryClient, listOptions, selectedNodeId, serverSort, typeFilter, nameParam, pubkeyPrefixParam, scopeFilter, iatas],
  );

  useWsNodeUpdateHandler(wsManager, handleNodeUpdate);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="relative flex flex-col flex-1 min-w-0">
        <NodeFilterBar
          search={search}
          onSearchChange={setSearch}
          searchField={searchField}
          onSearchFieldChange={handleSearchFieldChange}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          pathsFilter={pathsFilter}
          onPathsChange={setPathsFilter}
          tracesFilter={tracesFilter}
          onTracesChange={setTracesFilter}
          scopeFilter={scopeFilter}
          onScopeChange={setScopeFilter}
          scopeOptions={scopeOptions}
        />

        <DataTable
          columns={columns}
          rows={nodes}
          rowKey={(n) => n.id}
          selectedKey={selectedNodeId}
          onSelect={onSelectNode}
          isLoading={isLoading}
          emptyLabel={t("entities.noNodes")}
          sort={sort}
          onSortChange={setSort}
          sortMode="server"
          virtualize
          onEndReached={loadMore}
          renderCard={(node) => renderNodeCard(node, t)}
        />
        <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun={t("entities.nodes")} position="bottom-3 right-3" />
      </div>
    </div>
  );
}
