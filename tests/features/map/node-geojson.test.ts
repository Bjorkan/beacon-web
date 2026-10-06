import { describe, it, expect } from "vitest";
import { nodesToFeatureCollection, filterByNodeType, buildNeighborEdges, neighborFocusIds, buildFocusedNeighborEdges } from "../../../src/features/map/node-geojson";
import type { NodeSummary, NodeNeighbor } from "../../../src/features/nodes/types";

function node(overrides: Partial<NodeSummary>): NodeSummary {
  return {
    id: "n1",
    publicKey: "pk",
    nodeType: 1,
    nodeTypeName: "repeater",
    name: "Node 1",
    latitude: 45,
    longitude: -75,
    iatas: [],
    ...overrides,
  };
}

describe("nodesToFeatureCollection", () => {
  it("returns an empty FeatureCollection for no nodes", () => {
    const fc = nodesToFeatureCollection([]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toEqual([]);
  });

  it("maps a located node to a Point feature in [lng, lat] order", () => {
    const fc = nodesToFeatureCollection([node({ latitude: 45.3, longitude: -75.6 })]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry).toEqual({ type: "Point", coordinates: [-75.6, 45.3] });
  });

  it("keeps whole-degree coordinates intact (the API sends decimal degrees, never microdegrees)", () => {
    const fc = nodesToFeatureCollection([node({ latitude: 51, longitude: -114 })]);
    expect(fc.features[0]!.geometry.coordinates).toEqual([-114, 51]);
  });

  it("carries id/name/nodeTypeName/isObserver as feature properties", () => {
    const fc = nodesToFeatureCollection([
      node({ id: "abc", name: "Relay A", nodeType: 2, nodeTypeName: "sensor" }),
    ]);
    expect(fc.features[0]!.properties).toEqual({
      id: "abc",
      name: "Relay A",
      nodeTypeName: "sensor",
      isObserver: false,
    });
  });

  it("defaults isObserver to false and reflects it when set", () => {
    const fc = nodesToFeatureCollection([
      node({ id: "plain" }),
      node({ id: "obs", isObserver: true }),
    ]);
    expect(fc.features[0]!.properties.isObserver).toBe(false);
    expect(fc.features[1]!.properties.isObserver).toBe(true);
  });

  it("drops nodes missing lat or lng", () => {
    const fc = nodesToFeatureCollection([
      node({ id: "a", latitude: null, longitude: -75 }),
      node({ id: "b", latitude: 45, longitude: null }),
      node({ id: "c", latitude: 45, longitude: -75 }),
    ]);
    expect(fc.features.map((f) => f.properties.id)).toEqual(["c"]);
  });

  it("omits location resets and unusable coordinates", () => {
    const positions = [[0, 0], [-0, 0], [NaN, 10], [10, Infinity], [91, 20], [-91, 20], [10, 181], [10, -181]];
    expect(nodesToFeatureCollection(positions.map(([lat, lng], i) => node({ id: String(i), latitude: lat, longitude: lng }))).features).toEqual([]);
  });

  it("keeps valid equator, prime-meridian and boundary locations", () => {
    const positions = [[0, -75], [45, 0], [90, 180], [-90, -180]];
    const fc = nodesToFeatureCollection(positions.map(([lat, lng], i) => node({ id: String(i), latitude: lat, longitude: lng })));
    expect(fc.features.map((f) => f.geometry.coordinates)).toEqual([[-75, 0], [0, 45], [180, 90], [-180, -90]]);
  });

  it("passes decimal coordinates through untouched (api/nodes.go sends *float64 degrees)", () => {
    const fc = nodesToFeatureCollection([node({ latitude: 49.28, longitude: -123.12 })]);
    expect(fc.features[0]!.geometry.coordinates).toEqual([-123.12, 49.28]);
  });
});

describe("buildNeighborEdges", () => {
  const a = node({ id: "a", latitude: 45, longitude: -75, neighborIds: ["b", "c"] });
  const b = node({ id: "b", latitude: 46, longitude: -76, neighborIds: ["a"] });
  const c = node({ id: "c", latitude: 47, longitude: -77, neighborIds: ["a"] });

  it("emits one undirected edge per neighbor pair (a<->b counted once) in [lng, lat] order", () => {
    const fc = buildNeighborEdges([a, b], "on", null);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry).toEqual({
      type: "LineString",
      coordinates: [[-75, 45], [-76, 46]],
    });
  });

  it("skips neighbor ids absent from the set or without coordinates", () => {
    const lonely = node({ id: "a", latitude: 45, longitude: -75, neighborIds: ["ghost"] });
    const noCoord = node({ id: "b", latitude: null, longitude: null, neighborIds: ["a"] });
    expect(buildNeighborEdges([lonely, noCoord], "on", null).features).toEqual([]);
  });

  it("in 'selected' mode keeps only edges incident to the selected node", () => {
    const fc = buildNeighborEdges([a, b, c], "selected", "b");
    expect(fc.features).toHaveLength(1); // only a<->b
    expect(fc.features[0]!.properties.selected).toBe(true);
  });

  it("in 'on' mode emits all edges and flags those incident to the selected node", () => {
    const fc = buildNeighborEdges([a, b, c], "on", "b");
    expect(fc.features).toHaveLength(2); // a<->b and a<->c
    expect(fc.features.filter((f) => f.properties.selected)).toHaveLength(1); // a<->b
  });

  it("ignores a node that lists itself as a neighbor (no zero-length edge)", () => {
    const selfRef = node({ id: "a", latitude: 45, longitude: -75, neighborIds: ["a", "b"] });
    const fc = buildNeighborEdges([selfRef, b], "on", null);
    expect(fc.features).toHaveLength(1); // a<->b only, not a<->a
  });

  it("omits both directions of neighbour edges to reset or invalid locations", () => {
    const valid = node({ id: "a", neighborIds: ["reset", "invalid"] });
    const reset = node({ id: "reset", latitude: 0, longitude: 0, neighborIds: ["a"] });
    const invalid = node({ id: "invalid", latitude: 91, longitude: 10, neighborIds: ["a"] });
    for (const mode of ["on", "selected"] as const) {
      expect(buildNeighborEdges([valid, reset, invalid], mode, "a").features).toEqual([]);
    }
    expect(neighborFocusIds([valid, reset, invalid], "a")).toBeNull();
    expect(neighborFocusIds([valid, reset, invalid], "reset")).toBeNull();
  });
});

describe("neighborFocusIds", () => {
  const a = node({ id: "a", latitude: 45, longitude: -75, neighborIds: ["b", "c"] });
  const b = node({ id: "b", latitude: 46, longitude: -76, neighborIds: ["a"] });
  const c = node({ id: "c", latitude: 47, longitude: -77, neighborIds: ["a"] });

  const sorted = (ids: string[] | null) => (ids ? [...ids].sort() : ids);

  it("returns null when nothing is selected", () => {
    expect(neighborFocusIds([a, b, c], null)).toBeNull();
  });

  it("includes the selected node and its located neighbors", () => {
    expect(sorted(neighborFocusIds([a, b, c], "a"))).toEqual(["a", "b", "c"]);
  });

  it("treats neighbor links as undirected (a node listing the selection counts)", () => {
    // b lists a; c does not list b, so only a<->b makes c irrelevant to b's focus set
    expect(sorted(neighborFocusIds([a, b, c], "b"))).toEqual(["a", "b"]);
  });

  it("skips neighbor ids that are absent or unlocated", () => {
    const noCoord = node({ id: "c", latitude: null, longitude: null, neighborIds: ["a"] });
    expect(sorted(neighborFocusIds([a, b, noCoord], "a"))).toEqual(["a", "b"]);
  });

  it("returns null when the selected node is unlocated (no marker to keep lit)", () => {
    const unlocated = node({ id: "a", latitude: null, longitude: null, neighborIds: ["b"] });
    expect(neighborFocusIds([unlocated, b], "a")).toBeNull();
  });

  it("returns null when the selected node has no located neighbors", () => {
    const lonely = node({ id: "x", latitude: 45, longitude: -75, neighborIds: ["ghost"] });
    expect(neighborFocusIds([lonely, b], "x")).toBeNull();
  });
});

describe("buildFocusedNeighborEdges", () => {
  const DAY = 86400000;
  const NOW = 1000 * DAY;
  const sel = node({ id: "a", latitude: 45, longitude: -75 });
  function nb(o: Partial<NodeNeighbor>): NodeNeighbor {
    return { id: "b", publicKey: "pk", nodeType: 2, nodeTypeName: "repeater", iata: "YOW", observationCount: 10, firstSeen: 0, lastSeen: NOW, latitude: 46, longitude: -76, ...o };
  }

  it("returns empty when nothing is selected", () => {
    expect(buildFocusedNeighborEdges(null, [nb({})], NOW).features).toEqual([]);
  });

  it("returns empty when the selected node has no coordinates", () => {
    expect(buildFocusedNeighborEdges(node({ id: "a", latitude: null, longitude: null }), [nb({})], NOW).features).toEqual([]);
  });

  it("draws one edge selected->neighbor with obs, in [lng, lat] order", () => {
    const fc = buildFocusedNeighborEdges(sel, [nb({ id: "b", latitude: 46, longitude: -76, observationCount: 42, lastSeen: NOW })], NOW);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry.coordinates).toEqual([[-75, 45], [-76, 46]]);
    expect(fc.features[0]!.properties.obs).toBe(42);
    expect(fc.features[0]!.properties.selected).toBe(true);
    expect(fc.features[0]!.properties.ageDays).toBe(0);
  });

  it("computes ageDays from lastSeen relative to now", () => {
    const fc = buildFocusedNeighborEdges(sel, [nb({ id: "b", lastSeen: NOW - 3 * DAY })], NOW);
    expect(fc.features[0]!.properties.ageDays).toBeCloseTo(3);
  });

  it("aggregates a neighbor's per-iata rows: sums obs, keeps the freshest lastSeen", () => {
    const fc = buildFocusedNeighborEdges(sel, [
      nb({ id: "b", iata: "YOW", observationCount: 30, lastSeen: NOW - 5 * DAY }),
      nb({ id: "b", iata: "YYZ", observationCount: 12, lastSeen: NOW - 1 * DAY }),
    ], NOW);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties.obs).toBe(42);
    expect(fc.features[0]!.properties.ageDays).toBeCloseTo(1);
  });

  it("skips neighbors without coordinates and any self-referential row", () => {
    const fc = buildFocusedNeighborEdges(sel, [
      nb({ id: "b", latitude: undefined, longitude: undefined }),
      nb({ id: "a", latitude: 45, longitude: -75 }), // self — no zero-length edge
      nb({ id: "c", latitude: 47, longitude: -77, observationCount: 5 }),
    ], NOW);
    expect(fc.features.map((f) => f.properties.obs)).toEqual([5]);
  });

  it("omits reset and invalid locations from focused edges", () => {
    const candidates = [nb({ id: "reset", latitude: 0, longitude: 0 }), nb({ id: "invalid", latitude: 10, longitude: Infinity }), nb({ id: "valid", latitude: 0, longitude: 15 })];
    expect(buildFocusedNeighborEdges(sel, candidates, NOW).features.map((f) => f.geometry.coordinates)).toEqual([[[-75, 45], [15, 0]]]);
    expect(buildFocusedNeighborEdges(node({ latitude: 0, longitude: 0 }), [nb({})], NOW).features).toEqual([]);
  });
});

describe("filterByNodeType", () => {
  const fc = nodesToFeatureCollection([
    node({ id: "r1", nodeTypeName: "repeater" }),
    node({ id: "c1", nodeTypeName: "companion" }),
    node({ id: "r2", nodeTypeName: "repeater" }),
  ]);

  it("returns all features (same reference) for an empty type = All", () => {
    expect(filterByNodeType(fc, "")).toBe(fc);
  });

  it("keeps only features matching the given type", () => {
    expect(filterByNodeType(fc, "repeater").features.map((f) => f.properties.id)).toEqual(["r1", "r2"]);
  });

  it("returns an empty collection when nothing matches", () => {
    const out = filterByNodeType(fc, "sensor");
    expect(out.type).toBe("FeatureCollection");
    expect(out.features).toEqual([]);
  });
});
