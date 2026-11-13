import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  ShoppingCart,
  Search,
  Printer,
  CheckCircle2,
  Trash2,
  Plus,
  Minus,
  MapPin,
  Store,
  Briefcase,
  Barcode,
  Camera,
  Bluetooth,
  Volume2,
  VolumeX,
  Sparkles,
  Coins,
  CreditCard,
  Smartphone,
  Zap,
  ScanLine,
  X,
  AlertCircle,
  UtensilsCrossed,
  Flame,
  Cigarette,
  Wine,
  ChefHat,
  Layers,
  Calendar,
  Receipt,
  FileText,
  Check,
  RotateCcw,
} from 'lucide-react';
import {
  Product,
  Branch,
  GeoRegion,
  Partner,
  StaffMember,
  TransactionDoc,
  DocType,
  LineItem,
  StockCategory,
  BusinessUnit,
  RestaurantInventoryItem,
} from '../types';
import { calculateGeoPrice, formatKes, isUserFeaturePermitted } from '../erpUtils';
import { NAIROBI_DRINKS_SUB_CATEGORIES } from '../data/nairobiDrinksCatalog';
import {
  PRESET_SIGGER_ITEMS,
  PRESET_SHISHA_ITEMS,
  PRESET_AMENITY_ITEMS,
  ClubTopupItem,
} from '../data/clubTopupsData';
import { ProductImage } from './ProductImage';
import { AnimatedSuccessTickIcon } from './AnimatedFeedback';
import { PhoneBarcodeScannerModal } from './PhoneBarcodeScannerModal';
import { playPosBeep, triggerScanHaptic, isAudioMuted, toggleAudioMuted } from '../utils/audioBeep';
import QRCode from 'qrcode';
import {
  syncPosCartToFirestore,
  subscribeToActivePosCart,
  clearActivePosCart,
} from '../utils/posCartSync';
import { PhoneScannerCompanion } from './PhoneScannerCompanion';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { subscribeToProductScans } from '../utils/productScanBroadcast';
import { useDashboardPrefs } from '../utils/dashboardPrefs';
import { MinimalDashboardBar } from './common/MinimalDashboardBar';

interface PosViewsProps {
  mode: 'retail' | 'wholesale';
  currentUser: StaffMember;
  products: Product[];
  branches: Branch[];
  regions: GeoRegion[];
  partners: Partner[];
  businessUnits?: BusinessUnit[];
  restaurantInventory?: RestaurantInventoryItem[];
  onCommitTransaction: (
    txDraft: Omit<TransactionDoc, 'id' | 'createdAt'>,
    updatedProducts: { productId: string; newTotal: number; newBranchStockJson: string }[]
  ) => Promise<TransactionDoc | null>;
  onPreviewDoc: (doc: TransactionDoc) => void;
  onUpdateRestaurantItem?: (itemId: string, updates: Partial<RestaurantInventoryItem>) => Promise<void>;
  onNavigateModule?: (module: any) => void;
}

export const PosViews: React.FC<PosViewsProps> = ({
  mode,
  currentUser,
  products,
  branches,
  regions,
  partners,
  businessUnits = [],
  restaurantInventory = [],
  onCommitTransaction,
  onPreviewDoc,
  onUpdateRestaurantItem,
  onNavigateModule,
}) => {
  const isScopedBranch =
    currentUser.role === 'Branch Manager' ||
    currentUser.role === 'Counter Cashier' ||
    currentUser.role === 'Affiliate Sales Representative';

  const canVoidOrder = isUserFeaturePermitted(currentUser, 'pos_voids');

  const defaultBranchId =
    (isScopedBranch && currentUser.branchId ? currentUser.branchId : branches[0]?.id) || '';

  const [selectedBranchId, setSelectedBranchId] = useState<string>(defaultBranchId);
  const activeBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) || branches[0],
    [branches, selectedBranchId]
  );

  const [selectedRegionId, setSelectedRegionId] = useState<string>(
    activeBranch?.regionId || regions[0]?.id || ''
  );

  const effectiveRegionId =
    mode === 'retail'
      ? activeBranch?.regionId || selectedRegionId
      : selectedRegionId || activeBranch?.regionId || '';

  const activeRegion = useMemo(
    () => regions.find((r) => r.id === effectiveRegionId) || regions[0],
    [regions, effectiveRegionId]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState<'ALL' | StockCategory>('ALL');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('ALL');
  const [visibleLimit, setVisibleLimit] = useState<number>(36);

  const {
    schema: dashSchema,
    prefs: dashPrefs,
    isMinimal,
    setMode: setDashMode,
    toggleKpi,
    toggleWidget,
    isKpiVisible,
    isWidgetVisible,
    resetToDefault,
  } = useDashboardPrefs(currentUser);

  // Outlets under current active branch
  const branchOutlets = useMemo(() => {
    if (!activeBranch) return [];
    return businessUnits.filter((u) => u.branchId === activeBranch.id);
  }, [businessUnits, activeBranch]);

  // Priority outlet selection: if staff is assigned to a specific businessUnit, default to it!
  const [selectedOutletId, setSelectedOutletId] = useState<string>(() => {
    if (currentUser.businessUnitId) return currentUser.businessUnitId;
    return 'BONDED_CENTRAL';
  });

  const activeOutlet = useMemo(() => {
    if (selectedOutletId === 'BONDED_CENTRAL') return null;
    return businessUnits.find((u) => u.id === selectedOutletId) || null;
  }, [businessUnits, selectedOutletId]);

  const isRestaurantMode = activeOutlet?.unitType === 'restaurant_club';
  const isMerchantShopMode = activeOutlet?.unitType === 'merchant_shop';

  // Restaurant Food Category filter
  const [restaurantCategoryFilter, setRestaurantCategoryFilter] = useState<string>('ALL');
  const [activeTableNumber, setActiveTableNumber] = useState<string>('Table 01');
  const [guestCount, setGuestCount] = useState<number>(2);

  // Club Topup Modal State (Liquor, Cigars/Sigger, Shisha)
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false);
  const [topupTab, setTopupTab] = useState<'liquor' | 'sigger' | 'shisha' | 'amenity'>('liquor');
  const [topupLiquorSearch, setTopupLiquorSearch] = useState('');

  const [cart, setCart] = useState<
    {
      id: string;
      kind: 'bonded_product' | 'restaurant_food' | 'topup_item';
      product?: Product;
      restaurantItem?: RestaurantInventoryItem;
      topupItem?: ClubTopupItem;
      unitMode: 'Bottle' | 'Case' | 'Portion' | 'Plate' | 'Platter' | 'Glass' | 'Cup' | 'Stick' | 'Head' | 'Serving' | 'Basket';
      quantityUnits: number;
      unitPrice: number;
      name: string;
      category: string;
    }[]
  >([]);

  const retailers = useMemo(
    () => partners.filter((p) => p.partnerType === 'Retailer'),
    [partners]
  );

  const [customerName, setCustomerName] = useState<string>(
    mode === 'retail' ? 'Walk-In Retail Customer (21+ Verified)' : retailers[0]?.companyName || ''
  );
  const [customerLicense, setCustomerLicense] = useState<string>(
    mode === 'retail' ? 'AGE-21-VERIFIED' : retailers[0]?.liquorLicenseNo || ''
  );
  const [customerKraPin, setCustomerKraPin] = useState<string>(
    mode === 'wholesale' ? retailers[0]?.taxPin || '' : ''
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(
    mode === 'retail' ? 'M-Pesa Till / Instant Card' : 'Corporate Bank EFT / M-Pesa Paybill'
  );
  const [docTypeToIssue, setDocTypeToIssue] = useState<DocType>(
    mode === 'retail' ? 'Receipt' : 'Invoice'
  );
  const [affiliateCode, setAffiliateCode] = useState<string>(
    currentUser.role === 'Affiliate Sales Representative'
      ? `AFF-${currentUser.name.slice(0, 3).toUpperCase()}-01`
      : ''
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Barcode Scanner Integration & Activation (Phone, Desktop USB & Bluetooth Scanners)
  const [barcodeInput, setBarcodeInput] = useState('');
  const [activatedProductIds, setActivatedProductIds] = useState<string[]>([]);
  const [scanQueue, setScanQueue] = useState<{ id: string; name: string; barcode: string; timestamp: number }[]>([]);
  const [isPhoneScannerOpen, setIsPhoneScannerOpen] = useState(false);
  const [showAllCartItems, setShowAllCartItems] = useState(false);

  // Real-time listener for product activations
  useEffect(() => {
    if (!activeBranch) return;
    const q = query(
      collection(db, 'branch_product_activations'),
      where('branchId', '==', activeBranch.id)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const ids = snap.docs.map((d) => d.data().productId);
        setActivatedProductIds(ids);
      },
      (error) => {
        console.warn('[branch_product_activations] sync notice:', error?.message || error);
      }
    );
    return unsub;
  }, [activeBranch]);

  // Real-time broadcast listener: instantly activate products on POS shelf when scanned anywhere
  useEffect(() => {
    const unsubScans = subscribeToProductScans((evt) => {
      setActivatedProductIds((prev) => Array.from(new Set([evt.productId, ...prev])));
      setScanNotification({
        type: 'success',
        text: `⚡ Live Scan: "${evt.name}" activated on POS shelf!`,
        productName: evt.name,
        price: evt.price,
        timestamp: Date.now(),
      });
      playPosBeep('success');
      triggerScanHaptic();
    });
    return () => unsubScans();
  }, []);

  const [scanNotification, setScanNotification] = useState<{
    type: 'success' | 'error' | 'case';
    text: string;
    productName?: string;
    price?: number;
    qtyInCart?: number;
    timestamp: number;
  } | null>(null);
  const [soundMuted, setSoundMuted] = useState(() => isAudioMuted());
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string>('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Real-time Phone-to-Desktop Cashier Sync State under Cashier Account
  const [isPhoneSyncActive, setIsPhoneSyncActive] = useState(false);
  const [isPhonePairModalOpen, setIsPhonePairModalOpen] = useState(false);
  const [pairingQrDataUrl, setPairingQrDataUrl] = useState<string>('');
  const [pairingUrl, setPairingUrl] = useState<string>('');
  const [isPhoneCompanionModalOpen, setIsPhoneCompanionModalOpen] = useState(false);
  const [mpesaCustomerPhone, setMpesaCustomerPhone] = useState('');
  const [mpesaReceiptCode, setMpesaReceiptCode] = useState('');
  const isApplyingRemoteSyncRef = useRef(false);

  // Generate pairing QR code whenever pairing modal opens
  useEffect(() => {
    if (isPhonePairModalOpen) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = `${origin}/?phone_scanner=true&staffId=${encodeURIComponent(currentUser.id)}&staffName=${encodeURIComponent(currentUser.name)}&staffRole=${encodeURIComponent(currentUser.role)}&staffEmail=${encodeURIComponent(currentUser.email || '')}`;
      setPairingUrl(url);
      QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#0A006E', light: '#FFFFFF' } })
        .then((dataUrl) => setPairingQrDataUrl(dataUrl))
        .catch((err) => console.warn('QR Code generation error:', err));
    }
  }, [isPhonePairModalOpen, currentUser]);

  const localCartRef = useRef(cart);
  localCartRef.current = cart;

  // Real-time listener: receive instant scans from phone under currentUser's account
  useEffect(() => {
    const staffKey = currentUser.email;
    if (!staffKey) return;

    const unsub = subscribeToActivePosCart(staffKey, (remote) => {
      // Enrich remote items with catalog product details for accurate pricing, taxes, and images
      const enrichedCart = remote.cart.map((item) => {
        if (item.kind === 'bonded_product' && item.product?.id) {
          const fullProd = products.find((p) => p.id === item.product!.id) || item.product;
          return { ...item, product: fullProd };
        }
        return item;
      });

      const remoteSummary = enrichedCart.map((it) => `${it.id}:${it.quantityUnits}:${it.unitMode}`).join('|');
      const localSummary = localCartRef.current.map((it) => `${it.id}:${it.quantityUnits}:${it.unitMode}`).join('|');

      if (remoteSummary !== localSummary) {
        isApplyingRemoteSyncRef.current = true;
        setCart(enrichedCart as any);
        if (remote.activatedProductIds && remote.activatedProductIds.length > 0) {
          setActivatedProductIds((prev) => Array.from(new Set([...prev, ...remote.activatedProductIds])));
        }
        setIsPhoneSyncActive(true);

        if (remote.lastScannedProductName) {
          playPosBeep('success');
          triggerScanHaptic();
          setScanNotification({
            type: 'success',
            text: `📱 Phone Scanned: ${remote.lastScannedProductName} (+1 item) · New Total: ${formatKes(remote.grandTotal)}`,
            productName: remote.lastScannedProductName,
            price: remote.cart[remote.cart.length - 1]?.unitPrice || 0,
            qtyInCart: remote.cart.find((it) => it.name === remote.lastScannedProductName)?.quantityUnits || 1,
            timestamp: Date.now(),
          });
        }
      }
    });

    return () => unsub();
  }, [currentUser.id, currentUser.email, products]);

  // Synchronize local desktop cart updates to Firestore
  useEffect(() => {
    if (isApplyingRemoteSyncRef.current) {
      isApplyingRemoteSyncRef.current = false;
      return;
    }
    const staffKey = currentUser.email;
    if (!staffKey) return;

    let sub = 0;
    let units = 0;
    for (const it of cart) {
      units += it.quantityUnits;
      sub += Math.round((it.unitPrice || 0) * it.quantityUnits);
    }
    const tax = Math.round(sub * (activeRegion?.regionalTaxRate ?? 0.16));

    syncPosCartToFirestore({
      staffId: currentUser.id,
      staffName: currentUser.name,
      staffEmail: currentUser.email || '',
      staffRole: currentUser.role,
      branchId: activeBranch?.id || '',
      cart,
      activatedProductIds,
      totalUnits: units,
      subtotal: sub,
      exciseAndTax: tax,
      grandTotal: sub + tax,
      lastScannedBarcode,
      sourceDevice: 'desktop',
    }).catch(() => {});
  }, [cart, activatedProductIds, currentUser, activeBranch, activeRegion, lastScannedBarcode]);

  const handleScanBarcode = useCallback(
    (rawBarcode: string): { success: boolean; product?: Product; message?: string } => {
      const code = rawBarcode.trim();
      if (!code) return { success: false, message: 'Empty barcode' };
      const digitsOnly = code.replace(/\D/g, '');

      // 1. Exact match on barcode, caseBarcode or SKU
      let matched = products.find(
        (p) =>
          (p.barcode && p.barcode.trim() === code) ||
          (p.caseBarcode && p.caseBarcode.trim() === code) ||
          (p.sku && p.sku.toLowerCase() === code.toLowerCase())
      );

      let isCaseScan = false;
      if (matched && matched.caseBarcode && matched.caseBarcode.trim() === code) {
        isCaseScan = true;
      }

      // 2. Normalized digit matching (EAN-13, UPC-A 12 vs 13 digits with leading zero, ITF-14)
      if (!matched && digitsOnly) {
        matched = products.find((p) => {
          const pCase = p.caseBarcode ? p.caseBarcode.replace(/\D/g, '') : '';
          const pBottle = p.barcode ? p.barcode.replace(/\D/g, '') : '';

          if (pCase && (pCase === digitsOnly || pCase.endsWith(digitsOnly) || digitsOnly.endsWith(pCase))) {
            isCaseScan = true;
            return true;
          }
          if (pBottle) {
            if (pBottle === digitsOnly) return true;
            if (pBottle.padStart(13, '0') === digitsOnly.padStart(13, '0')) return true;
          }
          return false;
        });
      }

      if (!matched) {
        playPosBeep('error');
        setScanNotification({
          type: 'error',
          text: `Barcode "${code}" not found in bonded product catalog`,
          timestamp: Date.now(),
        });
        return { success: false, message: `Barcode "${code}" not found` };
      }

      const targetUnit: 'Bottle' | 'Case' = isCaseScan
        ? 'Case'
        : mode === 'wholesale'
        ? 'Case'
        : 'Bottle';

      playPosBeep(isCaseScan ? 'case' : 'success');
      triggerScanHaptic();
      setLastScannedBarcode(code);

      // Mark product as scanned & activated in ERP catalog
      if (!matched!.isScanned) {
        matched!.isScanned = true;
        setDoc(doc(db, 'products', matched!.id), {
          isScanned: true,
          scannedAt: new Date().toISOString(),
          scannerId: currentUser.id,
        }, { merge: true }).catch((err) => console.error('Product scan activation write failed:', err));
      }

      // Activate product into POS checkout session shelf
      setActivatedProductIds((prev) => Array.from(new Set([matched!.id, ...prev])));
      if (!activatedProductIds.includes(matched!.id)) {
        const activationId = `${activeBranch.id}_${matched!.id}`;
        setDoc(doc(db, 'branch_product_activations', activationId), {
          id: activationId,
          branchId: activeBranch.id,
          productId: matched!.id,
          activatedAt: new Date().toISOString(),
          activatedBy: currentUser.id,
        }).catch((err) => console.error('Activation write failed:', err));
      }

      let updatedQty = 1;
      setCart((prev) => {
        const existingIdx = prev.findIndex(
          (item) => item.product?.id === matched!.id && item.unitMode === targetUnit && item.kind === 'bonded_product'
        );
        if (existingIdx >= 0) {
          updatedQty = prev[existingIdx].quantityUnits + 1;
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantityUnits: updatedQty,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: `scan-${matched!.id}-${Date.now()}`,
            kind: 'bonded_product',
            product: matched!,
            unitMode: targetUnit,
            quantityUnits: 1,
            unitPrice: 0,
            name: matched!.name,
            category: matched!.category,
          },
        ];
      });

      const geoPrice = calculateGeoPrice(
        matched,
        activeRegion,
        mode === 'wholesale' ? 'wholesale' : 'retail'
      );
      const unitPrice = targetUnit === 'Case' ? geoPrice.casePrice : geoPrice.unitBottlePrice;

      setScanNotification({
        type: isCaseScan ? 'case' : 'success',
        text: `Scanned & Added: ${matched.name}`,
        productName: matched.name,
        price: unitPrice,
        qtyInCart: updatedQty,
        timestamp: Date.now(),
      });

      setBarcodeInput('');
      return { success: true, product: matched };
    },
    [products, mode, activeRegion]
  );

  // Global listener for Desktop USB & Bluetooth Handheld Barcode Scanners (HID Wedge mode)
  useEffect(() => {
    let keyBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const activeTag = activeEl?.tagName?.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea';
      const isQuickScanInput = activeEl?.id === 'barcode-scanner-quick-input';

      const now = Date.now();
      const charInterval = now - lastKeyTime;
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (isQuickScanInput && barcodeInput.trim()) {
          e.preventDefault();
          handleScanBarcode(barcodeInput);
          return;
        }

        if (keyBuffer.length >= 3) {
          e.preventDefault();
          const code = keyBuffer;
          keyBuffer = '';
          handleScanBarcode(code);
        } else {
          keyBuffer = '';
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isInput && !isQuickScanInput) {
          if (charInterval < 50) {
            keyBuffer += e.key;
          } else {
            keyBuffer = '';
          }
        } else {
          if (charInterval > 85 && !isQuickScanInput) {
            keyBuffer = e.key;
          } else {
            keyBuffer += e.key;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleScanBarcode, barcodeInput]);

  // Auto-dismiss scan notification banner after 4.5 seconds
  useEffect(() => {
    if (scanNotification) {
      const timer = setTimeout(() => {
        setScanNotification(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [scanNotification]);

  const [catalogStockFilter, setCatalogStockFilter] = useState<'ALL' | 'IN_STOCK'>('ALL');

  // Products displayed on Cashier POS: All active catalog products available for point-of-sale selection
  const activatedProducts = useMemo(() => {
    return products.filter((p) => p.status !== ('Deleted' as any));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return activatedProducts.filter((p) => {
      // Sales Rep restriction: only show IPS products
      if (currentUser.role === 'Affiliate Sales Representative' && p.category !== 'IPS') {
        return false;
      }

      if (catalogStockFilter === 'IN_STOCK') {
        const stock = activeBranch ? getBranchBottleStock(p, activeBranch.id) : (p.totalBottles ?? 0);
        if (stock <= 0) return false;
      }

      const matchesStockCat =
        stockCategoryFilter === 'ALL' || p.category === stockCategoryFilter;
      const matchesSub =
        selectedSubCategory === 'ALL' ||
        (p.subCategory || p.category) === selectedSubCategory;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q);
      return matchesStockCat && matchesSub && matchesSearch;
    });
  }, [activatedProducts, catalogStockFilter, stockCategoryFilter, selectedSubCategory, searchQuery, currentUser.role, activeBranch]);

  const displayedProducts = useMemo(
    () => filteredProducts.slice(0, visibleLimit),
    [filteredProducts, visibleLimit]
  );

  const getBranchBottleStock = (product: Product, branchId: string): number => {
    const fallbackTotal = product.totalBottles ?? 0;
    try {
      const parsed = product.branchStockSummary ? JSON.parse(product.branchStockSummary) : {};
      return typeof parsed[branchId] === 'number' ? parsed[branchId] : fallbackTotal;
    } catch {
      return fallbackTotal;
    }
  };

  const handleAddToCart = (product: Product) => {
    playPosBeep('success');
    triggerScanHaptic();
    setActivatedProductIds((prev) => (prev.includes(product.id) ? prev : [product.id, ...prev]));
    const defaultUnitMode: 'Bottle' | 'Case' = mode === 'wholesale' ? 'Case' : 'Bottle';
    setCart((prev) => {
      const existing = prev.find(
        (item) => item.product?.id === product.id && item.unitMode === defaultUnitMode && item.kind === 'bonded_product'
      );
      if (existing) {
        return prev.map((item) =>
          item.product?.id === product.id && item.unitMode === defaultUnitMode && item.kind === 'bonded_product'
            ? { ...item, quantityUnits: item.quantityUnits + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          id: `prod-${product.id}-${Date.now()}`,
          kind: 'bonded_product',
          product,
          unitMode: defaultUnitMode,
          quantityUnits: 1,
          unitPrice: 0,
          name: product.name,
          category: product.category,
        },
      ];
    });
  };

  // Add Restaurant Food / Drink dish to order
  const handleAddRestaurantDish = (dish: RestaurantInventoryItem) => {
    if (dish.portionsAvailable <= 0) {
      playPosBeep('error');
      setScanNotification({
        type: 'error',
        text: `"${dish.name}" is sold out in kitchen inventory!`,
        timestamp: Date.now(),
      });
      return;
    }
    playPosBeep('success');
    triggerScanHaptic();
    setCart((prev) => {
      const existing = prev.find(
        (item) => item.restaurantItem?.id === dish.id && item.kind === 'restaurant_food'
      );
      if (existing) {
        return prev.map((item) =>
          item === existing ? { ...item, quantityUnits: item.quantityUnits + 1 } : item
        );
      }
      const unitMode = (dish.portionUnit || 'Plate') as any;
      return [
        ...prev,
        {
          id: `dish-${dish.id}-${Date.now()}`,
          kind: 'restaurant_food',
          restaurantItem: dish,
          unitMode,
          quantityUnits: 1,
          unitPrice: dish.sellingPriceKes,
          name: dish.name,
          category: dish.category,
        },
      ];
    });
  };

  // Add Club Topup (Bonded Liquor, Cigars/Sigger, Shisha, Amenities)
  const handleAddClubTopup = (topup: ClubTopupItem, linkedProduct?: Product) => {
    playPosBeep('case');
    triggerScanHaptic();
    setCart((prev) => {
      const existing = prev.find(
        (item) => item.topupItem?.id === topup.id && item.kind === 'topup_item'
      );
      if (existing) {
        return prev.map((item) =>
          item === existing ? { ...item, quantityUnits: item.quantityUnits + 1 } : item
        );
      }
      const unitMode = (topup.portionUnit || 'Stick') as any;
      return [
        ...prev,
        {
          id: `topup-${topup.id}-${Date.now()}`,
          kind: 'topup_item',
          topupItem: topup,
          product: linkedProduct,
          unitMode,
          quantityUnits: 1,
          unitPrice: topup.priceKes,
          name: topup.name,
          category: topup.category,
        },
      ];
    });
    setIsTopupModalOpen(false);
  };

  const handleUpdateQty = (index: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item, idx) =>
          idx === index ? { ...item, quantityUnits: Math.max(0, item.quantityUnits + delta) } : item
        )
        .filter((item) => item.quantityUnits > 0)
    );
  };

  const handleToggleUnitMode = (index: number) => {
    setCart((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (item.kind === 'bonded_product') {
          return { ...item, unitMode: item.unitMode === 'Bottle' ? 'Case' : 'Bottle' };
        }
        return item;
      })
    );
  };

  const handleRemoveCartItem = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  const computedLineItems: LineItem[] = useMemo(() => {
    return cart.map((entry) => {
      if (entry.kind === 'bonded_product' && entry.product) {
        const packSize = entry.product.packSize || entry.product.bottlesPerCase || 12;
        const geoPricing = calculateGeoPrice(
          entry.product,
          activeRegion,
          mode === 'wholesale' ? 'wholesale' : 'retail'
        );
        const unitPrice =
          entry.unitMode === 'Case' ? geoPricing.casePrice : geoPricing.unitBottlePrice;
        const totalBottles =
          entry.unitMode === 'Case'
            ? entry.quantityUnits * packSize
            : entry.quantityUnits;
        const lineTotal = Math.round(unitPrice * entry.quantityUnits);

        return {
          productId: entry.product.id,
          sku: entry.product.sku,
          name: entry.product.name,
          unitMode: entry.unitMode,
          bottlesPerCase: packSize,
          quantityUnits: entry.quantityUnits,
          totalBottles,
          unitPrice,
          lineTotal,
        };
      } else if (entry.kind === 'restaurant_food' && entry.restaurantItem) {
        const unitPrice = entry.unitPrice ?? entry.restaurantItem.sellingPriceKes;
        const lineTotal = Math.round(unitPrice * entry.quantityUnits);
        return {
          productId: entry.restaurantItem.id,
          sku: `FOOD-${entry.restaurantItem.id.slice(-4)}`,
          name: `[FOOD] ${entry.restaurantItem.name}`,
          unitMode: entry.unitMode,
          bottlesPerCase: 1,
          quantityUnits: entry.quantityUnits,
          totalBottles: 0,
          unitPrice,
          lineTotal,
          businessUnitId: entry.restaurantItem.businessUnitId,
        };
      } else {
        const unitPrice = entry.unitPrice ?? entry.topupItem?.priceKes ?? 0;
        const lineTotal = Math.round(unitPrice * entry.quantityUnits);
        const topupTag =
          entry.topupItem?.category === 'liquor'
            ? '[LIQUOR TOPUP]'
            : entry.topupItem?.category === 'sigger'
            ? '[SIGGER TOPUP]'
            : entry.topupItem?.category === 'shisha'
            ? '[SHISHA TOPUP]'
            : '[CLUB AMENITY]';
        return {
          productId: entry.product?.id || entry.topupItem?.id || `topup-${Date.now()}`,
          sku: `TOP-${(entry.topupItem?.category || 'gen').slice(0, 3).toUpperCase()}`,
          name: `${topupTag} ${entry.name || entry.topupItem?.name}`,
          unitMode: entry.unitMode,
          bottlesPerCase: 1,
          quantityUnits: entry.quantityUnits,
          totalBottles: entry.topupItem?.category === 'liquor' ? entry.quantityUnits : 0,
          unitPrice,
          lineTotal,
          isTopup: true,
          topupType: entry.topupItem?.category || 'liquor',
        };
      }
    });
  }, [cart, activeRegion, mode]);

  const subtotal = useMemo(
    () => computedLineItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [computedLineItems]
  );
  const taxRate = activeRegion?.regionalTaxRate ?? 0.16;
  const exciseAndTax = Math.round(subtotal * taxRate);
  const grandTotal = subtotal + exciseAndTax;

  const handleCompleteCheckout = async () => {
    if (computedLineItems.length === 0 || !activeBranch || !activeRegion) return;
    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const prefixMap: Record<DocType, string> = {
        Receipt: 'RCP',
        Invoice: 'INV',
        Quote: 'QUO',
        'Packing List': 'PKL',
        'Delivery Note': 'DLN',
        'Credit Note': 'CRN',
        'Online Order': 'ONL',
      };
      const docNumber = `${prefixMap[docTypeToIssue]}-${Date.now().toString().slice(-6)}`;

      const updatedProducts: { productId: string; newTotal: number; newBranchStockJson: string }[] = [];

      // Deduct central liquor bottles for bonded or topup items
      if (docTypeToIssue !== 'Quote') {
        for (const line of computedLineItems) {
          const prod = products.find((p) => p.id === line.productId);
          if (prod && line.totalBottles > 0) {
            const fallbackTotal = prod.totalBottles ?? 0;
            let branchMap: Record<string, number> = {};
            try {
              branchMap = prod.branchStockSummary ? JSON.parse(prod.branchStockSummary) : {};
            } catch {
              branchMap = {};
            }
            const currentBranchQty = branchMap[activeBranch.id] ?? fallbackTotal;
            const nextBranchQty = Math.max(0, currentBranchQty - line.totalBottles);
            branchMap[activeBranch.id] = nextBranchQty;
            const newTotal = Math.max(0, fallbackTotal - line.totalBottles);

            updatedProducts.push({
              productId: prod.id,
              newTotal,
              newBranchStockJson: JSON.stringify(branchMap),
            });
          }
        }

        // Deduct portions from separate kitchen inventory for restaurant items
        if (onUpdateRestaurantItem) {
          for (const item of cart) {
            if (item.kind === 'restaurant_food' && item.restaurantItem) {
              const currentPortions = item.restaurantItem.portionsAvailable || 0;
              const remaining = Math.max(0, currentPortions - item.quantityUnits);
              await onUpdateRestaurantItem(item.restaurantItem.id, {
                portionsAvailable: remaining,
                isAvailable: remaining > 0,
              }).catch(() => {});
            }
          }
        }
      }

      const isRestaurantPos = isRestaurantMode && activeOutlet;
      const createdTx = await onCommitTransaction(
        {
          docNumber,
          docType: docTypeToIssue,
          channel: isRestaurantPos
            ? 'Restaurant & Club POS'
            : isMerchantShopMode
            ? 'Merchant Shop POS'
            : currentUser.role === 'Affiliate Sales Representative'
            ? 'Affiliate Rep'
            : mode === 'retail'
            ? 'Retail Counter POS'
            : 'B2B Wholesale POS',
          branchId: activeBranch.id,
          branchName: activeBranch.name,
          businessUnitId: isRestaurantPos ? activeOutlet.id : undefined,
          businessUnitName: isRestaurantPos ? activeOutlet.name : undefined,
          tableNumber: isRestaurantPos ? activeTableNumber : undefined,
          regionId: activeRegion.id,
          regionName: activeRegion.name,
          customerName: isRestaurantPos
            ? `${activeTableNumber ? `${activeTableNumber} · ` : ''}${customerName.trim() || 'Dine-In Guest'}`
            : customerName.trim() || 'Walk-in Customer',
          customerKraPin: customerKraPin.trim().toUpperCase() || undefined,
          customerLicenseNo: customerLicense.trim() || 'VERIFIED-21',
          itemsSummary: JSON.stringify(computedLineItems),
          subtotal,
          exciseAndTax,
          totalAmount: grandTotal,
          paymentMethod,
          status: docTypeToIssue === 'Quote' ? 'Issued' : 'Paid',
          createdBy: currentUser.name,
          createdByRole: currentUser.role,
          affiliateCode: affiliateCode || undefined,
        },
        updatedProducts
      );

      setCart([]);
      setActivatedProductIds([]);
      clearActivePosCart(currentUser.id || currentUser.email).catch(() => {});
      setStatusMessage(`${docTypeToIssue} ${docNumber} committed and ready to print.`);
      if (createdTx) {
        onPreviewDoc(createdTx);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Minimal Customizable Cashier Command Bar */}
      <MinimalDashboardBar
        currentUser={currentUser}
        title={mode === 'retail' ? 'Retail Checkout' : 'Wholesale POS'}
        subtitle={`${activeBranch?.name || 'Central Outlet'} · ${activeRegion?.name || 'Default Zone'}`}
        schema={dashSchema}
        prefs={dashPrefs}
        onChangeMode={setDashMode}
        onToggleKpi={toggleKpi}
        onToggleWidget={toggleWidget}
        onReset={resetToDefault}
        minimalLabel="Focus"
        expandedLabel="Full"
        actions={
          <>
            {isKpiVisible('branch_zone') && (
              <>
                <select
                  disabled={isScopedBranch}
                  value={activeBranch?.id || ''}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    const br = branches.find((b) => b.id === e.target.value);
                    if (br) setSelectedRegionId(br.regionId);
                  }}
                  className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-montserrat font-bold text-[#0A006E] cursor-pointer"
                >
                  {(isScopedBranch && currentUser.branchId
                    ? branches.filter(
                        (b) =>
                          b.id === currentUser.branchId ||
                          b.name === currentUser.branchName
                      )
                    : branches
                  ).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.name}
                    </option>
                  ))}
                </select>
                <select
                  value={activeRegion?.id || ''}
                  onChange={(e) => setSelectedRegionId(e.target.value)}
                  className="px-2 py-1.5 bg-[#0A006E] text-white rounded-lg text-[11px] font-montserrat font-bold cursor-pointer"
                  title="Geo-Pricing Zone"
                >
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.tierType})
                    </option>
                  ))}
                </select>
              </>
            )}
            {onNavigateModule && (
              <button
                type="button"
                onClick={() => onNavigateModule('leave_management')}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Request Annual Leave, Off-Day, Emergency or Maternity Leave"
              >
                <Calendar className="w-3.5 h-3.5 text-fuchsia-600 shrink-0" />
                <span>Leave / Off</span>
              </button>
            )}
          </>
        }
      />

      {/* BARCODE SCANNER STATION (Compact in Focus Mode, Detailed in Full Mode) */}
      {isWidgetVisible('scanner_station') && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
          {(!isMinimal || isWidgetVisible('quick_tips')) && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-[#0A006E] shrink-0" />
                <h3 className="font-montserrat font-bold text-xs text-[#0A006E]">
                  Barcode Scanner Station
                </h3>
                <span className="text-[11px] text-slate-500">
                  USB gun, camera, or Bluetooth paired scanner ready
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Barcode Quick-Scan Input */}
            <div className="relative flex-1">
              <ScanLine className="w-4 h-4 text-[#0A006E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={barcodeInputRef}
                id="barcode-scanner-quick-input"
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScanBarcode(barcodeInput);
                  }
                }}
                placeholder="Scan barcode or type EAN-13 & press Enter..."
                className="w-full pl-9 pr-20 py-2 bg-slate-50 border border-slate-200 focus:border-[#0A006E] focus:bg-white rounded-lg text-xs font-mono-tabular text-slate-900 focus:outline-none"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {barcodeInput && (
                  <button
                    type="button"
                    onClick={() => setBarcodeInput('')}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleScanBarcode(barcodeInput)}
                  disabled={!barcodeInput.trim()}
                  className="px-2.5 py-1 bg-[#FFDE00] hover:bg-amber-400 disabled:opacity-40 text-[#0A006E] font-montserrat font-bold text-[11px] rounded cursor-pointer"
                >
                  Scan
                </button>
              </div>
            </div>

            {/* Compact Hardware Controls */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setIsPhoneScannerOpen(true)}
                className="px-2.5 py-2 bg-[#0A006E] text-[#FFDE00] rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Camera</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPhonePairModalOpen(true)}
                className="px-2.5 py-2 bg-white border border-slate-200 text-[#0A006E] rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{isPhoneSyncActive ? 'Phone Paired' : 'Pair Phone'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = toggleAudioMuted();
                  setSoundMuted(next);
                }}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer border whitespace-nowrap ${
                  !soundMuted
                    ? 'bg-slate-50 border-slate-200 text-slate-700'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
                title={soundMuted ? 'Unmute POS Chime' : 'Mute POS Chime'}
              >
                {soundMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-600" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-600" />}
                <span className="hidden md:inline">{soundMuted ? 'Muted' : 'Beep'}</span>
              </button>
              <button
                type="button"
                onClick={() => barcodeInputRef.current?.focus()}
                className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Bluetooth className="w-3.5 h-3.5 text-[#0A006E]" />
                <span className="hidden md:inline">Focus</span>
              </button>
            </div>
          </div>

          {scanNotification && (
            <div
              className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-xs font-montserrat font-bold ${
                scanNotification.type === 'error'
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : 'bg-emerald-50 border-emerald-400 text-emerald-950'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {scanNotification.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <div className="truncate">
                  <span>{scanNotification.text}</span>
                  {scanNotification.price && (
                    <span className="ml-2 font-mono-tabular text-emerald-700">
                      · {formatKes(scanNotification.price)}
                      {scanNotification.qtyInCart && ` (Qty: ${scanNotification.qtyInCart})`}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScanNotification(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main 2-Column POS Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left 7 Columns: Product Catalog */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-xs">
            {/* Catalog Top Header & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-montserrat font-black text-sm text-[#0A006E] flex items-center gap-2">
                  <Wine className="w-4 h-4 text-[#0A006E]" />
                  <span>Bonded Liquor Catalog</span>
                  <span className="text-[11px] font-mono-tabular font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                    {filteredProducts.length} item{filteredProducts.length === 1 ? '' : 's'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Dispensing from: <strong className="text-slate-700">{activeBranch?.name || 'Central Bonded Store'}</strong> · Region: {activeRegion?.name || 'Nairobi Central'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {(searchQuery || stockCategoryFilter !== 'ALL' || selectedSubCategory !== 'ALL' || catalogStockFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStockCategoryFilter('ALL');
                      setSelectedSubCategory('ALL');
                      setCatalogStockFilter('ALL');
                      setVisibleLimit(36);
                    }}
                    className="text-[11px] text-[#0A006E] hover:underline flex items-center gap-1 font-montserrat font-bold cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset Filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsPhoneScannerOpen(true)}
                  className="px-2.5 py-1.5 bg-[#0A006E] hover:bg-[#060046] text-[#FFDE00] rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Scan Barcode</span>
                </button>
              </div>
            </div>

            {/* Search Input & Stock Filter Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-6 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleLimit(36);
                  }}
                  placeholder="Search by bottle name, SKU, brand, or barcode..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0A006E] focus:ring-1 focus:ring-[#0A006E] transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Stock Category Pills (ALL, IPS, LPS) */}
              <div className="sm:col-span-3 flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                {(['ALL', 'IPS', 'LPS'] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => {
                      setStockCategoryFilter(sc);
                      setVisibleLimit(36);
                    }}
                    className={`flex-1 py-1.5 text-[11px] font-montserrat font-bold rounded-lg transition cursor-pointer text-center ${
                      stockCategoryFilter === sc
                        ? 'bg-[#0A006E] text-[#FFDE00] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sc === 'ALL' ? 'All' : sc}
                  </button>
                ))}
              </div>

              {/* Availability Filter Toggle (All vs In Stock) */}
              <div className="sm:col-span-3 flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setCatalogStockFilter('ALL');
                    setVisibleLimit(36);
                  }}
                  className={`flex-1 py-1.5 text-[11px] font-montserrat font-bold rounded-lg transition cursor-pointer text-center ${
                    catalogStockFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Items
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogStockFilter('IN_STOCK');
                    setVisibleLimit(36);
                  }}
                  className={`flex-1 py-1.5 text-[11px] font-montserrat font-bold rounded-lg transition cursor-pointer text-center flex items-center justify-center gap-1 ${
                    catalogStockFilter === 'IN_STOCK'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${catalogStockFilter === 'IN_STOCK' ? 'bg-white' : 'bg-emerald-500'}`} />
                  In Stock
                </button>
              </div>
            </div>

            {/* Horizontal Subcategory Filter Ribbon */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setSelectedSubCategory('ALL');
                  setVisibleLimit(36);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-montserrat font-bold whitespace-nowrap transition cursor-pointer shrink-0 border ${
                  selectedSubCategory === 'ALL'
                    ? 'bg-[#0A006E] text-[#FFDE00] border-[#0A006E]'
                    : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-200'
                }`}
              >
                All Categories ({activatedProducts.length})
              </button>
              {NAIROBI_DRINKS_SUB_CATEGORIES.map((cat) => {
                const count = activatedProducts.filter(
                  (p) => (p.subCategory || p.category) === cat
                ).length;
                if (count === 0) return null;
                const isSelected = selectedSubCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedSubCategory(cat);
                      setVisibleLimit(36);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-montserrat font-bold whitespace-nowrap transition cursor-pointer shrink-0 border flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#0A006E] text-[#FFDE00] border-[#0A006E]'
                        : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`text-[10px] font-mono-tabular px-1.5 py-0.2 rounded ${
                      isSelected ? 'bg-white/20 text-[#FFDE00]' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Product Cards Grid */}
            {displayedProducts.length === 0 ? (
              <div className="p-12 text-center space-y-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center mx-auto">
                  <Wine className="w-6 h-6" />
                </div>
                <div className="max-w-sm mx-auto space-y-1">
                  <h4 className="font-montserrat font-bold text-sm text-slate-800">
                    No matching products found
                  </h4>
                  <p className="text-xs text-slate-500">
                    {searchQuery
                      ? `No inventory items matched "${searchQuery}". Try adjusting your keywords or category filters.`
                      : 'No items found matching the selected stock and category filters.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStockCategoryFilter('ALL');
                    setSelectedSubCategory('ALL');
                    setCatalogStockFilter('ALL');
                  }}
                  className="px-3.5 py-1.5 bg-[#0A006E] text-[#FFDE00] rounded-lg text-xs font-montserrat font-bold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Show All Products</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {displayedProducts.map((product) => {
                  const packSize = product.packSize || product.bottlesPerCase || 12;
                  const abv = product.alcoholPercentage ?? product.abv ?? 40;
                  const geoPrice = calculateGeoPrice(
                    product,
                    activeRegion,
                    mode === 'wholesale' ? 'wholesale' : 'retail'
                  );
                  const branchStock = activeBranch
                    ? getBranchBottleStock(product, activeBranch.id)
                    : product.totalBottles ?? 0;

                  // Check if item is already in cart
                  const inCartItem = cart.find(
                    (it) => it.kind === 'bonded_product' && it.product?.id === product.id
                  );
                  const inCartQty = inCartItem ? inCartItem.quantityUnits : 0;

                  return (
                    <div
                      key={product.id}
                      onClick={() => handleAddToCart(product)}
                      className={`bg-white border rounded-xl p-3 flex flex-col justify-between transition-all duration-150 cursor-pointer group hover:shadow-md relative ${
                        inCartQty > 0
                          ? 'border-[#0A006E] bg-blue-50/20 shadow-xs ring-1 ring-[#0A006E]/20'
                          : 'border-slate-200 hover:border-[#0A006E]'
                      }`}
                    >
                      {/* Top Badges & Image Row */}
                      <div>
                        <div className="flex items-start gap-2.5">
                          <div className="shrink-0">
                            <ProductImage
                              product={{
                                ...product,
                                category: product.category === 'LPS' ? 'LPS' : 'IPS',
                              }}
                              size="sm"
                              showVolumeBadge={true}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1 text-[10px] font-mono-tabular">
                              <span className="font-bold text-[#0A006E] truncate">{product.sku}</span>
                              <span className="font-bold text-[#1E9E60] shrink-0 text-[9px] uppercase px-1.5 py-0.2 bg-emerald-50 border border-emerald-200 rounded">
                                {product.category}
                              </span>
                            </div>

                            <h4 className="text-xs font-montserrat font-bold text-slate-900 group-hover:text-[#0A006E] transition-colors mt-0.5 leading-snug line-clamp-2" title={product.name}>
                              {product.name}
                            </h4>

                            <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                              {product.subCategory || 'Liquor'} · {abv}% ABV · {packSize}/cs
                            </div>

                            {/* In-Cart Pill Badge */}
                            {inCartQty > 0 && (
                              <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-300 rounded text-[10px] font-montserrat font-bold text-emerald-800">
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>{inCartQty} in cart</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Stock & Barcode Info Row */}
                        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-bold border inline-flex items-center gap-1 ${
                              branchStock > 10
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : branchStock > 0
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                            title={`Available stock at ${activeBranch?.name || 'this branch'}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                branchStock > 10
                                  ? 'bg-emerald-500'
                                  : branchStock > 0
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400'
                              }`}
                            />
                            {branchStock > 0 ? `${branchStock} in branch` : '0 in branch'}
                          </span>

                          {product.barcode && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded text-[9px] font-mono-tabular font-semibold truncate max-w-[110px]" title={product.barcode}>
                              {product.barcode}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom Price & Add Action Row */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="font-mono-tabular">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                            {mode === 'wholesale' ? 'Case Price' : 'Bottle Price'}
                          </div>
                          <div className="text-xs font-montserrat font-black text-[#0A006E]">
                            {mode === 'wholesale'
                              ? formatKes(geoPrice.casePrice)
                              : formatKes(geoPrice.unitBottlePrice)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToCart(product);
                          }}
                          className="px-3 py-1.5 bg-[#0A006E] hover:bg-[#060046] active:scale-95 text-[#FFDE00] rounded-lg text-xs font-montserrat font-black flex items-center gap-1 cursor-pointer transition shadow-xs shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Load More Pagination */}
            {filteredProducts.length > displayedProducts.length && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + 36)}
                  className="px-4 py-2 bg-[#0A006E] hover:bg-[#060046] text-[#FFDE00] rounded-xl text-xs font-montserrat font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                >
                  <span>Load More ({filteredProducts.length - displayedProducts.length} more)</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right 5 Columns: Active Order Register & Document Generator */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl flex flex-col sticky top-20 h-[calc(100vh-5.5rem)] max-h-[920px] overflow-hidden shadow-sm">
          {/* Fixed Register Header */}
          <div className="p-3.5 border-b border-slate-200 bg-slate-50/90 backdrop-blur-xs space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#0A006E] text-[#FFDE00] flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-montserrat font-black text-[#0A006E] truncate">
                    {mode === 'retail' ? 'Retail Counter Register' : 'B2B Wholesale Dispatch & ETIMS'}
                  </h3>
                  <p className="text-[10px] text-slate-500 truncate">
                    Cashier: <strong>{currentUser.name}</strong> · {activeBranch?.name}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-xs font-mono-tabular font-bold text-[#0A006E] bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                  {computedLineItems.length} {computedLineItems.length === 1 ? 'item' : 'items'}
                </span>
              </div>
            </div>

            {/* Document Type Selector Tabs */}
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-200">
              {(['Receipt', 'Invoice', 'Delivery Note', 'Quote'] as DocType[]).map((dt) => (
                <button
                  key={dt}
                  type="button"
                  onClick={() => setDocTypeToIssue(dt)}
                  className={`flex-1 py-1 px-1 rounded-lg text-[11px] font-montserrat font-bold transition cursor-pointer text-center truncate ${
                    docTypeToIssue === dt
                      ? 'bg-[#0A006E] text-[#FFDE00] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {dt}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Register Body: Customer Details, Payment, and Line Items */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
            {statusMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-[#34D186] text-xs text-[#0A006E] font-montserrat font-bold flex items-center gap-2.5 shadow-xs">
                <AnimatedSuccessTickIcon size="sm" />
                <span className="flex-1">{statusMessage}</span>
                <button
                  type="button"
                  onClick={() => setStatusMessage(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Customer Details Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
              {mode === 'wholesale' && retailers.length > 0 && (
                <div>
                  <label className="block text-[11px] font-montserrat font-bold text-slate-700">
                    Quick-Select Licensed Retailer
                  </label>
                  <select
                    onChange={(e) => {
                      const found = retailers.find((r) => r.id === e.target.value);
                      if (found) {
                        setCustomerName(found.companyName);
                        setCustomerLicense(found.liquorLicenseNo);
                        setCustomerKraPin(found.taxPin || '');
                        if (found.regionId) setSelectedRegionId(found.regionId);
                      }
                    }}
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#0A006E]"
                  >
                    <option value="">-- Choose Licensed Retailer or Type Custom --</option>
                    {retailers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.companyName} ({r.regionName} · PIN: {r.taxPin || 'N/A'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-montserrat font-bold text-slate-600 uppercase tracking-wider">
                    Customer / Buyer Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-In Customer or Company"
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#0A006E]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-montserrat font-bold text-slate-600 uppercase tracking-wider">
                    Buyer KRA PIN (VAT3)
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={customerKraPin}
                    onChange={(e) => setCustomerKraPin(e.target.value.toUpperCase())}
                    placeholder="e.g. P051882910Z"
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono-tabular uppercase font-bold text-slate-900 focus:outline-none focus:border-[#0A006E]"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-montserrat font-bold text-slate-600 uppercase tracking-wider">
                Payment Method
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { id: 'M-Pesa Till / Instant Card', label: 'Lipa M-Pesa', icon: Smartphone },
                  { id: 'Cash Till Settlement', label: 'Cash Till', icon: Coins },
                  { id: 'Corporate Bank EFT / M-Pesa Paybill', label: 'Card / Bank', icon: CreditCard },
                  { id: 'Distributor Credit Line', label: 'Credit Line', icon: Zap },
                ].map((pm) => {
                  const IconC = pm.icon;
                  const isSel = paymentMethod === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPaymentMethod(pm.id)}
                      className={`py-2 px-2 rounded-xl border text-[11px] font-montserrat font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                        isSel
                          ? 'bg-[#0A006E] text-white border-[#0A006E] shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <IconC className={`w-3.5 h-3.5 ${isSel ? 'text-[#FFDE00]' : 'text-slate-500'}`} />
                      <span className="truncate">{pm.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contextual Payment Drawer: M-Pesa STK */}
            {paymentMethod === 'M-Pesa Till / Instant Card' && (
              <div className="bg-emerald-50/90 border border-emerald-300 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-montserrat font-black text-emerald-950">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-700" />
                    Lipa Na M-Pesa · Buy Goods Till 4082211
                  </span>
                  <span className="font-mono-tabular text-emerald-900 bg-white px-2 py-0.5 rounded-md border border-emerald-200 font-bold">
                    KES {grandTotal.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="tel"
                    placeholder="Customer Handset (e.g. 0712 345 678)"
                    value={mpesaCustomerPhone}
                    onChange={(e) => setMpesaCustomerPhone(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-white border border-emerald-300 focus:border-[#0A006E] rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setStatusMessage(`📲 M-Pesa STK push prompt sent to ${mpesaCustomerPhone || 'customer phone'} for ${formatKes(grandTotal)}!`);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-[#FFDE00] rounded-lg text-[11px] font-montserrat font-black flex items-center gap-1 cursor-pointer transition shadow-xs shrink-0"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Send STK</span>
                  </button>
                </div>
              </div>
            )}

            {/* Contextual Payment Drawer: Cash Calculator */}
            {paymentMethod === 'Cash Till Settlement' && (
              <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-montserrat font-black text-amber-950">
                  <span className="flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-amber-700" />
                    Cash Tendered &amp; Change
                  </span>
                  <span className="font-mono-tabular text-slate-900">
                    Amount Due: <strong>{formatKes(grandTotal)}</strong>
                  </span>
                </div>

                {/* Quick Tender Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCashTendered(grandTotal)}
                    className="px-2 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded text-[10px] font-montserrat font-bold text-amber-950 cursor-pointer"
                  >
                    Exact ({formatKes(grandTotal)})
                  </button>
                  {[500, 1000, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCashTendered(amt)}
                      className="px-2 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded text-[10px] font-mono-tabular font-bold text-amber-950 cursor-pointer"
                    >
                      KES {amt.toLocaleString()}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-montserrat font-bold text-amber-900 uppercase">
                      Tendered (KES)
                    </label>
                    <input
                      type="number"
                      value={cashTendered || ''}
                      onChange={(e) => setCashTendered(Number(e.target.value))}
                      placeholder="Enter cash given"
                      className="w-full mt-0.5 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-[#0A006E]"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-montserrat font-bold text-amber-900 uppercase">
                      Change to Return
                    </label>
                    <div className="mt-0.5 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-mono font-black flex items-center justify-between">
                      <span className={cashTendered >= grandTotal ? 'text-emerald-700' : 'text-amber-700'}>
                        {cashTendered >= grandTotal
                          ? formatKes(cashTendered - grandTotal)
                          : cashTendered > 0
                          ? `Short ${formatKes(grandTotal - cashTendered)}`
                          : 'KES 0'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cart Items List */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px] font-montserrat font-bold text-slate-600 px-0.5">
                <span className="flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-[#0A006E]" />
                  <span>Order Line Items ({computedLineItems.length})</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-500">
                    {computedLineItems.reduce((s, it) => s + it.quantityUnits, 0)} units
                  </span>
                  {computedLineItems.length > 0 && canVoidOrder && (
                    <button
                      type="button"
                      onClick={() => {
                        setCart([]);
                        setActivatedProductIds([]);
                        clearActivePosCart(currentUser.id || currentUser.email).catch(() => {});
                      }}
                      className="text-rose-600 hover:underline text-[10px] font-montserrat font-bold cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {computedLineItems.length === 0 ? (
                <div className="p-8 text-center space-y-2 bg-slate-50/70 border border-dashed border-slate-200 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center mx-auto">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-montserrat font-bold text-slate-700">
                      Register is currently empty
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      Click any bottle in the catalog on the left or scan a barcode to add it to this checkout ticket.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {computedLineItems.map((item, idx) => (
                    <div
                      key={`${item.productId}-${item.unitMode}-${idx}`}
                      className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 hover:border-slate-300 transition-all shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[10px] font-mono-tabular text-slate-500">
                            <span className="font-bold text-[#0A006E]">{item.sku}</span>
                            <span>·</span>
                            <span className="text-slate-600">{formatKes(item.unitPrice)} / {item.unitMode}</span>
                          </div>
                          <h4 className="text-xs font-montserrat font-bold text-slate-900 truncate mt-0.5" title={item.name}>
                            {item.name}
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCartItem(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                          title="Remove line item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleUnitMode(idx)}
                            className="px-2 py-0.5 rounded text-[10px] font-montserrat font-bold bg-slate-100 hover:bg-[#FFDE00] text-[#0A006E] border border-slate-200 transition-colors cursor-pointer"
                            title="Switch Bottle / Case"
                          >
                            {item.unitMode} ({item.totalBottles} btls)
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(idx, -1)}
                              className="w-7 h-7 flex items-center justify-center hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center font-mono-tabular text-xs font-bold text-slate-900">
                              {item.quantityUnits}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(idx, 1)}
                              className="w-7 h-7 flex items-center justify-center hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="font-mono-tabular font-black text-xs text-[#0A006E] text-right min-w-[70px]">
                            {formatKes(item.lineTotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* FLOATING CART TOTAL & SETTLEMENT BAR - PERMANENTLY FLOATS AT THE BOTTOM */}
          <div className="p-4 bg-slate-950 text-white border-t-2 border-[#0A006E] space-y-2.5 shrink-0 shadow-[0_-8px_25px_rgba(0,0,0,0.22)] z-20">
            <div className="flex items-center justify-between text-xs font-mono-tabular">
              <div className="flex items-center gap-1.5 text-slate-300">
                <ShoppingCart className="w-3.5 h-3.5 text-[#FFDE00]" />
                <span>
                  Items: <strong>{computedLineItems.length}</strong> ({computedLineItems.reduce((s, it) => s + it.quantityUnits, 0)} units)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {isPhoneSyncActive ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-montserrat font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Phone Linked
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsPhonePairModalOpen(true)}
                    className="text-[10px] text-[#FFDE00] hover:underline font-montserrat font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Smartphone className="w-3 h-3" />
                    <span>Link Phone</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-between text-[11px] text-slate-400 font-mono-tabular">
              <span>Subtotal: {formatKes(subtotal)}</span>
              <span>Regional Tax ({(taxRate * 100).toFixed(0)}% VAT): {formatKes(exciseAndTax)}</span>
            </div>

            <div className="flex justify-between items-baseline text-lg sm:text-xl font-montserrat font-black text-[#FFDE00] pt-1.5 border-t border-slate-800 font-mono-tabular">
              <span className="text-sm font-bold text-slate-300">Total Payable:</span>
              <span className="text-xl sm:text-2xl text-emerald-400">{formatKes(grandTotal)}</span>
            </div>

            {/* Floating Action Buttons */}
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  if (!canVoidOrder) return;
                  setCart([]);
                  setActivatedProductIds([]);
                  clearActivePosCart(currentUser.id || currentUser.email).catch(() => {});
                }}
                disabled={cart.length === 0 || !canVoidOrder}
                className={`min-h-[42px] px-3.5 py-2 border rounded-xl text-xs font-montserrat font-bold flex items-center gap-1.5 transition-colors ${
                  !canVoidOrder
                    ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-60'
                    : 'bg-white hover:bg-red-50 text-red-600 border-slate-200 cursor-pointer disabled:opacity-40'
                }`}
                title={
                  !canVoidOrder
                    ? 'Order void authorization stripped by Administrator'
                    : 'Clear active cart'
                }
              >
                <Trash2 className="w-4 h-4" />
                <span>{canVoidOrder ? 'Clear' : 'Locked'}</span>
              </button>

              <button
                type="button"
                disabled={cart.length === 0 || isProcessing}
                onClick={handleCompleteCheckout}
                className="flex-1 min-h-[42px] py-2 px-4 bg-[#FFDE00] hover:bg-amber-400 border-2 border-[#0A006E] disabled:opacity-40 text-[#0A006E] font-montserrat font-black text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-[0.99]"
              >
                {paymentMethod === 'M-Pesa Till / Instant Card' ? (
                  <>
                    <Smartphone className="w-4 h-4" />
                    <span>
                      {isProcessing
                        ? 'Processing M-Pesa Settlement...'
                        : `Lipa M-Pesa & Complete (${formatKes(grandTotal)})`}
                    </span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    <span>
                      {isProcessing
                        ? 'Issuing Document...'
                        : `Commit & Print ${docTypeToIssue} (${formatKes(grandTotal)})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live Phone Camera Barcode Scanner Viewfinder Modal */}
      <PhoneBarcodeScannerModal
        isOpen={isPhoneScannerOpen}
        onClose={() => setIsPhoneScannerOpen(false)}
        onBarcodeScanned={handleScanBarcode}
      />

      {/* Instant Phone Barcode Scanner QR Pairing Modal */}
      {isPhonePairModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border-2 border-[#0A006E] animate-in fade-in zoom-in-95">
            <div className="bg-[#0A006E] text-white p-4.5 flex items-center justify-between border-b-2 border-[#FFDE00]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FFDE00] text-[#0A006E] flex items-center justify-center font-black">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-montserrat font-black text-sm text-[#FFDE00]">
                    Instant Phone Barcode Scanner Link
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Beam bottle barcodes from your phone directly into this cashier register
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPhonePairModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 text-center space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
                <span className="text-slate-600">Active Cashier Account:</span>
                <span className="font-montserrat font-black text-[#0A006E]">
                  {currentUser.name} ({currentUser.role})
                </span>
              </div>

              {/* QR Code Container */}
              <div className="p-4 bg-white border-2 border-dashed border-[#0A006E]/30 rounded-2xl inline-block shadow-inner">
                {pairingQrDataUrl ? (
                  <img
                    src={pairingQrDataUrl}
                    alt="Pairing QR Code"
                    className="w-56 h-56 mx-auto rounded-lg"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-xs text-slate-400">
                    Generating QR code...
                  </div>
                )}
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                <p className="font-montserrat font-bold text-slate-800">
                  📱 How to Scan Bottles with Your Phone:
                </p>
                <ol className="text-left text-[11px] space-y-1 list-decimal list-inside bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-700">
                  <li>Open the Camera app on your mobile phone.</li>
                  <li>Scan the QR code above to launch the Mobile Scanner Station.</li>
                  <li>Aim at any bottle barcode — it will <strong>instant show on this desktop cashier</strong> and the total increases automatically!</li>
                </ol>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsPhoneCompanionModalOpen(true)}
                  className="flex-1 py-2.5 px-3 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-xs font-montserrat font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition"
                >
                  <Camera className="w-4 h-4" />
                  <span>Launch Scanner on this Screen</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(pairingUrl);
                    setStatusMessage('Phone pairing link copied to clipboard!');
                  }}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-montserrat font-bold cursor-pointer"
                  title="Copy direct pairing link"
                >
                  Copy Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Phone Scanner Companion Modal */}
      {isPhoneCompanionModalOpen && (
        <PhoneScannerCompanion
          products={products}
          staffId={currentUser.id}
          staffName={currentUser.name}
          staffEmail={currentUser.email || ''}
          staffRole={currentUser.role}
          branchId={activeBranch?.id}
          branches={branches}
          regions={regions}
          onClose={() => setIsPhoneCompanionModalOpen(false)}
        />
      )}
    </div>
  );
};
