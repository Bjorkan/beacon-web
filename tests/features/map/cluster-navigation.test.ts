import { describe, expect, it } from "vitest";
import { CLUSTER_FALLBACK_ZOOM_STEP, clusterClickDecision, fallbackClusterZoom } from "../../../src/features/map/cluster-navigation";

describe("clusterClickDecision", () => {
  it("zooms to MapLibre's natural expansion zoom", () => {
    expect(clusterClickDecision(8, 11, 22)).toEqual({ type: "zoom", zoom: 11 });
  });

  it("zooms to the map ceiling before spiderfying a co-located cluster", () => {
    expect(clusterClickDecision(8, 24, 22)).toEqual({ type: "zoom", zoom: 22 });
  });

  it("spiderfies only when there is no useful zoom left", () => {
    expect(clusterClickDecision(22, 24, 22)).toEqual({ type: "spiderfy" });
    expect(clusterClickDecision(22, 22, 22)).toEqual({ type: "spiderfy" });
  });

  it("uses a bounded fallback step when MapLibre cannot resolve expansion zoom", () => {
    expect(fallbackClusterZoom(10, 22)).toBe(10 + CLUSTER_FALLBACK_ZOOM_STEP);
    expect(fallbackClusterZoom(21, 22)).toBe(22);
    expect(fallbackClusterZoom(22, 22)).toBeNull();
  });
});
