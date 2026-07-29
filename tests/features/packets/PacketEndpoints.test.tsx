import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PacketEndpoints } from "../../../src/features/packets/PacketEndpoints";
import type { LatestObserver, PacketSummary } from "../../../src/types/api";

const pkt = (observer?: LatestObserver): PacketSummary => ({
  packetHash: "AA11", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 0, lastHeardAt: 0, observationCount: 1, latestObserver: observer,
});

const obs = (over: Partial<LatestObserver> = {}): LatestObserver => ({
  id: "o1", iata: "YVR", pathLength: { raw: "00", hashSize: 1, hopCount: 0 }, ...over,
});

describe("PacketEndpoints", () => {
  it("renders a single n/a when there is no observer at all", () => {
    render(<PacketEndpoints packet={pkt()} />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  it("renders both endpoints with the arrow glyph between them", () => {
    render(<PacketEndpoints packet={pkt(obs({
      resolvedSource: { confidence: "high", nodes: [{ id: "s", publicKey: "aa", name: "SrcNode" }] },
      resolvedDestination: { confidence: "high", nodes: [{ id: "d", publicKey: "bb", name: "DstNode" }] },
    }))} />);
    expect(screen.getByText("SrcNode")).toBeInTheDocument();
    expect(screen.getByText("DstNode")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
  });

  it("shows n/a for a missing endpoint while the present one still renders", () => {
    render(<PacketEndpoints packet={pkt(obs({
      resolvedSource: { confidence: "high", nodes: [{ id: "s", publicKey: "aa", name: "SrcNode" }] },
    }))} />);
    expect(screen.getByText("SrcNode")).toBeInTheDocument();
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  // The REST list leaves both nil, so this is the common scrollback case — one n/a, no arrow.
  it("collapses to a single n/a when both endpoints are absent", () => {
    render(<PacketEndpoints packet={pkt(obs())} />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
    expect(screen.queryByText("→")).not.toBeInTheDocument();
  });

  it("tints an ambiguous endpoint with the warn token", () => {
    render(<PacketEndpoints packet={pkt(obs({
      resolvedSource: { confidence: "ambiguous", nodes: [{ id: "n", publicKey: "ab", name: "Raven" }] },
    }))} />);
    expect(screen.getByText("Raven").className).toContain("text-warn");
  });

  it("tints a high-confidence endpoint with the green token", () => {
    render(<PacketEndpoints packet={pkt(obs({
      resolvedSource: { confidence: "high", nodes: [{ id: "n", publicKey: "ab", name: "Falcon" }] },
    }))} />);
    expect(screen.getByText("Falcon").className).toContain("text-green");
  });

  it("renders a bare ? for an endpoint the backend could not resolve", () => {
    render(<PacketEndpoints packet={pkt(obs({
      resolvedSource: { confidence: "none", nodes: [] },
    }))} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
