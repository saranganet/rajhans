import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AlertTriangle size={24} color={isDangerous ? '#dc2626' : '#d97706'} />
            <h3 className="modal-title">{title}</h3>
          </div>
          <button className="modal-close-btn" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '1.05rem', color: '#334155', lineHeight: '1.5' }}>
            {message}
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={isDangerous ? 'btn-danger' : 'btn-primary'}
            onClick={() => {
              onConfirm();
              onCancel();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
