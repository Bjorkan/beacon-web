import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, GeoJSONSource, CircleLayerSpecification, ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { FocusedNeighborPointProps } from "./node-geojson";
import {
  FOCUSED_NEIGHBORS_LAYER_ID,
  FOCUSED_NEIGHBORS_SOURCE_ID,
  FOCUSED_SELECTED_BACKDROP_LAYER_ID,
} from "./types";
import { syncMapOverlayLayerOrder } from "./map-layer-order";

type Points = FeatureCollection<Point, FocusedNeighborPointProps>;

export function useMapFocusedNeighbors(
  mapRef: React.RefObject<MapLibreMap | null>,
  isReady: boolean,
  points: Points,
  liveMode: boolean,
  themeKey: string,
  onSelectNode: (id: string) => void,
) {
  const selectRef = useRef(onSelectNode);
  useEffect(() => { selectRef.current = onSelectNode; }, [onSelectNode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const color: ExpressionSpecification = [
      "match", ["get", "nodeTypeName"],
      "companion", "#3B82F6", "repeater", "#A78BFA", "room_server", "#22C55E", "sensor", "#EAB308", "#71717A",
    ] as unknown as ExpressionSpecification;
    if (!map.getSource(FOCUSED_NEIGHBORS_SOURCE_ID)) map.addSource(FOCUSED_NEIGHBORS_SOURCE_ID, { type: "geojson", data: points });
    if (!map.getLayer(FOCUSED_SELECTED_BACKDROP_LAYER_ID)) {
      map.addLayer({
        id: FOCUSED_SELECTED_BACKDROP_LAYER_ID,
        type: "circle",
        source: FOCUSED_NEIGHBORS_SOURCE_ID,
        filter: ["==", ["get", "selected"], true],
        paint: {
          "circle-radius": liveMode ? 5 : 9,
          "circle-color": color,
          "circle-opacity": 0.82,
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": liveMode ? 1.8 : 2.2,
        },
      } as CircleLayerSpecification);
    }
    if (!map.getLayer(FOCUSED_NEIGHBORS_LAYER_ID)) {
      map.addLayer({
          id: FOCUSED_NEIGHBORS_LAYER_ID,
          type: "circle",
          source: FOCUSED_NEIGHBORS_SOURCE_ID,
          filter: ["!=", ["get", "selected"], true],
          paint: {
            // Endpoints stay unclustered and render above the normal node layer, so a focused edge
            // never terminates in empty space even if its base-source node is filtered or clustered.
            "circle-radius": liveMode ? 3.2 : 5.5,
            "circle-color": color,
            "circle-opacity": 0.96,
            "circle-stroke-color": "rgba(9,9,11,0.95)",
            "circle-stroke-width": liveMode ? 1 : 1.5,
          },
        } as CircleLayerSpecification);
    }
    map.setPaintProperty(FOCUSED_SELECTED_BACKDROP_LAYER_ID, "circle-radius", liveMode ? 5 : 9);
    map.setPaintProperty(FOCUSED_SELECTED_BACKDROP_LAYER_ID, "circle-stroke-width", liveMode ? 1.8 : 2.2);
    map.setPaintProperty(FOCUSED_NEIGHBORS_LAYER_ID, "circle-radius", liveMode ? 3.2 : 5.5);
    map.setPaintProperty(FOCUSED_NEIGHBORS_LAYER_ID, "circle-stroke-width", liveMode ? 1 : 1.5);
    const source = map.getSource(FOCUSED_NEIGHBORS_SOURCE_ID) as GeoJSONSource;
    source.setData(points);
    syncMapOverlayLayerOrder(map);
    const onClick = (event: { features?: Array<{ properties?: Record<string, unknown> }> }) => {
      const id = event.features?.[0]?.properties?.["id"];
      if (typeof id === "string") selectRef.current(id);
    };
    const onEnter = () => { map.getCanvas().style.cursor = "pointer"; };
    const onLeave = () => { map.getCanvas().style.cursor = ""; };
    map.on("click", FOCUSED_NEIGHBORS_LAYER_ID, onClick);
    map.on("mouseenter", FOCUSED_NEIGHBORS_LAYER_ID, onEnter);
    map.on("mouseleave", FOCUSED_NEIGHBORS_LAYER_ID, onLeave);
    return () => {
      map.off("click", FOCUSED_NEIGHBORS_LAYER_ID, onClick);
      map.off("mouseenter", FOCUSED_NEIGHBORS_LAYER_ID, onEnter);
      map.off("mouseleave", FOCUSED_NEIGHBORS_LAYER_ID, onLeave);
    };
  }, [mapRef, isReady, points, liveMode, themeKey]);
}
