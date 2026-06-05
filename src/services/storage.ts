import { Device, DeviceSnapshot } from '../types';

const DB_NAME = 'deviceMonitorDB';
const DB_VERSION = 1;
const STORE_NAME = 'deviceSnapshots';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'date' });
        store.createIndex('dateIndex', 'date', { unique: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSnapshot(date: string, devices: Device[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ date, devices } as DeviceSnapshot);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSnapshot(date: string): Promise<DeviceSnapshot | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(date);
    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getAllSnapshots(): Promise<DeviceSnapshot[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      db.close();
      resolve((request.result || []).sort((a, b) => b.date.localeCompare(a.date)));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSnapshot(date: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(date);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDateBefore(baseDate: string, days: number): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

export function getMonthBefore(baseDate: string): string {
  const d = new Date(baseDate);
  d.setMonth(d.getMonth() - 1);
  return formatDate(d);
}

export async function getLatestSnapshot(): Promise<DeviceSnapshot | null> {
  const all = await getAllSnapshots();
  return all.length > 0 ? all[0] : null;
}
