import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getDeviceFilePath(date) {
  return path.join(dataDir, `devices_${date}.json`);
}

function getSnapshotFilePath() {
  return path.join(dataDir, 'snapshots.json');
}

export function saveSnapshot(date, sourceFile, devices) {
  const devicePath = getDeviceFilePath(date);
  fs.writeFileSync(devicePath, JSON.stringify(devices, null, 2), 'utf-8');

  const snapshotsPath = getSnapshotFilePath();
  let snapshots = [];
  if (fs.existsSync(snapshotsPath)) {
    snapshots = JSON.parse(fs.readFileSync(snapshotsPath, 'utf-8'));
  }

  const existingIndex = snapshots.findIndex(s => s.date === date);
  const snapshotInfo = {
    date,
    sourceFile,
    importedAt: new Date().toISOString(),
    totalCount: devices.length,
    enabledCount: devices.filter(d => d.enabled === '启用').length,
  };

  if (existingIndex >= 0) {
    snapshots[existingIndex] = snapshotInfo;
  } else {
    snapshots.push(snapshotInfo);
  }

  snapshots.sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(snapshotsPath, JSON.stringify(snapshots, null, 2), 'utf-8');
}

export function getSnapshotDevices(date) {
  const devicePath = getDeviceFilePath(date);
  if (!fs.existsSync(devicePath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(devicePath, 'utf-8'));
}

export function getSnapshot(date) {
  const devices = getSnapshotDevices(date);
  if (devices.length === 0) return null;

  const snapshotsPath = getSnapshotFilePath();
  let snapInfo = null;
  if (fs.existsSync(snapshotsPath)) {
    const snapshots = JSON.parse(fs.readFileSync(snapshotsPath, 'utf-8'));
    snapInfo = snapshots.find(s => s.date === date);
  }

  return {
    date,
    devices,
    sourceFile: snapInfo ? snapInfo.sourceFile : '',
    importedAt: snapInfo ? snapInfo.importedAt : '',
  };
}

export function getAllSnapshots() {
  const snapshotsPath = getSnapshotFilePath();
  if (!fs.existsSync(snapshotsPath)) {
    return [];
  }
  const snapshots = JSON.parse(fs.readFileSync(snapshotsPath, 'utf-8'));
  return snapshots.sort((a, b) => b.date.localeCompare(a.date));
}

export function deleteSnapshot(date) {
  const devicePath = getDeviceFilePath(date);
  if (fs.existsSync(devicePath)) {
    fs.unlinkSync(devicePath);
  }

  const snapshotsPath = getSnapshotFilePath();
  if (fs.existsSync(snapshotsPath)) {
    let snapshots = JSON.parse(fs.readFileSync(snapshotsPath, 'utf-8'));
    snapshots = snapshots.filter(s => s.date !== date);
    fs.writeFileSync(snapshotsPath, JSON.stringify(snapshots, null, 2), 'utf-8');
  }
}