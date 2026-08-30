import React, { useState } from 'react';
import {
  Calendar,
  Users,
  Receipt,
  BarChart3,
  History,
  Search,
  Database,
  X
} from 'lucide-react';

export type TabType = 'TODAY' | 'PROVIDERS' | 'RECEIPTS' | 'REPORTS' | 'AUDIT';

interface NavbarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenBackup: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onOpenBackup
}) => {
  const [showMobileSearch, setShowMobileSearch] = useState<boolean>(false);

  return (
    <>
      {/* Top Header Bar */}
      <header className="app-topbar">
        <div className="brand-section">
          <div className="brand-logo">🥛</div>
          <div>
            <div className="brand-title">Rajhans Dairy</div>
            <div className="brand-subtitle">राजहंस डेअरी • IST</div>
          </div>
        </div>

        {/* Desktop Top Links */}
        <nav className="desktop-nav-links">
          <button
            className={`desktop-nav-item ${activeTab === 'TODAY' ? 'active' : ''}`}
            onClick={() => onTabChange('TODAY')}
          >
            <Calendar size={18} />
            <span>Today (नोंदवही)</span>
          </button>

          <button
            className={`desktop-nav-item ${activeTab === 'PROVIDERS' ? 'active' : ''}`}
            onClick={() => onTabChange('PROVIDERS')}
          >
            <Users size={18} />
            <span>Providers (उत्पादक)</span>
          </button>

          <button
            className={`desktop-nav-item ${activeTab === 'RECEIPTS' ? 'active' : ''}`}
            onClick={() => onTabChange('RECEIPTS')}
          >
            <Receipt size={18} />
            <span>Receipts (पावत्या)</span>
          </button>

          <button
            className={`desktop-nav-item ${activeTab === 'REPORTS' ? 'active' : ''}`}
            onClick={() => onTabChange('REPORTS')}
          >
            <BarChart3 size={18} />
            <span>Reports (अहवाल)</span>
          </button>

          <button
            className={`desktop-nav-item ${activeTab === 'AUDIT' ? 'active' : ''}`}
            onClick={() => onTabChange('AUDIT')}
          >
            <History size={18} />
            <span>Audit (बदल)</span>
          </button>
        </nav>

        {/* Right Actions */}
        <div className="topbar-right">
          <div className="nav-search-wrap" style={{ display: window.innerWidth < 900 && !showMobileSearch ? 'none' : 'flex', maxWidth: '240px' }}>
            <Search size={16} className="nav-search-icon" />
            <input
              type="text"
              className="nav-search-input"
              style={{ height: '38px', fontSize: '0.9rem' }}
              placeholder="Search provider..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <button
            className="btn-icon-topbar"
            style={{ display: window.innerWidth < 900 ? 'flex' : 'none' }}
            onClick={() => setShowMobileSearch(!showMobileSearch)}
            title="Search"
          >
            {showMobileSearch ? <X size={18} /> : <Search size={18} />}
          </button>

          <button
            className="btn-icon-topbar"
            onClick={onOpenBackup}
            title="Backup Data"
          >
            <Database size={18} />
          </button>
        </div>
      </header>

      {/* Mobile Search Bar Expansion */}
      {showMobileSearch && (
        <div style={{ background: '#ffffff', padding: '0.6rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
          <div className="nav-search-wrap">
            <Search size={16} className="nav-search-icon" />
            <input
              type="text"
              className="nav-search-input"
              placeholder="Search provider name or phone..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Mobile Sticky Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <button
          className={`mobile-nav-item ${activeTab === 'TODAY' ? 'active' : ''}`}
          onClick={() => onTabChange('TODAY')}
        >
          <div className="mobile-nav-icon-wrap">
            <Calendar size={20} />
          </div>
          <span>Today</span>
        </button>

        <button
          className={`mobile-nav-item ${activeTab === 'PROVIDERS' ? 'active' : ''}`}
          onClick={() => onTabChange('PROVIDERS')}
        >
          <div className="mobile-nav-icon-wrap">
            <Users size={20} />
          </div>
          <span>Providers</span>
        </button>

        <button
          className={`mobile-nav-item ${activeTab === 'RECEIPTS' ? 'active' : ''}`}
          onClick={() => onTabChange('RECEIPTS')}
        >
          <div className="mobile-nav-icon-wrap">
            <Receipt size={20} />
          </div>
          <span>10-Day</span>
        </button>

        <button
          className={`mobile-nav-item ${activeTab === 'REPORTS' ? 'active' : ''}`}
          onClick={() => onTabChange('REPORTS')}
        >
          <div className="mobile-nav-icon-wrap">
            <BarChart3 size={20} />
          </div>
          <span>Reports</span>
        </button>

        <button
          className={`mobile-nav-item ${activeTab === 'AUDIT' ? 'active' : ''}`}
          onClick={() => onTabChange('AUDIT')}
        >
          <div className="mobile-nav-icon-wrap">
            <History size={20} />
          </div>
          <span>Audit</span>
        </button>
      </nav>
    </>
  );
};
