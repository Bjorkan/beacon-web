import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PacketPathLine } from "../../../src/features/packets/PacketPathLine";
import type { PacketSummary } from "../../../src/types/api";

const pkt = (over: Partial<PacketSummary> = {}): PacketSummary => ({
  packetHash: "AA11", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 0, lastHeardAt: 0, observationCount: 1, ...over,
});

describe("PacketPathLine", () => {
  it("renders a single n/a when there is nothing to show", () => {
    render(<PacketPathLine packet={pkt()} />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  it("renders hop label, hex chips and the overflow count", () => {
    render(<PacketPathLine packet={pkt({
      latestObserver: {
        id: "o1", iata: "YVR",
        pathLength: { raw: "4e", hashSize: 1, hopCount: 14 },
        pathBytes: "000102030405060708090a0b0c0d",
      },
    })} />);
    expect(screen.getByText("14 hops")).toBeInTheDocument();
    expect(screen.getByText("00")).toBeInTheDocument();
    expect(screen.getByText("+9 more")).toBeInTheDocument();
  });

  it("tints an ambiguous hop with the warn token", () => {
    render(<PacketPathLine packet={pkt({
      latestObserver: {
        id: "o1", iata: "YVR",
        pathLength: { raw: "41", hashSize: 1, hopCount: 1 }, pathBytes: "7f",
        resolvedPath: [{ confidence: "ambiguous", nodes: [{ id: "n", publicKey: "ab", name: "Raven" }] }],
      },
    })} />);
    expect(screen.getByText("Raven").className).toContain("text-warn");
  });
});
