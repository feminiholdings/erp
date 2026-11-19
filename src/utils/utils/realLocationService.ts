import type {
  Branch,
  CustomerDeliveryLocation,
  DeliveryGlobalSettings,
  DeliveryZone,
  GeoRegion,
  Product,
  ProductLocationAvailability,
} from '../types';
import type {
  CartValidationRequestItem,
  CartValidationResult,
  CatalogFilterOptions,
} from '../../lib/deliveryEngine';
import {
  buildStableLocationId,
  inferNearestDirectoryLocationFromCoords,
  normalizeCountyName,
} from '../../lib/locationsDirectory';
import { DELIVERY_ZONE_GEO_DIRECTORY, calculateHaversineDistanceKm } from './branchGeoRouting';

export interface RealResolvedLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  displayName: string;
  streetOrBuilding: string;
  areaOrSuburb: string;
  cityOrTown: string;
  county: string;
  country?: string;
  countryCode?: string;
  locationId?: string;
  placeId?: string;
  provider?: string;
  matchedDeliveryZone: string;
  source: 'BROWSER_GPS' | 'PLACE_SEARCH' | 'IP_GEOLOCATION' | 'MAP_PIN' | 'MANUAL_HIERARCHY';
  resolvedAt?: number;
}

export interface NormalizedApiGeocodedResult {
  provider?: string;
  place_id: number | string;
  lat: string;
  lon: string;
  latitude?: number;
  longitude?: number;
  locationId?: string;
  display_name: string;
  name?: string;
  country?: string;
  countryCode?: string;
  county?: string;
  cityOrTown?: string;
  estateOrLocality?: string;
  streetOrBuilding?: string;
  address?: {
    road?: string;
    building?: string;
    house_number?: string;
    amenity?: string;
    shop?: string;
    suburb?: string;
    neighbourhood?: string;
    residential?: string;
    quarter?: string;
    estate?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

export interface BranchDrivingMetric {
  branchId: string;
  distanceMeters: number;
  distanceKm: number;
  driveMinutes: number;
  etaMinutes: number;
  provider?: string;
}

const PERSISTED_LOCATION_KEY = 'vaairo_real_location_v3';
const PERSISTED_DELIVERY_LOCATION_KEY = 'vaairo_delivery_location_v1';
const PERSISTED_LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function savePersistedDeliveryLocation(loc: CustomerDeliveryLocation): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CustomerDeliveryLocation = {
      ...loc,
      confirmedAt: Date.now(),
    };
    window.localStorage.setItem(PERSISTED_DELIVERY_LOCATION_KEY, JSON.stringify(payload));
    savePersistedRealLocation(deliveryLocationToRealLocation(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function getPersistedDeliveryLocation(): CustomerDeliveryLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PERSISTED_DELIVERY_LOCATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CustomerDeliveryLocation;
      if (
        parsed &&
        typeof parsed.latitude === 'number' &&
        typeof parsed.longitude === 'number' &&
        Number.isFinite(parsed.latitude) &&
        Number.isFinite(parsed.longitude) &&
        parsed.county
      ) {
        const age = Date.now() - Number(parsed.confirmedAt || 0);
        if (!parsed.confirmedAt || age <= PERSISTED_LOCATION_MAX_AGE_MS) {
          return parsed;
        }
      }
    }
    const legacy = getPersistedRealLocation();
    if (legacy) {
      return realLocationToDeliveryLocation(legacy);
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPersistedDeliveryLocation(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PERSISTED_DELIVERY_LOCATION_KEY);
    window.localStorage.removeItem(PERSISTED_LOCATION_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function savePersistedRealLocation(loc: RealResolvedLocation): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: RealResolvedLocation = {
      ...loc,
      resolvedAt: Date.now(),
    };
    window.localStorage.setItem(PERSISTED_LOCATION_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
}

export function getPersistedRealLocation(): RealResolvedLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PERSISTED_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RealResolvedLocation;
    if (
      !parsed ||
      typeof parsed.latitude !== 'number' ||
      typeof parsed.longitude !== 'number' ||
      Number.isNaN(parsed.latitude) ||
      Number.isNaN(parsed.longitude)
    ) {
      return null;
    }
    const age = Date.now() - Number(parsed.resolvedAt || 0);
    if (parsed.resolvedAt && age > PERSISTED_LOCATION_MAX_AGE_MS) {
      window.localStorage.removeItem(PERSISTED_LOCATION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPersistedRealLocation(): void {
  clearPersistedDeliveryLocation();
}

export function realLocationToDeliveryLocation(loc: RealResolvedLocation): CustomerDeliveryLocation {
  const nearest = inferNearestDirectoryLocationFromCoords(loc.latitude, loc.longitude);
  const countryCode = (loc.countryCode || nearest.countryCode || 'KE').toUpperCase();
  const country = loc.country || (countryCode === 'KE' ? 'Kenya' : nearest.country);
  const county =
    normalizeCountyName(loc.county || loc.cityOrTown || '', countryCode) ||
    loc.county ||
    nearest.county;
  const cityOrTown = loc.cityOrTown || county;
  const estateOrLocality =
    (loc.areaOrSuburb || '').split(',')[0]?.trim() || loc.streetOrBuilding || cityOrTown;

  return {
    locationId:
      loc.locationId ||
      buildStableLocationId({
        countryCode,
        county,
        cityOrTown,
        estateOrLocality,
      }),
    country,
    countryCode,
    county,
    cityOrTown,
    estateOrLocality,
    streetOrBuilding: loc.streetOrBuilding || undefined,
    formattedAddress:
      loc.displayName || [estateOrLocality, cityOrTown, county, country].filter(Boolean).join(', '),
    latitude: Number(loc.latitude.toFixed(6)),
    longitude: Number(loc.longitude.toFixed(6)),
    accuracyMeters: loc.accuracyMeters,
    source:
      loc.source === 'BROWSER_GPS'
        ? 'BROWSER_GPS'
        : loc.source === 'PLACE_SEARCH'
        ? 'ADDRESS_SEARCH'
        : loc.source === 'MAP_PIN'
        ? 'MAP_PIN'
        : loc.source === 'IP_GEOLOCATION'
        ? 'IP_GEOLOCATION'
        : 'MANUAL_HIERARCHY',
    provider: loc.provider,
    confirmedAt: loc.resolvedAt || Date.now(),
  };
}

export function deliveryLocationToRealLocation(loc: CustomerDeliveryLocation): RealResolvedLocation {
  return {
    latitude: loc.latitude,
    longitude: loc.longitude,
    accuracyMeters: loc.accuracyMeters,
    displayName: loc.formattedAddress,
    streetOrBuilding: loc.streetOrBuilding || loc.estateOrLocality,
    areaOrSuburb: loc.estateOrLocality || loc.cityOrTown,
    cityOrTown: loc.cityOrTown,
    county: loc.county,
    country: loc.country,
    countryCode: loc.countryCode,
    locationId: loc.locationId,
    provider: loc.provider,
    matchedDeliveryZone: `${loc.county}, ${loc.estateOrLocality || loc.cityOrTown}`,
    source:
      loc.source === 'BROWSER_GPS'
        ? 'BROWSER_GPS'
        : loc.source === 'ADDRESS_SEARCH'
        ? 'PLACE_SEARCH'
        : loc.source === 'MAP_PIN'
        ? 'MAP_PIN'
        : loc.source === 'IP_GEOLOCATION'
        ? 'IP_GEOLOCATION'
        : 'MANUAL_HIERARCHY',
    resolvedAt: loc.confirmedAt,
  };
}

export function matchNearestDeliveryZoneFromRealCoords(
  lat: number,
  lng: number,
  areaLabel?: string
): string {
  let closestZone = DELIVERY_ZONE_GEO_DIRECTORY[0];
  let minDistance = Number.POSITIVE_INFINITY;

  for (const z of DELIVERY_ZONE_GEO_DIRECTORY) {
    const dist = calculateHaversineDistanceKm(lat, lng, z.latitude, z.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      closestZone = z;
    }
  }

  if (areaLabel && areaLabel.trim()) {
    return areaLabel.trim();
  }
  if (minDistance <= 60) {
    return closestZone.label;
  }
  return `GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

export function parseApiResultToDeliveryLocation(
  data: NormalizedApiGeocodedResult,
  lat: number,
  lng: number,
  source: CustomerDeliveryLocation['source'],
  accuracyMeters?: number
): CustomerDeliveryLocation {
  const nearest = inferNearestDirectoryLocationFromCoords(lat, lng);
  const addr = data.address || {};
  const countryCode = (
    data.countryCode ||
    addr.country_code ||
    (nearest.distanceKm < 250 ? nearest.countryCode : 'KE')
  ).toUpperCase();
  const country = data.country || addr.country || (countryCode === 'KE' ? 'Kenya' : nearest.country);
  const rawCounty = data.county || addr.county || addr.state || data.cityOrTown || addr.city || '';
  const county =
    normalizeCountyName(rawCounty, countryCode) ||
    (nearest.distanceKm < 120 ? nearest.county : rawCounty || 'Nairobi');
  const cityOrTown = data.cityOrTown || addr.city || addr.town || county;
  const estateOrLocality =
    data.estateOrLocality ||
    addr.suburb ||
    addr.estate ||
    addr.neighbourhood ||
    addr.quarter ||
    data.name ||
    cityOrTown;
  const streetOrBuilding =
    data.streetOrBuilding ||
    [data.name, [addr.house_number, addr.road].filter(Boolean).join(' ')]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', ') ||
    estateOrLocality;

  return {
    locationId:
      data.locationId ||
      buildStableLocationId({
        countryCode,
        county,
        cityOrTown,
        estateOrLocality,
      }),
    country,
    countryCode,
    county,
    cityOrTown,
    estateOrLocality,
    streetOrBuilding,
    formattedAddress:
      data.display_name ||
      [streetOrBuilding, estateOrLocality, cityOrTown, county, country]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(', '),
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    accuracyMeters,
    source,
    provider: data.provider || 'OSM_NOMINATIM',
    confirmedAt: Date.now(),
  };
}

/**
 * Reverse geocodes GPS coordinates via server proxy (/api/location/reverse) backed by Geoapify + OpenStreetMap Nominatim.
 */
export async function reverseGeocodeToDeliveryLocation(
  lat: number,
  lng: number,
  source: CustomerDeliveryLocation['source'] = 'BROWSER_GPS',
  accuracyMeters?: number
): Promise<CustomerDeliveryLocation> {
  try {
    const res = await fetch(
      `/api/location/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
      { cache: 'no-store' }
    );
    const data = (await res.json().catch(() => null)) as NormalizedApiGeocodedResult | null;
    if (res.ok && data && (data.display_name || data.county || data.address)) {
      return parseApiResultToDeliveryLocation(data, lat, lng, source, accuracyMeters);
    }
  } catch {
    // Graceful local 47-county centroid fallback below
  }

  const nearest = inferNearestDirectoryLocationFromCoords(lat, lng);
  return {
    locationId: buildStableLocationId({
      countryCode: nearest.countryCode,
      county: nearest.county,
      cityOrTown: nearest.cityOrTown,
      estateOrLocality: nearest.estateOrLocality,
    }),
    country: nearest.country,
    countryCode: nearest.countryCode,
    county: nearest.county,
    cityOrTown: nearest.cityOrTown,
    estateOrLocality: nearest.estateOrLocality,
    streetOrBuilding: `GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
    formattedAddress: `${nearest.estateOrLocality}, ${nearest.cityOrTown}, ${nearest.county}, ${nearest.country}`,
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    accuracyMeters,
    source,
    provider: 'DIRECTORY_FALLBACK',
    confirmedAt: Date.now(),
  };
}

export async function reverseGeocodeRealCoordinates(
  lat: number,
  lng: number,
  source: RealResolvedLocation['source'] = 'BROWSER_GPS',
  accuracyMeters?: number
): Promise<RealResolvedLocation> {
  const mappedSource: CustomerDeliveryLocation['source'] =
    source === 'BROWSER_GPS'
      ? 'BROWSER_GPS'
      : source === 'MAP_PIN'
      ? 'MAP_PIN'
      : source === 'PLACE_SEARCH'
      ? 'ADDRESS_SEARCH'
      : source === 'IP_GEOLOCATION'
      ? 'IP_GEOLOCATION'
      : 'MANUAL_HIERARCHY';
  const loc = await reverseGeocodeToDeliveryLocation(lat, lng, mappedSource, accuracyMeters);
  return deliveryLocationToRealLocation(loc);
}

/**
 * Searches addresses & landmarks via /api/location/search (Geoapify Autocomplete + OpenStreetMap Nominatim).
 */
export async function searchDeliveryLocations(
  query: string,
  countryCode: string = 'ke',
  biasCoords?: { lat: number; lng: number } | null
): Promise<CustomerDeliveryLocation[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const params = new URLSearchParams({ q: trimmed });
    if (countryCode && countryCode.trim().length === 2) {
      params.set('country', countryCode.trim().toLowerCase());
    }
    if (biasCoords && Number.isFinite(biasCoords.lat) && Number.isFinite(biasCoords.lng)) {
      params.set('lat', String(biasCoords.lat));
      params.set('lng', String(biasCoords.lng));
    }

    const res = await fetch(`/api/location/search?${params.toString()}`, {
      cache: 'no-store',
    });
    const payload = (await res.json().catch(() => null)) as {
      results?: NormalizedApiGeocodedResult[];
    } | null;

    if (res.ok && Array.isArray(payload?.results)) {
      return payload.results
        .filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
        .map((item) =>
          parseApiResultToDeliveryLocation(item, Number(item.lat), Number(item.lon), 'ADDRESS_SEARCH')
        );
    }
  } catch {
    // Graceful empty list on transient network failure
  }

  return [];
}

export async function searchRealPlaces(
  query: string,
  countryCode?: string,
  biasCoords?: { lat: number; lng: number } | null
): Promise<RealResolvedLocation[]> {
  const results = await searchDeliveryLocations(query, countryCode || 'ke', biasCoords);
  return results.map(deliveryLocationToRealLocation);
}

/**
 * Computes road driving distance & ETA from customer location to fulfilment hubs
 * via /api/location/route-matrix (Geoapify Routing / OSRM / Road-Haversine).
 */
export async function computeRealBranchDrivingMatrix(
  origin: { lat: number; lng: number },
  destinations: Array<{ branchId: string; lat: number; lng: number }>
): Promise<Record<string, BranchDrivingMetric>> {
  if (
    !origin ||
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lng) ||
    destinations.length === 0
  ) {
    return {};
  }

  try {
    const res = await fetch('/api/location/route-matrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin,
        destinations: destinations.slice(0, 25),
      }),
      cache: 'no-store',
    });

    const data = (await res.json().catch(() => null)) as {
      results?: BranchDrivingMetric[];
    } | null;

    const map: Record<string, BranchDrivingMetric> = {};
    if (res.ok && Array.isArray(data?.results)) {
      for (const item of data.results) {
        if (item && item.branchId && Number.isFinite(item.distanceKm)) {
          map[item.branchId] = item;
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

export type GpsDetectionOutcome =
  | { ok: true; location: CustomerDeliveryLocation; fallbackUsed: 'GPS' | 'IP'; message?: string }
  | { ok: false; code: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED'; message: string };

/**
 * Detects the customer's live delivery location using Browser Geolocation API + Geoapify/OSM Reverse Geocoding,
 * with explicit permission-denied reporting and optional IP geolocation fallback.
 */
export async function detectDeliveryLocationWithGps(options?: {
  allowIpFallback?: boolean;
}): Promise<GpsDetectionOutcome> {
  const allowIpFallback = options?.allowIpFallback !== false;

  const requestBrowserPosition = (): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject({ code: 0, message: 'Geolocation is not supported by this browser.' });
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 9000,
        maximumAge: 15000,
      });
    });

  try {
    const pos = await requestBrowserPosition();
    const loc = await reverseGeocodeToDeliveryLocation(
      pos.coords.latitude,
      pos.coords.longitude,
      'BROWSER_GPS',
      Math.round(pos.coords.accuracy || 0)
    );
    return { ok: true, location: loc, fallbackUsed: 'GPS' };
  } catch (err: any) {
    const codeNum = Number(err?.code || 0);
    if (allowIpFallback && codeNum !== 1) {
      try {
        const ipRes = await fetch('/api/location/ip', { cache: 'no-store' });
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          const lat = Number(ipData?.latitude);
          const lng = Number(ipData?.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const loc = await reverseGeocodeToDeliveryLocation(lat, lng, 'IP_GEOLOCATION');
            return { ok: true, location: loc, fallbackUsed: 'IP' };
          }
        }
      } catch {
        // Proceed to structured error below
      }
    }

    if (codeNum === 1) {
      return {
        ok: false,
        code: 'PERMISSION_DENIED',
        message:
          'Location permission was denied. Enable GPS in your browser settings, search your address, or choose your County, Town & Estate manually.',
      };
    }
    if (codeNum === 3) {
      return {
        ok: false,
        code: 'TIMEOUT',
        message: 'GPS signal timed out. Please search your street/estate or select from the County & Estate list.',
      };
    }
    if (codeNum === 0) {
      return {
        ok: false,
        code: 'UNSUPPORTED',
        message: 'Automatic GPS is not available on this device. Search your location or pick your County & Estate.',
      };
    }
    return {
      ok: false,
      code: 'POSITION_UNAVAILABLE',
      message: 'Could not lock onto GPS coordinates. Please search your address or select your County & Estate.',
    };
  }
}

/**
 * Legacy-compatible wrapper for existing storefront callers.
 */
export async function detectUserRealWorldLocation(): Promise<RealResolvedLocation> {
  const outcome = await detectDeliveryLocationWithGps({ allowIpFallback: true });
  if (outcome.ok) {
    savePersistedDeliveryLocation(outcome.location);
    return deliveryLocationToRealLocation(outcome.location);
  }
  throw new Error(outcome.message || 'Could not detect location.');
}

/**
 * Calls the authoritative zero-trust backend checkout validator (/api/checkout/validate).
 */
export async function validateCheckoutOnServer(params: {
  location: CustomerDeliveryLocation | null;
  items: CartValidationRequestItem[];
  fallbackSnapshot?: {
    products?: Product[];
    branches?: Branch[];
    regions?: GeoRegion[];
    deliveryZones?: DeliveryZone[];
    productAvailability?: ProductLocationAvailability[];
    deliverySettings?: DeliveryGlobalSettings;
  };
}): Promise<(CartValidationResult & { validationToken?: string }) | null> {
  try {
    const res = await fetch('/api/checkout/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as CartValidationResult & { validationToken?: string };
  } catch {
    return null;
  }
}

/**
 * Calls backend location-filtered catalog discovery (/api/catalog/availability).
 */
export async function fetchServerLocationCatalog(params: {
  location: CustomerDeliveryLocation | null;
  filters?: CatalogFilterOptions;
  fallbackSnapshot?: {
    products?: Product[];
    branches?: Branch[];
    regions?: GeoRegion[];
    deliveryZones?: DeliveryZone[];
    productAvailability?: ProductLocationAvailability[];
    deliverySettings?: DeliveryGlobalSettings;
  };
}): Promise<any | null> {
  try {
    const res = await fetch('/api/catalog/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function buildOpenStreetMapEmbedUrl(lat: number, lng: number, zoomDelta: number = 0.008): string {
  const minLon = (lng - zoomDelta).toFixed(6);
  const minLat = (lat - zoomDelta).toFixed(6);
  const maxLon = (lng + zoomDelta).toFixed(6);
  const maxLat = (lat + zoomDelta).toFixed(6);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
}

export function buildOpenStreetMapDirectUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=17/${lat.toFixed(6)}/${lng.toFixed(6)}`;
}
