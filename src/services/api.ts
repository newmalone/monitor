import { Device, DeviceSnapshot } from '../types';

const API_BASE = '/api';

export async function uploadFile(file: File, date: string): Promise<{ success: boolean; date: string; totalCount: number; enabledCount: number; devices: Device[] }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('date', date);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new Error('无法连接上传服务，请确认后端服务已启动');
  }

  if (!res.ok) {
    const text = await res.text();
    try {
      const err = JSON.parse(text);
      throw new Error(err.error || '上传失败');
    } catch {
      throw new Error(text || '上传失败');
    }
  }

  return res.json();
}

export async function getDevices(date: string): Promise<{ date: string; devices: Device[] }> {
  const res = await fetch(`${API_BASE}/devices/${date}`);
  if (!res.ok) {
    throw new Error('获取设备数据失败');
  }
  return res.json();
}

export async function getAllSnapshots(): Promise<{ date: string; sourceFile: string; importedAt: string; totalCount: number; enabledCount: number }[]> {
  const res = await fetch(`${API_BASE}/snapshots`);
  if (!res.ok) {
    throw new Error('获取快照列表失败');
  }
  return res.json();
}

export async function getSnapshotDevices(date: string): Promise<Device[]> {
  const res = await fetch(`${API_BASE}/devices/${date}`);
  if (!res.ok) {
    throw new Error('获取设备数据失败');
  }
  const data = await res.json();
  return data.devices;
}

export async function getFullSnapshot(date: string): Promise<DeviceSnapshot> {
  const res = await fetch(`${API_BASE}/snapshots/${date}`);
  if (!res.ok) {
    throw new Error('获取快照失败');
  }
  return res.json();
}

export async function getLatestSnapshot(): Promise<DeviceSnapshot | null> {
  try {
    const res = await fetch(`${API_BASE}/snapshots/latest`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function deleteSnapshot(date: string): Promise<void> {
  const res = await fetch(`${API_BASE}/snapshots/${date}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('删除失败');
  }
}