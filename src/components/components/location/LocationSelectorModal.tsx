import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  CheckCircle2,
  Clock,
  Crosshair,
  Globe,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Search,
  Star,
  Trash2,
  Truck,
  X,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import type {
  Branch,
  CustomerDeliveryLocation,
  CustomerSavedAddress,
  DeliveryGlobalSettings,
  DeliveryZone,
} from '../../types';
import {
  COUNTRY_DIRECTORY,
  getCountiesForCountry,
  getEstatesForTown,
  getTownsForCounty,
  normalizeCountyName,
} from '../../../lib/locationsDirectory';
import {
  buildDefaultDeliveryZones,
  buildManualDeliveryLocation,
  calculateDeliveryPricing,
  DEFAULT_DELIVERY_SETTINGS,
  matchDeliveryZoneForLocation,
} from '../../../lib/deliveryEngine';
import {
  detectDeliveryLocationWithGps,
  reverseGeocodeToDeliveryLocation,
  searchDeliveryLocations,
} from '../../utils/realLocationService';
import {
  deleteCustomerSavedAddress,
  saveCustomerDeliveryAddress,
  savedAddressToDeliveryLocation,
  setDefaultCustomerAddress,
} from '../../utils/customerAddressService';
import { MapLibreLocationMap, type MapBranchPin } from './MapLibreLocationMap';
import { resolveBranchGeoProfile } from '../../utils/branchGeoRouting';

export interface LocationSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'customer' for storefront delivery location selection; 'pin_branch' for ERP Admin facility GPS pinning */
  mode?: 'customer' | 'pin_branch';

  // Customer mode props
  currentLocation?: CustomerDeliveryLocation | null;
  onConfirmLocation?: (location: CustomerDeliveryLocation) => void;
  branches?: Branch[];
  deliveryZones?: DeliveryZone[];
  deliverySettings?: DeliveryGlobalSettings;
  savedAddresses?: CustomerSavedAddress[];
  onSavedAddressesChange?: (next: CustomerSavedAddress[]) => void;
  customerUid?: string | null;
  customerName?: string;
  customerPhone?: string;
  onRequestSignIn?: () => void;

  // Admin branch pinning mode props
  branchLabel?: string;
  initialLat?: number;
  initialLng?: number;
  initialAddress?: string;
  initialRadiusKm?: number;
  onSaveBranchPin?: (pin: {
    latitude: number;
    longitude: number;
    address: string;
    maxDeliveryRadiusKm: number;
  }) => void | Promise<void>;
}

export const LocationSelectorModal: React.FC<LocationSelectorModalProps> = ({
  isOpen,
  onClose,
  mode = 'customer',
  currentLocation,
  onConfirmLocation,
  branches = [],
  deliveryZones = [],
  deliverySettings = DEFAULT_DELIVERY_SETTINGS,
  savedAddresses = [],
  onSavedAddressesChange,
  customerUid,
  customerName,
  customerPhone,
  onRequestSignIn,
  branchLabel,
  initialLat = -1.286389,
  initialLng = 36.817223,
  initialAddress = '',
  initialRadiusKm = 15,
  onSaveBranchPin,
}) => {
  const [activeTab, setActiveTab] = useState<'gps_map' | 'manual' | 'saved'>('gps_map');

  // Draft location being previewed before confirmation
  const [draftLocation, setDraftLocation] = useState<CustomerDeliveryLocation>(() => {
    if (currentLocation) return currentLocation;
    return buildManualDeliveryLocation({
      countryCode: 'KE',
      countyName: 'Nairobi',
      townName: 'Westlands',
      estateName: 'Westlands',
    });
  });

  // Search autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerDeliveryLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // GPS state
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsInfo, setGpsInfo] = useState<string | null>(null);
  const [isResolvingPin, setIsResolvingPin] = useState(false);

  // Cascading Country -> County -> Town -> Estate manual picker state
  const [selectedCountryCode, setSelectedCountryCode] = useState('KE');
  const [selectedCounty, setSelectedCounty] = useState('Nairobi');
  const [selectedTown, setSelectedTown] = useState('Westlands');
  const [selectedEstate, setSelectedEstate] = useState('Westlands');
  const [manualStreetInput, setManualStreetInput] = useState('');

  // Save address form state
  const [saveLabel, setSaveLabel] = useState('');
  const [saveInstructions, setSaveInstructions] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [addressNotice, setAddressNotice] = useState<string | null>(null);

  // Admin pin_branch mode state
  const [pinLat, setPinLat] = useState(initialLat);
  const [pinLng, setPinLng] = useState(initialLng);
  const [pinAddress, setPinAddress] = useState(initialAddress);
  const [pinRadiusKm, setPinRadiusKm] = useState(initialRadiusKm);
  const [isSavingBranch, setIsSavingBranch] = useState(false);

  // Sync draft when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setGpsError(null);
    setGpsInfo(null);
    setAddressNotice(null);
    setSearchQuery('');
    setSearchResults([]);

    if (mode === 'pin_branch') {
      setPinLat(Number.isFinite(initialLat) ? initialLat : -1.286389);
      setPinLng(Number.isFinite(initialLng) ? initialLng : 36.817223);
      setPinAddress(initialAddress || '');
      setPinRadiusKm(initialRadiusKm || 15);
      return;
    }

    const base =
      currentLocation ||
      buildManualDeliveryLocation({
        countryCode: 'KE',
        countyName: 'Nairobi',
        townName: 'Westlands',
        estateName: 'Westlands',
      });
    setDraftLocation(base);

    const cc = base.countryCode || 'KE';
    const counties = getCountiesForCountry(cc);
    const matchedCounty =
      normalizeCountyName(base.county, cc) || counties[0]?.name || 'Nairobi';
    const towns = getTownsForCounty(matchedCounty, cc);
    const matchedTown =
      towns.find(
        (t) =>
          t.name.toLowerCase() === (base.cityOrTown || '').toLowerCase() ||
          t.estates.some((e) => e.toLowerCase() === (base.estateOrLocality || '').toLowerCase())
      )?.name ||
      towns[0]?.name ||
      matchedCounty;
    const estates = getEstatesForTown(matchedCounty, matchedTown, cc);
    const matchedEstate =
      estates.find((e) => e.toLowerCase() === (base.estateOrLocality || '').toLowerCase()) ||
      estates[0] ||
      matchedTown;

    setSelectedCountryCode(cc);
    setSelectedCounty(matchedCounty);
    setSelectedTown(matchedTown);
    setSelectedEstate(matchedEstate);
    setManualStreetInput(base.streetOrBuilding || '');
  }, [isOpen, mode, currentLocation, initialLat, initialLng, initialAddress, initialRadiusKm]);

  // Debounced address autocomplete via Geoapify / OpenStreetMap
  useEffect(() => {
    if (!isOpen) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const bias =
        mode === 'pin_branch'
          ? { lat: pinLat, lng: pinLng }
          : { lat: draftLocation.latitude, lng: draftLocation.longitude };
      const results = await searchDeliveryLocations(q, selectedCountryCode.toLowerCase(), bias);
      if (!cancelled) {
        setSearchResults(results);
        setIsSearching(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedCountryCode, isOpen, mode, pinLat, pinLng, draftLocation.latitude, draftLocation.longitude]);

  const effectiveZones = useMemo(
    () => (deliveryZones.length > 0 ? deliveryZones : buildDefaultDeliveryZones(branches)),
    [deliveryZones, branches]
  );

  // Live preview of zone match & delivery fee for draftLocation
  const liveZonePreview = useMemo(() => {
    if (mode !== 'customer') return null;
    const zoneMatch = matchDeliveryZoneForLocation({
      location: draftLocation,
      zones: effectiveZones,
      branches,
      settings: deliverySettings,
    });
    const pricing = calculateDeliveryPricing({
      zoneMatch,
      location: draftLocation,
      subtotalKes: 0,
      settings: deliverySettings,
    });
    return { zoneMatch, pricing };
  }, [mode, draftLocation, effectiveZones, branches, deliverySettings]);

  // Operational branch pins for MapLibre map
  const mapBranchPins = useMemo<MapBranchPin[]>(() => {
    const primaryId = liveZonePreview?.zoneMatch.primaryBranch?.id;
    return branches
      .filter((b) => b.status === 'Operational')
      .map((b) => {
        const geo = resolveBranchGeoProfile(b);
        return {
          id: b.id,
          name: b.name,
          code: b.code,
          latitude: geo.latitude,
          longitude: geo.longitude,
          isPrimary: b.id === primaryId,
          subtitle: b.id === primaryId ? 'Assigned Fulfilment Hub' : b.address || b.regionName,
        };
      });
  }, [branches, liveZonePreview?.zoneMatch.primaryBranch?.id]);

  // Directory options for manual cascading picker
  const countiesForCountry = useMemo(
    () => getCountiesForCountry(selectedCountryCode),
    [selectedCountryCode]
  );
  const townsForCounty = useMemo(
    () => getTownsForCounty(selectedCounty, selectedCountryCode),
    [selectedCounty, selectedCountryCode]
  );
  const estatesForTown = useMemo(
    () => getEstatesForTown(selectedCounty, selectedTown, selectedCountryCode),
    [selectedCounty, selectedTown, selectedCountryCode]
  );

  const handleManualCountryChange = (cc: string) => {
    setSelectedCountryCode(cc);
    const nextCounties = getCountiesForCountry(cc);
    const nextCounty = nextCounties[0]?.name || 'Nairobi';
    const nextTowns = getTownsForCounty(nextCounty, cc);
    const nextTown = nextTowns[0]?.name || nextCounty;
    const nextEstates = getEstatesForTown(nextCounty, nextTown, cc);
    const nextEstate = nextEstates[0] || nextTown;
    setSelectedCounty(nextCounty);
    setSelectedTown(nextTown);
    setSelectedEstate(nextEstate);
    setDraftLocation(
      buildManualDeliveryLocation({
        countryCode: cc,
        countyName: nextCounty,
        townName: nextTown,
        estateName: nextEstate,
        streetOrBuilding: manualStreetInput,
      })
    );
  };

  const handleManualCountyChange = (countyName: string) => {
    setSelectedCounty(countyName);
    const nextTowns = getTownsForCounty(countyName, selectedCountryCode);
    const nextTown = nextTowns[0]?.name || countyName;
    const nextEstates = getEstatesForTown(countyName, nextTown, selectedCountryCode);
    const nextEstate = nextEstates[0] || nextTown;
    setSelectedTown(nextTown);
    setSelectedEstate(nextEstate);
    setDraftLocation(
      buildManualDeliveryLocation({
        countryCode: selectedCountryCode,
        countyName,
        townName: nextTown,
        estateName: nextEstate,
        streetOrBuilding: manualStreetInput,
      })
    );
  };

  const handleManualTownChange = (townName: string) => {
    setSelectedTown(townName);
    const nextEstates = getEstatesForTown(selectedCounty, townName, selectedCountryCode);
    const nextEstate = nextEstates[0] || townName;
    setSelectedEstate(nextEstate);
    setDraftLocation(
      buildManualDeliveryLocation({
        countryCode: selectedCountryCode,
        countyName: selectedCounty,
        townName,
        estateName: nextEstate,
        streetOrBuilding: manualStreetInput,
      })
    );
  };

  const handleManualEstateChange = (estateName: string) => {
    setSelectedEstate(estateName);
    setDraftLocation(
      buildManualDeliveryLocation({
        countryCode: selectedCountryCode,
        countyName: selectedCounty,
        townName: selectedTown,
        estateName,
        streetOrBuilding: manualStreetInput,
      })
    );
  };

  const handleManualStreetChange = (street: string) => {
    setManualStreetInput(street);
    setDraftLocation(
      buildManualDeliveryLocation({
        countryCode: selectedCountryCode,
        countyName: selectedCounty,
        townName: selectedTown,
        estateName: selectedEstate,
        streetOrBuilding: street,
      })
    );
  };

  const handleDetectGps = async () => {
    setIsDetectingGps(true);
    setGpsError(null);
    setGpsInfo(null);
    try {
      const outcome = await detectDeliveryLocationWithGps({ allowIpFallback: true });
      if (outcome.ok) {
        if (mode === 'pin_branch') {
          setPinLat(outcome.location.latitude);
          setPinLng(outcome.location.longitude);
          setPinAddress(outcome.location.formattedAddress);
        } else {
          setDraftLocation(outcome.location);
        }
        setGpsInfo(
          outcome.fallbackUsed === 'GPS'
            ? `GPS detected: ${outcome.location.estateOrLocality}, ${outcome.location.county}`
            : `Approximate network location detected: ${outcome.location.estateOrLocality}, ${outcome.location.county}. Adjust pin if needed.`
        );
      } else {
        setGpsError(outcome.message || 'Could not detect GPS location.');
      }
    } finally {
      setIsDetectingGps(false);
    }
  };

  const handleMapClickCoordinates = async (lat: number, lng: number) => {
    setIsResolvingPin(true);
    setGpsError(null);
    try {
      const resolved = await reverseGeocodeToDeliveryLocation(lat, lng, 'MAP_PIN');
      if (mode === 'pin_branch') {
        setPinLat(lat);
        setPinLng(lng);
        setPinAddress(resolved.formattedAddress);
      } else {
        setDraftLocation(resolved);
      }
    } finally {
      setIsResolvingPin(false);
    }
  };

  const handleSaveCurrentAddress = async () => {
    setIsSavingAddress(true);
    setAddressNotice(null);
    try {
      const saved = await saveCustomerDeliveryAddress({
        userId: customerUid,
        label: saveLabel.trim() || `${draftLocation.estateOrLocality} (${draftLocation.county})`,
        location: draftLocation,
        recipientName: customerName,
        recipientPhone: customerPhone,
        deliveryInstructions: saveInstructions,
        isDefault: saveAsDefault,
        existingAddresses: savedAddresses,
      });
      if (!customerUid && onSavedAddressesChange) {
        const nextList = savedAddresses
          .filter((a) => a.id !== saved.id)
          .map((a) => (saved.isDefault ? { ...a, isDefault: false } : a));
        nextList.unshift(saved);
        onSavedAddressesChange(nextList);
      }
      setSaveLabel('');
      setSaveInstructions('');
      setAddressNotice(
        customerUid
          ? `Saved "${saved.label}" to your cloud delivery address book.`
          : `Saved "${saved.label}" on this device (guest mode).`
      );
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleSetDefaultAddr = async (addrId: string) => {
    const updated = await setDefaultCustomerAddress({
      userId: customerUid,
      addressId: addrId,
      existingAddresses: savedAddresses,
    });
    if (!customerUid && onSavedAddressesChange) {
      onSavedAddressesChange(updated);
    }
  };

  const handleDeleteAddr = async (addrId: string) => {
    const remaining = await deleteCustomerSavedAddress({
      userId: customerUid,
      addressId: addrId,
      existingAddresses: savedAddresses,
    });
    if (!customerUid && onSavedAddressesChange) {
      onSavedAddressesChange(remaining);
    }
  };

  const handleConfirmAdminBranchPin = async () => {
    if (!onSaveBranchPin) {
      onClose();
      return;
    }
    setIsSavingBranch(true);
    try {
      await onSaveBranchPin({
        latitude: Number(pinLat.toFixed(6)),
        longitude: Number(pinLng.toFixed(6)),
        address: pinAddress.trim() || `GPS (${pinLat.toFixed(5)}, ${pinLng.toFixed(5)})`,
        maxDeliveryRadiusKm: Math.max(1, Number(pinRadiusKm) || 15),
      });
      onClose();
    } finally {
      setIsSavingBranch(false);
    }
  };

  if (!isOpen) return null;

  // =====================================================
  // ADMIN FACILITY GPS PINNING MODE (MapLibre + Geoapify/OSM)
  // =====================================================
  if (mode === 'pin_branch') {
    return (
      <div className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
          <div className="bg-[#0A006E] px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#FFDE00] text-[#0A006E] flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-montserrat font-black text-white truncate">
                  Pin Facility GPS Coordinates
                </h2>
                <p className="text-xs text-blue-200 truncate">
                  {branchLabel || 'Branch / Warehouse'} · OpenStreetMap + MapLibre GL
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-4 max-h-[82vh] overflow-y-auto">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search street, building, estate or town (e.g., Westlands, Mombasa Nyali)..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A006E]"
                />
                {isSearching && (
                  <Loader2 className="w-4 h-4 text-[#0A006E] animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
              <button
                type="button"
                onClick={handleDetectGps}
                disabled={isDetectingGps}
                className="px-4 py-2.5 rounded-xl bg-[#FFDE00] hover:bg-amber-300 text-[#0A006E] font-montserrat font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isDetectingGps ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
                Use My GPS
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-44 overflow-y-auto bg-slate-50">
                {searchResults.map((res, idx) => (
                  <button
                    key={`${res.locationId}_${idx}`}
                    type="button"
                    onClick={() => {
                      setPinLat(res.latitude);
                      setPinLng(res.longitude);
                      setPinAddress(res.formattedAddress);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-white flex items-start gap-2.5 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-[#0A006E] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {res.estateOrLocality}, {res.county}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{res.formattedAddress}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {gpsError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>{gpsError}</span>
              </div>
            )}

            <MapLibreLocationMap
              latitude={pinLat}
              longitude={pinLng}
              zoom={14}
              heightClassName="h-[300px]"
              userPinLabel={branchLabel || 'Branch Pin'}
              onSelectCoordinates={handleMapClickCoordinates}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Resolved Facility Address
                </label>
                <input
                  type="text"
                  value={pinAddress}
                  onChange={(e) => setPinAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  placeholder="Street, building, estate, county"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Max Radius (km)
                </label>
                <input
                  type="number"
                  min={1}
                  max={250}
                  value={pinRadiusKm}
                  onChange={(e) => setPinRadiusKm(Number(e.target.value) || 15)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-500 font-mono">
                {isResolvingPin ? 'Resolving address...' : `LAT ${pinLat.toFixed(6)} · LNG ${pinLng.toFixed(6)}`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAdminBranchPin}
                  disabled={isSavingBranch}
                  className="px-5 py-2.5 rounded-xl bg-[#0A006E] hover:bg-[#060046] text-[#FFDE00] font-montserrat font-black text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSavingBranch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save Facility Coordinates
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =====================================================
  // CUSTOMER DELIVERY LOCATION SELECTOR MODAL
  // =====================================================
  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#0A006E] px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#FFDE00] text-[#0A006E] flex items-center justify-center shrink-0 shadow-sm">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-montserrat font-black text-white leading-tight">
                Select Your Delivery Location
              </h2>
              <p className="text-xs text-blue-200 truncate">
                See real-time local inventory, deliverable categories &amp; exact delivery fees for your area
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            aria-label="Close location selector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 px-3 pt-2 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('gps_map')}
            className={`px-3 py-2.5 rounded-t-xl text-xs font-montserrat font-black flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'gps_map'
                ? 'bg-white text-[#0A006E] border-[#0A006E]'
                : 'text-slate-600 border-transparent hover:text-[#0A006E]'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>GPS &amp; Map Search</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`px-3 py-2.5 rounded-t-xl text-xs font-montserrat font-black flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-[#0A006E] border-[#0A006E]'
                : 'text-slate-600 border-transparent hover:text-[#0A006E]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>County &amp; Estate</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`px-3 py-2.5 rounded-t-xl text-xs font-montserrat font-black flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'saved'
                ? 'bg-white text-[#0A006E] border-[#0A006E]'
                : 'text-slate-600 border-transparent hover:text-[#0A006E]'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved ({savedAddresses.length})</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: GPS + SEARCH AUTOCOMPLETE + MAPLIBRE MAP */}
          {activeTab === 'gps_map' && (
            <div className="space-y-3.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search estate, street, mall or town (e.g., Westlands, Kilimani, Nyali)..."
                    className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A006E]"
                  />
                  {isSearching && (
                    <Loader2 className="w-4 h-4 text-[#0A006E] animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleDetectGps}
                  disabled={isDetectingGps}
                  className="px-4 py-2.5 rounded-xl bg-[#FFDE00] hover:bg-amber-300 text-[#0A006E] font-montserrat font-black text-xs inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-60 shadow-sm"
                >
                  {isDetectingGps ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Crosshair className="w-4 h-4" />
                  )}
                  {isDetectingGps ? 'Detecting GPS...' : 'Detect Current Location'}
                </button>
              </div>

              {/* Autocomplete results dropdown */}
              {searchResults.length > 0 && (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto bg-white shadow-md">
                  {searchResults.map((item, i) => (
                    <button
                      key={`${item.locationId}_${i}`}
                      type="button"
                      onClick={() => {
                        setDraftLocation(item);
                        setSearchQuery('');
                        setSearchResults([]);
                        setGpsError(null);
                      }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50/70 flex items-start gap-2.5 cursor-pointer transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-[#0A006E] mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {item.estateOrLocality}, {item.county}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{item.formattedAddress}</div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                        {item.countryCode}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {gpsError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Automatic GPS Unavailable</div>
                    <p className="mt-0.5">{gpsError}</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('manual')}
                      className="mt-1.5 text-[11px] font-black text-[#0A006E] underline cursor-pointer"
                    >
                      Switch to County, Town &amp; Estate Selector &rarr;
                    </button>
                  </div>
                </div>
              )}

              {gpsInfo && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{gpsInfo}</span>
                </div>
              )}

              {/* Quick Kenyan Locality Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Popular areas:</span>
                {[
                  { county: 'Nairobi', town: 'Westlands', estate: 'Westlands' },
                  { county: 'Nairobi', town: 'Kilimani & Dagoretti', estate: 'Kilimani' },
                  { county: 'Nairobi', town: 'Nairobi Central (CBD)', estate: 'Nairobi CBD' },
                  { county: 'Nairobi', town: 'Langata & Karen', estate: 'Karen' },
                  { county: 'Mombasa', town: 'Nyali', estate: 'Nyali' },
                  { county: 'Kiambu', town: 'Ruaka / Kiambu Town', estate: 'Ruaka' },
                  { county: 'Kisumu', town: 'Kisumu City', estate: 'Milimani' },
                ].map((preset) => (
                  <button
                    key={`${preset.county}-${preset.estate}`}
                    type="button"
                    onClick={() =>
                      setDraftLocation(
                        buildManualDeliveryLocation({
                          countryCode: 'KE',
                          countyName: preset.county,
                          townName: preset.town,
                          estateName: preset.estate,
                        })
                      )
                    }
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 bg-slate-50 hover:bg-[#0A006E] hover:text-[#FFDE00] hover:border-[#0A006E] text-slate-700 transition-colors cursor-pointer"
                  >
                    {preset.estate}
                  </button>
                ))}
              </div>

              {/* Interactive MapLibre GL Map (OpenStreetMap) */}
              <MapLibreLocationMap
                latitude={draftLocation.latitude}
                longitude={draftLocation.longitude}
                zoom={13}
                heightClassName="h-[260px] sm:h-[300px]"
                userPinLabel={`${draftLocation.estateOrLocality}, ${draftLocation.county}`}
                branches={mapBranchPins}
                onSelectCoordinates={handleMapClickCoordinates}
              />
            </div>
          )}

          {/* TAB 2: MANUAL CASCADING COUNTRY / 47 COUNTIES / TOWN / ESTATE PICKER */}
          {activeTab === 'manual' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Choose your exact <strong className="text-slate-900">Country, County (all 47 Kenyan Counties supported), Town &amp; Estate</strong> to unlock locally deliverable stock and pricing.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                    Country
                  </label>
                  <select
                    value={selectedCountryCode}
                    onChange={(e) => handleManualCountryChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#0A006E]"
                  >
                    {COUNTRY_DIRECTORY.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                    County / Region ({countiesForCountry.length} available)
                  </label>
                  <select
                    value={selectedCounty}
                    onChange={(e) => handleManualCountyChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#0A006E]"
                  >
                    {countiesForCountry.map((county) => (
                      <option key={county.code} value={county.name}>
                        {county.code} — {county.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                    City / Town / Sub-County
                  </label>
                  <select
                    value={selectedTown}
                    onChange={(e) => handleManualTownChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#0A006E]"
                  >
                    {townsForCounty.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                    Estate / Locality / Neighbourhood
                  </label>
                  <select
                    value={selectedEstate}
                    onChange={(e) => handleManualEstateChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#0A006E]"
                  >
                    {estatesForTown.map((est) => (
                      <option key={est} value={est}>
                        {est}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                  Street, Building, Apartment or Gate Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={manualStreetInput}
                  onChange={(e) => handleManualStreetChange(e.target.value)}
                  placeholder="e.g., Woodvale Grove, Delta Corner Suite 4B or Gate No. 12"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A006E]"
                />
              </div>
            </div>
          )}

          {/* TAB 3: SAVED DELIVERY ADDRESSES (GUEST + FIREBASE AUTH SYNCED) */}
          {activeTab === 'saved' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-700">
                  {customerUid ? (
                    <span className="font-semibold text-emerald-700">
                      Cloud Sync Active — Your saved delivery addresses sync automatically across devices via Firebase.
                    </span>
                  ) : (
                    <span>
                      <strong className="text-slate-900">Guest Mode:</strong> Addresses are saved on this device. Sign in to sync them across devices.
                    </span>
                  )}
                </div>
                {!customerUid && onRequestSignIn && (
                  <button
                    type="button"
                    onClick={onRequestSignIn}
                    className="px-3 py-1.5 rounded-lg bg-[#0A006E] text-[#FFDE00] text-[11px] font-black shrink-0 cursor-pointer"
                  >
                    Sign In to Sync
                  </button>
                )}
              </div>

              {/* Save current draft pin as a reusable address */}
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
                <div className="text-xs font-montserrat font-black text-[#0A006E] flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  Save Current Selection: {draftLocation.estateOrLocality}, {draftLocation.county}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={saveLabel}
                    onChange={(e) => setSaveLabel(e.target.value)}
                    placeholder="Address Label (e.g., Home, Westlands Office)"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  />
                  <input
                    type="text"
                    value={saveInstructions}
                    onChange={(e) => setSaveInstructions(e.target.value)}
                    placeholder="Delivery note (e.g., Call at gate, 3rd floor)"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAsDefault}
                      onChange={(e) => setSaveAsDefault(e.target.checked)}
                      className="rounded border-slate-300 text-[#0A006E]"
                    />
                    Set as default delivery address
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveCurrentAddress}
                    disabled={isSavingAddress}
                    className="px-4 py-2 rounded-xl bg-[#0A006E] hover:bg-[#060046] text-[#FFDE00] text-xs font-montserrat font-black inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {isSavingAddress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" />}
                    Save Address
                  </button>
                </div>
                {addressNotice && (
                  <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {addressNotice}
                  </div>
                )}
              </div>

              {/* Saved Address List */}
              {savedAddresses.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                  No saved delivery addresses yet. Pick a location on the map or County &amp; Estate tab, then save it here for 1-click checkout.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {savedAddresses.map((addr) => (
                    <div
                      key={addr.id}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        addr.isDefault
                          ? 'border-[#0A006E] bg-indigo-50/40'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-montserrat font-black text-slate-900 truncate">
                            {addr.label}
                          </span>
                          {addr.isDefault && (
                            <span className="px-2 py-0.5 rounded bg-[#0A006E] text-[#FFDE00] text-[10px] font-black uppercase">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-slate-700 mt-0.5">
                          {addr.estateOrLocality}, {addr.cityOrTown}, {addr.county} ({addr.country})
                        </div>
                        {addr.streetOrBuilding && (
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {addr.streetOrBuilding}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const loc = savedAddressToDeliveryLocation(addr);
                            setDraftLocation(loc);
                            onConfirmLocation?.(loc);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#0A006E] text-[#FFDE00] text-xs font-black cursor-pointer hover:bg-[#060046]"
                        >
                          Deliver Here
                        </button>
                        {!addr.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultAddr(addr.id)}
                            title="Set as Default"
                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-amber-600 hover:border-amber-300 cursor-pointer"
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteAddr(addr.id)}
                          title="Delete Address"
                          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-300 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LIVE DELIVERY COVERAGE & FEE PREVIEW CARD */}
          {liveZonePreview && (
            <div
              className={`p-4 rounded-xl border ${
                liveZonePreview.zoneMatch.isDeliverable
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-rose-50/80 border-rose-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {liveZonePreview.zoneMatch.isDeliverable ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span className="text-xs font-montserrat font-black text-slate-900">
                      {isResolvingPin
                        ? 'Resolving pinned address...'
                        : `${draftLocation.county}, ${draftLocation.estateOrLocality || draftLocation.cityOrTown}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {draftLocation.formattedAddress}
                  </p>
                  <p
                    className={`text-xs font-bold ${
                      liveZonePreview.zoneMatch.isDeliverable ? 'text-emerald-800' : 'text-rose-700'
                    }`}
                  >
                    {liveZonePreview.zoneMatch.coverageMessage}
                  </p>
                </div>

                {liveZonePreview.zoneMatch.isDeliverable && (
                  <div className="sm:text-right shrink-0 space-y-1 bg-white/80 rounded-lg px-3 py-2 border border-emerald-200/80">
                    <div className="text-[11px] font-bold text-slate-500 flex sm:justify-end items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-[#0A006E]" />
                      Est. Fee:{' '}
                      <span className="text-slate-900 font-black">
                        KES {liveZonePreview.pricing.baseFeeKes.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 flex sm:justify-end items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      ETA:{' '}
                      <span className="text-emerald-700 font-black">
                        {liveZonePreview.zoneMatch.estimatedDeliveryLabel}
                      </span>
                    </div>
                    {liveZonePreview.pricing.freeDeliveryThresholdKes > 0 && (
                      <div className="text-[10px] font-semibold text-indigo-700">
                        Free delivery over KES{' '}
                        {liveZonePreview.pricing.freeDeliveryThresholdKes.toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Confirm Action */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <div className="text-[11px] text-slate-500">
            Selected:{' '}
            <strong className="text-slate-900">
              {draftLocation.county}, {draftLocation.estateOrLocality || draftLocation.cityOrTown}
            </strong>{' '}
            ({draftLocation.country})
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirmLocation?.({
                  ...draftLocation,
                  confirmedAt: Date.now(),
                });
                onClose();
              }}
              className="px-5 py-2.5 rounded-xl bg-[#0A006E] hover:bg-[#060046] text-[#FFDE00] font-montserrat font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Confirm Delivery Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
