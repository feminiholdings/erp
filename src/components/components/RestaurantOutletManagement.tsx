import React, { useState, useMemo, useEffect } from 'react';
import {
  UtensilsCrossed,
  Store,
  Wine,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Users,
  DollarSign,
  ChefHat,
  Flame,
  Search,
  Layers,
  ArrowRight,
  ShieldCheck,
  Package,
  Clock,
  Sparkles,
  Download,
  Info,
  Check,
  X,
  ExternalLink,
  Sliders,
  Cigarette,
  Warehouse,
  ShoppingBag,
  ChevronRight,
} from 'lucide-react';
import {
  BusinessUnit,
  BusinessUnitType,
  RestaurantInventoryItem,
  RestaurantItemType,
  Branch,
  StaffMember,
  Product,
} from '../types';
import { formatKes, exportToCSV } from '../erpUtils';
import { ConfirmationModal } from './common/ConfirmationModal';
import { StatusFeedbackToast } from './AnimatedFeedback';
import {
  PRESET_SIGGER_ITEMS,
  PRESET_SHISHA_ITEMS,
  PRESET_AMENITY_ITEMS,
  DEFAULT_RESTAURANT_FOOD_CATEGORIES,
  DEFAULT_RESTAURANT_BEVERAGE_CATEGORIES,
} from '../data/clubTopupsData';

interface RestaurantOutletManagementProps {
  currentUser: StaffMember;
  branches: Branch[];
  staffList: StaffMember[];
  products: Product[];
  businessUnits: BusinessUnit[];
  restaurantInventory: RestaurantInventoryItem[];
  onCreateBusinessUnit: (unit: Omit<BusinessUnit, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateBusinessUnit: (unitId: string, updates: Partial<BusinessUnit>) => Promise<void>;
  onDeleteBusinessUnit?: (unitId: string) => Promise<void>;
  onCreateRestaurantItem: (item: Omit<RestaurantInventoryItem, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateRestaurantItem: (itemId: string, updates: Partial<RestaurantInventoryItem>) => Promise<void>;
  onDeleteRestaurantItem?: (itemId: string) => Promise<void>;
  onNavigateToPos?: (businessUnitId: string) => void;
  onUpdateStaff?: (staffId: string, updates: Partial<StaffMember>) => Promise<void>;
}

export const RestaurantOutletManagement: React.FC<RestaurantOutletManagementProps> = ({
  currentUser,
  branches,
  staffList,
  products,
  businessUnits,
  restaurantInventory,
  onCreateBusinessUnit,
  onUpdateBusinessUnit,
  onDeleteBusinessUnit,
  onCreateRestaurantItem,
  onUpdateRestaurantItem,
  onDeleteRestaurantItem,
  onNavigateToPos,
  onUpdateStaff,
}) => {
  const [activeTab, setActiveTab] = useState<'outlets' | 'food_menu' | 'inventory' | 'topups'>('outlets');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('ALL');

  // Select active business unit for menu & inventory tabs
  const [selectedUnitId, setSelectedUnitId] = useState<string>(() => {
    if (currentUser.businessUnitId) return currentUser.businessUnitId;
    return businessUnits[0]?.id || '';
  });

  // Automatically keep selectedUnitId valid when businessUnits are added or removed
  useEffect(() => {
    if (businessUnits.length > 0) {
      if (!businessUnits.some((u) => u.id === selectedUnitId)) {
        setSelectedUnitId(businessUnits[0].id);
      }
    } else {
      setSelectedUnitId('');
    }
  }, [businessUnits, selectedUnitId]);

  const isPrivilegedManager =
    currentUser.role === 'Admin' ||
    currentUser.role === 'Branch Manager' ||
    currentUser.role === 'Sales Manager' ||
    currentUser.role === 'Inventory Controller';

  // Ensure active unit is valid & restricted if staff is assigned to a specific restaurant
  const activeBusinessUnit = useMemo(() => {
    const targetId =
      !isPrivilegedManager && currentUser.businessUnitId
        ? currentUser.businessUnitId
        : selectedUnitId;
    const found = businessUnits.find((u) => u.id === targetId);
    return found || businessUnits[0] || null;
  }, [businessUnits, selectedUnitId, isPrivilegedManager, currentUser.businessUnitId]);

  // Modal: Create or Edit Business Unit / Sub-Business
  const [isCreateOutletModalOpen, setIsCreateOutletModalOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<BusinessUnit | null>(null);
  const [newOutletBranchId, setNewOutletBranchId] = useState(branches[0]?.id || '');
  const [newOutletName, setNewOutletName] = useState('');
  const [newOutletType, setNewOutletType] = useState<BusinessUnitType>('restaurant_club');
  const [newOutletDesc, setNewOutletDesc] = useState('');
  const [newOutletManager, setNewOutletManager] = useState('');
  const [newOutletTableCount, setNewOutletTableCount] = useState<number>(24);
  const [newOutletAllowTopup, setNewOutletAllowTopup] = useState(true);
  const [newOutletStatus, setNewOutletStatus] = useState<'Active' | 'Inactive'>('Active');

  // Instant delete confirmation state
  const [confirmDeleteUnit, setConfirmDeleteUnit] = useState<BusinessUnit | null>(null);
  const [isDeletingOutletId, setIsDeletingOutletId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error'; title: string; message: string; } | null>(null);

  // Open modal to create a new outlet (optionally with preset type: store, shop, warehouse, etc.)
  const handleOpenCreateOutletModal = (presetType?: BusinessUnitType | React.MouseEvent) => {
    setEditingOutlet(null);
    setNewOutletBranchId(branches[0]?.id || '');
    setNewOutletName('');
    const t: BusinessUnitType =
      typeof presetType === 'string'
        ? presetType
        : 'store';
    setNewOutletType(t);
    setNewOutletDesc(
      t === 'store'
        ? 'Retail bottle store and customer walk-in sales counter.'
        : t === 'shop'
        ? 'High-turnover liquor merchant shop with trade counter tills.'
        : t === 'warehouse'
        ? 'Regional storage yard and bonded dispatch warehouse.'
        : t === 'restaurant_club'
        ? 'Luxury club lounge, premium grilled steaks, artisan cocktails, and bottle service.'
        : ''
    );
    setNewOutletManager('');
    setNewOutletTableCount(t === 'restaurant_club' ? 24 : 0);
    setNewOutletAllowTopup(true);
    setNewOutletStatus('Active');
    setIsCreateOutletModalOpen(true);
  };

  // Open modal to edit an existing sub-business
  const handleOpenEditOutletModal = (unit: BusinessUnit) => {
    setEditingOutlet(unit);
    setNewOutletBranchId(unit.branchId || branches[0]?.id || '');
    setNewOutletName(unit.name || '');
    setNewOutletType(unit.unitType || 'restaurant_club');
    setNewOutletDesc(unit.description || '');
    setNewOutletManager(unit.managerName || '');
    setNewOutletTableCount(unit.tableCount ?? 20);
    setNewOutletAllowTopup(unit.allowLiquorTopup ?? true);
    setNewOutletStatus(unit.status || 'Active');
    setIsCreateOutletModalOpen(true);
  };

  // Instant delete handler
  const handleInstantDeleteOutlet = async (unit: BusinessUnit) => {
    if (!onDeleteBusinessUnit) return;
    setIsDeletingOutletId(unit.id);
    try {
      await onDeleteBusinessUnit(unit.id);
      if (selectedUnitId === unit.id) {
        const remaining = businessUnits.filter((u) => u.id !== unit.id);
        if (remaining.length > 0) {
          setSelectedUnitId(remaining[0].id);
        }
      }
      setConfirmDeleteUnit(null);
    } finally {
      setIsDeletingOutletId(null);
    }
  };

  // Modal: Add or Edit Food Item
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RestaurantInventoryItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemType, setItemType] = useState<RestaurantItemType>('food');
  const [itemPortionUnit, setItemPortionUnit] = useState('Plate');
  const [itemCostPrice, setItemCostPrice] = useState<number>(500);
  const [itemSellingPrice, setItemSellingPrice] = useState<number>(1200);
  const [itemPortions, setItemPortions] = useState<number>(30);
  const [itemMinAlert, setItemMinAlert] = useState<number>(10);
  const [itemPrepMinutes, setItemPrepMinutes] = useState<number>(15);
  const [itemDesc, setItemDesc] = useState('');
  const [itemAllergens, setItemAllergens] = useState('');

  // Category management input
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [categoryTypeToAdd, setCategoryTypeToAdd] = useState<'food' | 'beverage'>('food');

  // Inventory search & filter
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('ALL');

  // Quick Inline Price Editing
  const [quickPriceItemId, setQuickPriceItemId] = useState<string | null>(null);
  const [quickPriceValue, setQuickPriceValue] = useState<number>(0);

  // Filter by Sub-Business Category (Store, Shop, Warehouse, Hospitality)
  const [outletTypeFilter, setOutletTypeFilter] = useState<'ALL' | 'store' | 'shop' | 'warehouse' | 'hospitality'>('ALL');

  // Filtered Business Units
  const filteredUnits = useMemo(() => {
    return businessUnits.filter((u) => {
      if (selectedBranchFilter !== 'ALL' && u.branchId !== selectedBranchFilter) return false;
      if (outletTypeFilter === 'store') return u.unitType === 'store' || u.unitType === 'retail_store';
      if (outletTypeFilter === 'shop') return u.unitType === 'shop' || u.unitType === 'merchant_shop';
      if (outletTypeFilter === 'warehouse') return u.unitType === 'warehouse';
      if (outletTypeFilter === 'hospitality') {
        return (u.unitType === 'restaurant_club' || u.unitType === 'bar_lounge') &&
               !u.name?.toLowerCase().includes('retail shop');
      }
      return true;
    });
  }, [businessUnits, selectedBranchFilter, outletTypeFilter]);

  // Inventory scoped to active business unit
  const activeUnitInventory = useMemo(() => {
    if (!activeBusinessUnit) return [];
    return restaurantInventory.filter((item) => item.businessUnitId === activeBusinessUnit.id);
  }, [restaurantInventory, activeBusinessUnit]);

  // Filtered Inventory for display
  const displayedInventory = useMemo(() => {
    return activeUnitInventory.filter((item) => {
      if (inventoryCategoryFilter !== 'ALL' && item.category !== inventoryCategoryFilter) return false;
      if (inventorySearch.trim()) {
        const q = inventorySearch.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesCat = item.category.toLowerCase().includes(q);
        const matchesDesc = (item.description || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCat && !matchesDesc) return false;
      }
      return true;
    });
  }, [activeUnitInventory, inventoryCategoryFilter, inventorySearch]);

  // Kitchen Metrics
  const kitchenMetrics = useMemo(() => {
    const totalItems = activeUnitInventory.length;
    let totalStockValue = 0;
    let totalSellingValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    activeUnitInventory.forEach((item) => {
      totalStockValue += (item.portionsAvailable || 0) * (item.costPriceKes || 0);
      totalSellingValue += (item.portionsAvailable || 0) * (item.sellingPriceKes || 0);
      if (item.portionsAvailable <= 0) {
        outOfStockCount++;
      } else if (item.portionsAvailable <= (item.minStockAlert || 5)) {
        lowStockCount++;
      }
    });

    return {
      totalItems,
      totalStockValue,
      totalSellingValue,
      lowStockCount,
      outOfStockCount,
    };
  }, [activeUnitInventory]);

  // Handle Create or Edit Business Unit
  const handleOutletFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOutletName.trim() || !newOutletBranchId) return;

    const branch = branches.find((b) => b.id === newOutletBranchId) || branches[0];

    if (editingOutlet) {
      await onUpdateBusinessUnit(editingOutlet.id, {
        name: newOutletName.trim(),
        branchId: branch?.id || editingOutlet.branchId,
        branchName: branch?.name || editingOutlet.branchName,
        unitType: newOutletType,
        description: newOutletDesc.trim(),
        managerName: newOutletManager.trim(),
        status: newOutletStatus,
        allowLiquorTopup: newOutletAllowTopup,
        tableCount: newOutletType === 'restaurant_club' ? newOutletTableCount : 0,
      });
    } else {
      const prefix =
        newOutletType === 'store' || newOutletType === 'retail_store'
          ? 'STR'
          : newOutletType === 'shop' || newOutletType === 'merchant_shop'
          ? 'SHP'
          : newOutletType === 'warehouse'
          ? 'WHS'
          : newOutletType === 'bar_lounge'
          ? 'BAR'
          : 'RST';
      const cleanNameTag = newOutletName.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
      const code = `${prefix}-${cleanNameTag}-${Date.now().toString().slice(-4)}`;

      const defaultDesc =
        newOutletDesc.trim() ||
        (newOutletType === 'warehouse'
          ? 'Bonded storage warehouse and bulk distribution depot'
          : newOutletType === 'store' || newOutletType === 'retail_store'
          ? 'Commercial supermarket and wholesale distribution store'
          : newOutletType === 'shop' || newOutletType === 'merchant_shop'
          ? 'Retail bottle shop and counter merchandise store'
          : newOutletType === 'bar_lounge'
          ? 'Lounge bar, VIP counter and cocktail service'
          : 'Club dining, restaurant kitchen, and lounge service');

      const defaultFood =
        newOutletType === 'restaurant_club'
          ? [...DEFAULT_RESTAURANT_FOOD_CATEGORIES]
          : newOutletType === 'store' || newOutletType === 'retail_store'
          ? ['Packaged Groceries', 'Wholesale Bundles', 'Bar Snacks & Mixers']
          : newOutletType === 'shop' || newOutletType === 'merchant_shop'
          ? ['Snack Bites', 'Bar Nuts & Biltong', 'Confectionery']
          : newOutletType === 'warehouse'
          ? ['Bulk Provisions', 'General Supplies', 'Packaging Materials']
          : ['Tapas & Bar Bites', 'Platters & Grills'];

      const defaultBev =
        newOutletType === 'restaurant_club'
          ? [...DEFAULT_RESTAURANT_BEVERAGE_CATEGORIES]
          : newOutletType === 'warehouse'
          ? ['Bonded Spirits Pallets', 'Imported Wines Pallets', 'Beer Kegs & Crates', 'Duty-Free Stocks']
          : newOutletType === 'store' || newOutletType === 'retail_store'
          ? ['Commercial Spirits Aisle', 'Fine Wines Vault', 'Chilled Beers & Ciders', 'Energy & Mixers']
          : ['Single Malts & Blends', 'Champagne & Sparkling', 'Craft Beers', 'Mixers & Syrups'];

      await onCreateBusinessUnit({
        code,
        name: newOutletName.trim(),
        branchId: branch?.id || 'br-main',
        branchName: branch?.name || 'Main Branch',
        unitType: newOutletType,
        description: defaultDesc,
        managerName: newOutletManager.trim() || currentUser.name,
        status: newOutletStatus,
        foodCategories: defaultFood,
        beverageCategories: defaultBev,
        allowLiquorTopup: newOutletAllowTopup,
        tableCount: newOutletType === 'restaurant_club' ? newOutletTableCount : 0,
        currency: 'KES',
      });
    }

    setNewOutletName('');
    setNewOutletDesc('');
    setIsCreateOutletModalOpen(false);
    setEditingOutlet(null);
    setFeedbackToast({
      type: 'success',
      title: editingOutlet ? 'Outlet Updated' : 'Outlet Created',
      message: `Successfully ${editingOutlet ? 'updated' : 'created'} the sub-business: ${newOutletName.trim()}.`,
    });
  };

  // Handle Add Category to current unit
  const handleAddCategory = async () => {
    if (!newCategoryInput.trim() || !activeBusinessUnit) return;
    const cat = newCategoryInput.trim();

    if (categoryTypeToAdd === 'food') {
      const existing = activeBusinessUnit.foodCategories || [];
      if (!existing.includes(cat)) {
        const updated = [...existing, cat];
        await onUpdateBusinessUnit(activeBusinessUnit.id, { foodCategories: updated });
      }
    } else {
      const existing = activeBusinessUnit.beverageCategories || [];
      if (!existing.includes(cat)) {
        const updated = [...existing, cat];
        await onUpdateBusinessUnit(activeBusinessUnit.id, { beverageCategories: updated });
      }
    }

    setNewCategoryInput('');
  };

  // Handle Delete Category
  const handleDeleteCategory = async (catToDelete: string, isFood: boolean) => {
    if (!activeBusinessUnit) return;
    if (isFood) {
      const updated = (activeBusinessUnit.foodCategories || []).filter((c) => c !== catToDelete);
      await onUpdateBusinessUnit(activeBusinessUnit.id, { foodCategories: updated });
    } else {
      const updated = (activeBusinessUnit.beverageCategories || []).filter((c) => c !== catToDelete);
      await onUpdateBusinessUnit(activeBusinessUnit.id, { beverageCategories: updated });
    }
  };

  // Populate Standard Food Categories
  const handleLoadDefaultFoodCategories = async () => {
    if (!activeBusinessUnit) return;
    const existing = activeBusinessUnit.foodCategories || [];
    const merged = Array.from(new Set([...existing, ...DEFAULT_RESTAURANT_FOOD_CATEGORIES]));
    await onUpdateBusinessUnit(activeBusinessUnit.id, { foodCategories: merged });
    setFeedbackToast({
      type: 'success',
      title: 'Categories Loaded',
      message: `Loaded ${DEFAULT_RESTAURANT_FOOD_CATEGORIES.length} standard food categories for ${activeBusinessUnit.name}.`,
    });
  };

  // Populate Standard Beverage Categories
  const handleLoadDefaultBeverageCategories = async () => {
    if (!activeBusinessUnit) return;
    const existing = activeBusinessUnit.beverageCategories || [];
    const merged = Array.from(new Set([...existing, ...DEFAULT_RESTAURANT_BEVERAGE_CATEGORIES]));
    await onUpdateBusinessUnit(activeBusinessUnit.id, { beverageCategories: merged });
    setFeedbackToast({
      type: 'success',
      title: 'Categories Loaded',
      message: `Loaded ${DEFAULT_RESTAURANT_BEVERAGE_CATEGORIES.length} standard beverage categories for ${activeBusinessUnit.name}.`,
    });
  };

  // Open item modal for add
  const handleOpenAddItemModal = () => {
    if (!activeBusinessUnit) {
      handleOpenCreateOutletModal('restaurant_club');
      return;
    }
    setEditingItem(null);
    setItemName('');
    const defaultCat =
      activeBusinessUnit?.foodCategories?.[0] ||
      activeBusinessUnit?.beverageCategories?.[0] ||
      DEFAULT_RESTAURANT_FOOD_CATEGORIES[0] ||
      'Main Courses';
    setItemCategory(defaultCat);
    setItemType('food');
    setItemPortionUnit('Plate');
    setItemCostPrice(450);
    setItemSellingPrice(1200);
    setItemPortions(30);
    setItemMinAlert(8);
    setItemPrepMinutes(15);
    setItemDesc('');
    setItemAllergens('');
    setIsItemModalOpen(true);
  };

  // Open item modal for edit
  const handleOpenEditItemModal = (item: RestaurantInventoryItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemCategory(item.category);
    setItemType(item.itemType);
    setItemPortionUnit(item.portionUnit);
    setItemCostPrice(item.costPriceKes);
    setItemSellingPrice(item.sellingPriceKes);
    setItemPortions(item.portionsAvailable);
    setItemMinAlert(item.minStockAlert || 5);
    setItemPrepMinutes(item.prepTimeMinutes || 15);
    setItemDesc(item.description || '');
    setItemAllergens(item.allergens || '');
    setIsItemModalOpen(true);
  };

  // Handle Item Submit
  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !activeBusinessUnit) return;

    if (editingItem) {
      await onUpdateRestaurantItem(editingItem.id, {
        name: itemName.trim(),
        category: itemCategory,
        itemType,
        portionUnit: itemPortionUnit.trim() || 'Plate',
        costPriceKes: Number(itemCostPrice),
        sellingPriceKes: Number(itemSellingPrice),
        portionsAvailable: Number(itemPortions),
        minStockAlert: Number(itemMinAlert),
        prepTimeMinutes: Number(itemPrepMinutes),
        description: itemDesc.trim(),
        allergens: itemAllergens.trim(),
        isAvailable: Number(itemPortions) > 0,
      });
    } else {
      await onCreateRestaurantItem({
        businessUnitId: activeBusinessUnit.id,
        businessUnitName: activeBusinessUnit.name,
        branchId: activeBusinessUnit.branchId,
        name: itemName.trim(),
        category: itemCategory || 'Chef Specials',
        itemType,
        portionUnit: itemPortionUnit.trim() || 'Plate',
        costPriceKes: Number(itemCostPrice),
        sellingPriceKes: Number(itemSellingPrice),
        portionsAvailable: Number(itemPortions),
        minStockAlert: Number(itemMinAlert),
        prepTimeMinutes: Number(itemPrepMinutes),
        isAvailable: Number(itemPortions) > 0,
        description: itemDesc.trim(),
        allergens: itemAllergens.trim(),
      });
    }

    setIsItemModalOpen(false);
    setFeedbackToast({
      type: 'success',
      title: editingItem ? 'Item Updated' : 'Item Created',
      message: `Successfully ${editingItem ? 'updated' : 'created'} the inventory item: ${itemName.trim()}.`,
    });
  };

  // Handle Quick Price Update
  const handleSaveQuickPrice = async (item: RestaurantInventoryItem) => {
    if (quickPriceValue > 0) {
      await onUpdateRestaurantItem(item.id, { sellingPriceKes: Number(quickPriceValue) });
    }
    setQuickPriceItemId(null);
  };

  // Restock portions quick action
  const handleQuickRestock = async (item: RestaurantInventoryItem, amountToAdd: number) => {
    const updatedPortions = Math.max(0, (item.portionsAvailable || 0) + amountToAdd);
    await onUpdateRestaurantItem(item.id, {
      portionsAvailable: updatedPortions,
      isAvailable: updatedPortions > 0,
    });
  };

  // Export Kitchen Inventory CSV
  const handleExportKitchenInventoryCSV = () => {
    if (!activeBusinessUnit) return;
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportToCSV(
      `${activeBusinessUnit.name.replace(/\s+/g, '_')}_Kitchen_Inventory_${dateStamp}`,
      [
        'Item Name',
        'Category',
        'Type',
        'Portion Unit',
        'Cost Price (KES)',
        'Menu Price (KES)',
        'Gross Margin %',
        'Portions in Stock',
        'Min Alert Level',
        'Stock Valuation (KES)',
        'Status',
        'Description',
      ],
      activeUnitInventory.map((i) => {
        const margin = i.sellingPriceKes > 0 ? Math.round(((i.sellingPriceKes - i.costPriceKes) / i.sellingPriceKes) * 100) : 0;
        return [
          i.name,
          i.category,
          i.itemType,
          i.portionUnit,
          i.costPriceKes,
          i.sellingPriceKes,
          `${margin}%`,
          i.portionsAvailable,
          i.minStockAlert,
          i.portionsAvailable * i.costPriceKes,
          i.portionsAvailable <= 0 ? 'Sold Out' : i.portionsAvailable <= i.minStockAlert ? 'Low Stock' : 'In Stock',
          i.description || '',
        ];
      })
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Compact Header & Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3.5 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-montserrat font-semibold text-slate-500">
              Commercial Outlets <span aria-hidden="true">·</span> <span className="text-[#0A006E]">Sub-Businesses</span>
            </div>
            <h2 className="text-lg sm:text-xl font-montserrat font-bold text-slate-900 mt-0.5 tracking-tight">
              Outlets, Menus &amp; Merchant Shops
            </h2>
          </div>
          {activeBusinessUnit && (
            <div className="text-xs font-montserrat font-semibold text-slate-600 truncate">
              Selected: <span className="text-[#0A006E] font-bold">{activeBusinessUnit.name}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 border-t border-slate-100 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-slate-50/50">
          <div className="px-4 py-2.5">
            <div className="text-[11px] text-slate-500 font-medium">Total Outlets</div>
            <div className="text-lg font-montserrat font-black text-[#0A006E] font-mono-tabular">
              {businessUnits.length}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[11px] text-slate-500 font-medium">Stores</div>
            <div className="text-lg font-montserrat font-black text-slate-900 font-mono-tabular">
              {businessUnits.filter((u) => u.unitType === 'store' || u.unitType === 'retail_store').length}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[11px] text-slate-500 font-medium">Retail Shops</div>
            <div className="text-lg font-montserrat font-black text-slate-900 font-mono-tabular">
              {businessUnits.filter((u) => u.unitType === 'shop' || u.unitType === 'merchant_shop').length}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[11px] text-slate-500 font-medium">Warehouses</div>
            <div className="text-lg font-montserrat font-black text-slate-900 font-mono-tabular">
              {businessUnits.filter((u) => u.unitType === 'warehouse').length}
            </div>
          </div>
          <div className="px-4 py-2.5 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-slate-500 font-medium">Hospitality &amp; Clubs</div>
            <div className="text-lg font-montserrat font-black text-slate-900 font-mono-tabular">
              {businessUnits.filter((u) => u.unitType === 'restaurant_club' || u.unitType === 'bar_lounge').length}
            </div>
          </div>
        </div>
      </div>

      {/* Prominent Inventory-Style Gradient Quick Access Action Buttons */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          activeBusinessUnit && onNavigateToPos
            ? 'xl:grid-cols-4'
            : activeBusinessUnit || onNavigateToPos
            ? 'xl:grid-cols-3'
            : 'sm:grid-cols-2'
        } gap-3.5`}
      >
        <button
          type="button"
          onClick={() => handleOpenCreateOutletModal('restaurant_club')}
          className="group min-h-[72px] sm:min-h-[78px] w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-[#0A006E] via-[#15099C] to-[#2518CC] hover:from-[#070052] hover:to-[#2E20E0] text-white border border-[#FFDE00]/35 shadow-lg shadow-[#0A006E]/20 flex items-center justify-between gap-4 cursor-pointer transition-all hover:-translate-y-0.5 active:scale-[0.99] text-left"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FFDE00] to-amber-400 text-[#0A006E] flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Plus className="w-6 h-6 stroke-[2.6]" />
            </div>
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-montserrat font-black tracking-tight text-white leading-tight truncate">
                New Restaurant / Club
              </div>
              <div className="text-xs font-montserrat font-medium text-indigo-100/90 mt-0.5 truncate">
                Kitchen, bar &amp; lounge
              </div>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 group-hover:translate-x-0.5 transition-transform">
            <ChevronRight className="w-5 h-5 text-[#FFDE00] stroke-[2.5]" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleOpenCreateOutletModal('store')}
          className="group min-h-[72px] sm:min-h-[78px] w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-[#0C5E37] via-[#157E4C] to-[#21A165] hover:from-[#094A2B] hover:to-[#27B874] text-white border border-emerald-300/35 shadow-lg shadow-emerald-900/20 flex items-center justify-between gap-4 cursor-pointer transition-all hover:-translate-y-0.5 active:scale-[0.99] text-left"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-white/25 to-white/10 text-white border border-white/25 flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Store className="w-6 h-6 stroke-[2.3]" />
            </div>
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-montserrat font-black tracking-tight text-white leading-tight truncate">
                New Store / Shop
              </div>
              <div className="text-xs font-montserrat font-medium text-emerald-50/90 mt-0.5 truncate">
                Retail counter or depot
              </div>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 group-hover:translate-x-0.5 transition-transform">
            <ChevronRight className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
        </button>

        {activeBusinessUnit && (
          <button
            type="button"
            onClick={handleOpenAddItemModal}
            className="group min-h-[72px] sm:min-h-[78px] w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-[#FFDE00] via-amber-300 to-amber-400 hover:from-amber-300 hover:to-amber-500 text-[#0A006E] border border-amber-400 shadow-lg shadow-amber-500/20 flex items-center justify-between gap-4 cursor-pointer transition-all hover:-translate-y-0.5 active:scale-[0.99] text-left"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0A006E] to-[#1D10B3] text-[#FFDE00] flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                <ChefHat className="w-6 h-6 stroke-[2.3]" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-lg font-montserrat font-black tracking-tight text-[#0A006E] leading-tight truncate">
                  Add Dish
                </div>
                <div className="text-xs font-montserrat font-semibold text-[#0A006E]/80 mt-0.5 truncate">
                  Menu item &amp; price
                </div>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#0A006E]/10 border border-[#0A006E]/15 flex items-center justify-center shrink-0 group-hover:translate-x-0.5 transition-transform">
              <ChevronRight className="w-5 h-5 text-[#0A006E] stroke-[2.5]" />
            </div>
          </button>
        )}

        {onNavigateToPos && activeBusinessUnit && (
          <button
            type="button"
            onClick={() => onNavigateToPos(activeBusinessUnit.id)}
            className="group min-h-[72px] sm:min-h-[78px] w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-[#0A006E] hover:from-slate-800 hover:to-[#15099C] text-white border border-slate-700 shadow-lg shadow-slate-900/20 flex items-center justify-between gap-4 cursor-pointer transition-all hover:-translate-y-0.5 active:scale-[0.99] text-left"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                <ArrowRight className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-lg font-montserrat font-black tracking-tight text-white leading-tight truncate">
                  Open POS
                </div>
                <div className="text-xs font-montserrat font-medium text-slate-200 mt-0.5 truncate">
                  Sell food &amp; topups
                </div>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 group-hover:translate-x-0.5 transition-transform">
              <ChevronRight className="w-5 h-5 text-[#FFDE00] stroke-[2.5]" />
            </div>
          </button>
        )}
      </div>

      {/* 2. Quick Access Navigation Tabs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => setActiveTab('outlets')}
          className={`min-h-[54px] px-5 py-3.5 rounded-xl text-sm font-montserrat font-black flex items-center justify-center gap-2.5 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'outlets'
              ? 'bg-[#0A006E] text-[#FFDE00] shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <Building2 className="w-5 h-5 shrink-0" />
          <span>Outlets ({businessUnits.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('food_menu')}
          className={`min-h-[54px] px-5 py-3.5 rounded-xl text-sm font-montserrat font-black flex items-center justify-center gap-2.5 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'food_menu'
              ? 'bg-[#0A006E] text-[#FFDE00] shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <UtensilsCrossed className="w-5 h-5 shrink-0" />
          <span>Menu &amp; Pricing</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`min-h-[54px] px-5 py-3.5 rounded-xl text-sm font-montserrat font-black flex items-center justify-center gap-2.5 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'bg-[#0A006E] text-[#FFDE00] shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <Package className="w-5 h-5 shrink-0" />
          <span>Kitchen Stock</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('topups')}
          className={`min-h-[54px] px-5 py-3.5 rounded-xl text-sm font-montserrat font-black flex items-center justify-center gap-2.5 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'topups'
              ? 'bg-[#0A006E] text-[#FFDE00] shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <Flame className="w-5 h-5 shrink-0" />
          <span>Club Topups</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: OUTLETS DIRECTORY & CREATION
         ========================================================================= */}
      {activeTab === 'outlets' && (
        <div className="space-y-4">
          {/* Filter & Quick Create Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-montserrat font-bold text-slate-600">Branch:</span>
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="min-h-[46px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 cursor-pointer"
              >
                <option value="ALL">All Branches ({branches.length})</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => handleOpenCreateOutletModal()}
              className="min-h-[48px] px-5 py-2.5 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-sm font-montserrat font-black flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
              <span>New Sub-Business</span>
            </button>
          </div>

          {/* Outlets Grid or Empty State */}
          {filteredUnits.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
                <UtensilsCrossed className="w-6 h-6" />
              </div>
              <h3 className="font-montserrat font-bold text-base text-slate-900">
                No Outlets Yet
              </h3>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenCreateOutletModal('restaurant_club')}
                  className="min-h-[52px] px-6 py-3 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-sm font-montserrat font-black flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                  <span>Add Restaurant / Club</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenCreateOutletModal('store')}
                  className="min-h-[52px] px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-sm font-montserrat font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Building2 className="w-5 h-5" />
                  <span>Add Store / Shop</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUnits.map((unit) => {
              const unitItems = restaurantInventory.filter((i) => i.businessUnitId === unit.id);
              const isRestaurant = unit.unitType === 'restaurant_club';
              const isMerchantShop = unit.unitType === 'merchant_shop';
              const assignedStaff = staffList.filter((s) => s.businessUnitId === unit.id);
              const unassignedStaff = staffList.filter(
                (s) => s.businessUnitId !== unit.id && (!s.branchId || s.branchId === unit.branchId)
              );

              return (
                <div
                  key={unit.id}
                  className={`bg-white border rounded-xl p-4 space-y-3.5 flex flex-col justify-between transition ${
                    selectedUnitId === unit.id
                      ? 'border-[#0A006E] ring-1 ring-[#0A006E]/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Metadata & Quick Icon Actions */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 font-montserrat font-semibold text-slate-600 truncate">
                        <span>
                          {unit.unitType === 'warehouse'
                            ? 'Warehouse'
                            : unit.unitType === 'store' || unit.unitType === 'retail_store'
                            ? 'Store'
                            : unit.unitType === 'shop' || unit.unitType === 'merchant_shop'
                            ? 'Retail Shop'
                            : unit.unitType === 'restaurant_club'
                            ? 'Restaurant & Club'
                            : 'Bar & Lounge'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={unit.status === 'Active' ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                          {unit.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditOutletModal(unit)}
                          className="p-1.5 text-slate-500 hover:text-[#0A006E] hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="Edit Outlet"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteUnit(unit)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Delete Outlet"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Title + Single-Line Location */}
                    <div>
                      <h3 className="text-base font-montserrat font-bold text-slate-900 leading-tight truncate">
                        {unit.name}
                      </h3>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        <span className="font-mono-tabular">{unit.code}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{unit.branchName}</span>
                        {unit.managerName ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span>{unit.managerName}</span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {/* Compact 3-Metric Strip */}
                    <div className="grid grid-cols-3 border border-slate-100 rounded-lg divide-x divide-slate-100 bg-slate-50/60 text-center">
                      <div className="py-2 px-1">
                        <div className="text-[10px] text-slate-500">Dishes</div>
                        <div className="text-sm font-montserrat font-black text-slate-900 font-mono-tabular">
                          {unitItems.length}
                        </div>
                      </div>
                      <div className="py-2 px-1">
                        <div className="text-[10px] text-slate-500">{isRestaurant ? 'Tables' : 'Topups'}</div>
                        <div className="text-sm font-montserrat font-black text-slate-900 font-mono-tabular">
                          {isRestaurant ? (unit.tableCount || 20) : unit.allowLiquorTopup ? 'On' : 'Off'}
                        </div>
                      </div>
                      <div className="py-2 px-1">
                        <div className="text-[10px] text-slate-500">Staff</div>
                        <div className="text-sm font-montserrat font-black text-[#0A006E] font-mono-tabular">
                          {assignedStaff.length}
                        </div>
                      </div>
                    </div>

                    {/* Compact Staff Assignment */}
                    <div className="space-y-1.5 text-xs">
                      {assignedStaff.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {assignedStaff.map((st) => (
                            <span
                              key={st.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-semibold"
                            >
                              <span>{st.name}</span>
                              {onUpdateStaff && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateStaff(st.id, {
                                      businessUnitId: '',
                                      businessUnitName: '',
                                    })
                                  }
                                  className="text-slate-400 hover:text-rose-600 font-bold cursor-pointer"
                                  title="Unassign"
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      {onUpdateStaff && unassignedStaff.length > 0 && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              onUpdateStaff(e.target.value, {
                                businessUnitId: unit.id,
                                businessUnitName: unit.name,
                              });
                              e.target.value = '';
                            }
                          }}
                          className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 w-full cursor-pointer"
                        >
                          <option value="" disabled>
                            + Assign staff...
                          </option>
                          {unassignedStaff.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name} ({st.role})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Quick Access Buttons */}
                  <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUnitId(unit.id);
                        setActiveTab('food_menu');
                      }}
                      className="min-h-[48px] px-4 py-3 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-sm font-montserrat font-black flex items-center justify-center gap-2 cursor-pointer transition"
                    >
                      <ChefHat className="w-4 h-4 shrink-0" />
                      <span>Menu</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUnitId(unit.id);
                        setActiveTab('inventory');
                      }}
                      className="min-h-[48px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-sm font-montserrat font-bold flex items-center justify-center gap-2 cursor-pointer transition"
                    >
                      <Package className="w-4 h-4 shrink-0" />
                      <span>Stock</span>
                    </button>

                    {onNavigateToPos && (
                      <button
                        type="button"
                        onClick={() => onNavigateToPos(unit.id)}
                        className="col-span-2 min-h-[48px] px-4 py-3 bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] rounded-xl text-sm font-montserrat font-black flex items-center justify-center gap-2 cursor-pointer transition"
                      >
                        <span>Open POS</span>
                        <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: FOOD CATEGORIES & CUSTOM PRICING
         ========================================================================= */}
      {activeTab === 'food_menu' && (
        <div className="space-y-6">
          {/* Active Outlet Selector Header */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <ChefHat className="w-5 h-5 text-[#0A006E] shrink-0" />
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-montserrat font-bold text-[#0A006E] cursor-pointer"
              >
                {businessUnits.length === 0 ? (
                  <option value="">No outlets yet</option>
                ) : (
                  businessUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.branchName})
                    </option>
                  ))
                )}
              </select>
              {businessUnits.length === 0 && (
                <button
                  type="button"
                  onClick={() => handleOpenCreateOutletModal('restaurant_club')}
                  className="min-h-[42px] px-4 py-2 bg-[#FFDE00] text-[#0A006E] rounded-xl text-xs font-montserrat font-black hover:bg-amber-400 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>New Outlet</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleOpenAddItemModal}
                className="min-h-[48px] px-5 py-2.5 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-sm font-montserrat font-black flex items-center gap-2 cursor-pointer transition"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
                <span>Add Dish</span>
              </button>
              {activeBusinessUnit && onNavigateToPos && (
                <button
                  type="button"
                  onClick={() => onNavigateToPos(activeBusinessUnit.id)}
                  className="min-h-[48px] px-5 py-2.5 bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] rounded-xl text-sm font-montserrat font-black flex items-center gap-2 cursor-pointer transition"
                >
                  <span>Open POS</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              {activeBusinessUnit && (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenEditOutletModal(activeBusinessUnit)}
                    className="min-h-[48px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#0A006E] rounded-xl text-sm font-montserrat font-bold flex items-center gap-2 cursor-pointer transition"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteUnit(activeBusinessUnit)}
                    className="min-h-[48px] px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-sm font-montserrat font-bold flex items-center gap-2 cursor-pointer transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {activeBusinessUnit ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Category Management */}
              <div className="lg:col-span-1 space-y-5">
                {/* Food Categories Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-montserrat font-bold text-sm text-[#0A006E]">Food Categories</h4>
                    <span className="text-xs font-mono-tabular font-bold text-slate-600">
                      {activeBusinessUnit.foodCategories?.length || 0}
                    </span>
                  </div>

                  {/* Add Food Category Input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="New category..."
                      value={categoryTypeToAdd === 'food' ? newCategoryInput : ''}
                      onChange={(e) => {
                        setCategoryTypeToAdd('food');
                        setNewCategoryInput(e.target.value);
                      }}
                      className="flex-1 min-h-[38px] px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryTypeToAdd('food');
                        handleAddCategory();
                      }}
                      disabled={!newCategoryInput.trim() || categoryTypeToAdd !== 'food'}
                      className="min-h-[38px] px-3.5 py-1.5 bg-[#0A006E] disabled:opacity-40 text-[#FFDE00] rounded-xl text-xs font-montserrat font-bold cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  {/* Category List */}
                  <div className="flex flex-wrap gap-1.5">
                    {(activeBusinessUnit.foodCategories || []).map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800"
                      >
                        <span>{cat}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat, true)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Remove category"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {(!activeBusinessUnit.foodCategories || activeBusinessUnit.foodCategories.length === 0) && (
                    <button
                      type="button"
                      onClick={handleLoadDefaultFoodCategories}
                      className="min-h-[40px] px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition w-full justify-center"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>Load Defaults</span>
                    </button>
                  )}
                </div>

                {/* Beverage Categories Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-montserrat font-bold text-sm text-[#0A006E]">Beverage Categories</h4>
                    <span className="text-xs font-mono-tabular font-bold text-slate-600">
                      {activeBusinessUnit.beverageCategories?.length || 0}
                    </span>
                  </div>

                  {/* Add Beverage Category Input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="New drink group..."
                      value={categoryTypeToAdd === 'beverage' ? newCategoryInput : ''}
                      onChange={(e) => {
                        setCategoryTypeToAdd('beverage');
                        setNewCategoryInput(e.target.value);
                      }}
                      className="flex-1 min-h-[38px] px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryTypeToAdd('beverage');
                        handleAddCategory();
                      }}
                      disabled={!newCategoryInput.trim() || categoryTypeToAdd !== 'beverage'}
                      className="min-h-[38px] px-3.5 py-1.5 bg-[#0A006E] disabled:opacity-40 text-[#FFDE00] rounded-xl text-xs font-montserrat font-bold cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  {/* Category List */}
                  <div className="flex flex-wrap gap-1.5">
                    {(activeBusinessUnit.beverageCategories || []).map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-900"
                      >
                        <span>{cat}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat, false)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Remove beverage category"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {(!activeBusinessUnit.beverageCategories || activeBusinessUnit.beverageCategories.length === 0) && (
                    <button
                      type="button"
                      onClick={handleLoadDefaultBeverageCategories}
                      className="min-h-[40px] px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition w-full justify-center"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      <span>Load Defaults</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Menu Dishes & Custom Pricing */}
              <div className="lg:col-span-2 space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-montserrat font-bold text-base text-slate-900">
                    Menu ({activeUnitInventory.length})
                  </h3>
                  <button
                    type="button"
                    onClick={handleOpenAddItemModal}
                    className="min-h-[38px] px-3.5 py-1.5 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-xs font-montserrat font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New Dish</span>
                  </button>
                </div>

                {activeUnitInventory.length === 0 ? (
                  <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-3">
                    <div className="font-montserrat font-bold text-slate-800 text-sm">
                      No dishes yet for {activeBusinessUnit.name}
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenAddItemModal}
                      className="min-h-[42px] px-5 py-2 bg-[#0A006E] text-[#FFDE00] rounded-xl text-xs font-montserrat font-bold cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add First Dish</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {activeUnitInventory.map((item) => {
                      const grossMarginPct =
                        item.sellingPriceKes > 0
                          ? Math.round(((item.sellingPriceKes - item.costPriceKes) / item.sellingPriceKes) * 100)
                          : 0;

                      return (
                        <div
                          key={item.id}
                          className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 transition hover:border-slate-300"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] font-montserrat font-semibold text-slate-500 truncate">
                                <span>{item.category}</span>
                                <span aria-hidden="true"> · </span>
                                <span>{item.portionUnit}</span>
                              </div>
                              <h4 className="font-montserrat font-bold text-sm text-slate-900 mt-0.5 truncate">
                                {item.name}
                              </h4>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenEditItemModal(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#0A006E] hover:bg-slate-100 cursor-pointer shrink-0"
                              title="Edit dish"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Pricing & Margin */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center justify-between text-xs">
                            <div>
                              <span className="text-[10px] text-slate-500 block">Menu Price</span>
                              {quickPriceItemId === item.id ? (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <input
                                    type="number"
                                    value={quickPriceValue}
                                    onChange={(e) => setQuickPriceValue(Number(e.target.value))}
                                    className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono-tabular"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveQuickPrice(item)}
                                    className="p-1.5 bg-[#0A006E] text-[#FFDE00] rounded-lg cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickPriceItemId(item.id);
                                    setQuickPriceValue(item.sellingPriceKes);
                                  }}
                                  className="font-montserrat font-black text-sm text-[#0A006E] font-mono-tabular hover:underline cursor-pointer flex items-center gap-1"
                                  title="Click to edit price"
                                >
                                  <span>KES {item.sellingPriceKes.toLocaleString()}</span>
                                  <Edit2 className="w-3 h-3 text-slate-400" />
                                </button>
                              )}
                            </div>

                            <div className="text-right font-mono-tabular">
                              <span className="text-[10px] text-slate-500 block">
                                Cost KES {item.costPriceKes.toLocaleString()}
                              </span>
                              <span className="font-montserrat font-bold text-[11px] text-emerald-700">
                                {grossMarginPct}% Margin
                              </span>
                            </div>
                          </div>

                          {/* Stock & Quick Restock */}
                          <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                            <span
                              className={`font-bold font-mono-tabular ${
                                item.portionsAvailable <= 0
                                  ? 'text-rose-600'
                                  : item.portionsAvailable <= (item.minStockAlert || 5)
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {item.portionsAvailable <= 0
                                ? 'Sold Out'
                                : `${item.portionsAvailable} ${item.portionUnit}s`}
                            </span>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleQuickRestock(item, 10)}
                                className="min-h-[42px] px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs sm:text-sm font-montserrat font-bold cursor-pointer transition"
                              >
                                +10 Stock
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditItemModal(item)}
                                className="min-h-[42px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-montserrat font-bold cursor-pointer transition"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-3">
              <h3 className="font-montserrat font-bold text-base text-slate-900">
                No Outlet Selected
              </h3>
              <button
                type="button"
                onClick={() => handleOpenCreateOutletModal('restaurant_club')}
                className="min-h-[44px] px-5 py-2.5 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-xs sm:text-sm font-montserrat font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Create Outlet</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: SEPARATE KITCHEN & PANTRY INVENTORY
         ========================================================================= */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          {/* Outlet Selection & Quick Access Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Package className="w-5 h-5 text-[#0A006E] shrink-0" />
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-montserrat font-bold text-[#0A006E] cursor-pointer"
              >
                {businessUnits.length === 0 ? (
                  <option value="">No outlets yet</option>
                ) : (
                  businessUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleOpenAddItemModal}
                className="min-h-[48px] px-5 py-2.5 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-sm font-montserrat font-black flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
                <span>New Item</span>
              </button>

              <button
                type="button"
                onClick={handleExportKitchenInventoryCSV}
                className="min-h-[48px] px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-montserrat font-bold flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>CSV</span>
              </button>

              {activeBusinessUnit && (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenEditOutletModal(activeBusinessUnit)}
                    className="min-h-[48px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#0A006E] rounded-xl text-sm font-montserrat font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteUnit(activeBusinessUnit)}
                    className="min-h-[48px] px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-sm font-montserrat font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {!activeBusinessUnit ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-3">
              <h3 className="font-montserrat font-bold text-base text-slate-900">
                No Outlet Selected
              </h3>
              <button
                type="button"
                onClick={() => handleOpenCreateOutletModal('restaurant_club')}
                className="min-h-[44px] px-5 py-2.5 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-xs sm:text-sm font-montserrat font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Create Outlet</span>
              </button>
            </div>
          ) : (
            <>
              {/* Kitchen KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-[11px] font-bold text-slate-600 font-montserrat">Kitchen Items Active</div>
              <div className="text-xl sm:text-2xl font-black font-montserrat text-[#0A006E] mt-0.5">
                {kitchenMetrics.totalItems}
              </div>
            </div>

            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-[11px] font-bold text-slate-600 font-montserrat">Pantry Cost Valuation</div>
              <div className="text-xl sm:text-2xl font-black font-montserrat text-slate-900 mt-0.5">
                {formatKes(kitchenMetrics.totalStockValue)}
              </div>
            </div>

            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-[11px] font-bold text-slate-600 font-montserrat">Potential Menu Value</div>
              <div className="text-xl sm:text-2xl font-black font-montserrat text-emerald-700 mt-0.5">
                {formatKes(kitchenMetrics.totalSellingValue)}
              </div>
            </div>

            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-[11px] font-bold text-slate-600 font-montserrat">Low Stock / Sold Out</div>
              <div className="text-xl sm:text-2xl font-black font-montserrat text-amber-700 mt-0.5">
                {kitchenMetrics.lowStockCount + kitchenMetrics.outOfStockCount} items
              </div>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search food item, steak, burger, drink..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={inventoryCategoryFilter}
                onChange={(e) => setInventoryCategoryFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer w-full sm:w-auto"
              >
                <option value="ALL">All Categories</option>
                {(activeBusinessUnit?.foodCategories || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {(activeBusinessUnit?.beverageCategories || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0A006E] text-white font-montserrat font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Item &amp; Description</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Unit</th>
                    <th className="py-3 px-3 text-right">Cost Price</th>
                    <th className="py-3 px-3 text-right">Menu Price</th>
                    <th className="py-3 px-3 text-center">Portions Available</th>
                    <th className="py-3 px-3 text-center">Stock Health</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {displayedInventory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        <div className="font-montserrat font-bold text-sm text-slate-700">
                          No Kitchen Items Found
                        </div>
                        {!inventorySearch.trim() && inventoryCategoryFilter === 'ALL' && activeBusinessUnit && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={handleOpenAddItemModal}
                              className="min-h-[42px] px-4 py-2 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-xs font-montserrat font-bold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Add First Item</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    displayedInventory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4">
                          <div className="font-montserrat font-black text-slate-900">{item.name}</div>
                          {item.description && (
                            <div className="text-[11px] text-slate-500 truncate max-w-xs">{item.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                            {item.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-600">{item.portionUnit}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-600">
                          KES {item.costPriceKes.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-[#0A006E]">
                          KES {item.sellingPriceKes.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-black text-base text-slate-900">
                          {item.portionsAvailable}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {item.portionsAvailable <= 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              Sold Out
                            </span>
                          ) : item.portionsAvailable <= (item.minStockAlert || 5) ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              Low Stock (&lt;{item.minStockAlert})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              In Stock
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleQuickRestock(item, 10)}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold cursor-pointer"
                              title="Restock +10 portions"
                            >
                              +10 Restock
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditItemModal(item)}
                              className="p-1 rounded-lg text-slate-400 hover:text-[#0A006E] hover:bg-slate-100 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 4: CLUB TOPUPS (LIQUOR, CIGARS/SIGGER, SHISHA)
         ========================================================================= */}
      {activeTab === 'topups' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 font-montserrat font-bold text-[#0A006E]">
                <Wine className="w-4 h-4" />
                <span>Bonded Liquor: {products.length} SKUs</span>
              </div>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <div className="flex items-center gap-1.5 font-montserrat font-bold text-amber-800">
                <Cigarette className="w-4 h-4" />
                <span>Cigars: {PRESET_SIGGER_ITEMS.length}</span>
              </div>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <div className="flex items-center gap-1.5 font-montserrat font-bold text-indigo-800">
                <Flame className="w-4 h-4" />
                <span>Shisha: {PRESET_SHISHA_ITEMS.length}</span>
              </div>
            </div>

            {onNavigateToPos && activeBusinessUnit && (
              <button
                type="button"
                onClick={() => onNavigateToPos(activeBusinessUnit.id)}
                className="min-h-[50px] px-5 py-3 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl text-sm font-montserrat font-black flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shadow-sm"
              >
                <span>Launch Topups in POS</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Topup Catalogs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Cigarette className="w-4 h-4 text-amber-700" />
                  <h4 className="font-montserrat font-bold text-sm text-slate-900">
                    Cigars &amp; Cigarettes
                  </h4>
                </div>
                <span className="text-xs font-mono-tabular font-semibold text-slate-500">
                  {PRESET_SIGGER_ITEMS.length}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {PRESET_SIGGER_ITEMS.map((item) => (
                  <div key={item.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-montserrat font-bold text-slate-900 truncate">{item.name}</span>
                    <span className="font-mono-tabular font-black text-[#0A006E] text-sm shrink-0 ml-3">
                      KES {item.priceKes.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">/ {item.portionUnit}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-indigo-700" />
                  <h4 className="font-montserrat font-bold text-sm text-slate-900">
                    Hookah &amp; Shisha
                  </h4>
                </div>
                <span className="text-xs font-mono-tabular font-semibold text-slate-500">
                  {PRESET_SHISHA_ITEMS.length}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {PRESET_SHISHA_ITEMS.map((item) => (
                  <div key={item.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-montserrat font-bold text-slate-900 truncate">{item.name}</span>
                    <span className="font-mono-tabular font-black text-[#0A006E] text-sm shrink-0 ml-3">
                      KES {item.priceKes.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">/ {item.portionUnit}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CREATE / EDIT BUSINESS UNIT (SUB-BUSINESS)
         ========================================================================= */}
      {isCreateOutletModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border-2 border-[#0A006E] space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#0A006E] text-[#FFDE00] flex items-center justify-center">
                  <Building2 className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="font-montserrat font-black text-base text-slate-900">
                    {editingOutlet ? `Edit Sub-Business: ${editingOutlet.name}` : 'Create Sub-Business Under Branch'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingOutlet
                      ? 'Update commercial details, manager, table capacity, and status'
                      : 'Establish a Restaurant/Club or Merchant Liquor Supermarket'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOutletModalOpen(false);
                  setEditingOutlet(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOutletFormSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">
                  Parent Branch Depot *
                </label>
                <select
                  value={newOutletBranchId}
                  onChange={(e) => setNewOutletBranchId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold cursor-pointer"
                  required
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code}) — {b.regionName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">
                  Sub-Business / Facility Type *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewOutletType('store')}
                    className={`p-2.5 rounded-xl border-2 flex flex-col items-center gap-1 text-center cursor-pointer transition ${
                      newOutletType === 'store' || newOutletType === 'retail_store'
                        ? 'border-[#0A006E] bg-emerald-50 text-[#0A006E] font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Store className="w-5 h-5 text-emerald-700" />
                    <span className="font-montserrat font-bold text-xs">Store</span>
                    <span className="text-[9px] text-slate-500">Commercial Store</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewOutletType('shop')}
                    className={`p-2.5 rounded-xl border-2 flex flex-col items-center gap-1 text-center cursor-pointer transition ${
                      newOutletType === 'shop' || newOutletType === 'merchant_shop'
                        ? 'border-[#0A006E] bg-purple-50 text-[#0A006E] font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ShoppingBag className="w-5 h-5 text-purple-700" />
                    <span className="font-montserrat font-bold text-xs">Shop</span>
                    <span className="text-[9px] text-slate-500">Retail Bottle Shop</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewOutletType('warehouse')}
                    className={`p-2.5 rounded-xl border-2 flex flex-col items-center gap-1 text-center cursor-pointer transition ${
                      newOutletType === 'warehouse'
                        ? 'border-[#0A006E] bg-blue-50 text-[#0A006E] font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Warehouse className="w-5 h-5 text-blue-700" />
                    <span className="font-montserrat font-bold text-xs">Warehouse</span>
                    <span className="text-[9px] text-slate-500">Storage &amp; Depot</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewOutletType('restaurant_club')}
                    className={`p-2.5 rounded-xl border-2 flex flex-col items-center gap-1 text-center cursor-pointer transition ${
                      newOutletType === 'restaurant_club'
                        ? 'border-[#0A006E] bg-amber-50 text-[#0A006E] font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <UtensilsCrossed className="w-5 h-5 text-amber-700" />
                    <span className="font-montserrat font-bold text-xs">Restaurant &amp; Club</span>
                    <span className="text-[9px] text-slate-500">Dining &amp; Kitchen</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewOutletType('bar_lounge')}
                    className={`p-2.5 rounded-xl border-2 flex flex-col items-center gap-1 text-center cursor-pointer transition ${
                      newOutletType === 'bar_lounge'
                        ? 'border-[#0A006E] bg-rose-50 text-[#0A006E] font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Wine className="w-5 h-5 text-rose-700" />
                    <span className="font-montserrat font-bold text-xs">Bar &amp; Lounge</span>
                    <span className="text-[9px] text-slate-500">Cocktails &amp; VIP</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">
                  Facility / Commercial Name *
                </label>
                <input
                  type="text"
                  placeholder={
                    newOutletType === 'store' || newOutletType === 'retail_store'
                      ? 'e.g. Westlands Supermarket & Liquor Store'
                      : newOutletType === 'shop' || newOutletType === 'merchant_shop'
                      ? 'e.g. Kilimani Cellars Retail Shop'
                      : newOutletType === 'warehouse'
                      ? 'e.g. Port Road Bonded Warehouse Unit 2'
                      : newOutletType === 'bar_lounge'
                      ? 'e.g. Skyline Sky Lounge & Bar'
                      : 'e.g. The Sovereign Club & Bistro'
                  }
                  value={newOutletName}
                  onChange={(e) => setNewOutletName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">
                  Outlet Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Atmosphere, cuisine style, operational notes..."
                  value={newOutletDesc}
                  onChange={(e) => setNewOutletDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Outlet Manager Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Executive Chef / Lead"
                    value={newOutletManager}
                    onChange={(e) => setNewOutletManager(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Operational Status
                  </label>
                  <select
                    value={newOutletStatus}
                    onChange={(e) => setNewOutletStatus(e.target.value as 'Active' | 'Inactive')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold cursor-pointer"
                  >
                    <option value="Active">Active (Open for business)</option>
                    <option value="Inactive">Inactive (Suspended)</option>
                  </select>
                </div>
              </div>

              {newOutletType === 'restaurant_club' && (
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Dining Table Count
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={newOutletTableCount}
                    onChange={(e) => setNewOutletTableCount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                  />
                </div>
              )}

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-montserrat font-bold text-slate-800 block">
                    Allow Central Liquor &amp; Cigar Topup
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Waiters can requisition spirits from parent branch during dining
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={newOutletAllowTopup}
                  onChange={(e) => setNewOutletAllowTopup(e.target.checked)}
                  className="w-5 h-5 accent-[#0A006E] cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOutletModalOpen(false);
                    setEditingOutlet(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-bold cursor-pointer hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl font-montserrat font-black cursor-pointer shadow-md"
                >
                  {editingOutlet ? 'Save Sub-Business Changes' : 'Create Outlet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: INSTANT DELETE SUB-BUSINESS CONFIRMATION
         ========================================================================= */}
      {confirmDeleteUnit && (
        <ConfirmationModal
          isOpen={true}
          title="Instant Delete Sub-Business"
          message={`Are you sure you want to delete ${confirmDeleteUnit.name} (${confirmDeleteUnit.code})? This will instantly remove this sub-business from the directory and unassign staff members.`}
          onConfirm={() => handleInstantDeleteOutlet(confirmDeleteUnit)}
          onCancel={() => setConfirmDeleteUnit(null)}
          isConfirming={isDeletingOutletId === confirmDeleteUnit.id}
        />
      )}

      {/* =========================================================================
          MODAL: ADD / EDIT RESTAURANT ITEM
         ========================================================================= */}
      {isItemModalOpen && activeBusinessUnit && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border-2 border-[#0A006E] space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#0A006E] text-[#FFDE00] flex items-center justify-center">
                  <ChefHat className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="font-montserrat font-black text-base text-slate-900">
                    {editingItem ? 'Edit Dish & Pricing' : 'Add Food / Drink Item'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    For outlet: <strong className="text-slate-800">{activeBusinessUnit.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsItemModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleItemSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">
                  Dish / Beverage Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Prime Angus Ribeye Steak (350g)"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold cursor-pointer"
                    required
                  >
                    {(activeBusinessUnit.foodCategories || []).map((c) => (
                      <option key={c} value={c}>
                        [Food] {c}
                      </option>
                    ))}
                    {(activeBusinessUnit.beverageCategories || []).map((c) => (
                      <option key={c} value={c}>
                        [Drink] {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Portion Unit
                  </label>
                  <select
                    value={itemPortionUnit}
                    onChange={(e) => setItemPortionUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold cursor-pointer"
                  >
                    <option value="Plate">Plate</option>
                    <option value="Portion">Portion</option>
                    <option value="Platter">Platter</option>
                    <option value="Glass">Glass</option>
                    <option value="Pitcher">Pitcher</option>
                    <option value="Cup">Cup</option>
                    <option value="Stick">Stick (Cigar)</option>
                    <option value="Head">Head (Shisha)</option>
                    <option value="Serving">Serving</option>
                  </select>
                </div>
              </div>

              {/* Pricing Row */}
              <div className="grid grid-cols-2 gap-3 bg-[#F0F2F0] p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Cost Price (KES) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={itemCostPrice}
                    onChange={(e) => setItemCostPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                    required
                  />
                  <span className="text-[10px] text-slate-500">Kitchen ingredients cost</span>
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-[#0A006E] mb-1">
                    Menu Selling Price (KES) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={itemSellingPrice}
                    onChange={(e) => setItemSellingPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border-2 border-[#0A006E] rounded-xl text-[#0A006E] font-mono font-black"
                    required
                  />
                  <span className="text-[10px] text-emerald-700 font-bold">
                    Margin:{' '}
                    {itemSellingPrice > 0
                      ? Math.round(((itemSellingPrice - itemCostPrice) / itemSellingPrice) * 100)
                      : 0}
                    %
                  </span>
                </div>
              </div>

              {/* Inventory & Prep Row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Initial Stock
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={itemPortions}
                    onChange={(e) => setItemPortions(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-500">Portions ready</span>
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Min Alert
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={itemMinAlert}
                    onChange={(e) => setItemMinAlert(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-500">Alert threshold</span>
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Prep Time (min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={itemPrepMinutes}
                    onChange={(e) => setItemPrepMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-500">Kitchen speed</span>
                </div>
              </div>

              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">
                  Menu Description &amp; Recipe Highlights
                </label>
                <textarea
                  rows={2}
                  placeholder="Accompaniments, sauce choices, cut specifications..."
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-bold cursor-pointer hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0A006E] hover:bg-[#070050] text-[#FFDE00] rounded-xl font-montserrat font-black cursor-pointer shadow-md"
                >
                  {editingItem ? 'Save Changes' : 'Add to Menu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <StatusFeedbackToast status={feedbackToast} onDismiss={() => setFeedbackToast(null)} />
    </div>
  );
};
