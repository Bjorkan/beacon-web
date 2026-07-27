import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PacketTableRow } from "../../../src/features/packets/PacketTableRow";
import type { PacketSummary } from "../../../src/types/api";

const pkt = (over: Partial<PacketSummary> = {}): PacketSummary => ({
  packetHash: "AA11BB22", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 1700000000, lastHeardAt: 1700000000, observationCount: 3, ...over,
});

describe("PacketTableRow", () => {
  it("exposes one button carrying the expansion state", () => {
    render(<PacketTableRow packet={pkt()} expanded={false} onToggle={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles on click", () => {
    const onToggle = vi.fn();
    render(<PacketTableRow packet={pkt()} expanded={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("renders line 2 even when there is no path data, so row height is constant", () => {
    render(<PacketTableRow packet={pkt()} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  it("falls back to the observer id when there is no display name", () => {
    render(<PacketTableRow packet={pkt({ latestObserver: { id: "abcdef1234", iata: "YVR" } })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("abcdef12")).toBeInTheDocument();
    expect(screen.getByText("YVR")).toBeInTheDocument();
  });

  it("prefers the observer display name over the id", () => {
    render(<PacketTableRow packet={pkt({ latestObserver: { id: "abcdef1234", displayName: "Cypress Peak", iata: "YVR" } })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("Cypress Peak")).toBeInTheDocument();
    expect(screen.queryByText("abcdef12")).not.toBeInTheDocument();
  });

  it("reflects the expanded state on the button and chevron", () => {
    render(<PacketTableRow packet={pkt()} expanded={true} onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("›")).toHaveClass("rotate-90");
  });

  it("marks a fresh row with the pulse class", () => {
    const { container } = render(<PacketTableRow packet={pkt()} expanded={false} isFresh onToggle={() => {}} />);
    expect(container.querySelector(".packet-fresh")).toBeInTheDocument();
  });

  it("renders a scope tag when the packet has a scope", () => {
    render(<PacketTableRow packet={pkt({ scope: "#bc" })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("#bc")).toBeInTheDocument();
  });

  it("falls back to the raw payload type name for an unrecognized payload type", () => {
    render(<PacketTableRow packet={pkt({ payloadType: 99, payloadTypeName: "CUSTOM_99" })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("CUSTOM_99")).toBeInTheDocument();
  });

  it("falls back to Unknown when routeTypeName is empty", () => {
    render(<PacketTableRow packet={pkt({ routeTypeName: "" })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});
