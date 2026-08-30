import React, { useState, useEffect } from 'react';
import { X, Download, Upload, Database, Check, ShieldCheck, RefreshCw, Trash2 } from 'lucide-react';
import { exportDatabaseBackup, restoreDatabaseBackup, resetDatabaseAll, requestPersistentStorage } from '../../services/db';
import { populateDemoData } from '../../services/seedData';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => void;
  onAddProviderClick?: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onRestored
}) => {
  const [status, setStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPersistent, setIsPersistent] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      requestPersistentStorage().then(setIsPersistent);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setIsProcessing(true);
      const jsonStr = await exportDatabaseBackup();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `rajhans_dairy_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('Backup downloaded successfully! (बॅकअप फाइल डाउनलोड झाली)');
    } catch (err) {
      alert('Failed to export backup.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Restoring will replace current dairy database with the backup file. Are you sure?')) {
      return;
    }

    try {
      setIsProcessing(true);
      const text = await file.text();
      await restoreDatabaseBackup(text);
      setStatus('Database restored successfully! (डेटा पुनर्संचयित झाला)');
      setTimeout(() => {
        onRestored();
        onClose();
      }, 1000);
    } catch (err) {
      alert('Invalid backup file. Could not restore database.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetFresh = async () => {
    if (!confirm('Are you sure you want to CLEAR ALL records to start a completely fresh dairy? You can add your own providers manually.')) {
      return;
    }
    try {
      setIsProcessing(true);
      await resetDatabaseAll();
      setStatus('All data cleared. You can now add your own providers! (नवीन डेअरी सुरु झाली)');
      setTimeout(() => {
        onRestored();
        onClose();
      }, 1000);
    } catch (err) {
      alert('Failed to reset database.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadDemo = async () => {
    if (!confirm('Load sample demo providers and milk records for demonstration?')) {
      return;
    }
    try {
      setIsProcessing(true);
      await populateDemoData();
      setStatus('Demo sample data loaded! (डेमो डेटा लोड झाला)');
      setTimeout(() => {
        onRestored();
        onClose();
      }, 1000);
    } catch (err) {
      alert('Failed to load demo data.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Database size={22} color="#1b4332" />
            <h3 className="modal-title">Data Storage & Safety (डेटा सुरक्षा)</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Storage Security Status */}
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShieldCheck size={24} color="#16a34a" />
            <div>
              <div style={{ fontWeight: 800, color: '#14532d', fontSize: '0.95rem' }}>
                {isPersistent ? '100% Offline & Persistent Local Storage' : 'Secured on this Device'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#166534' }}>
                All milk entries, rates, and payments are automatically saved to your device database immediately.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
            {/* Download Backup */}
            <div style={{ padding: '0.9rem', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }}>
              <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Download Backup File</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.6rem' }}>
                Save all records as a JSON file to your phone storage or computer.
              </div>
              <button className="btn-primary" style={{ width: '100%' }} onClick={handleExport} disabled={isProcessing}>
                <Download size={18} /> Export & Download Backup
              </button>
            </div>

            {/* Restore from Backup */}
            <div style={{ padding: '0.9rem', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }}>
              <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: '0.2rem' }}>Restore from Backup</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.6rem' }}>
                Restore records from a previously downloaded JSON file.
              </div>
              <label className="btn-secondary" style={{ width: '100%', cursor: 'pointer' }}>
                <Upload size={18} /> Choose Backup File (.json)
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={handleImport}
                  disabled={isProcessing}
                />
              </label>
            </div>

            {/* Dairy Setup Tools */}
            <div style={{ padding: '0.9rem', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#f8fafc' }}>
              <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>Dairy Reset & Demo Tools</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '0.85rem', color: '#b91c1c', borderColor: '#fca5a5', background: '#fff' }}
                  onClick={handleResetFresh}
                  disabled={isProcessing}
                >
                  <Trash2 size={16} color="#dc2626" />
                  <span>Start Fresh (रिकामी डेअरी)</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '0.85rem', color: '#1b4332', background: '#fff' }}
                  onClick={handleLoadDemo}
                  disabled={isProcessing}
                >
                  <RefreshCw size={16} />
                  <span>Load Demo Data</span>
                </button>
              </div>
            </div>
          </div>

          {status && (
            <div style={{ background: '#dcfce7', color: '#166534', padding: '0.75rem', borderRadius: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              <Check size={18} /> {status}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" style={{ width: '100%' }} onClick={onClose}>
            Close (बंद करा)
          </button>
        </div>
      </div>
    </div>
  );
};
