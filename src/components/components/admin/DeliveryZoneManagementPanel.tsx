import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Edit3,
  Globe,
  Layers,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Sliders,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import type {
  Branch,
  DeliveryGlobalSettings,
  DeliveryPricingModel,
  DeliveryZone,
  GeoRegion,
  Product,
  ProductLocationAvailability,
  StaffMember,
} from '../../types';
import {
  COUNTRY_DIRECTORY,
  getCountiesForCountry,
  getTownsForCounty,
} from '../../../lib/locationsDirectory';
import {
  buildDefaultDeliveryZones,
  buildManualDeliveryLocation,
  COMMERCE_DEPARTMENTS,
  DEFAULT_DELIVERY_SETTINGS,
  filterAndSortCatalogForLocation,
  parseBranchStockMap,
} from '../../../lib/deliveryEngine';

export interface DeliveryZoneManagementPanelProps {
  currentUser: StaffMember;
  branches: Branch[];
  products: Product[];
  regions: GeoRegion[];
  deliveryZones: DeliveryZone[];
  productAvailability: ProductLocationAvailability[];
  deliverySettings: DeliveryGlobalSettings;
  onSaveDeliveryZone: (zone: DeliveryZone) => Promise<void>;
  onDeleteDeliveryZone: (zoneId: string) => Promise<void>;
  onToggleDeliveryZoneActive: (zoneId: string, isActive: boolean) => Promise<void>;
  onSeedDefaultDeliveryZones: () => Promise<void>;
  onUpsertProductAvailability: (
    record: ProductLocationAvailability,
    syncBranchStock?: boolean
  ) => Promise<void>;
  onSaveDeliverySettings: (settings: DeliveryGlobalSettings) => Promise<void>;
  onTriggerToast?: (type: 'success' | 'error', title: string, message: string) => void;
}

const AUTHORIZED_ROLES = new Set([
  'Admin',
  'Branch Manager',
  'Delivery Manager',
  'Inventory Controller',
]);

export const DeliveryZoneManagementPanel: React.FC<DeliveryZoneManagementPanelProps> = ({
  currentUser,
  branches,
  products,
  regions,
  deliveryZones,
  productAvailability,
  deliverySettings = DEFAULT_DELIVERY_SETTINGS,
  onSaveDeliveryZone,
  onDeleteDeliveryZone,
  onToggleDeliveryZoneActive,
  onSeedDefaultDeliveryZones,
  onUpsertProductAvailability,
  onSaveDeliverySettings,
  onTriggerToast,
}) => {
  const isAuthorized = AUTHORIZED_ROLES.has(currentUser.role);

  const [subTab, setSubTab] = useState<'zones' | 'stock' | 'monitor' | 'settings'>('zones');
  const [searchZone, setSearchZone] = useState('');
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [isZoneFormOpen, setIsZoneFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Zone editor form fields
  const [zCode, setZCode] = useState('');
  const [zName, setZName] = useState('');
  const [zCountryCode, setZCountryCode] = useState('KE');
  const [zCounties, setZCounties] = useState<string[]>(['Nairobi']);
  const [zTownsText, setZTownsText] = useState('');
  const [zEstatesText, setZEstatesText] = useState('');
  const [zAssignedBranchIds, setZAssignedBranchIds] = useState<string[]>([]);
  const [zPricingModel, setZPricingModel] = useState<DeliveryPricingModel>('FIXED');
  const [zBaseFee, setZBaseFee] = useState(250);
  const [zPerKmFee, setZPerKmFee] = useState(30);
  const [zIncludedKm, setZIncludedKm] = useState(4);
  const [zFreeThreshold, setZFreeThreshold] = useState(10000);
  const [zMinOrder, setZMinOrder] = useState(500);
  const [zEtaMin, setZEtaMin] = useState(25);
  const [zEtaMax, setZEtaMax] = useState(45);
  const [zPriority, setZPriority] = useState(80);
  const [zIsActive, setZIsActive] = useState(true);
  const [zLocalityFeesText, setZLocalityFeesText] = useState('');
  const [zNotes, setZNotes] = useState('');

  // Location Stock tab state
  const [stockBranchId, setStockBranchId] = useState<string>(
    branches.find((b) => b.status === 'Operational')?.id || branches[0]?.id || ''
  );
  const [stockSearch, setStockSearch] = useState('');
  const [stockEdits, setStockEdits] = useState<
    Record<string, { stock: number; eligible: boolean; eta: string }>
  >({});

  // Coverage Monitor tab state
  const [monitorZoneId, setMonitorZoneId] = useState<string>('');

  // Global Settings tab state
  const [settingsDraft, setSettingsDraft] = useState<DeliveryGlobalSettings>(deliverySettings);

  const effectiveZones = useMemo(
    () => (deliveryZones.length > 0 ? deliveryZones : buildDefaultDeliveryZones(branches)),
    [deliveryZones, branches]
  );

  const isUsingBuiltInDefaults = deliveryZones.length === 0;

  const operationalBranches = useMemo(
    () => branches.filter((b) => b.status === 'Operational'),
    [branches]
  );

  const countryCounties = useMemo(
    () => getCountiesForCountry(zCountryCode),
    [zCountryCode]
  );

  const openCreateZone = () => {
    const defaultBranch = operationalBranches[0]?.id || branches[0]?.id || '';
    setEditingZone(null);
    setZCode(`DZ-${Math.floor(100 + Math.random() * 900)}`);
    setZName('');
    setZCountryCode('KE');
    setZCounties(['Nairobi']);
    setZTownsText('');
    setZEstatesText('');
    setZAssignedBranchIds(defaultBranch ? [defaultBranch] : []);
    setZPricingModel('LOCALITY_TIERED');
    setZBaseFee(deliverySettings.defaultDeliveryFeeKes || 300);
    setZPerKmFee(30);
    setZIncludedKm(4);
    setZFreeThreshold(deliverySettings.defaultFreeDeliveryThresholdKes || 10000);
    setZMinOrder(deliverySettings.defaultMinOrderValueKes || 500);
    setZEtaMin(25);
    setZEtaMax(50);
    setZPriority(80);
    setZIsActive(true);
    setZLocalityFeesText('Westlands: 200\nKilimani: 220');
    setZNotes('');
    setIsZoneFormOpen(true);
  };

  const openEditZone = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setZCode(zone.code);
    setZName(zone.name);
    setZCountryCode(zone.countryCode || 'KE');
    setZCounties(zone.counties || []);
    setZTownsText((zone.towns || []).join(', '));
    setZEstatesText((zone.estates || []).join(', '));
    setZAssignedBranchIds(zone.assignedBranchIds || []);
    setZPricingModel(zone.pricingModel || 'FIXED');
    setZBaseFee(zone.baseDeliveryFeeKes ?? 300);
    setZPerKmFee(zone.perKmFeeKes ?? 30);
    setZIncludedKm(zone.includedRadiusKm ?? 4);
    setZFreeThreshold(zone.freeDeliveryThresholdKes ?? 10000);
    setZMinOrder(zone.minOrderValueKes ?? 500);
    setZEtaMin(zone.estimatedDeliveryMinMins ?? 30);
    setZEtaMax(zone.estimatedDeliveryMaxMins ?? 60);
    setZPriority(zone.priority ?? 80);
    setZIsActive(zone.isActive);
    setZLocalityFeesText(
      zone.localityFees
        ? Object.entries(zone.localityFees)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        : ''
    );
    setZNotes(zone.notes || '');
    setIsZoneFormOpen(true);
  };

  const toggleCountyInForm = (countyName: string) => {
    setZCounties((prev) =>
      prev.includes(countyName) ? prev.filter((c) => c !== countyName) : [...prev, countyName]
    );
  };

  const toggleBranchInForm = (branchId: string) => {
    setZAssignedBranchIds((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
    );
  };

  const autoFillTownsEstatesFromSelectedCounties = () => {
    const townsSet = new Set<string>();
    const estatesSet = new Set<string>();
    for (const c of zCounties) {
      const towns = getTownsForCounty(c, zCountryCode);
      for (const t of towns) {
        townsSet.add(t.name);
        for (const est of t.estates) {
          estatesSet.add(est);
        }
      }
    }
    setZTownsText(Array.from(townsSet).join(', '));
    setZEstatesText(Array.from(estatesSet).join(', '));
  };

  const handleSubmitZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zName.trim() || zCounties.length === 0) {
      onTriggerToast?.(
        'error',
        'Incomplete Zone',
        'Provide a zone name and select at least one County.'
      );
      return;
    }

    const countryObj = COUNTRY_DIRECTORY.find((c) => c.code === zCountryCode);
    const parsedTowns = zTownsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedEstates = zEstatesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const parsedLocalityFees: Record<string, number> = {};
    for (const line of zLocalityFeesText.split('\n')) {
      const [loc, rawFee] = line.split(':');
      const numFee = Number(rawFee?.trim());
      if (loc && loc.trim() && Number.isFinite(numFee) && numFee >= 0) {
        parsedLocalityFees[loc.trim()] = Math.round(numFee);
      }
    }

    const now = new Date().toISOString();
    const id =
      editingZone?.id ||
      `dz-${zCountryCode.toLowerCase()}-${zName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 28)}-${Date.now().toString(36).slice(-4)}`;

    const payload: DeliveryZone = {
      id,
      code: zCode.trim().toUpperCase() || `DZ-${id.slice(-4).toUpperCase()}`,
      name: zName.trim(),
      country: countryObj?.name || 'Kenya',
      countryCode: zCountryCode,
      counties: zCounties,
      towns: parsedTowns,
      estates: parsedEstates,
      assignedBranchIds: zAssignedBranchIds,
      pricingModel: zPricingModel,
      baseDeliveryFeeKes: Math.max(0, Number(zBaseFee) || 0),
      localityFees: Object.keys(parsedLocalityFees).length > 0 ? parsedLocalityFees : undefined,
      perKmFeeKes: Math.max(0, Number(zPerKmFee) || 0),
      includedRadiusKm: Math.max(0, Number(zIncludedKm) || 0),
      freeDeliveryThresholdKes: Math.max(0, Number(zFreeThreshold) || 0),
      minOrderValueKes: Math.max(0, Number(zMinOrder) || 0),
      estimatedDeliveryMinMins: Math.max(5, Number(zEtaMin) || 25),
      estimatedDeliveryMaxMins: Math.max(Number(zEtaMin) || 25, Number(zEtaMax) || 50),
      estimatedDeliveryLabel: `${Math.max(5, Number(zEtaMin) || 25)} – ${Math.max(
        Number(zEtaMin) || 25,
        Number(zEtaMax) || 50
      )} mins`,
      isActive: zIsActive,
      priority: Number(zPriority) || 80,
      notes: zNotes.trim() || undefined,
      createdAt: editingZone?.createdAt || now,
      updatedAt: now,
    };

    setIsSaving(true);
    try {
      await onSaveDeliveryZone(payload);
      setIsZoneFormOpen(false);
      setEditingZone(null);
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered zones list
  const visibleZones = useMemo(() => {
    const q = searchZone.trim().toLowerCase();
    return [...effectiveZones]
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .filter((z) => {
        if (!q) return true;
        return `${z.name} ${z.code} ${z.counties.join(' ')} ${z.towns.join(' ')} ${z.estates.join(' ')}`
          .toLowerCase()
          .includes(q);
      });
  }, [effectiveZones, searchZone]);

  // Stock management rows for selected branch
  const selectedStockBranch = useMemo(
    () => branches.find((b) => b.id === stockBranchId) || operationalBranches[0] || branches[0],
    [branches, stockBranchId, operationalBranches]
  );

  const stockRows = useMemo(() => {
    if (!selectedStockBranch) return [];
    const q = stockSearch.trim().toLowerCase();
    return products
      .filter((p) => {
        if (p.status === ('Deleted' as any)) return false;
        if (!q) return true;
        return `${p.name} ${p.sku} ${p.brand || ''} ${p.category} ${p.subCategory || ''}`
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 80)
      .map((product) => {
        const branchStockMap = parseBranchStockMap(product);
        const explicit = productAvailability.find(
          (r) => r.productId === product.id && r.branchId === selectedStockBranch.id
        );
        const currentStock =
          explicit?.availableStock ??
          (Object.keys(branchStockMap).length > 0
            ? branchStockMap[selectedStockBranch.id] ?? 0
            : product.totalBottles ?? 0);
        const deliveryEligible = explicit ? explicit.deliveryEligible : true;
        const eta = explicit?.estimatedDeliveryTime || '';
        return { product, explicit, currentStock, deliveryEligible, eta };
      });
  }, [products, productAvailability, selectedStockBranch, stockSearch]);

  const handleSaveProductStockRow = async (product: Product, currentStock: number, currentEligible: boolean, currentEta: string) => {
    if (!selectedStockBranch) return;
    const edit = stockEdits[product.id];
    const finalStock = Math.max(0, Math.floor(edit ? edit.stock : currentStock));
    const finalEligible = edit ? edit.eligible : currentEligible;
    const finalEta = (edit ? edit.eta : currentEta).trim();
    const lowThresh = deliverySettings.defaultLowStockThreshold || 5;

    const nowIso = new Date().toISOString();
    const availId = `${product.id}__${selectedStockBranch.id}`;
    const existingRecord = productAvailability.find((r) => r.id === availId);
    const record: ProductLocationAvailability = {
      id: availId,
      productId: product.id,
      sku: product.sku,
      locationId: `branch_${selectedStockBranch.id}`,
      branchId: selectedStockBranch.id,
      branchName: selectedStockBranch.name,
      country: 'Kenya',
      county: selectedStockBranch.county || selectedStockBranch.regionName || 'Nairobi',
      city: selectedStockBranch.regionName || selectedStockBranch.county || 'Nairobi',
      estate: selectedStockBranch.address || selectedStockBranch.name,
      availableStock: finalStock,
      reservedStock: 0,
      availabilityStatus: !finalEligible
        ? 'UNAVAILABLE_IN_AREA'
        : finalStock <= 0
        ? 'OUT_OF_STOCK'
        : finalStock <= lowThresh
        ? 'LIMITED_STOCK'
        : 'AVAILABLE',
      deliveryEligible: finalEligible,
      estimatedDeliveryTime: finalEta || undefined,
      createdAt: existingRecord?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await onUpsertProductAvailability(record, true);
    setStockEdits((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
  };

  // Coverage Monitor evaluation per zone
  const monitorSummaries = useMemo(() => {
    return effectiveZones.map((zone) => {
      const sampleLoc = buildManualDeliveryLocation({
        countryCode: zone.countryCode || 'KE',
        countyName: zone.counties[0] || 'Nairobi',
        townName: zone.towns[0] || undefined,
        estateName: zone.estates[0] || undefined,
      });
      const evalRes = filterAndSortCatalogForLocation({
        products,
        location: sampleLoc,
        zones: effectiveZones,
        branches,
        availabilityRecords: productAvailability,
        regions,
        settings: deliverySettings,
        filters: { onlyDeliverable: false, pageSize: 200 },
      });
      const limitedCount = evalRes.items.filter(
        (i) => i.availability.availabilityStatus === 'LIMITED_STOCK'
      ).length;
      const outCount = evalRes.items.filter((i) => !i.availability.deliveryEligible).length;
      return {
        zone,
        deliverableCount: evalRes.totalDeliverableCount,
        totalCatalogCount: evalRes.totalCatalogCount,
        limitedCount,
        outCount,
        departments: evalRes.departments.filter((d) => d.kind === 'department'),
        assignedBranchNames: branches
          .filter((b) => zone.assignedBranchIds.includes(b.id))
          .map((b) => b.name),
      };
    });
  }, [effectiveZones, products, branches, productAvailability, regions, deliverySettings]);

  const activeMonitorItem =
    monitorSummaries.find((m) => m.zone.id === monitorZoneId) || monitorSummaries[0] || null;

  if (!isAuthorized) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-base font-montserrat font-black text-slate-900">
          Administrative Permission Required
        </h3>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Delivery zone pricing, fulfilment assignments, and location-specific inventory controls are restricted to Admin, Branch Manager, Delivery Manager, and Inventory Controller roles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-[#0A006E] rounded-2xl p-5 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-md">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#FFDE00]">
            <Globe className="w-3.5 h-3.5" /> Location-Aware Fulfilment &amp; Delivery Zone Control
          </div>
          <h2 className="text-lg sm:text-xl font-montserrat font-black mt-1">
            Delivery Zones, Pricing &amp; Location Stock
          </h2>
          <p className="text-xs text-blue-200 mt-0.5 max-w-2xl">
            Configure Kenyan 47-county delivery zones, estate-level fees, free-delivery thresholds, assigned warehouses, and branch-specific product availability without duplicating catalog SKUs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isUsingBuiltInDefaults && (
            <button
              type="button"
              onClick={onSeedDefaultDeliveryZones}
              className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-montserrat font-black inline-flex items-center gap-1.5 cursor-pointer border border-white/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Save Default Kenya Zones to Firestore
            </button>
          )}
          <button
            type="button"
            onClick={openCreateZone}
            className="px-4 py-2.5 rounded-xl bg-[#FFDE00] hover:bg-amber-300 text-[#0A006E] text-xs font-montserrat font-black inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Delivery Zone
          </button>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'zones', label: `Delivery Zones (${effectiveZones.length})`, icon: MapPin },
          { id: 'stock', label: 'Location Stock & Eligibility', icon: Package },
          { id: 'monitor', label: 'Coverage Monitor', icon: Layers },
          { id: 'settings', label: 'Global Delivery Rules', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl text-xs font-montserrat font-black inline-flex items-center gap-2 transition-all cursor-pointer border ${
                active
                  ? 'bg-[#0A006E] text-[#FFDE00] border-[#0A006E] shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-[#0A006E]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* =========================================================
          SUB-TAB 1: DELIVERY ZONES DIRECTORY + EDITOR
         ========================================================= */}
      {subTab === 'zones' && (
        <div className="space-y-4">
          {isUsingBuiltInDefaults && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Showing baseline Kenya delivery zones dynamically matched to your operational branches. Edit any zone or click <strong>Save Default Kenya Zones to Firestore</strong> to persist custom zones in <code>deliveryZones</code>.
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchZone}
                onChange={(e) => setSearchZone(e.target.value)}
                placeholder="Search zones by county, town, estate or code..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0A006E]"
              />
            </div>
            <div className="text-xs font-bold text-slate-500">
              Active Zones: <span className="text-emerald-700 font-black">{effectiveZones.filter((z) => z.isActive).length}</span> / {effectiveZones.length}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visibleZones.map((zone) => {
              const linkedBranches = branches.filter((b) => zone.assignedBranchIds.includes(b.id));
              return (
                <div
                  key={zone.id}
                  className={`bg-white rounded-2xl border p-4 shadow-sm transition-all flex flex-col justify-between gap-3 ${
                    zone.isActive ? 'border-slate-200' : 'border-slate-200 opacity-65 bg-slate-50'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-[#0A006E] text-[#FFDE00] text-[10px] font-black font-mono">
                            {zone.code}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              zone.isActive
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {zone.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 text-[10px] font-bold">
                            {zone.pricingModel.replace('_', ' ')}
                          </span>
                        </div>
                        <h3 className="text-sm font-montserrat font-black text-slate-900 mt-1.5">
                          {zone.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleDeliveryZoneActive(zone.id, !zone.isActive)}
                          title={zone.isActive ? 'Deactivate Zone' : 'Activate Zone'}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                        >
                          {zone.isActive ? (
                            <ToggleRight className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-slate-400" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditZone(zone)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-indigo-50 text-[#0A006E] cursor-pointer"
                          title="Edit Zone"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {!isUsingBuiltInDefaults && (
                          <button
                            type="button"
                            onClick={() => onDeleteDeliveryZone(zone.id)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 cursor-pointer"
                            title="Delete Zone"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1">
                      <div>
                        <strong className="text-slate-800">Counties ({zone.country}):</strong>{' '}
                        {zone.counties.join(', ') || 'None'}
                      </div>
                      {zone.estates.length > 0 && (
                        <div className="line-clamp-2">
                          <strong className="text-slate-800">Estates:</strong>{' '}
                          {zone.estates.join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Base Fee</div>
                        <div className="text-xs font-black text-slate-900">
                          KES {zone.baseDeliveryFeeKes.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Free Over</div>
                        <div className="text-xs font-black text-emerald-700">
                          KES {zone.freeDeliveryThresholdKes.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Min Order</div>
                        <div className="text-xs font-black text-slate-900">
                          KES {zone.minOrderValueKes.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Est. ETA</div>
                        <div className="text-xs font-black text-[#0A006E]">
                          {zone.estimatedDeliveryLabel}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                      <Building2 className="w-3.5 h-3.5 text-[#0A006E] shrink-0" />
                      <span className="truncate font-semibold">
                        {linkedBranches.length > 0
                          ? linkedBranches.map((b) => b.name).join(', ')
                          : 'No fulfilment branch assigned'}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      Priority {zone.priority}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================
          SUB-TAB 2: LOCATION-SPECIFIC STOCK & ELIGIBILITY
         ========================================================= */}
      {subTab === 'stock' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-montserrat font-black text-slate-900">
                Manage Location-Specific Stock &amp; Delivery Eligibility
              </h3>
              <p className="text-xs text-slate-500">
                Updates <code>productAvailability</code> records and syncs branch stock without duplicating global products.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedStockBranch?.id || ''}
                onChange={(e) => {
                  setStockBranchId(e.target.value);
                  setStockEdits({});
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name} ({b.status})
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Filter SKU or product..."
                  className="pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs w-full sm:w-52"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500 font-black">
                  <th className="py-2.5 px-3">Product / SKU</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Local Stock</th>
                  <th className="py-2.5 px-3">Delivery Eligible</th>
                  <th className="py-2.5 px-3">Custom ETA (Opt.)</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockRows.map(({ product, currentStock, deliveryEligible, eta }) => {
                  const edit = stockEdits[product.id];
                  const valStock = edit ? edit.stock : currentStock;
                  const valElig = edit ? edit.eligible : deliveryEligible;
                  const valEta = edit ? edit.eta : eta;
                  const isDirty = Boolean(edit);

                  return (
                    <tr key={product.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{product.name}</div>
                        <div className="text-[10px] font-mono text-slate-500">{product.sku}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-semibold">
                        {product.subCategory || product.category}
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min={0}
                          value={valStock}
                          onChange={(e) =>
                            setStockEdits((prev) => ({
                              ...prev,
                              [product.id]: {
                                stock: Math.max(0, Number(e.target.value) || 0),
                                eligible: valElig,
                                eta: valEta,
                              },
                            }))
                          }
                          className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() =>
                            setStockEdits((prev) => ({
                              ...prev,
                              [product.id]: {
                                stock: valStock,
                                eligible: !valElig,
                                eta: valEta,
                              },
                            }))
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                            valElig
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {valElig ? 'Deliverable' : 'Blocked Locally'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={valEta}
                          onChange={(e) =>
                            setStockEdits((prev) => ({
                              ...prev,
                              [product.id]: {
                                stock: valStock,
                                eligible: valElig,
                                eta: e.target.value,
                              },
                            }))
                          }
                          placeholder="Zone default"
                          className="w-28 px-2 py-1.5 rounded-lg border border-slate-200 text-[11px]"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            handleSaveProductStockRow(product, currentStock, deliveryEligible, eta)
                          }
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1 cursor-pointer ${
                            isDirty
                              ? 'bg-[#0A006E] text-[#FFDE00]'
                              : 'bg-slate-100 text-slate-700 hover:bg-[#0A006E] hover:text-[#FFDE00]'
                          }`}
                        >
                          <Save className="w-3 h-3" /> Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================
          SUB-TAB 3: ZONE COVERAGE & AVAILABILITY MONITOR
         ========================================================= */}
      {subTab === 'monitor' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2.5">
            {monitorSummaries.map((item) => {
              const selected = activeMonitorItem?.zone.id === item.zone.id;
              const pct =
                item.totalCatalogCount > 0
                  ? Math.round((item.deliverableCount / item.totalCatalogCount) * 100)
                  : 0;
              return (
                <button
                  key={item.zone.id}
                  type="button"
                  onClick={() => setMonitorZoneId(item.zone.id)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    selected
                      ? 'bg-[#0A006E] text-white border-[#0A006E] shadow-md'
                      : 'bg-white text-slate-900 border-slate-200 hover:border-[#0A006E]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-montserrat font-black truncate">
                      {item.zone.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        selected
                          ? 'bg-[#FFDE00] text-[#0A006E]'
                          : pct > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {pct}% SKUs
                    </span>
                  </div>
                  <div className={`text-[11px] mt-1 ${selected ? 'text-blue-200' : 'text-slate-500'}`}>
                    {item.deliverableCount} deliverable · {item.limitedCount} low stock · {item.outCount} unavailable
                  </div>
                </button>
              );
            })}
          </div>

          {activeMonitorItem && (
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-montserrat font-black text-slate-900">
                    {activeMonitorItem.zone.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Fulfilment hubs:{' '}
                    <strong className="text-slate-800">
                      {activeMonitorItem.assignedBranchNames.join(', ') || 'None assigned'}
                    </strong>
                  </p>
                </div>
                <span className="px-3 py-1 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#0A006E]" />
                  {activeMonitorItem.zone.estimatedDeliveryLabel}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] font-black uppercase text-emerald-700">Deliverable SKUs</div>
                  <div className="text-2xl font-montserrat font-black text-emerald-900 mt-0.5">
                    {activeMonitorItem.deliverableCount}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-[10px] font-black uppercase text-amber-700">Limited Local Stock</div>
                  <div className="text-2xl font-montserrat font-black text-amber-900 mt-0.5">
                    {activeMonitorItem.limitedCount}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="text-[10px] font-black uppercase text-rose-700">Unavailable / OOS</div>
                  <div className="text-2xl font-montserrat font-black text-rose-900 mt-0.5">
                    {activeMonitorItem.outCount}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-montserrat font-black uppercase tracking-wide text-slate-500 mb-2">
                  Department Availability Matrix ({COMMERCE_DEPARTMENTS.length} Departments)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeMonitorItem.departments.map((dept) => (
                    <div
                      key={dept.id}
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        dept.hasLocalAvailability
                          ? 'bg-white border-emerald-200'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      <span className="text-xs font-bold">{dept.label}</span>
                      <span
                        className={`text-[11px] font-black px-2 py-0.5 rounded ${
                          dept.hasLocalAvailability
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {dept.deliverableCount} / {dept.totalCatalogCount} local
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          SUB-TAB 4: GLOBAL DELIVERY SETTINGS
         ========================================================= */}
      {subTab === 'settings' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm max-w-2xl">
          <div className="flex items-center gap-2 text-[#0A006E]">
            <Sliders className="w-5 h-5" />
            <h3 className="text-base font-montserrat font-black">Global Delivery &amp; Pricing Rules</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Default Delivery Fee (KES)
              </label>
              <input
                type="number"
                min={0}
                value={settingsDraft.defaultDeliveryFeeKes}
                onChange={(e) =>
                  setSettingsDraft((s) => ({ ...s, defaultDeliveryFeeKes: Number(e.target.value) || 0 }))
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Default Free Delivery Threshold (KES)
              </label>
              <input
                type="number"
                min={0}
                value={settingsDraft.defaultFreeDeliveryThresholdKes}
                onChange={(e) =>
                  setSettingsDraft((s) => ({
                    ...s,
                    defaultFreeDeliveryThresholdKes: Number(e.target.value) || 0,
                  }))
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Default Minimum Order Value (KES)
              </label>
              <input
                type="number"
                min={0}
                value={settingsDraft.defaultMinOrderValueKes}
                onChange={(e) =>
                  setSettingsDraft((s) => ({
                    ...s,
                    defaultMinOrderValueKes: Number(e.target.value) || 0,
                  }))
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Low Stock Alert Threshold (Units)
              </label>
              <input
                type="number"
                min={1}
                value={settingsDraft.defaultLowStockThreshold}
                onChange={(e) =>
                  setSettingsDraft((s) => ({
                    ...s,
                    defaultLowStockThreshold: Math.max(1, Number(e.target.value) || 5),
                  }))
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsDraft.enableRoadDistancePricing}
                onChange={(e) =>
                  setSettingsDraft((s) => ({ ...s, enableRoadDistancePricing: e.target.checked }))
                }
              />
              Enable Road-Distance Delivery Fee Calculation (Geoapify Routing / OpenStreetMap OSRM)
            </label>
            <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsDraft.strictZoneEnforcement}
                onChange={(e) =>
                  setSettingsDraft((s) => ({ ...s, strictZoneEnforcement: e.target.checked }))
                }
              />
              Strict Zone Coverage Enforcement (block checkout outside active delivery zones)
            </label>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() =>
                onSaveDeliverySettings({
                  ...settingsDraft,
                  id: 'default',
                  updatedAt: new Date().toISOString(),
                })
              }
              className="px-5 py-2.5 rounded-xl bg-[#0A006E] hover:bg-[#060046] text-[#FFDE00] text-xs font-montserrat font-black inline-flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" /> Save Global Delivery Rules
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          CREATE / EDIT DELIVERY ZONE MODAL
         ========================================================= */}
      {isZoneFormOpen && (
        <div className="fixed inset-0 z-[125] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
          <form
            onSubmit={handleSubmitZone}
            className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]"
          >
            <div className="bg-[#0A006E] px-5 py-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <Truck className="w-5 h-5 text-[#FFDE00]" />
                <h3 className="text-base font-montserrat font-black">
                  {editingZone ? `Edit Zone — ${editingZone.name}` : 'Create New Delivery Zone'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsZoneFormOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Zone Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={zCode}
                    onChange={(e) => setZCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Zone Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={zName}
                    onChange={(e) => setZName(e.target.value)}
                    placeholder="e.g., Nairobi — Westlands & Parklands"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Country
                  </label>
                  <select
                    value={zCountryCode}
                    onChange={(e) => {
                      setZCountryCode(e.target.value);
                      setZCounties([]);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    {COUNTRY_DIRECTORY.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Match Priority (Higher matches first)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={zPriority}
                    onChange={(e) => setZPriority(Number(e.target.value) || 80)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Multi-select 47 Kenyan Counties */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold uppercase text-slate-500">
                    Assigned Counties ({zCounties.length} selected)
                  </label>
                  <button
                    type="button"
                    onClick={autoFillTownsEstatesFromSelectedCounties}
                    className="text-[11px] font-black text-[#0A006E] hover:underline cursor-pointer"
                  >
                    Auto-fill Towns &amp; Estates from Selected Counties
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap gap-1.5">
                  {countryCounties.map((c) => {
                    const selected = zCounties.includes(c.name);
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => toggleCountyInForm(c.name)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#0A006E] text-[#FFDE00] border-[#0A006E]'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Towns / Sub-Counties (comma-separated)
                  </label>
                  <textarea
                    rows={2}
                    value={zTownsText}
                    onChange={(e) => setZTownsText(e.target.value)}
                    placeholder="Westlands, Kilimani, Nyali..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Estates / Localities (comma-separated)
                  </label>
                  <textarea
                    rows={2}
                    value={zEstatesText}
                    onChange={(e) => setZEstatesText(e.target.value)}
                    placeholder="Westlands, Parklands, Riverside, Gigiri..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              </div>

              {/* Fulfilment Branches */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">
                  Assigned Fulfilment Warehouses / Branches ({zAssignedBranchIds.length} selected)
                </label>
                <div className="flex flex-wrap gap-2">
                  {branches.map((b) => {
                    const selected = zAssignedBranchIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBranchInForm(b.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                          selected
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-[#0A006E]'
                        }`}
                      >
                        {selected && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {b.code} · {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pricing Model & Delivery Rules */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Pricing Model
                  </label>
                  <select
                    value={zPricingModel}
                    onChange={(e) => setZPricingModel(e.target.value as DeliveryPricingModel)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="FIXED">Fixed Zone Fee</option>
                    <option value="LOCALITY_TIERED">Locality-Specific Fees</option>
                    <option value="ROAD_DISTANCE">Road Distance (per km)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Base Fee (KES)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={zBaseFee}
                    onChange={(e) => setZBaseFee(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Free Over (KES)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={zFreeThreshold}
                    onChange={(e) => setZFreeThreshold(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Min Order (KES)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={zMinOrder}
                    onChange={(e) => setZMinOrder(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  />
                </div>
              </div>

              {zPricingModel === 'ROAD_DISTANCE' && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-indigo-50/50 border border-indigo-200">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-indigo-800 mb-1">
                      Included Base Radius (km)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={zIncludedKm}
                      onChange={(e) => setZIncludedKm(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-indigo-800 mb-1">
                      Extra Road Fee per km (KES)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={zPerKmFee}
                      onChange={(e) => setZPerKmFee(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs font-bold"
                    />
                  </div>
                </div>
              )}

              {zPricingModel === 'LOCALITY_TIERED' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Estate / Locality Fee Overrides (one per line: <code>Estate: FeeKes</code>)
                  </label>
                  <textarea
                    rows={3}
                    value={zLocalityFeesText}
                    onChange={(e) => setZLocalityFeesText(e.target.value)}
                    placeholder={'Westlands: 200\nParklands: 200\nGigiri: 300'}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Min ETA (mins)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={zEtaMin}
                    onChange={(e) => setZEtaMin(Number(e.target.value) || 25)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Max ETA (mins)
                  </label>
                  <input
                    type="number"
                    min={10}
                    value={zEtaMax}
                    onChange={(e) => setZEtaMax(Number(e.target.value) || 50)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={zIsActive}
                    onChange={(e) => setZIsActive(e.target.checked)}
                  />
                  Zone Active
                </label>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsZoneFormOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-[#0A006E] hover:bg-[#060046] text-[#FFDE00] text-xs font-montserrat font-black inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Delivery Zone'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
