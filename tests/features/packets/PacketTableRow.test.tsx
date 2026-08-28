import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PacketTableRow } from "../../../src/features/packets/PacketTableRow";
import type { LatestObserver, PacketSummary } from "../../../src/types/api";

const pkt = (over: Partial<PacketSummary> = {}): PacketSummary => ({
  packetHash: "AA11BB22", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 1700000000, lastHeardAt: 1700000000, observationCount: 3, ...over,
});

// pathLength is what makes buildPathSummary produce endpoints at all, so it is always present here.
const observer = (
  over: { hopCount?: number; hashSize?: number } & Partial<Pick<LatestObserver, "resolvedSource" | "resolvedDestination">> = {},
): LatestObserver => {
  const { hopCount = 2, hashSize = 1, ...rest } = over;
  return { id: "abcdef1234", iata: "YVR", pathLength: { raw: "1e", hashSize, hopCount }, ...rest };
};

// The row resolves region display names through the shared iatas query; tests render without the
// app's provider, so supply a fresh one (queries just stay pending — the row falls back to codes).
function renderRow(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("PacketTableRow", () => {
  it("exposes one button carrying the expansion state", () => {
    renderRow(<PacketTableRow packet={pkt()} expanded={false} onToggle={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles on click", () => {
    const onToggle = vi.fn();
    renderRow(<PacketTableRow packet={pkt()} expanded={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("is a single line, so the row height stays constant for the virtualizer", () => {
    const { container } = renderRow(<PacketTableRow packet={pkt()} expanded={false} onToggle={() => {}} />);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(screen.queryByText("latest")).not.toBeInTheDocument();
  });

  it("falls back to n/a in the hops, hash size and IATA cells when there is no observer", () => {
    renderRow(<PacketTableRow packet={pkt()} expanded={false} onToggle={() => {}} />);
    const row = within(screen.getByRole("button"));
    expect(row.getAllByText("n/a")).toHaveLength(3);
  });

  it("shows the hash size alongside the hop count", () => {
    renderRow(<PacketTableRow packet={pkt({ observationCount: 9, latestObserver: observer({ hopCount: 5, hashSize: 3 }) })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("no longer shows the observer, which moved into the expansion", () => {
    renderRow(<PacketTableRow packet={pkt({ latestObserver: { id: "abcdef1234", displayName: "Cypress Peak", iata: "YVR" } })} expanded={false} onToggle={() => {}} />);
    expect(screen.queryByText("Cypress Peak")).not.toBeInTheDocument();
    expect(screen.queryByText("abcdef12")).not.toBeInTheDocument();
    expect(screen.getByText("YVR")).toBeInTheDocument();
  });

  it("shows the hop count, which the REST list carries on every row", () => {
    renderRow(<PacketTableRow packet={pkt({ observationCount: 7, latestObserver: observer({ hopCount: 3 }) })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("reflects the expanded state on the button and chevron", () => {
    renderRow(<PacketTableRow packet={pkt()} expanded={true} onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("›")).toHaveClass("rotate-90");
  });

  it("marks a fresh row with the pulse class", () => {
    const { container } = renderRow(<PacketTableRow packet={pkt()} expanded={false} isFresh onToggle={() => {}} />);
    expect(container.querySelector(".packet-fresh")).toBeInTheDocument();
  });

  it("renders a scope tag when the packet has a scope", () => {
    renderRow(<PacketTableRow packet={pkt({ scope: "#bc" })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("#bc")).toBeInTheDocument();
  });

  it("falls back to the raw payload type name for an unrecognized payload type", () => {
    renderRow(<PacketTableRow packet={pkt({ payloadType: 99, payloadTypeName: "CUSTOM_99" })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("CUSTOM_99")).toBeInTheDocument();
  });

  it("falls back to Unknown when routeTypeName is empty", () => {
    renderRow(<PacketTableRow packet={pkt({ routeTypeName: "" })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});
