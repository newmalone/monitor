import { useMemo, useState } from 'react';
import { Layout, Menu, Breadcrumb } from 'antd';
import { HistoryOutlined, MonitorOutlined, SwapOutlined, FileTextOutlined, RobotOutlined } from '@ant-design/icons';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ComparePage } from './pages/ComparePage';
import { HistoryPage } from './pages/HistoryPage';
import { MonitorPage } from './pages/MonitorPage';
import { ReportPage } from './pages/ReportPage';
import AgentPage from './pages/AgentPage';
import './App.css';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <MonitorOutlined />, label: '设备状态监控' },
  { key: '/compare', icon: <SwapOutlined />, label: '数据比对分析' },
  { key: '/history', icon: <HistoryOutlined />, label: '导入历史查询' },
  { key: '/report', icon: <FileTextOutlined />, label: '设备状态分析日报' },
  { key: '/agent', icon: <RobotOutlined />, label: '智能问答' },
];

const breadcrumbMap: Record<string, string> = {
  '/': '设备状态监控',
  '/compare': '数据比对分析',
  '/history': '导入历史查询',
  '/report': '设备状态分析日报',
  '/agent': '智能问答',
};

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const isAgentPage = location.pathname === '/agent';

  const breadcrumbItems = useMemo(() => {
    const items = [{ title: '首页' }];
    const name = breadcrumbMap[location.pathname];
    if (name) {
      items.push({ title: name });
    }
    return items;
  }, [location.pathname]);

  if (isAgentPage) {
    return <AgentPage />;
  }

  return (
    <Layout className="app-layout">
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        className="app-sider"
        width={220}
        trigger={null}
      >
        <div className="logo-area">
          <div className="logo-icon">
            <MonitorOutlined />
          </div>
          {!collapsed && <span className="logo-text">设备状态监控系统</span>}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="side-menu"
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-left">
            <div
              className={`collapse-trigger ${collapsed ? 'collapsed' : ''}`}
              onClick={() => setCollapsed(!collapsed)}
            >
              <span className="trigger-bar" />
              <span className="trigger-bar" />
              <span className="trigger-bar" />
            </div>
            <Breadcrumb items={breadcrumbItems} className="app-breadcrumb" />
          </div>
          <div className="header-right">
            <span className="header-tag">设备运维管理中心</span>
          </div>
        </Header>
        <Content className="app-content">
          <div className="content-wrapper">
            <Routes>
              <Route path="/" element={<MonitorPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/report" element={<ReportPage />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;