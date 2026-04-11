import { useState, useEffect, useCallback } from 'react';
import { Button } from '@carbon/react';
import { Locked, Unlocked } from '@carbon/icons-react';
import './PasswordDialog.css';

interface PasswordDialogProps {
  open: boolean;
  mode: 'unlock' | 'protect';
  onClose: () => void;
  onSubmit: (password: string) => void;
}

/** Custom modal for entering a password to unlock or protect a PDF */
export default function PasswordDialog({ open, mode, onClose, onSubmit }: PasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const isProtect = mode === 'protect';
  const passwordsMatch = !isProtect || password === confirmPassword;
  const canSubmit = password.length > 0 && passwordsMatch;

  useEffect(() => {
    if (open) {
      setPassword('');
      setConfirmPassword('');
    }
  }, [open]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit(password);
    setPassword('');
    setConfirmPassword('');
  }, [canSubmit, password, onSubmit]);

  const handleClose = useCallback(() => {
    setPassword('');
    setConfirmPassword('');
    onClose();
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  }, [handleClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit) handleSubmit();
  }, [canSubmit, handleSubmit]);

  if (!open) return null;

  return (
    <div className="password-backdrop" onClick={handleBackdropClick}>
      <div className="password-modal" role="dialog" aria-modal aria-label={isProtect ? 'Protect PDF' : 'Unlock PDF'}>
        <header className="password-header">
          <h2>{isProtect ? 'Protect PDF' : 'Unlock PDF'}</h2>
        </header>

        <div className="password-body">
          <p className="password-hint">
            {isProtect
              ? 'Your PDF will be wrapped in a ZIP file for secure sharing.'
              : 'This PDF is password-protected. Enter the password to open it.'}
          </p>

          <div className="password-field">
            <label htmlFor="pdf-pw">Password</label>
            <input
              id="pdf-pw"
              type="password"
              value={password}
              autoComplete="off"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {isProtect && (
            <div className="password-field">
              <label htmlFor="pdf-pw-confirm">Confirm Password</label>
              <input
                id="pdf-pw-confirm"
                type="password"
                className={confirmPassword.length > 0 && !passwordsMatch ? 'password-invalid' : ''}
                value={confirmPassword}
                autoComplete="off"
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <div className="password-error">Passwords do not match</div>
              )}
            </div>
          )}
        </div>

        <footer className="password-footer">
          <Button kind="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button kind="primary" size="sm" disabled={!canSubmit} onClick={handleSubmit} renderIcon={isProtect ? Locked : Unlocked}>
            {isProtect ? 'Protect' : 'Unlock'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
