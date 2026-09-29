"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

/**
 * The one store, on a real map.
 *
 * The band used to show milwaukeetool.gr's picture of its dealer network —
 * a map full of other shops — while this shop is a single store in Piraeus.
 *
 * MapLibre with OpenFreeMap's "positron" style: open data, no API key, so
 * nothing secret reaches the browser (the MapTiler plan has no static maps,
 * and its key stays on the server). Version 5, whose worker is inlined — v6
 * loads it from a file the bundler does not ship. The library is large, so it is only
 * fetched when the band scrolls near the viewport. Scroll-wheel zoom is off
 * and touch needs two fingers, so the map never traps the page's scroll.
 * Without WebGL the plain grey panel stays, with the pin bar over it.
 */

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const HDC_RED = "#DB011C";

export function StoreMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let map: { remove: () => void } | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        // v5 ships as UMD with the worker inlined, so no worker file to host;
        // the bundler exposes it as the default export or as the module itself.
        const mod = await import("maplibre-gl");
        const maplibre = mod.default ?? mod;
        if (cancelled || !box.current) return;
        const instance = new maplibre.Map({
          container: box.current,
          style: STYLE,
          center: [lng, lat],
          zoom: 16,
          scrollZoom: false,
          dragRotate: false,
          touchPitch: false,
          cooperativeGestures: true,
          attributionControl: false,
        });
        instance.touchZoomRotate.disableRotation();
        instance.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        // Top-left: the pin bar covers the bottom of the panel.
        instance.addControl(new maplibre.AttributionControl({ compact: true }), "top-left");
        new maplibre.Marker({ color: HDC_RED }).setLngLat([lng, lat]).addTo(instance);
        instance.once("load", () => {
          if (cancelled) return;
          // The compact credit starts expanded and would cover half a phone's
          // map; start it as the "i" button, one tap away.
          box.current
            ?.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")
            ?.classList.remove("maplibregl-compact-show");
          setReady(true);
        });
        map = instance;
      } catch {
        // No WebGL or the tiles are unreachable: the grey panel and the pin bar stay.
      }
    };

    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          seen.disconnect();
          void load();
        }
      },
      { rootMargin: "400px" },
    );
    seen.observe(el);

    return () => {
      cancelled = true;
      seen.disconnect();
      map?.remove();
    };
  }, [lat, lng]);

  return (
    <div
      ref={box}
      className={`hdc-store-canvas${ready ? " is-ready" : ""}`}
      role="img"
      aria-label={label}
    />
  );
}
