import { memo } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { Users, Megaphone, BarChart3, Settings, MessageSquare, RefreshCw, LayoutGrid, Upload } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Campaigns from './pages/Campaigns';
import CampaignDetail from './pages/CampaignDetail';
import AISettings from './pages/AISettings';
import Inbox from './pages/Inbox';
import FollowUp from './pages/FollowUp';
import Kanban from './pages/Kanban';
import SettingsPage from './pages/Settings';
import ImportPage from './pages/Import';
import CampaignBuilder from './pages/CampaignBuilder';

import { ErrorBoundary } from './components/ErrorBoundary';
import { inboxApi, followUpApi, type Lead } from './api/client';
import { usePollingInterval } from './hooks/usePageVisible';
import './App.css';

// Badge de follow-ups pendentes
const FollowUpNavItem = memo(function FollowUpNavItem() {
  const poll = usePollingInterval(30_000);
  const { data: stats } = useQuery({
    queryKey: ['follow-up-stats'],
    queryFn: () => followUpApi.stats().then((r) => r.data),
    refetchInterval: poll,
    staleTime: 20_000,
  });
  const pendingNow = stats?.pendingNow ?? 0;

  return (
    <NavLink to="/follow-up" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
      <RefreshCw size={18} />
      <span>Follow-up</span>
      {pendingNow > 0 && (
        <span style={{ marginLeft: 'auto', background: 'var(--warning)', color: 'white', borderRadius: 999, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
          {pendingNow}
        </span>
      )}
    </NavLink>
  );
});
const InboxNavItem = memo(function InboxNavItem() {
  const poll = usePollingInterval(15_000); // 15s é suficiente para o badge

  const { data: leads = [] } = useQuery({
    queryKey: ['inbox-unread'],
    queryFn: () => inboxApi.list({ unreadOnly: true }).then((r) => r.data),
    refetchInterval: poll,
    staleTime: 10_000,
  });

  const totalUnread = (leads as Lead[]).reduce((sum, l) => sum + (l.unreadCount || 0), 0);

  return (
    <NavLink to="/inbox" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
      <MessageSquare size={18} />
      <span>Inbox</span>
      {totalUnread > 0 && (
        <span style={{ marginLeft: 'auto', background: 'var(--danger)', color: 'white', borderRadius: 999, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
          {totalUnread}
        </span>
      )}
    </NavLink>
  );
});

import LoginPage from './pages/Login';

export default function App() {
  const token = localStorage.getItem('token');
  const isAuth = !!token;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="*"
        element={
          isAuth ? (
            <div className="app-layout">
              <nav className="sidebar">
                <div className="sidebar-logo">
                  <span className="logo-icon">🏢</span>
                  <span className="logo-text">CRM Imob</span>
                </div>
                <ul className="nav-list">
                  <li>
                    <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                      <BarChart3 size={18} /><span>Dashboard</span>
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/leads" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                      <Users size={18} /><span>Leads</span>
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/import" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                      <Upload size={18} /><span>Importar</span>
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/kanban" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                      <LayoutGrid size={18} /><span>Kanban</span>
                    </NavLink>
                  </li>
                  <li><InboxNavItem /></li>
                  <li>
                    <NavLink to="/campaigns" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                      <Megaphone size={18} /><span>Campanhas</span>
                    </NavLink>
                  </li>
                  <li><FollowUpNavItem /></li>
                  <li>
                    <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                      <Settings size={18} /><span>Configurações</span>
                    </NavLink>
                  </li>
                </ul>
                <div style={{ marginTop: 'auto', padding: '20px' }}>
                  <button 
                    className="btn btn-ghost" 
                    style={{ width: '100%', justifyContent: 'flex-start', color: '#f87171' }}
                    onClick={() => {
                      localStorage.removeItem('token');
                      localStorage.removeItem('user');
                      window.location.href = '/login';
                    }}
                  >
                    Sair
                  </button>
                </div>
              </nav>
              <main className="main-content">
                <ErrorBoundary>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/leads" element={<Leads />} />
                    <Route path="/leads/:id" element={<LeadDetail />} />
                    <Route path="/inbox" element={<Inbox />} />
                    <Route path="/campanhas/nova" element={<CampaignBuilder />} />
                    <Route path="/campanhas/:id/editar" element={<CampaignBuilder />} />
                    <Route path="/campaigns" element={<Campaigns />} />
                    <Route path="/campaigns/:id" element={<CampaignDetail />} />
                    <Route path="/follow-up" element={<FollowUp />} />
                    <Route path="/kanban" element={<Kanban />} />
                    <Route path="/import" element={<ImportPage />} />
                    <Route path="/settings" element={<AISettings />} />
                    <Route path="/settings/general" element={<SettingsPage />} />
                    <Route path="/config" element={<SettingsPage />} />
                  </Routes>
                </ErrorBoundary>
              </main>
            </div>
          ) : (
            <LoginPage />
          )
        }
      />
    </Routes>
  );
}

