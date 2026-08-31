import { useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState } from "./EmptyState";
import { SkeletonRows } from "./SkeletonRows";
import { useIsMobile } from "../hooks/useMediaQuery";

export interface Column<T> {
  header: string; // stable sort/key identity; may be an untranslated technical identifier
  label?: string; // localized visible heading
  cell: (row: T) => ReactNode;
  className?: string; // extra classes applied to the <td>
  sortValue?: (row: T) => string | number | null | undefined; // column is sortable when present
}

export type SortDirection = "asc" | "desc";
export interface SortState {
  header: string;
  direction: SortDirection;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  // Optional route/data preload signal. Fired only on explicit user intent (hover/focus/touch), never
  // merely because a virtual row enters the viewport.
  onRowIntent?: (key: string) => void;
  isLoading?: boolean;
  emptyLabel: string;
  defaultSort?: { header: string; direction?: SortDirection };
  // Optional controlled sort. Server-paged entity tables bind this to their query key; smaller
  // client-side tables can keep the simpler internal sort state.
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  // Server mode keeps row order exactly as returned by the API while retaining the same sortable
  // header UI. Client mode (default) applies sortValue locally.
  sortMode?: "client" | "server";
  // false means a requested client-side global sort is waiting for the complete result set. Keep the
  // current page order until every page is present, then apply the sort once instead of reshuffling
  // the viewport as each page arrives. Ignored in server mode.
  sortReady?: boolean;
  // called when the scroll position nears the bottom, for on-demand paging (omit = no infinite scroll)
  onEndReached?: () => void;
  // Large entity datasets opt in; small analytics/routes tables keep the simpler full rendering.
  virtualize?: boolean;
  // when set, rows render as stacked cards below the md breakpoint instead of a table; sort UI lives
  // in <thead>, so cards keep whichever sort state the caller supplied
  renderCard?: (row: T) => ReactNode;
}

// fire onEndReached once the viewport is within this many px of the list's end
const END_REACHED_THRESHOLD_PX = 200;

// selectable, sticky-header list table shared by the entity tabs (observers, nodes, …)

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectedKey,
  onSelect,
  onRowIntent,
  isLoading,
  emptyLabel,
  defaultSort,
  sort: controlledSort,
  onSortChange,
  sortMode = "client",
  sortReady = true,
  onEndReached,
  virtualize = false,
  renderCard,
}: DataTableProps<T>) {
  const asCards = useIsMobile() && !!renderCard;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [internalSort, setInternalSort] = useState<SortState>(() => ({
    header: defaultSort?.header ?? "",
    direction: defaultSort?.direction ?? "asc",
  }));
  const sort = controlledSort ?? internalSort;

  function toggleSort(header: string) {
    const next: SortState =
      sort.header === header
        ? { header, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { header, direction: "asc" };
    if (onSortChange) onSortChange(next);
    else setInternalSort(next);
  }

  const sortedRows = useMemo(() => {
    if (!rows || sortMode === "server" || !sortReady) return rows;
    const col = columns.find((c) => c.header === sort.header && c.sortValue);
    if (!col?.sortValue) return rows;
    const getValue = col.sortValue;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1; // empties sink to the bottom
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [rows, columns, sort, sortMode, sortReady]);

  // React Compiler deliberately skips components using TanStack Virtual's imperative API.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualize ? (sortedRows?.length ?? 0) : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (asCards ? 76 : 39),
    overscan: 8,
    getItemKey: (index) => {
      const row = sortedRows?.[index];
      return row ? rowKey(row) : index;
    },
  });

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!onEndReached) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < END_REACHED_THRESHOLD_PX) onEndReached();
  }

  if (isLoading) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <SkeletonRows />
      </div>
    );
  }

  if (asCards) {
    const virtualItems = virtualizer.getVirtualItems();
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScroll} data-virtualized={virtualize || undefined}>
        {sortedRows && sortedRows.length > 0 ? (
          <div
            className={virtualize ? "relative" : "flex flex-col divide-y divide-border/40"}
            style={virtualize ? { height: virtualizer.getTotalSize() } : undefined}
          >
            {(virtualize ? virtualItems.map((item) => ({ row: sortedRows[item.index]!, item })) : sortedRows.map((row) => ({ row, item: null }))).map(({ row, item }) => {
              const key = rowKey(row);
              const isSelected = key === selectedKey;
              return (
                <button
                  key={key}
                  ref={item ? virtualizer.measureElement : undefined}
                  data-index={item?.index}
                  type="button"
                  className={`w-full text-left px-3 py-2.5 border-l-2 cursor-pointer transition-colors ${virtualize ? "border-b border-b-border/40" : ""} ${
                    isSelected
                      ? "bg-primary/10 border-l-primary"
                      : "border-l-transparent hover:bg-primary/5 hover:border-l-primary/50"
                  }`}
                  style={item ? { position: "absolute", top: 0, left: 0, transform: `translateY(${item.start}px)` } : undefined}
                  onMouseEnter={() => onRowIntent?.(key)}
                  onFocus={() => onRowIntent?.(key)}
                  onTouchStart={() => onRowIntent?.(key)}
                  onClick={() => onSelect(isSelected ? null : key)}
                >
                  {renderCard!(row)}
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState title={emptyLabel} />
        )}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const topPadding = virtualItems[0]?.start ?? 0;
  const bottomPadding = virtualItems.length > 0
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1]!.end
    : 0;
  const tableRows = virtualize
    ? virtualItems.map((item) => ({ row: sortedRows![item.index]!, item }))
    : (sortedRows ?? []).map((row) => ({ row, item: null }));

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto" onScroll={handleScroll} data-virtualized={virtualize || undefined}>
      {sortedRows && sortedRows.length > 0 ? (
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-bg-surface z-10">
            <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
              {columns.map((col) => {
                if (!col.sortValue) {
                  return <th key={col.header} className="text-left px-4 py-2 font-medium">{col.label ?? col.header}</th>;
                }
                const active = sort.header === col.header;
                return (
                  <th key={col.header} className="text-left px-4 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.header)}
                      className="flex items-center gap-1 cursor-pointer hover:text-text-normal transition-colors"
                      aria-busy={sortMode === "client" && active && !sortReady ? true : undefined}
                    >
                      {col.label ?? col.header}
                      <span className={active ? "text-text-normal" : "text-text-dim/40"}>
                        {active ? (sort.direction === "asc" ? "▲" : "▼") : "▲"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {virtualize && topPadding > 0 && (
              <tr aria-hidden><td colSpan={columns.length} style={{ height: topPadding, padding: 0, border: 0 }} /></tr>
            )}
            {tableRows.map(({ row, item }) => {
              const key = rowKey(row);
              const isSelected = key === selectedKey;
              return (
                <tr
                  key={key}
                  ref={item ? virtualizer.measureElement : undefined}
                  data-index={item?.index}
                  className={`border-b border-border/40 border-l-2 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary/10 border-l-primary"
                      : "border-l-transparent hover:bg-primary/5 hover:border-l-primary/50"
                  }`}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => onRowIntent?.(key)}
                  onFocus={() => onRowIntent?.(key)}
                  onTouchStart={() => onRowIntent?.(key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(isSelected ? null : key);
                    }
                  }}
                  onClick={() => onSelect(isSelected ? null : key)}
                >
                  {columns.map((col) => (
                    <td key={col.header} className={`px-4 py-2 ${col.className ?? ""}`}>{col.cell(row)}</td>
                  ))}
                </tr>
              );
            })}
            {virtualize && bottomPadding > 0 && (
              <tr aria-hidden><td colSpan={columns.length} style={{ height: bottomPadding, padding: 0, border: 0 }} /></tr>
            )}
          </tbody>
        </table>
      ) : (
        <EmptyState title={emptyLabel} />
      )}
    </div>
  );
}
