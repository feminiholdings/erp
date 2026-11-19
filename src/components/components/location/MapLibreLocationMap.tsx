import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { ExternalLink, MapPin } from 'lucide-react';
import { buildOpenStreetMapDirectUrl, buildOpenStreetMapEmbedUrl } from '../../utils/realLocationService';

export interface MapBranchPin {
  id: string;
  name: string;
  code?: string;
  latitude: number;
  longitude: number;
  isPrimary?: boolean;
  subtitle?: string;
}

export interface MapLibreLocationMapProps {
  latitude: number;
  longitude: number;
  zoom?: number;
  heightClassName?: string;
  interactive?: boolean;
  userPinLabel?: string;
  branches?: MapBranchPin[];
  onSelectCoordinates?: (lat: number, lng: number) => void;
}

const OSM_RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles-layer',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

function supportsWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export const MapLibreLocationMap: React.FC<MapLibreLocationMapProps> = ({
  latitude,
  longitude,
  zoom = 13,
  heightClassName = 'h-[300px] sm:h-[340px]',
  interactive = true,
  userPinLabel = 'Selected Delivery Location',
  branches = [],
  onSelectCoordinates,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const branchMarkersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelectCoordinates);
  onSelectRef.current = onSelectCoordinates;

  const [mapFailed, setMapFailed] = useState(false);

  // Initialize MapLibre GL map once
  useEffect(() => {
    if (!containerRef.current) return;
    if (!supportsWebGL()) {
      setMapFailed(true);
      return;
    }

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_RASTER_STYLE,
        center: [longitude, latitude],
        zoom,
        attributionControl: { compact: true },
      });
    } catch {
      setMapFailed(true);
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const userMarkerEl = document.createElement('div');
    userMarkerEl.className = 'vaairo-map-user-pin';
    userMarkerEl.style.width = '28px';
    userMarkerEl.style.height = '28px';
    userMarkerEl.style.borderRadius = '9999px';
    userMarkerEl.style.background = '#0A006E';
    userMarkerEl.style.border = '4px solid #FFDE00';
    userMarkerEl.style.boxShadow = '0 4px 12px rgba(10,0,110,0.45)';
    userMarkerEl.style.cursor = interactive ? 'grab' : 'default';

    const userMarker = new maplibregl.Marker({
      element: userMarkerEl,
      draggable: interactive,
    })
      .setLngLat([longitude, latitude])
      .setPopup(
        new maplibregl.Popup({ offset: 20 }).setHTML(
          `<div style="font-family:sans-serif;font-size:12px;font-weight:700;color:#0A006E;">${userPinLabel}</div>`
        )
      )
      .addTo(map);

    if (interactive) {
      userMarker.on('dragend', () => {
        const lngLat = userMarker.getLngLat();
        onSelectRef.current?.(Number(lngLat.lat.toFixed(6)), Number(lngLat.lng.toFixed(6)));
      });

      map.on('click', (e) => {
        const lat = Number(e.lngLat.lat.toFixed(6));
        const lng = Number(e.lngLat.lng.toFixed(6));
        userMarker.setLngLat([lng, lat]);
        onSelectRef.current?.(lat, lng);
      });
    }

    map.on('error', () => {
      // Keep rendering gracefully even if an individual tile fails
    });

    mapRef.current = map;
    userMarkerRef.current = userMarker;

    return () => {
      branchMarkersRef.current.forEach((m) => m.remove());
      branchMarkersRef.current = [];
      userMarker.remove();
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
    };
    // Intentionally initialize once; coordinate updates handled in effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update user marker & fly map smoothly when coordinates change
  useEffect(() => {
    const map = mapRef.current;
    const marker = userMarkerRef.current;
    if (!map || !marker) return;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    marker.setLngLat([longitude, latitude]);
    map.easeTo({
      center: [longitude, latitude],
      duration: 500,
    });
  }, [latitude, longitude]);

  // Render fulfilment branch markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    branchMarkersRef.current.forEach((m) => m.remove());
    branchMarkersRef.current = [];

    for (const b of branches) {
      if (!Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)) continue;

      const el = document.createElement('div');
      el.style.width = b.isPrimary ? '22px' : '16px';
      el.style.height = b.isPrimary ? '22px' : '16px';
      el.style.borderRadius = '6px';
      el.style.background = b.isPrimary ? '#059669' : '#475569';
      el.style.border = '2px solid #ffffff';
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';

      const popupHtml = `<div style="font-family:sans-serif;font-size:11px;line-height:1.35;">
        <div style="font-weight:800;color:#0A006E;">${b.name}</div>
        ${b.subtitle ? `<div style="color:#475569;margin-top:2px;">${b.subtitle}</div>` : ''}
      </div>`;

      const m = new maplibregl.Marker({ element: el })
        .setLngLat([b.longitude, b.latitude])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(popupHtml))
        .addTo(map);

      branchMarkersRef.current.push(m);
    }
  }, [branches]);

  if (mapFailed) {
    return (
      <div className={`relative w-full ${heightClassName} rounded-xl overflow-hidden border border-slate-200 bg-slate-100`}>
        <iframe
          title="OpenStreetMap Location Preview"
          src={buildOpenStreetMapEmbedUrl(latitude, longitude, 0.012)}
          className="w-full h-full border-0"
          loading="lazy"
        />
        <a
          href={buildOpenStreetMapDirectUrl(latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2 right-2 px-2.5 py-1.5 rounded-lg bg-white/95 border border-slate-200 text-[11px] font-bold text-[#0A006E] shadow-sm inline-flex items-center gap-1 hover:bg-[#FFDE00]"
        >
          <ExternalLink className="w-3 h-3" /> Open in OpenStreetMap
        </a>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${heightClassName} rounded-xl overflow-hidden border border-slate-200 bg-slate-100`}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="pointer-events-none absolute top-2.5 left-2.5 z-10 bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
        <MapPin className="w-3.5 h-3.5 text-[#0A006E]" />
        <span>
          {interactive
            ? 'Click map or drag pin to adjust location'
            : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
        </span>
      </div>
      <a
        href={buildOpenStreetMapDirectUrl(latitude, longitude)}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 left-2 z-10 px-2 py-1 rounded-md bg-white/90 border border-slate-200 text-[10px] font-bold text-[#0A006E] shadow-sm inline-flex items-center gap-1 hover:bg-[#FFDE00]"
      >
        <ExternalLink className="w-3 h-3" /> OpenStreetMap
      </a>
    </div>
  );
};
