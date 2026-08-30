import React, { useState, useEffect } from 'react';
import { Navbar, type TabType } from './components/Navbar';
import { DailyView } from './components/DailyView';
import { ProviderManagement } from './components/ProviderManagement';
import { ReceiptsView } from './components/ReceiptsView';
import { ReportsView } from './components/ReportsView';
import { AuditLogView } from './components/AuditLogView';
import { BackupModal } from './components/Modals/BackupModal';
import { ProviderModal } from './components/Modals/ProviderModal';
import { getTodayKolkata, getNowKolkataISO } from './services/dateService';
import { checkAndSeedDatabase } from './services/seedData';
import { db, generateId, requestPersistentStorage, verifyAndRecoverDatabase, syncRedundancySnapshot } from './services/db';
import { logAuditEntry } from './services/auditService';
import type { Provider } from './types';
import './styles/index.css';
import './styles/components.css';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('TODAY');
  const [currentDate, setCurrentDate] = useState<string>(getTodayKolkata());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);
  const [isQuickAddProviderOpen, setIsQuickAddProviderOpen] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. Request persistent permanent storage from browser OS
        await requestPersistentStorage();

        // 2. Check for self-healing recovery if needed
        await verifyAndRecoverDatabase();

        // 3. Check for starter/demo seeding if completely empty
        await checkAndSeedDatabase();

        // 4. Ensure redundancy snapshot is fresh
        await syncRedundancySnapshot();
      } catch (err) {
        console.error('Database initialization error:', err);
      } finally {
        setIsReady(true);
      }
    };
    initApp();
  }, []);

  const handleQuickAddProvider = async (params: { name: string; phone?: string; defaultRate: number; active: boolean }) => {
    const now = getNowKolkataISO();
    const today = getTodayKolkata();
    const newId = generateId();

    const newProvider: Provider = {
      id: newId,
      name: params.name,
      phone: params.phone,
      active: params.active,
      default_rate: params.defaultRate,
      created_at: now,
      updated_at: now
    };

    await db.providers.add(newProvider);

    await db.provider_rates.add({
      id: generateId(),
      provider_id: newId,
      rate_per_litre: params.defaultRate,
      effective_from: today,
      effective_to: null,
      created_at: now
    });

    await logAuditEntry({
      entity_type: 'PROVIDER',
      entity_id: newId,
      action: 'CREATE',
      old_value: null,
      new_value: newProvider,
      reason: `Added provider ${params.name} with rate ₹${params.defaultRate}/L`
    });

    await syncRedundancySnapshot();
    setIsQuickAddProviderOpen(false);
  };

  if (!isReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '3.5rem' }}>🥛</div>
        <h2 style={{ color: '#1b4332', fontWeight: 800, fontSize: '1.5rem' }}>Rajhans Dairy (राजहंस डेअरी)</h2>
        <p style={{ color: '#64748b' }}>Securing database & records...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenBackup={() => setIsBackupModalOpen(true)}
      />

      <main className="page-content">
        {activeTab === 'TODAY' && (
          <DailyView
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            searchFilter={searchQuery}
            onOpenAddProvider={() => setIsQuickAddProviderOpen(true)}
          />
        )}

        {activeTab === 'PROVIDERS' && (
          <ProviderManagement searchFilter={searchQuery} />
        )}

        {activeTab === 'RECEIPTS' && (
          <ReceiptsView searchFilter={searchQuery} />
        )}

        {activeTab === 'REPORTS' && (
          <ReportsView searchFilter={searchQuery} />
        )}

        {activeTab === 'AUDIT' && (
          <AuditLogView searchFilter={searchQuery} />
        )}
      </main>

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onRestored={() => window.location.reload()}
      />

      <ProviderModal
        isOpen={isQuickAddProviderOpen}
        onClose={() => setIsQuickAddProviderOpen(false)}
        onSubmit={handleQuickAddProvider}
      />
    </div>
  );
};

export default App;
