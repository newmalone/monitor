import { useState } from 'react';
import { Card, Upload, Button, message, Progress } from 'antd';
import { UploadOutlined, FileTextOutlined } from '@ant-design/icons';
import { Device } from '../types';
import { uploadFile } from '../services/api';
import { formatDate } from '../services/storage';

interface FileUploaderProps {
  onDataLoaded: (devices: Device[], snapshotDate: string) => void;
}

export const FileUploader = ({ onDataLoaded }: FileUploaderProps) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);


  const normalizeDate = (value: string) => {
    const match = value.match(/(20\d{2})[^\d]?(\d{1,2})[^\d]?(\d{1,2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return formatDate(new Date());
  };

  const extractDateFromFileName = (fileName: string) => {
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const fullYearMatch = baseName.match(/(20\d{2})[-_./年]?(\d{1,2})[-_./月]?(\d{1,2})/);
    if (fullYearMatch) {
      return normalizeDate(fullYearMatch[0]);
    }

    const shortMatch = baseName.match(/(\d{2})(\d{2})(?!\d)/);
    if (shortMatch) {
      const [, month, day] = shortMatch;
      const currentYear = new Date().getFullYear();
      return `${currentYear}-${month}-${day}`;
    }

    return formatDate(new Date());
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      message.error('请上传 Excel 文件 (.xlsx)');
      return false;
    }

    setLoading(true);
    setProgress(0);

    try {
      const snapshotDate = extractDateFromFileName(file.name);
      setProgress(50);
      const result = await uploadFile(file, snapshotDate);
      setProgress(100);

      setTimeout(() => {
        onDataLoaded(result.devices, result.date);
        message.success(`成功导入 ${result.totalCount} 条数据，其中已启用 ${result.enabledCount} 条，已按文件日期 ${result.date} 保存到服务器`);
        setLoading(false);
        setProgress(0);
      }, 300);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '上传失败';
      message.error(errorMessage);
      setLoading(false);
      setProgress(0);
    }

    return false;
  };

  return (
    <Card className="upload-card" title={<span className="flex items-center gap-2"><FileTextOutlined /> 数据导入</span>}>
      <Upload accept=".xlsx" beforeUpload={handleFileUpload} fileList={[]} customRequest={() => {}} showUploadList={false}>
        <Button icon={<UploadOutlined />} loading={loading} disabled={loading}>
          {loading ? '导入中...' : '上传设备数据文件'}
        </Button>
      </Upload>
      <p className="upload-hint">支持 .xlsx 格式，导入后按文件名中的日期保存到服务器</p>
      {loading && <Progress percent={progress} showInfo={true} style={{ marginTop: 16 }} />}
    </Card>
  );
};