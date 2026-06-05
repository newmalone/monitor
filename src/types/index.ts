export interface Device {
  id: string;
  deviceCode: string;
  productName: string;
  manufacturerCode: string;
  manufacturerName: string;
  deviceTypeCode: string;
  deviceTypeName: string;
  nodeType: string;
  authMethod: string;
  username: string;
  password: string;
  protocol: string;
  serialNumber: string;
  location: string;
  longitude: number;
  latitude: number;
  junctionId: string;
  junctionType: string;
  junctionLevel: string;
  region: string;
  relatedJunction: string;
  ipAddress: string;
  purpose: string;
  ownerUnit: string;
  maintenanceUnit: string;
  status: '在线' | '离线' | '异常';
  installLocation: string;
  radiationRadius?: number;
  cameraAngle?: string;
  cameraType?: string;
  directionAngle?: string;
  pitchAngle?: string;
  rotationAngle?: string;
  detectionDirection?: string;
  detectionRadius?: string;
  junctionCode: string;
  trafficPoliceCode: string;
  enabled: '启用' | '未启用';
}

export interface DeviceSnapshot {
  date: string;
  devices: Device[];
}

export interface Statistics {
  total: number;
  online: number;
  offline: number;
  abnormal: number;
  onlineRate: number;
  offlineRate: number;
  abnormalRate: number;
}

export interface ManufacturerStats {
  name: string;
  total: number;
  online: number;
  offline: number;
  abnormal: number;
  onlineRate: number;
}

export interface RegionStats {
  name: string;
  total: number;
  online: number;
  offline: number;
  abnormal: number;
}

export interface DeviceTypeStats {
  name: string;
  total: number;
  online: number;
  offline: number;
  abnormal: number;
}

export interface DailyReportDeviceStat {
  name: string;
  online: number;
  onlineRate: number;
  offline: number;
  offlineRate: number;
  abnormal: number;
  abnormalRate: number;
  total: number;
}

export interface SignalStat {
  name: string;
  count: number;
  rate: number;
}

export interface ComparisonData {
  label: string;
  dateA: string;
  dateB: string;
  overallA: Statistics;
  overallB: Statistics;
  manufacturerA: ManufacturerStats[];
  manufacturerB: ManufacturerStats[];
  regionA: RegionStats[];
  regionB: RegionStats[];
  typeA: DeviceTypeStats[];
  typeB: DeviceTypeStats[];
}

export interface ReportOverallStats {
  date: string;
  total: number;
  online: number;
  offline: number;
  abnormal: number;
  onlineRate: number;
}

export interface ReportTypeStats {
  typeName: string;
  date: string;
  online: number;
  offline: number;
  abnormal: number;
  total: number;
}

export interface ReportJunctionLevelStats {
  level: string;
  date: string;
  online: number;
  offlineAbnormal: number;
  total: number;
}

export interface DeviceChangeItem {
  ipAddress: string;
  location: string;
  deviceTypeName: string;
  statusA: string;
  statusB: string;
}

export interface ReportData {
  dateA: string;
  dateB: string;
  overall: {
    a: ReportOverallStats;
    b: ReportOverallStats;
  };
  typeStats: ReportTypeStats[];
  junctionLevelStats: ReportJunctionLevelStats[];
  recovered: DeviceChangeItem[];
  newOfflineAbnormal: DeviceChangeItem[];
  persistentOfflineAbnormal: DeviceChangeItem[];
}
