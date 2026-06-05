import { useEffect, useRef, useState } from 'react';
import { Card, Button } from 'antd';
import { WifiOutlined, ApiOutlined, AlertOutlined } from '@ant-design/icons';
import { Device } from '../types';

interface DeviceMapProps {
  devices: Device[];
}

const statusColors: Record<string, string> = {
  在线: '#52c41a',
  离线: '#ff4d4f',
  异常: '#faad14',
};

export const DeviceMap = ({ devices }: DeviceMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredDevices = devices.filter(d => statusFilter === 'all' || d.status === statusFilter);
  const enabledFilteredDevices = filteredDevices.filter(d => d.enabled === '启用');

  useEffect(() => {
    if (!mapContainer.current) return;

    const loadMap = () => {
      const AMap = (window as any).AMap;
      if (!AMap) {
        setTimeout(loadMap, 500);
        return;
      }

      if (mapInstance.current) {
        mapInstance.current.destroy();
      }

      const map = new AMap.Map(mapContainer.current, {
        zoom: 12,
        center: [120.3119, 31.4912],
        mapStyle: 'amap://styles/light',
      });

      map.setFitView(null, false, [100, 100, 100, 100]);

      mapInstance.current = map;
      addMarkers(map);
    };

    loadMap();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, [enabledFilteredDevices]);

  const addMarkers = (map: any) => {
    markersRef.current.forEach(m => map.remove(m));
    markersRef.current = [];

    if (enabledFilteredDevices.length === 0) return;

    enabledFilteredDevices.forEach(device => {
      if (!device.longitude || !device.latitude) return;

      const color = statusColors[device.status] || '#999';
      const marker = new (window as any).AMap.Marker({
        position: [device.longitude, device.latitude],
        title: device.deviceCode,
        icon: new (window as any).AMap.Icon({
          size: new (window as any).AMap.Size(16, 16),
          image: getMarkerSvg(color),
          imageSize: new (window as any).AMap.Size(16, 16),
        }),
        zIndex: 100,
      });

      marker.on('click', () => {
        const info = [
          `<strong>${device.deviceCode}</strong>`,
          `位置: ${device.location}`,
          `厂商: ${device.manufacturerName}`,
          `类型: ${device.deviceTypeName}`,
          `状态: ${device.status}`,
          `区域: ${device.region}`,
        ].join('<br>');

        const infoWindow = new (window as any).AMap.InfoWindow({
          content: `<div style="padding:8px">${info}</div>`,
          offset: new (window as any).AMap.Pixel(0, -20),
        });
        infoWindow.open(map, marker.getPosition());
      });

      map.add(marker);
      markersRef.current.push(marker);
    });
  };

  const getMarkerSvg = (color: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="8" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
  };

  return (
    <Card
      className="map-card"
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            设备位置分布图（仅已启用设备）
          </span>
          <div className="flex gap-2">
            <Button size="small" type={statusFilter === 'all' ? 'primary' : 'default'} onClick={() => setStatusFilter('all')}>全部</Button>
            <Button size="small" type={statusFilter === '在线' ? 'primary' : 'default'} onClick={() => setStatusFilter('在线')} style={{ color: '#52c41a', borderColor: '#52c41a' }}><WifiOutlined /> 在线</Button>
            <Button size="small" type={statusFilter === '离线' ? 'primary' : 'default'} onClick={() => setStatusFilter('离线')} style={{ color: '#ff4d4f', borderColor: '#ff4d4f' }}><ApiOutlined /> 离线</Button>
            <Button size="small" type={statusFilter === '异常' ? 'primary' : 'default'} onClick={() => setStatusFilter('异常')} style={{ color: '#faad14', borderColor: '#faad14' }}><AlertOutlined /> 异常</Button>
          </div>
        </div>
      }
    >
      <div ref={mapContainer} className="map-container" />
      <div className="map-legend">
        {Object.entries(statusColors).map(([status, color]) => (
          <div className="legend-item" key={status}>
            <span className="legend-dot" style={{ backgroundColor: color }} />
            <span>{status} ({enabledFilteredDevices.filter(d => d.status === status).length})</span>
          </div>
        ))}
      </div>
    </Card>
  );
};
