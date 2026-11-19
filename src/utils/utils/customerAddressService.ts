import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  cleanFirestoreData,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type { CustomerDeliveryLocation, CustomerSavedAddress } from '../types';
import { buildStableLocationId } from '../../lib/locationsDirectory';

const GUEST_ADDRESSES_STORAGE_KEY = 'vaairo_guest_saved_addresses_v1';

export function loadGuestSavedAddresses(): CustomerSavedAddress[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GUEST_ADDRESSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomerSavedAddress[]) : [];
  } catch {
    return [];
  }
}

export function persistGuestSavedAddresses(list: CustomerSavedAddress[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUEST_ADDRESSES_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

export function savedAddressToDeliveryLocation(addr: CustomerSavedAddress): CustomerDeliveryLocation {
  return {
    locationId: buildStableLocationId({
      countryCode: addr.countryCode,
      county: addr.county,
      cityOrTown: addr.cityOrTown,
      estateOrLocality: addr.estateOrLocality,
    }),
    country: addr.country,
    countryCode: addr.countryCode,
    county: addr.county,
    cityOrTown: addr.cityOrTown,
    estateOrLocality: addr.estateOrLocality,
    streetOrBuilding: addr.streetOrBuilding,
    formattedAddress: addr.formattedAddress,
    latitude: addr.latitude,
    longitude: addr.longitude,
    source: 'SAVED_ADDRESS',
    provider: 'SAVED_BOOK',
    savedAddressId: addr.id,
    confirmedAt: Date.now(),
  };
}

/**
 * Subscribes to authenticated customer addresses in Firestore `customerAddresses`.
 * Automatically scopes queries to `userId == uid` to comply with strict Firestore PII rules.
 */
export function subscribeCustomerSavedAddresses(
  userId: string | null | undefined,
  onUpdate: (addresses: CustomerSavedAddress[]) => void
): () => void {
  if (!userId) {
    onUpdate(loadGuestSavedAddresses());
    return () => {};
  }

  // Emit guest/local cache immediately while Firestore connects
  const q = query(collection(db, 'customerAddresses'), where('userId', '==', userId));
  const unsubscribe = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ ...(d.data() as CustomerSavedAddress), id: d.id }))
        .sort((a, b) => {
          if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
          return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customerAddresses');
      onUpdate(loadGuestSavedAddresses());
    }
  );

  return unsubscribe;
}

/**
 * Saves a new or updated delivery address.
 * - Authenticated users: writes to Firestore `customerAddresses/{addressId}` and ensures a single default address.
 * - Guest users: saves cleanly in `localStorage` without requiring registration.
 */
export async function saveCustomerDeliveryAddress(params: {
  userId?: string | null;
  label: string;
  location: CustomerDeliveryLocation;
  recipientName?: string;
  recipientPhone?: string;
  deliveryInstructions?: string;
  isDefault?: boolean;
  existingAddresses: CustomerSavedAddress[];
  editAddressId?: string;
}): Promise<CustomerSavedAddress> {
  const now = new Date().toISOString();
  const id =
    params.editAddressId ||
    `addr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const shouldBeDefault =
    params.isDefault === true || params.existingAddresses.length === 0;

  const streetCombined = [
    params.location.streetOrBuilding || '',
    params.deliveryInstructions?.trim() || '',
  ]
    .filter(Boolean)
    .join(' — ');

  const record: CustomerSavedAddress = {
    id,
    userId: params.userId || 'guest',
    label: params.label.trim() || params.location.estateOrLocality || 'My Delivery Address',
    country: params.location.country || 'Kenya',
    countryCode: params.location.countryCode || 'KE',
    county: params.location.county,
    cityOrTown: params.location.cityOrTown,
    estateOrLocality: params.location.estateOrLocality,
    streetOrBuilding: streetCombined || undefined,
    formattedAddress: params.location.formattedAddress,
    latitude: params.location.latitude,
    longitude: params.location.longitude,
    recipientName: params.recipientName?.trim() || undefined,
    recipientPhone: params.recipientPhone?.trim() || undefined,
    isDefault: shouldBeDefault,
    createdAt:
      params.existingAddresses.find((a) => a.id === id)?.createdAt || now,
    updatedAt: now,
  };

  if (!params.userId) {
    const nextList = params.existingAddresses
      .filter((a) => a.id !== id)
      .map((a) => (shouldBeDefault ? { ...a, isDefault: false } : a));
    nextList.unshift(record);
    persistGuestSavedAddresses(nextList);
    return record;
  }

  try {
    const batch = writeBatch(db);
    if (shouldBeDefault) {
      for (const existing of params.existingAddresses) {
        if (existing.id !== id && existing.isDefault && existing.userId === params.userId) {
          batch.update(doc(db, 'customerAddresses', existing.id), {
            isDefault: false,
            updatedAt: now,
          });
        }
      }
    }
    batch.set(doc(db, 'customerAddresses', id), cleanFirestoreData(record));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `customerAddresses/${id}`);
    // Fallback single write in case batch update hits an offline doc
    try {
      await setDoc(doc(db, 'customerAddresses', id), cleanFirestoreData(record));
    } catch (innerErr) {
      handleFirestoreError(innerErr, OperationType.CREATE, `customerAddresses/${id}`);
    }
  }

  return record;
}

/**
 * Sets one saved address as the default delivery address.
 */
export async function setDefaultCustomerAddress(params: {
  userId?: string | null;
  addressId: string;
  existingAddresses: CustomerSavedAddress[];
}): Promise<CustomerSavedAddress[]> {
  const now = new Date().toISOString();
  const updated = params.existingAddresses.map((a) => ({
    ...a,
    isDefault: a.id === params.addressId,
    updatedAt: a.id === params.addressId ? now : a.updatedAt,
  }));

  if (!params.userId) {
    persistGuestSavedAddresses(updated);
    return updated;
  }

  try {
    const batch = writeBatch(db);
    for (const addr of updated) {
      if (addr.userId === params.userId) {
        batch.update(doc(db, 'customerAddresses', addr.id), {
          isDefault: addr.id === params.addressId,
          updatedAt: now,
        });
      }
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `customerAddresses/${params.addressId}`);
  }
  return updated;
}

/**
 * Deletes a saved customer address.
 */
export async function deleteCustomerSavedAddress(params: {
  userId?: string | null;
  addressId: string;
  existingAddresses: CustomerSavedAddress[];
}): Promise<CustomerSavedAddress[]> {
  const remaining = params.existingAddresses.filter((a) => a.id !== params.addressId);
  if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
    remaining[0] = { ...remaining[0], isDefault: true };
  }

  if (!params.userId) {
    persistGuestSavedAddresses(remaining);
    return remaining;
  }

  try {
    await deleteDoc(doc(db, 'customerAddresses', params.addressId));
    if (remaining[0] && remaining[0].userId === params.userId && remaining[0].isDefault) {
      await setDoc(
        doc(db, 'customerAddresses', remaining[0].id),
        cleanFirestoreData({ ...remaining[0], updatedAt: new Date().toISOString() }),
        { merge: true }
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `customerAddresses/${params.addressId}`);
  }

  return remaining;
}

/**
 * Migrates guest-saved addresses into Firebase Firestore when a guest signs in.
 */
export async function syncGuestAddressesToFirebaseUser(userId: string): Promise<void> {
  const guestList = loadGuestSavedAddresses();
  if (guestList.length === 0) return;

  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    for (const addr of guestList) {
      const migratedId = `addr_${userId.slice(0, 6)}_${addr.id.replace(/^addr_/, '')}`;
      batch.set(
        doc(db, 'customerAddresses', migratedId),
        cleanFirestoreData({
          ...addr,
          id: migratedId,
          userId,
          updatedAt: now,
        })
      );
    }
    await batch.commit();
    persistGuestSavedAddresses([]);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'customerAddresses');
  }
}
