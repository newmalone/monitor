import { ComparisonData, Device } from '../types';
import { getDeviceTypeStats, getManufacturerStats, getRegionStats, getStatistics } from './stats';

export function buildComparisonBetween(
  label: string,
  dateA: string,
  dateB: string,
  devicesA: Device[],
  devicesB: Device[]
): ComparisonData {
  return {
    label,
    dateA,
    dateB,
    overallA: getStatistics(devicesA),
    overallB: getStatistics(devicesB),
    manufacturerA: getManufacturerStats(devicesA),
    manufacturerB: getManufacturerStats(devicesB),
    regionA: getRegionStats(devicesA),
    regionB: getRegionStats(devicesB),
    typeA: getDeviceTypeStats(devicesA),
    typeB: getDeviceTypeStats(devicesB),
  };
}
