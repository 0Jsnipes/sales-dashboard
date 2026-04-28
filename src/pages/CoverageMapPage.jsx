import { useEffect, useMemo, useRef, useState } from "react";
import { defaultProviderColors, starterAreas } from "../lib/coverageMapData.js";

const NOTES_STORAGE_KEY = "coverage-map-notes";
const COLORS_STORAGE_KEY = "coverage-map-colors";
const HEX_OVERRIDES_STORAGE_KEY = "coverage-map-hex-overrides";
const HEX_RADIUS_DEGREES = 0.33;
const MAP_BOUNDS = {
  minLat: 24.2,
  maxLat: 49.6,
  minLng: -125.2,
  maxLng: -66.2,
};

const providerMeta = {
  att: { label: "AT&T" },
  tmobile: { label: "T-Mobile" },
  clear: { label: "Clear" },
};

function useLocalStorageState(key, fallbackValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") return fallbackValue;

    const storedValue = window.localStorage.getItem(key);
    if (!storedValue) return fallbackValue;

    try {
      return JSON.parse(storedValue);
    } catch {
      return fallbackValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function useLeaflet() {
  const [state, setState] = useState({ ready: false, error: "" });

  useEffect(() => {
    if (window.L) {
      setState({ ready: true, error: "" });
      return undefined;
    }

    const existingScript = document.querySelector('script[data-leaflet-loader="true"]');
    const existingStylesheet = document.querySelector('link[data-leaflet-loader="true"]');

    if (!existingStylesheet) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.dataset.leafletLoader = "true";
      document.head.appendChild(link);
    }

    const onReady = () => setState({ ready: true, error: "" });
    const onError = () =>
      setState({
        ready: false,
        error: "Leaflet failed to load. Check network access for the CDN.",
      });

    if (existingScript) {
      existingScript.addEventListener("load", onReady);
      existingScript.addEventListener("error", onError);

      return () => {
        existingScript.removeEventListener("load", onReady);
        existingScript.removeEventListener("error", onError);
      };
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.dataset.leafletLoader = "true";
    script.addEventListener("load", onReady);
    script.addEventListener("error", onError);
    document.body.appendChild(script);

    return () => {
      script.removeEventListener("load", onReady);
      script.removeEventListener("error", onError);
    };
  }, []);

  return state;
}

function normalizeProvider(provider) {
  if (provider === "tmobileGreen" || provider === "tmobileRed") return "tmobile";
  return provider;
}

function pointInPolygon(point, polygon) {
  const [lat, lng] = point;
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [lat1, lng1] = polygon[index];
    const [lat2, lng2] = polygon[previous];
    const intersects =
      lng1 > lng !== lng2 > lng &&
      lat < ((lat2 - lat1) * (lng - lng1)) / (lng2 - lng1 || Number.EPSILON) + lat1;

    if (intersects) inside = !inside;
  }

  return inside;
}

function createHexPolygon(centerLat, centerLng, radius) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 30);
    const lat = centerLat + radius * Math.sin(angle);
    const lng = centerLng + (radius * Math.cos(angle)) / Math.cos((centerLat * Math.PI) / 180);
    return [lat, lng];
  });
}

function generateHexGrid() {
  const hexWidth = Math.sqrt(3) * HEX_RADIUS_DEGREES;
  const rowStep = HEX_RADIUS_DEGREES * 1.5;
  const hexes = [];
  let row = 0;

  for (let lat = MAP_BOUNDS.minLat; lat <= MAP_BOUNDS.maxLat; lat += rowStep) {
    const lngOffset = row % 2 === 0 ? 0 : hexWidth / 2;

    for (
      let lng = MAP_BOUNDS.minLng + lngOffset;
      lng <= MAP_BOUNDS.maxLng + hexWidth;
      lng += hexWidth
    ) {
      const id = `${lat.toFixed(3)}:${lng.toFixed(3)}`;
      hexes.push({
        id,
        center: [Number(lat.toFixed(5)), Number(lng.toFixed(5))],
        polygon: createHexPolygon(lat, lng, HEX_RADIUS_DEGREES),
      });
    }

    row += 1;
  }

  return hexes;
}

function buildStarterHexAssignments(hexes) {
  const assignments = {};

  hexes.forEach((hex) => {
    const matchedArea = starterAreas.find((area) => {
      if (area.kind === "polygon") return pointInPolygon(hex.center, area.coordinates);
      return false;
    });

    if (matchedArea) {
      assignments[hex.id] = normalizeProvider(matchedArea.provider);
    }
  });

  return assignments;
}

export default function CoverageMapPage() {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const hasFitBoundsRef = useRef(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useLocalStorageState(NOTES_STORAGE_KEY, "");
  const [providerColors, setProviderColors] = useLocalStorageState(
    COLORS_STORAGE_KEY,
    defaultProviderColors
  );
  const [hexOverrides, setHexOverrides] = useLocalStorageState(HEX_OVERRIDES_STORAGE_KEY, {});
  const [activePaint, setActivePaint] = useState("att");
  const { ready: leafletReady, error: leafletError } = useLeaflet();

  const hexGrid = useMemo(() => generateHexGrid(), []);
  const starterAssignments = useMemo(() => buildStarterHexAssignments(hexGrid), [hexGrid]);
  const visibleAssignments = useMemo(
    () => ({ ...starterAssignments, ...hexOverrides }),
    [hexOverrides, starterAssignments]
  );
  const paintedHexCount = useMemo(
    () => Object.values(visibleAssignments).filter(Boolean).length,
    [visibleAssignments]
  );

  useEffect(() => {
    if (!leafletReady || !mapNodeRef.current || mapRef.current) return undefined;

    const map = window.L.map(mapNodeRef.current, {
      zoomControl: true,
      minZoom: 3,
    }).setView([37.8, -96], 4);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    layersRef.current = window.L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
      hasFitBoundsRef.current = false;
    };
  }, [leafletReady]);

  useEffect(() => {
    if (!leafletReady || !mapRef.current || !layersRef.current) return;

    layersRef.current.clearLayers();

    hexGrid.forEach((hex) => {
      const assignedProvider = visibleAssignments[hex.id];
      const fillColor = assignedProvider ? providerColors[assignedProvider] : "#ffffff";

      const layer = window.L.polygon(hex.polygon, {
        color: assignedProvider ? fillColor : "#cbd5e1",
        fillColor,
        fillOpacity: assignedProvider ? 0.58 : 0.04,
        weight: assignedProvider ? 1.2 : 0.7,
      });

      layer.bindTooltip(
        assignedProvider
          ? `${providerMeta[assignedProvider].label} hex`
          : "Unassigned hex",
        { sticky: true }
      );

      layer.on("click", () => {
        setHexOverrides((current) => {
          const next = { ...current };

          if (activePaint === "clear") next[hex.id] = null;
          else next[hex.id] = activePaint;

          return next;
        });
      });

      layer.addTo(layersRef.current);
    });

    if (!hasFitBoundsRef.current) {
      mapRef.current.fitBounds(
        [
          [MAP_BOUNDS.minLat, MAP_BOUNDS.minLng],
          [MAP_BOUNDS.maxLat, MAP_BOUNDS.maxLng],
        ],
        { padding: [20, 20] }
      );
      hasFitBoundsRef.current = true;
    }
  }, [activePaint, hexGrid, leafletReady, providerColors, setHexOverrides, visibleAssignments]);

  const updateProviderColor = (provider, color) => {
    setProviderColors((current) => ({ ...current, [provider]: color }));
  };

  const clearPaintedHexes = () => {
    setHexOverrides({});
  };

  return (
    <main className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Coverage Map
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Hex Coverage
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                T-Mobile now uses one color. Click hexes on the map to paint AT&T or
                T-Mobile coverage and keep notes in the sidebar.
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setNotesOpen(true)}
            >
              Open Notes
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
          <h2 className="text-lg font-bold text-slate-900">Paint Tool</h2>
          <div className="mt-4 grid gap-3">
            {Object.entries(providerMeta).map(([providerKey, provider]) => {
              const isColorProvider = providerKey !== "clear";

              return (
                <button
                  key={providerKey}
                  type="button"
                  onClick={() => setActivePaint(providerKey)}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                    activePaint === providerKey
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <span className="text-sm font-semibold">{provider.label}</span>
                  {isColorProvider ? (
                    <span
                      className="h-4 w-4 rounded-full border border-white/30"
                      style={{ backgroundColor: providerColors[providerKey] }}
                    />
                  ) : (
                    <span className="text-xs uppercase tracking-[0.2em]">Erase</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Active tool applies when you click a hex. Use Clear to remove a filled hex.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Provider Colors</h2>
            <button
              type="button"
              onClick={clearPaintedHexes}
              className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
            >
              Clear Manual Edits
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {Object.entries(providerMeta)
              .filter(([providerKey]) => providerKey !== "clear")
              .map(([providerKey, provider]) => (
                <label
                  key={providerKey}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                >
                  <span className="text-sm font-semibold text-slate-700">{provider.label}</span>
                  <div className="flex items-center gap-3">
                    <span
                      className="h-4 w-4 rounded-full border border-slate-300"
                      style={{ backgroundColor: providerColors[providerKey] }}
                    />
                    <input
                      type="color"
                      value={providerColors[providerKey]}
                      onChange={(event) => updateProviderColor(providerKey, event.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 bg-transparent p-1"
                    />
                  </div>
                </label>
              ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
          <h2 className="text-lg font-bold text-slate-900">Coverage Stats</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Filled Hexes
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">{paintedHexCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Hex Radius
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">~{HEX_RADIUS_DEGREES}°</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative min-h-[720px] overflow-hidden rounded-[32px] border border-slate-200 bg-white/75 shadow-sm backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
          <div className="rounded-2xl bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Hex Map
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {Object.entries(providerMeta)
                .filter(([providerKey]) => providerKey !== "clear")
                .map(([providerKey, provider]) => (
                  <div key={providerKey} className="flex items-center gap-2 text-sm text-slate-700">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: providerColors[providerKey] }}
                    />
                    <span>{provider.label}</span>
                  </div>
                ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="pointer-events-auto rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm"
          >
            Notes
          </button>
        </div>

        {leafletError ? (
          <div className="flex h-full min-h-[720px] items-center justify-center p-6 text-center text-sm text-rose-600">
            {leafletError}
          </div>
        ) : (
          <div ref={mapNodeRef} className="h-full min-h-[720px] w-full" />
        )}
      </section>

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${
          notesOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Sidebar Notes
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Map Notes</h2>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700"
            onClick={() => setNotesOpen(false)}
          >
            Close
          </button>
        </div>

        <div className="flex-1 p-5">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Use this panel for market notes, build targets, follow-ups, or color legend reminders."
            className="h-full min-h-[320px] w-full resize-none rounded-3xl border border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-800 outline-none"
          />
        </div>
      </aside>

      {notesOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px]"
          onClick={() => setNotesOpen(false)}
          aria-label="Close notes sidebar"
        />
      ) : null}
    </main>
  );
}
