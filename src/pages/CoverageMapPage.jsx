import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { defaultProviderColors, starterAreas } from "../lib/coverageMapData.js";
import { db } from "../lib/firebase.js";
import { useAuthRole } from "../hooks/useAuth.js";
import NormalLeadsFormatter from "../components/NormalLeadsFormatter.jsx";

const NOTES_STORAGE_KEY = "coverage-map-notes";
const NOTES_DRAFT_STORAGE_KEY = "coverage-map-notes-draft";
const COLORS_STORAGE_KEY = "coverage-map-colors";
const HEX_OVERRIDES_STORAGE_KEY = "coverage-map-hex-overrides";
const SHARED_MAP_DOC_PATH = ["sharedMaps", "coverageMap"];
const HEX_RADIUS_DEGREES = 0.33;
const LEAD_HIGHLIGHT_COLOR = "#a3e635";
const MAP_BOUNDS = {
  minLat: 24.2,
  maxLat: 49.6,
  minLng: -125.2,
  maxLng: -66.2,
};

const providerMeta = {
  att: { label: "AT&T" },
  tmobile: { label: "T-Fiber" },
  attTfiber: { label: "AT&T + T-Fiber" },
  clear: { label: "Clear" },
};

function readLocalStorageValue(key, fallbackValue) {
  if (typeof window === "undefined") return fallbackValue;

  const storedValue = window.localStorage.getItem(key);
  if (!storedValue) return fallbackValue;

  try {
    return JSON.parse(storedValue);
  } catch {
    return fallbackValue;
  }
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
  if (provider === "tfiber") return "tmobile";
  if (provider === "att+tfiber" || provider === "att_tfiber" || provider === "both") {
    return "attTfiber";
  }
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

function getHexDistance(pointA, pointB) {
  const [latA, lngA] = pointA;
  const [latB, lngB] = pointB;
  const avgLatRadians = (((latA + latB) / 2) * Math.PI) / 180;
  const latDelta = latA - latB;
  const lngDelta = (lngA - lngB) * Math.cos(avgLatRadians);
  return Math.sqrt(latDelta * latDelta + lngDelta * lngDelta);
}

async function geocodeZipCode(zipCode) {
  const providers = [
    async () => {
      const endpoint = new URL("https://nominatim.openstreetmap.org/search");
      endpoint.searchParams.set("country", "United States");
      endpoint.searchParams.set("postalcode", zipCode);
      endpoint.searchParams.set("format", "jsonv2");
      endpoint.searchParams.set("limit", "1");

      const response = await fetch(endpoint.toString(), {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) return null;

      const results = await response.json();
      const match = results?.[0];
      if (!match) return null;

      return [Number(match.lat), Number(match.lon)];
    },
    async () => {
      const response = await fetch(`https://api.zippopotam.us/us/${zipCode}`, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) return null;

      const data = await response.json();
      const place = data?.places?.[0];
      if (!place) return null;

      return [Number(place.latitude), Number(place.longitude)];
    },
  ];

  for (const provider of providers) {
    try {
      const result = await provider();
      if (result && Number.isFinite(result[0]) && Number.isFinite(result[1])) {
        return result;
      }
    } catch (error) {
      console.warn(`ZIP geocoding provider failed for ${zipCode}`, error);
    }
  }

  return null;
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
  const hasLoadedSharedStateRef = useRef(false);
  const lastSavedPayloadRef = useRef("");
  const notesRef = useRef("");
  const sharedPayloadRef = useRef(null);
  const sharedMapRef = useMemo(() => doc(db, ...SHARED_MAP_DOC_PATH), []);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(() => readLocalStorageValue(NOTES_STORAGE_KEY, ""));
  const [draftNotes, setDraftNotes] = useState(() =>
    readLocalStorageValue(NOTES_DRAFT_STORAGE_KEY, readLocalStorageValue(NOTES_STORAGE_KEY, ""))
  );
  const [providerColors, setProviderColors] = useState(() =>
    readLocalStorageValue(COLORS_STORAGE_KEY, defaultProviderColors)
  );
  const [hexOverrides, setHexOverrides] = useState(() =>
    readLocalStorageValue(HEX_OVERRIDES_STORAGE_KEY, {})
  );
  const [leadHighlightHexes, setLeadHighlightHexes] = useState([]);
  const [leadHighlightMeta, setLeadHighlightMeta] = useState({
    zipCodes: [],
    failedZipCodes: [],
    loading: false,
  });
  const [activePaint, setActivePaint] = useState("att");
  const [sharedStateError, setSharedStateError] = useState("");
  const { ready: leafletReady, error: leafletError } = useLeaflet();
  const { user, isDemo } = useAuthRole();

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
  const hasUnsavedNotes = draftNotes !== notes;
  const sharedPayload = useMemo(
    () => ({
      notes,
      providerColors,
      hexOverrides,
      leadHighlightHexes,
      leadHighlightZipCodes: leadHighlightMeta.zipCodes,
    }),
    [hexOverrides, leadHighlightHexes, leadHighlightMeta.zipCodes, notes, providerColors]
  );

  useEffect(() => {
    sharedPayloadRef.current = sharedPayload;
  }, [sharedPayload]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(NOTES_DRAFT_STORAGE_KEY, JSON.stringify(draftNotes));
  }, [draftNotes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLORS_STORAGE_KEY, JSON.stringify(providerColors));
  }, [providerColors]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HEX_OVERRIDES_STORAGE_KEY, JSON.stringify(hexOverrides));
  }, [hexOverrides]);

  useEffect(() => {
    if (isDemo) {
      hasLoadedSharedStateRef.current = true;
      setSharedStateError("");
      return undefined;
    }

    hasLoadedSharedStateRef.current = false;

    return onSnapshot(
      sharedMapRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() || {};
          const nextNotes = typeof data.notes === "string" ? data.notes : "";
          const nextLeadHighlightHexes = Array.isArray(data.leadHighlightHexes)
            ? data.leadHighlightHexes.filter((value) => typeof value === "string")
            : [];
          const nextLeadHighlightZipCodes = Array.isArray(data.leadHighlightZipCodes)
            ? data.leadHighlightZipCodes.filter((value) => typeof value === "string")
            : [];
          setNotes(nextNotes);
          setDraftNotes((current) => (current === notesRef.current ? nextNotes : current));
          setProviderColors({
            ...defaultProviderColors,
            ...(data.providerColors || {}),
          });
          setHexOverrides(data.hexOverrides || {});
          setLeadHighlightHexes(nextLeadHighlightHexes);
          setLeadHighlightMeta((current) => ({
            ...current,
            zipCodes: nextLeadHighlightZipCodes,
            failedZipCodes: [],
            loading: false,
          }));
          lastSavedPayloadRef.current = JSON.stringify({
            notes: nextNotes,
            providerColors: {
              ...defaultProviderColors,
              ...(data.providerColors || {}),
            },
            hexOverrides: data.hexOverrides || {},
            leadHighlightHexes: nextLeadHighlightHexes,
            leadHighlightZipCodes: nextLeadHighlightZipCodes,
          });
        } else {
          const initialPayload = sharedPayloadRef.current || {
            notes: "",
            providerColors: defaultProviderColors,
            hexOverrides: {},
            leadHighlightHexes: [],
            leadHighlightZipCodes: [],
          };
          lastSavedPayloadRef.current = JSON.stringify(initialPayload);
          await setDoc(
            sharedMapRef,
            {
              ...initialPayload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              updatedBy: user?.uid || null,
            },
            { merge: true }
          );
        }

        hasLoadedSharedStateRef.current = true;
        setSharedStateError("");
      },
      (error) => {
        console.error("Failed to load shared coverage map state", error);
        hasLoadedSharedStateRef.current = true;
        setSharedStateError("Shared sync is unavailable right now. Showing local edits only.");
      }
    );
  }, [isDemo, sharedMapRef, user?.uid]);

  useEffect(() => {
    if (isDemo || !hasLoadedSharedStateRef.current) return undefined;

    const serializedPayload = JSON.stringify(sharedPayload);
    if (serializedPayload === lastSavedPayloadRef.current) return undefined;

    const timeoutId = window.setTimeout(() => {
      lastSavedPayloadRef.current = serializedPayload;
      setDoc(
        sharedMapRef,
        {
          ...sharedPayload,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || null,
        },
        { merge: true }
      ).catch((error) => {
        console.error("Failed to save shared coverage map state", error);
        lastSavedPayloadRef.current = "";
        setSharedStateError("Shared sync is unavailable right now. Showing local edits only.");
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [isDemo, sharedMapRef, sharedPayload, user?.uid]);

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
      const isLeadHighlighted = leadHighlightHexes.includes(hex.id);
      const fillColor = isLeadHighlighted
        ? LEAD_HIGHLIGHT_COLOR
        : assignedProvider
        ? providerColors[assignedProvider]
        : "#ffffff";

      const layer = window.L.polygon(hex.polygon, {
        color: isLeadHighlighted
          ? "#65a30d"
          : assignedProvider
          ? fillColor
          : "#cbd5e1",
        fillColor,
        fillOpacity: isLeadHighlighted ? 0.68 : assignedProvider ? 0.58 : 0.04,
        weight: isLeadHighlighted ? 1.6 : assignedProvider ? 1.2 : 0.7,
      });

      layer.bindTooltip(
        isLeadHighlighted
          ? "Normal leads ZIP area"
          : assignedProvider
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
  }, [
    activePaint,
    hexGrid,
    leadHighlightHexes,
    leafletReady,
    providerColors,
    setHexOverrides,
    visibleAssignments,
  ]);

  useEffect(() => {
    if (!leafletReady || !mapRef.current || leadHighlightHexes.length === 0) return;

    const highlightedPolygons = hexGrid.filter((hex) => leadHighlightHexes.includes(hex.id));
    if (!highlightedPolygons.length) return;

    const bounds = highlightedPolygons.flatMap((hex) => hex.polygon);
    mapRef.current.fitBounds(bounds, {
      padding: [24, 24],
      maxZoom: 10,
    });
  }, [hexGrid, leadHighlightHexes, leafletReady]);

  const updateProviderColor = (provider, color) => {
    setProviderColors((current) => ({ ...current, [provider]: color }));
  };

  const clearPaintedHexes = () => {
    setHexOverrides({});
  };

  const clearLeadHighlights = () => {
    setLeadHighlightHexes([]);
    setLeadHighlightMeta({
      zipCodes: [],
      failedZipCodes: [],
      loading: false,
    });
  };

  const handleNormalLeadsFormatted = async (prepared) => {
    const zipCodes = prepared?.zipCodes || [];
    if (!zipCodes.length) {
      setLeadHighlightHexes([]);
      setLeadHighlightMeta({
        zipCodes: [],
        failedZipCodes: [],
        loading: false,
      });
      return;
    }

    setLeadHighlightMeta({
      zipCodes,
      failedZipCodes: [],
      loading: true,
    });
    setSharedStateError("");

    const highlightedHexIds = new Set();
    const failedZipCodes = [];

    for (const zipCode of zipCodes) {
      try {
        const center = await geocodeZipCode(zipCode);
        if (!center) {
          failedZipCodes.push(zipCode);
          continue;
        }

        const nearbyHexes = hexGrid
          .map((hex) => ({
            id: hex.id,
            distance: getHexDistance(center, hex.center),
          }))
          .sort((a, b) => a.distance - b.distance)
          .filter((hex, index) => index < 7 || hex.distance <= HEX_RADIUS_DEGREES * 1.8);

        nearbyHexes.forEach((hex) => highlightedHexIds.add(hex.id));
      } catch (error) {
        console.error(error);
        failedZipCodes.push(zipCode);
      }
    }

    setLeadHighlightHexes(Array.from(highlightedHexIds));
    setLeadHighlightMeta({
      zipCodes,
      failedZipCodes,
      loading: false,
    });
  };

  const saveNotes = () => {
    setNotes(draftNotes);
    setSharedStateError("");
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
                Click hexes on the map to paint AT&T, T-Fiber, or shared AT&T and
                T-Fiber coverage and keep notes in the sidebar.
              </p>
              {leadHighlightMeta.zipCodes.length > 0 ? (
                <p className="mt-3 text-sm font-medium text-lime-700">
                  Normal leads highlighted for ZIPs: {leadHighlightMeta.zipCodes.join(", ")}
                </p>
              ) : null}
              {leadHighlightMeta.failedZipCodes.length > 0 ? (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  Could not map ZIPs: {leadHighlightMeta.failedZipCodes.join(", ")}
                </p>
              ) : null}
              {leadHighlightMeta.loading ? (
                <p className="mt-2 text-sm font-medium text-slate-600">
                  Mapping ZIP highlights...
                </p>
              ) : null}
              {sharedStateError ? (
                <p className="mt-3 text-sm font-medium text-amber-700">{sharedStateError}</p>
              ) : null}
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearLeadHighlights}
                className="rounded-full border border-lime-200 px-3 py-1 text-xs font-semibold text-lime-700"
              >
                Clear Lead Highlights
              </button>
              <button
                type="button"
                onClick={clearPaintedHexes}
                className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
              >
                Clear Manual Edits
              </button>
            </div>
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

        <NormalLeadsFormatter onFormatComplete={handleNormalLeadsFormatted} />
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
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: LEAD_HIGHLIGHT_COLOR }} />
                <span>Normal Leads ZIPs</span>
              </div>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700"
              onClick={() => setDraftNotes(notes)}
              disabled={!hasUnsavedNotes}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-sm font-semibold text-white disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
              onClick={saveNotes}
              disabled={!hasUnsavedNotes}
            >
              Save
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700"
              onClick={() => setNotesOpen(false)}
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 p-5">
          <p className="mb-3 text-xs font-medium text-slate-500">
            Notes stay local while you type. Click Save to publish them to the shared map.
          </p>
          <textarea
            value={draftNotes}
            onChange={(event) => setDraftNotes(event.target.value)}
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
