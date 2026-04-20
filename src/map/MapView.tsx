import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import { TrafficLayer } from "./trafficLayer";
import { useStore } from "../state/store";
import {
  CORRIDOR_BEARING,
  CORRIDOR_CENTER,
  CORRIDOR_PITCH,
  CORRIDOR_ZOOM,
} from "../data/corridor";
import { lngLatToMeters, metersPerMercMeter } from "../sim/geo";

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const layerRef = useRef<TrafficLayer | null>(null);
  const sim = useStore((s) => s.sim);
  const publishKPI = useStore((s) => s.publishKPI);
  const setSelectedLane = useStore((s) => s.setSelectedLaneId);
  const selectedLaneId = useStore((s) => s.selectedLaneId);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          // Raster tiles from CARTO Dark Matter — OpenStreetMap-based, dark theme,
          // keyless, has great Yerevan coverage. Works without an access token.
          basemap: {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxzoom: 19,
          },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#0f1524" } },
          {
            id: "basemap",
            type: "raster",
            source: "basemap",
            paint: {
              "raster-saturation": 0.1,
              "raster-contrast": 0.1,
              "raster-brightness-min": 0.05,
              "raster-brightness-max": 0.95,
            },
          },
        ],
      },
      center: CORRIDOR_CENTER,
      zoom: CORRIDOR_ZOOM,
      pitch: CORRIDOR_PITCH,
      bearing: CORRIDOR_BEARING,
      antialias: true,
    });

    mapRef.current = map;
    (window as any).__map = map;
    map.on("error", (e) => {
      console.warn("[map-error]", e.error?.message || e.error || e);
    });
    map.on("load", () => {
      try {
        const layer = new TrafficLayer({
          network: sim.network,
          sim,
          onTick: () => publishKPI(),
        });
        map.addLayer(layer);
        layerRef.current = layer;
        (window as any).__layer = layer;
        console.log("[traffic-layer] added ok");
      } catch (err: any) {
        console.warn("[traffic-layer] add failed", err?.stack || err?.message || String(err));
      }
    });

    // Click-to-select-lane for the editor
    map.on("click", (e) => {
      const layer = layerRef.current;
      if (!layer) return;
      const { lng, lat } = e.lngLat;
      const origin = sim.network.originLngLat;
      const originMerc = lngLatToMeters(origin[0], origin[1]);
      const mpm = metersPerMercMeter(origin[1]);
      const m = lngLatToMeters(lng, lat);
      const localX = (m.x - originMerc.x) / mpm;
      const localY = (m.y - originMerc.y) / mpm;
      const id = layer.pickLaneNear(localX, localY, 10);
      setSelectedLane(id);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [sim, publishKPI, setSelectedLane]);

  useEffect(() => {
    layerRef.current?.setSelectedLane(selectedLaneId);
  }, [selectedLaneId]);

  return <div ref={containerRef} className="map" />;
}
