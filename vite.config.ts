import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
  // P9-B: 拆包策略
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 拆离 vendor chunk：react、antd、charts、markdown、docs
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Markdown 渲染相关（仅 VannaPage 用）
          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('rehype-') ||
            id.includes('micromark') ||
            id.includes('mdast-') ||
            id.includes('hast-') ||
            id.includes('unified') ||
            id.includes('unist-') ||
            id.includes('highlight.js') ||
            id.includes('lowlight')
          ) {
            return 'vendor-markdown';
          }
          // 图表
          if (id.includes('@ant-design/charts') || id.includes('@antv') || id.includes('/g2/') || id.includes('@geometry/')) {
            return 'vendor-charts';
          }
          // Office/PDF 导出（按需）
          if (
            id.includes('jspdf') ||
            id.includes('html2canvas') ||
            id.includes('docx') ||
            id.includes('file-saver') ||
            id.includes('xlsx')
          ) {
            return 'vendor-export';
          }
          // antd 主包（@rc-component 也归到这里，避免 circular）
          if (
            id.includes('antd/') ||
            id.includes('@ant-design/') ||
            id.includes('@rc-component/') ||
            id.includes('/antd')
          ) {
            return 'vendor-antd';
          }
          // React 生态
          if (
            id.includes('react-router') ||
            id.includes('react-dom') ||
            id.includes('/react/') ||
            id.includes('scheduler') ||
            id.includes('use-sync-external-store')
          ) {
            return 'vendor-react';
          }
          // dayjs
          if (id.includes('dayjs')) {
            return 'vendor-dayjs';
          }
          // 其他
          return 'vendor-misc';
        },
        // 入口 chunk 命名
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
