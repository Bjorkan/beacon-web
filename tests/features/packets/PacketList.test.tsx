import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PacketList } from "../../../src/features/packets/PacketList";
import type { WsManager } from "../../../src/api/ws-manager";
import type { PacketSummary } from "../../../src/types/api";

const basePackets = () => ({
  allPackets: [] as PacketSummary[],
  observerOptions: [],
  newPacketCount: 0,
  acknowledgeNewPackets: () => {},
  fetchNextPage: () => {},
  hasNextPage: false,
  isFetchingNextPage: false,
  isLoading: false,
  isError: false,
  observersByHash: new Map(),
  handlePacketObservation: () => {},
  handleLagged: () => {},
  laggedCount: 0,
  dismissLagged: () => {},
});
const usePackets = vi.fn(basePackets);
vi.mock("../../../src/features/packets/usePackets", () => ({
  usePackets: (...args: unknown[]) => usePackets(...(args as [])),
}));

vi.mock("../../../src/hooks/useScopes", () => ({ useScopes: () => [] }));

vi.mock("../../../src/hooks/useRegion", () => ({
  useRegion: () => ({ iatas: ["YOW"], regionKey: "YOW" }),
}));

vi.mock("../../../src/hooks/useWsHandlers", () => ({
  useWsPacketHandler: () => {},
  useWsLaggedHandler: () => {},
}));

// the virtual list needs ResizeObserver in jsdom; stub it down to the expand wiring under test
vi.mock("../../../src/features/packets/PacketVirtualList", () => ({
  PacketVirtualList: ({
    packets,
    expandedHash,
    onToggleExpand,
  }: {
    packets: PacketSummary[];
    expandedHash: string | null;
    onToggleExpand: (hash: string) => void;
  }) => (
    <div>
      <div data-testid="expanded">{String(expandedHash)}</div>
      {packets.map((p) => (
        <button
          key={p.packetHash}
          type="button"
          aria-expanded={expandedHash === p.packetHash}
          onClick={() => onToggleExpand(p.packetHash)}
        >
          {p.packetHash}
        </button>
      ))}
    </div>
  ),
}));

const packet = (hash: string): PacketSummary => ({
  packetHash: hash, payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 1700000000, lastHeardAt: 1700000000, observationCount: 1,
});

describe("PacketList server filter wiring", () => {
  function renderAt(url: string) {
    render(
      <MemoryRouter initialEntries={[url]}>
        <PacketList wsManager={{} as unknown as WsManager} onAnalyze={vi.fn()} />
      </MemoryRouter>,
    );
  }

  it("passes a single selected type to usePackets as the server filter", () => {
    usePackets.mockClear();
    renderAt("/?types=4");
    expect(usePackets).toHaveBeenLastCalledWith(false, { payloadTypes: [4] });
  });

  it("passes a multi-select filter server-side so history stays filtered", () => {
    usePackets.mockClear();
    renderAt("/?types=2,4");
    expect(usePackets).toHaveBeenLastCalledWith(false, { payloadTypes: [2, 4] });
  });
});

describe("PacketList loading feedback", () => {
  afterEach(() => {
    usePackets.mockImplementation(basePackets);
  });

  function renderList() {
    render(
      <MemoryRouter>
        <PacketList wsManager={{} as unknown as WsManager} onAnalyze={vi.fn()} />
      </MemoryRouter>,
    );
  }

  it("shows skeletons instead of the list plus a loading pill during an empty initial load", () => {
    usePackets.mockImplementation(() => ({ ...basePackets(), isLoading: true }));
    renderList();

    expect(screen.queryByTestId("expanded")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading packets…");
  });

  it("keeps the list and shows the pill while paging in more history", () => {
    const pkt = { packetHash: "h1", payloadType: 4, routeType: 1, firstHeardAt: 1, lastHeardAt: 1, observationCount: 1 } as PacketSummary;
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [pkt], isFetchingNextPage: true }));
    renderList();

    expect(screen.getByTestId("expanded")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Loading packets… (1)");
  });

  it("surfaces a failed history fetch through the pill", () => {
    usePackets.mockImplementation(() => ({ ...basePackets(), isError: true }));
    renderList();

    expect(screen.getByRole("status").textContent).toContain("Failed to load packets");
  });

  it("renders neither pill nor skeletons when idle", () => {
    renderList();

    expect(screen.getByTestId("expanded")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("PacketList expanded row", () => {
  it("expands a row from ?hash without opening the analyzer", () => {
    const onAnalyze = vi.fn();
    usePackets.mockReturnValue({ ...basePackets(), allPackets: [packet("AA11")] });

    render(
      <MemoryRouter initialEntries={["/?tab=Packets&hash=AA11"]}>
        <PacketList wsManager={{} as WsManager} onAnalyze={onAnalyze} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /AA11/ })).toHaveAttribute("aria-expanded", "true");
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it("clicking a row sets ?hash and does not open the analyzer", () => {
    const onAnalyze = vi.fn();
    usePackets.mockReturnValue({ ...basePackets(), allPackets: [packet("AA11")] });

    render(
      <MemoryRouter initialEntries={["/?tab=Packets"]}>
        <PacketList wsManager={{} as WsManager} onAnalyze={onAnalyze} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /AA11/ }));
    expect(onAnalyze).not.toHaveBeenCalled();
  });
});
