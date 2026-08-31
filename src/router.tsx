/* eslint-disable react-refresh/only-export-components -- the router instance and its routes share this module by design */
// Application route tree (TanStack Router, code-based — the heavy tabs keep their React.lazy
// chunks, which gives the same bundler-level code splitting a file-based plugin would generate).
//
// Responsibilities moved here from the old App.tsx:
//   - route selection (the ?tab= switch became real paths)
//   - typed search params per route (map view, analyzer, analytics sub-state)
//   - region selection mirrored into the URL (root-level search, shared by every route)
//   - legacy deep-link redirects (?tab=Nodes&node=… → /nodes/…, ?tab=Stats → /analytics, …)
//
// Transient overlay state (the analyzer/node/path overlays) stays in React state below — it is
// not shareable navigation state, so it deliberately never touches the URL.

import { createContext, Suspense, lazy, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Outlet, createRootRoute, createRoute, createRouter, redirect, useNavigate, useParams, useSearch, useRouterState } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RegionProvider, useRegion, useRegionSelection } from "./hooks/useRegion";
import {
  ALL_REGIONS,
  isAllRegions,
  deserializeSelection,
  type RegionSelection,
} from "./hooks/region-selection";
import { useIsMobile } from "./hooks/useMediaQuery";
import { AppShell } from "./components/AppShell";
import { EmptyState } from "./components/EmptyState";
import { PacketList } from "./features/packets/PacketList";
import { PacketAnalyzerDrawer } from "./features/packets/PacketAnalyzerDrawer";
import { PacketAnalyzerOverlay } from "./features/packets/PacketAnalyzerOverlay";
import { PathLinkRestore } from "./features/packets/PathLinkRestore";
import { SelectionResetOnRegion } from "./state/SelectionResetOnRegion";
import { NodeTable } from "./features/nodes/NodeTable";
import { NodeDetailPanel } from "./features/nodes/NodeDetailPanel";
import { NodeDetailOverlay } from "./features/nodes/NodeDetailOverlay";
import { ObserverTable } from "./features/observers/ObserverTable";
import { ObserverDetailPanel } from "./features/observers/ObserverDetailPanel";
import { RouteTable } from "./features/routes/RouteTable";
import { TraceList } from "./features/traces/TraceList";
import { ChannelList } from "./features/channels/ChannelList";
import { usePacketDetail } from "./features/packets/usePacketDetail";
import { wsManager } from "./api/ws-instance";
import { parseMapViewSearch } from "./features/map/map-url";
import type { PacketDetail } from "./types/api";
import type { StatsRange, StatsTab } from "./features/stats/types";


// Map is the only heavy tab (maplibre-gl is ~1MB), so lazy-load it — its chunk is fetched the
// first time someone opens the Map route instead of bloating the initial bundle.
const MapView = lazy(() => import("./features/map/MapView").then((m) => ({ default: m.MapView })));
// The packet path modal also imports MapLibre through PacketPathMap. Keep it out of the startup
// bundle even when the user never visits /map; it is only needed after an explicit "view path" action.
const PacketPathMapModal = lazy(() => import("./features/map/PacketPathMapModal").then((m) => ({ default: m.PacketPathMapModal })));

// Stats pulls in ECharts (~150-200KB gz), so lazy-load it too.
const StatsOverview = lazy(() => import("./features/stats/StatsOverview").then((m) => ({ default: m.StatsOverview })));

const WS_EVENTS = ["packetObservation", "channelMessage", "observerStatus", "nodeUpdate"];

// ── search param validation ─────────────────────────────────────────────────────────────────

function csv(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values.map(String).map((s) => s.trim()).filter(Boolean);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// Root search is limited to state that is genuinely shared across routes. Packet filters remain here
// intentionally so they survive tab switches; Map and Analytics own their route-specific search.
interface RootSearch {
  regions: string[];
  iata: string[];
  region?: string; // legacy single-IATA param, folded in on load
  types: number[];
  routes: number[];
  obs: string[];
  scope: string[];
  q?: string;
  sf?: string;
  // Packet/Channel analyzer deep links are shared by those sibling routes.
  hash?: string;
  analyze?: string; // "1" flag
  path?: string;
}

interface MapSearch {
  node?: string;
  lat?: number;
  lng?: number;
  zoom?: number;
  clustering?: boolean;
  node_type?: string;
  neighbor_lines?: "on" | "selected" | "off";
  style?: string;
  flow?: boolean;
  borders?: boolean;
}

interface AnalyticsSearch {
  statsTab?: StatsTab;
  observerId?: string;
  range?: StatsRange;
}

function validateRootSearch(search: Record<string, unknown>): RootSearch {
  return {
    regions: csv(search.regions),
    iata: csv(search.iata).map((c) => c.toUpperCase()),
    ...(str(search.region) !== undefined ? { region: str(search.region)!.toUpperCase() } : {}),
    types: csv(search.types).map(Number).filter(Number.isFinite),
    routes: csv(search.routes).map(Number).filter(Number.isFinite),
    obs: csv(search.obs),
    scope: csv(search.scope),
    q: str(search.q),
    sf: str(search.sf) === "hash" ? "hash" : undefined,
    hash: str(search.hash),
    analyze: search.analyze === "1" ? "1" : undefined,
    path: str(search.path),
  };
}

function validateMapSearch(search: Record<string, unknown>): MapSearch {
  const mapView = parseMapViewSearch(search);
  return {
    node: str(search.node),
    lat: mapView.center?.[1],
    lng: mapView.center?.[0],
    zoom: mapView.zoom,
    clustering: mapView.clustered,
    node_type: mapView.nodeType,
    neighbor_lines: mapView.neighborLines,
    style: mapView.styleId,
    flow: mapView.flow,
    borders: mapView.borders,
  };
}

function validateAnalyticsSearch(search: Record<string, unknown>): AnalyticsSearch {
  const statsTab = str(search.statsTab);
  const range = str(search.range);
  return {
    statsTab: ["mesh", "talkers", "clockdrift", "observer", "graph"].includes(statsTab ?? "")
      ? statsTab as StatsTab
      : undefined,
    observerId: str(search.observerId),
    range: ["24h", "7d", "30d"].includes(range ?? "") ? range as StatsRange : undefined,
  };
}

// Navigation reducers must always re-materialize the required root arrays because TanStack Router
// invokes them against a merged, mostly-optional search object. Route-specific keys are added only
// by the destination route and therefore cannot leak between Map/Analytics/other tabs.
function rootSearch(prev: Partial<RootSearch> | undefined): RootSearch {
  return {
    regions: prev?.regions ?? [],
    iata: prev?.iata ?? [],
    types: prev?.types ?? [],
    routes: prev?.routes ?? [],
    obs: prev?.obs ?? [],
    scope: prev?.scope ?? [],
    q: prev?.q,
    sf: prev?.sf,
  };
}

function completeSearch(prev: Partial<RootSearch>): RootSearch {
  return { ...prev, ...rootSearch(prev) };
}

function searchForTab(prev: Partial<RootSearch>, tab: string, keepAnalyzer: boolean): RootSearch {
  const next = rootSearch(prev);
  if (tab === "Packets" || tab === "Channels") {
    next.hash = prev.hash;
    next.analyze = keepAnalyzer ? prev.analyze : undefined;
  }
  return next;
}

// Keep the historical comma-separated URL format. TanStack Router's default serializer JSON-encodes
// arrays, which would turn established links such as `?types=2,4` into a different public contract.
function parseSearch(searchString: string): Record<string, string> {
  const params = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
  return Object.fromEntries(params.entries());
}

function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    if (Array.isArray(value)) params.set(key, value.join(","));
    else if (typeof value === "boolean") params.set(key, value ? "on" : "off");
    else params.set(key, String(value));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

// ── transient overlay state (React state — never in the URL) ────────────────────────────────

interface Overlays {
  // packet analyzer shown as a modal over any tab (clicking an observation on Nodes/Traces/Map)
  overlayPacketHash: string | null;
  setOverlayPacketHash: (hash: string | null) => void;
  // node detail shown as a modal over the packet analyzer (clicking a resolved path hop)
  overlayNodeId: string | null;
  setOverlayNodeId: (id: string | null) => void;
  // packet path popup shown over the analyzer ("View path on map")
  pathMapDetail: PacketDetail | null;
  openPath: (detail: PacketDetail, initialKey: string | null) => void;
  // expanded-row observation selection shared with the analyzer drawer
  selectedObservationId: number | null;
  setSelectedObservationId: (id: number | null) => void;
  // URL-backed analyzer open/close (Packets + Channels search params)
  analyze: (hash: string | null) => void;
  // entity selection via route params
  selectNode: (id: string | null) => void;
  selectObserver: (id: string | null) => void;
  viewObserverStats: (observerId: string) => void;
}

const OverlaysContext = createContext<Overlays | null>(null);

function useOverlays(): Overlays {
  const ctx = useContext(OverlaysContext);
  if (!ctx) throw new Error("useOverlays must be used within the route tree");
  return ctx;
}

// ── tab <-> path mapping (AppShell still speaks in tab names) ────────────────────────────────

const TAB_TO_PATH: Record<string, string> = {
  Packets: "/packets",
  Channels: "/channels",
  Map: "/map",
  Nodes: "/nodes",
  Observers: "/observers",
  Routes: "/routes",
  Traces: "/traces",
  Analytics: "/analytics",
};

function activeTabFromPathname(pathname: string): string {
  for (const [tab, path] of Object.entries(TAB_TO_PATH)) {
    if (pathname === path || pathname.startsWith(`${path}/`)) return tab;
  }
  return "Packets";
}

// ── region helpers ───────────────────────────────────────────────────────────────────────────

// Compute the initial region selection on first load: URL params win (shareable links), then the
// persisted selection, then the pre-multi-select single-IATA key (migrated), else all regions.
function computeInitialSelection(fromUrl: RegionSelection): RegionSelection {
  if (!isAllRegions(fromUrl)) return fromUrl;
  const stored = deserializeSelection(localStorage.getItem("beacon-region-selection"));
  if (!isAllRegions(stored)) return stored;
  const legacy = localStorage.getItem("beacon-region");
  if (legacy && legacy !== "*") return { regions: [], iatas: [legacy.toUpperCase()] };
  return ALL_REGIONS;
}

// null-render component — easiest way to sync region changes into the WS manager
function RegionWatcher() {
  const { iatas, regionKey } = useRegion();

  useEffect(() => {
    wsManager.connect({ iatas, events: WS_EVENTS });
    return () => wsManager.disconnect();
    // The initial selection is intentionally captured once. The effect below updates the active
    // subscription whenever async region expansion or a user selection changes the resolved IATAs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    wsManager.updateSubscription({ iatas, events: WS_EVENTS });
    // regionKey is the stable identity of the resolved iatas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionKey]);

  return null;
}

// Mirror the active selection into the root search (?regions= / ?iata=) so the address bar is always
// shareable — on a dropdown change and on load (including a selection restored from localStorage).
// All-regions clears both params; any legacy ?region is folded in. replace keeps it out of history.
function RegionUrlSync() {
  const { selection } = useRegionSelection();
  const navigate = useNavigate();
  const search = useSearch({ from: "__root__" });

  useEffect(() => {
    const same =
      search.regions?.join(",") === selection.regions.join(",") &&
      search.iata?.join(",") === selection.iatas.join(",") &&
      search.region === undefined;
    if (same) return;
    navigate({
      to: ".",
      search: (prev) => ({
        ...completeSearch(prev),
        regions: selection.regions.length > 0 ? selection.regions : [],
        iata: selection.iatas.length > 0 ? selection.iatas : [],
        region: undefined,
      }),
      replace: true,
    });
    // `search` is deliberately not a dep: navigating is the EFFECT of a selection change, and the
    // equality guard above makes the follow-up navigation a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, navigate]);

  return null;
}

function TabLoading({ title }: { title: string }) {
  const { t } = useTranslation();
  return <EmptyState title={title} subtitle={t("common.loading")} />;
}

// ── root layout: shell + overlays + region wiring ────────────────────────────────────────────

function RootLayout() {
  const search = useSearch({ from: "__root__" });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const activeTab = activeTabFromPathname(pathname);

  // Resolve the starting selection once from URL → storage → legacy key.
  const initialSelection = useMemo(
    () => computeInitialSelection({ regions: csv(search.regions), iatas: csv(search.iata) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first mount only
    [],
  );

  // transient overlay state (category 3: not shareable, so React state instead of the URL)
  const [overlayNodeId, setOverlayNodeId] = useState<string | null>(null);
  const [overlayPacketHash, setOverlayPacketHash] = useState<string | null>(null);
  const [pathMapDetail, setPathMapDetail] = useState<PacketDetail | null>(null);
  const [pathMapInitialKey, setPathMapInitialKey] = useState<string | null>(null);
  const [selectedObservationId, setSelectedObservationId] = useState<number | null>(null);

  // ?analyze=1 opens the analyzer drawer for ?hash — but only on the routes that host the drawer.
  const analyzerHash = (activeTab === "Packets" || activeTab === "Channels") && search.analyze === "1" ? (search.hash ?? null) : null;

  const { data: analyzerDetail, isLoading: analyzerLoading } = usePacketDetail(analyzerHash);
  const { data: overlayPacketDetail, isLoading: overlayPacketLoading } = usePacketDetail(overlayPacketHash);

  const clearTransient = useCallback(() => {
    setOverlayNodeId(null);
    setOverlayPacketHash(null);
    setPathMapDetail(null);
  }, []);

  const handleTabChange = useCallback(
    (tab: string) => {
      clearTransient();
      // On mobile a detail panel (and the analyzer) fills the screen, so leaving its route must
      // close it; desktop panels live on their own routes. The analyzer is URL-backed, so its
      // mobile close drops ?analyze here rather than in each panel.
      navigate({
        to: TAB_TO_PATH[tab] ?? "/packets",
        search: (prev) => searchForTab(prev, tab, !isMobile),
      });
    },
    [clearTransient, isMobile, navigate],
  );

  const clearSelection = useCallback(() => {
    clearTransient();
    if (activeTab === "Nodes") {
      navigate({
        to: "/nodes",
        search: (prev) => completeSearch(prev),
        replace: true,
      });
    } else if (activeTab === "Map") {
      navigate({
        to: "/map",
        search: (prev) => ({ ...completeSearch(prev), node: undefined }),
        replace: true,
      });
    } else if (activeTab === "Observers") {
      navigate({
        to: "/observers",
        search: (prev) => completeSearch(prev),
        replace: true,
      });
    }
  }, [activeTab, clearTransient, navigate]);

  const analyze = useCallback(
    (hash: string | null) => {
      // No reset: observation ids are globally unique, so a pick inside an expanded row survives
      // into the drawer. URL-backed on the Packets and Channels routes.
      navigate({
        to: ".",
        search: (prev) => {
          const next = { ...prev };
          if (hash) {
            next.hash = hash;
            next.analyze = "1";
            next.path = undefined;
          } else {
            next.analyze = undefined;
          }
          return next;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const selectNode = useCallback(
    (id: string | null) => {
      navigate({
        to: id ? "/nodes/$nodeId" : "/nodes",
        params: id ? { nodeId: id } : undefined,
        search: (prev) => ({ ...rootSearch(prev) }),
      });
    },
    [navigate],
  );

  const selectObserver = useCallback(
    (id: string | null) => {
      if (id === null) {
        navigate({
          to: "/observers",
          search: (prev) => ({ ...rootSearch(prev) }),
          replace: true,
        });
      } else {
        navigate({
          to: "/observers/$observerId",
          params: { observerId: id },
          search: (prev) => ({ ...rootSearch(prev) }),
        });
      }
    },
    [navigate],
  );

  // Jump from an observer's detail panel to its telemetry on Analytics (preselected).
  const viewObserverStats = useCallback(
    (observerId: string) => {
      clearTransient();
      navigate({
        to: "/analytics",
        search: (prev) => ({ ...rootSearch(prev), statsTab: "observer", observerId }),
      });
    },
    [clearTransient, navigate],
  );

  const overlays = useMemo<Overlays>(
    () => ({
      overlayPacketHash,
      setOverlayPacketHash,
      overlayNodeId,
      setOverlayNodeId,
      pathMapDetail,
      openPath: (detail, key) => {
        setPathMapDetail(detail);
        setPathMapInitialKey(key);
      },
      selectedObservationId,
      setSelectedObservationId,
      analyze,
      selectNode,
      selectObserver,
      viewObserverStats,
    }),
    [overlayPacketHash, overlayNodeId, pathMapDetail, selectedObservationId, analyze, selectNode, selectObserver, viewObserverStats],
  );

  return (
    <RegionProvider defaultSelection={initialSelection}>
      <RegionWatcher />
      <RegionUrlSync />
      <SelectionResetOnRegion onRegionChange={clearSelection} />
      {search.path !== undefined && (
        <PathLinkRestore
          key={`${search.hash ?? ""}:${search.path}`}
          initialPath={search.path}
          hash={search.hash ?? null}
          analyzerDetail={analyzerDetail}
          onRestore={(detail, key) => {
            setPathMapDetail(detail);
            setPathMapInitialKey(key);
          }}
        />
      )}
      <OverlaysContext.Provider value={overlays}>
        <AppShell activeTab={activeTab} onTabChange={handleTabChange} wsManager={wsManager}>
          <div className="relative flex flex-1 min-h-0 min-w-0">
            <div key={activeTab} className="flex flex-1 min-h-0 min-w-0 fade-in">
              <Suspense fallback={<TabLoading title={activeTab} />}>
                <Outlet />
              </Suspense>
            </div>
            {analyzerHash && (
              <PacketAnalyzerDrawer
                detail={analyzerDetail}
                loading={analyzerLoading}
                selectedObservationId={selectedObservationId}
                onSelectObservation={setSelectedObservationId}
                onClose={() => analyze(null)}
                onViewNode={setOverlayNodeId}
                onViewPath={() => { if (analyzerDetail) overlays.openPath(analyzerDetail, null); }}
              />
            )}
            {overlayNodeId && (
              <NodeDetailOverlay
                nodeId={overlayNodeId}
                onClose={() => setOverlayNodeId(null)}
                onViewObserver={selectObserver}
                onViewNode={setOverlayNodeId}
              />
            )}
            {overlayPacketHash && (
              <PacketAnalyzerOverlay
                detail={overlayPacketDetail}
                loading={overlayPacketLoading}
                onClose={() => setOverlayPacketHash(null)}
                onViewObserver={selectObserver}
                onViewPath={() => { if (overlayPacketDetail) overlays.openPath(overlayPacketDetail, null); }}
                inactive={!!pathMapDetail}
              />
            )}
            {pathMapDetail && (
              <Suspense fallback={null}>
                <PacketPathMapModal
                  detail={pathMapDetail}
                  initialSelectedKey={pathMapInitialKey}
                  onClose={() => {
                    setPathMapDetail(null);
                    navigate({
                      to: ".",
                      search: (prev) => ({ ...prev, path: undefined }),
                      replace: true,
                    });
                  }}
                />
              </Suspense>
            )}
          </div>
        </AppShell>
      </OverlaysContext.Provider>
    </RegionProvider>
  );
}

// ── route components (thin adapters: router search/state -> feature props) ───────────────────

function PacketsRoute() {
  const overlays = useOverlays();
  return (
    <PacketList
      wsManager={wsManager}
      onAnalyze={overlays.analyze}
      onViewPath={(detail) => overlays.openPath(detail, null)}
      selectedObservationId={overlays.selectedObservationId}
      onSelectObservation={overlays.setSelectedObservationId}
    />
  );
}

function ChannelsRoute() {
  const overlays = useOverlays();
  return <ChannelList wsManager={wsManager} onAnalyze={overlays.analyze} />;
}

function MapRoute() {
  const search = useSearch({ from: "/map" });
  const overlays = useOverlays();
  const navigate = useNavigate({ from: "/map" });
  const urlView = parseMapViewSearch(search);
  const selectMapNode = useCallback(
    (id: string | null) =>
      navigate({
        to: ".",
        search: (prev) => ({ ...prev, node: id ?? undefined }),
      }),
    [navigate],
  );
  return (
    <>
      <MapView
        key={JSON.stringify(urlView)}
        wsManager={wsManager}
        urlView={urlView}
        selectedNodeId={search.node ?? null}
        onSelectNode={selectMapNode}
        onOpenPacket={overlays.setOverlayPacketHash}
      />
      {search.node && (
        <NodeDetailPanel
          nodeId={search.node}
          onClose={() => selectMapNode(null)}
          onViewObserver={overlays.selectObserver}
          onViewNode={selectMapNode}
          onAnalyzePacket={overlays.setOverlayPacketHash}
        />
      )}
    </>
  );
}

// The Nodes route renders the table at both /nodes and /nodes/$nodeId; the detail panel only
// exists on the child route (the table reads the child param for its selection highlight).
function NodesLayout() {
  const params = useParams({ strict: false }) as { nodeId?: string };
  const overlays = useOverlays();
  return (
    <>
      <NodeTable
        wsManager={wsManager}
        selectedNodeId={params.nodeId ?? null}
        onSelectNode={overlays.selectNode}
      />
      <Outlet />
    </>
  );
}

function NodeDetailRoute() {
  const { nodeId } = useParams({ from: "/nodes/$nodeId" });
  const overlays = useOverlays();
  return (
    <NodeDetailPanel
      nodeId={nodeId}
      onClose={() => overlays.selectNode(null)}
      onViewObserver={overlays.selectObserver}
      onViewNode={overlays.selectNode}
      onAnalyzePacket={overlays.setOverlayPacketHash}
    />
  );
}

function ObserversLayout() {
  const params = useParams({ strict: false }) as { observerId?: string };
  const overlays = useOverlays();
  return (
    <>
      <ObserverTable
        wsManager={wsManager}
        selectedObserverId={params.observerId ?? null}
        onSelectObserver={overlays.selectObserver}
      />
      <Outlet />
    </>
  );
}

function ObserverDetailRoute() {
  const { observerId } = useParams({ from: "/observers/$observerId" });
  const overlays = useOverlays();
  return (
    <ObserverDetailPanel
      observerId={observerId}
      onClose={() => overlays.selectObserver(null)}
      onAnalyzePacket={overlays.setOverlayPacketHash}
      onViewStats={overlays.viewObserverStats}
    />
  );
}

function RoutesRoute() {
  return <RouteTable />;
}

function TracesRoute() {
  const overlays = useOverlays();
  return <TraceList onAnalyze={overlays.setOverlayPacketHash} onViewNode={overlays.setOverlayNodeId} />;
}

function AnalyticsRoute() {
  const search = useSearch({ from: "/analytics" });
  const navigate = useNavigate();
  return (
    <StatsOverview
      wsManager={wsManager}
      statsTab={search.statsTab ?? "mesh"}
      range={search.range ?? "7d"}
      observerId={search.observerId ?? null}
      onPatch={(updates) =>
        navigate({
          to: ".",
          search: (prev) => {
            const next = { ...prev };
            for (const [key, value] of Object.entries(updates)) {
              if (value == null) (next as Record<string, unknown>)[key] = undefined;
              else (next as Record<string, unknown>)[key] = value;
            }
            return next;
          },
          replace: true,
        })
      }
    />
  );
}

// ── legacy deep-link redirects ───────────────────────────────────────────────────────────────
// The app historically lived on /?tab=<name> with a pile of companion params. Those links exist
// in copy/paste history and bookmarks, so the index route normalizes them to the path routes:

function legacyRedirect(search: Record<string, unknown>) {
  const rawTab = search.tab ?? "";
  const tab = rawTab === "Stats" ? "Analytics" : rawTab; // "Stats" was renamed to "Analytics"
  const hash = str(search.hash);
  const analyze = search.analyze === "1";
  const path = str(search.path);
  const node = str(search.node);
  const observer = str(search.observer);
  const statsTabValue = str(search.statsTab);
  const statsTab = ["mesh", "talkers", "clockdrift", "observer", "graph"].includes(statsTabValue ?? "")
    ? statsTabValue as StatsTab
    : undefined;
  const observerId = str(search.observerId);
  const rangeValue = str(search.range);
  const range = ["24h", "7d", "30d"].includes(rangeValue ?? "") ? rangeValue as StatsRange : undefined;
  // Carry the geographic filter + packet filters across the redirect so a deep link keeps its context.
  const regions = csv(search.regions);
  const iata = csv(search.iata).map((c) => c.toUpperCase());
  const legacyRegion = str(search.region);
  if (legacyRegion) iata.push(legacyRegion.toUpperCase());
  const q = str(search.q);
  const sf = str(search.sf);
  const root = {
    regions,
    iata,
    types: csv(search.types).map(Number).filter(Number.isFinite),
    routes: csv(search.routes).map(Number).filter(Number.isFinite),
    obs: csv(search.obs),
    scope: csv(search.scope),
    ...(q ? { q } : {}),
    ...(sf ? { sf } : {}),
  };

  switch (tab) {
    case "Map":
      throw redirect({ to: "/map", search: { ...root, ...(node ? { node } : {}) } });
    case "Channels":
      throw redirect({
        to: "/channels",
        search: { ...root, ...(hash ? { hash } : {}), ...(analyze ? { analyze: "1" } : {}) },
      });
    case "Observers":
      throw redirect(
        observer
          ? { to: "/observers/$observerId", params: { observerId: observer }, search: root }
          : { to: "/observers", search: root },
      );
    case "Nodes":
      throw redirect(
        node ? { to: "/nodes/$nodeId", params: { nodeId: node }, search: root } : { to: "/nodes", search: root },
      );
    case "Routes":
      throw redirect({ to: "/routes", search: root });
    case "Traces":
      throw redirect({ to: "/traces", search: root });
    case "Analytics":
      throw redirect({
        to: "/analytics",
        search: {
          ...root,
          ...(statsTab ? { statsTab } : {}),
          ...(observerId ? { observerId } : {}),
          ...(range ? { range } : {}),
        },
      });
    default: {
      // unknown/absent tab falls back to Packets, carrying the packet-scoped params it had
      throw redirect({
        to: "/packets",
        search: {
          ...root,
          ...(hash ? { hash } : {}),
          ...(analyze ? { analyze: "1" } : {}),
          ...(path ? { path } : {}),
        },
      });
    }
  }
}

// ── tree ─────────────────────────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: RootLayout,
  validateSearch: validateRootSearch,
  notFoundComponent: () => <EmptyState title="404" />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ location }) => {
    legacyRedirect(location.search);
  },
});

const packetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "packets",
  component: PacketsRoute,
});


const channelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "channels",
  component: ChannelsRoute,
});

const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "map",
  validateSearch: validateMapSearch,
  component: MapRoute,
});

const nodesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "nodes",
  component: NodesLayout,
});

const nodeDetailRoute = createRoute({
  getParentRoute: () => nodesRoute,
  path: "$nodeId",
  component: NodeDetailRoute,
});

const observersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "observers",
  component: ObserversLayout,
});

const observerDetailRoute = createRoute({
  getParentRoute: () => observersRoute,
  path: "$observerId",
  component: ObserverDetailRoute,
});

const routesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "routes",
  component: RoutesRoute,
});

const tracesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "traces",
  component: TracesRoute,
});

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "analytics",
  validateSearch: validateAnalyticsSearch,
  component: AnalyticsRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  packetsRoute,
  channelsRoute,
  mapRoute,
  nodesRoute.addChildren([nodeDetailRoute]),
  observersRoute.addChildren([observerDetailRoute]),
  routesRoute,
  tracesRoute,
  analyticsRoute,
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    parseSearch,
    stringifySearch,
    defaultPreload: "intent",
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
