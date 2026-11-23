import React, { useState } from 'react';
import {
  ShieldCheck,
  X,
  Check,
  HardDrive,
  Lock,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Smartphone,
  Copy
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStorage } from '../context/StorageContext';
import { STORAGE_PLANS, BKASH_MERCHANT_NUMBER, getPlanQuota, formatBytes } from '../utils/planQuotas';

export function SubscriptionModal({ isOpen, onClose }) {
  const { user, updateUserProfile } = useAuth();
  const { storageStats, addToast } = useStorage();

  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [senderBkash, setSenderBkash] = useState('');
  const [trxId, setTrxId] = useState('');
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [formError, setFormError] = useState('');

  if (!isOpen) return null;

  const currentPlanObj = getPlanQuota(user?.plan);
  const usedBytes = storageStats?.totalBytes || 0;
  const quotaBytes = currentPlanObj.quotaBytes;
  const usagePercent = Math.min(100, Math.max(0.01, (usedBytes / quotaBytes) * 100)).toFixed(2);

  const handleDowngradeToFree = async () => {
    const res = await updateUserProfile({ plan: STORAGE_PLANS.FREE.displayName });
    if (res.success) {
      if (addToast) addToast('Storage plan set to Free Tier (512 GB).', 'info');
    }
  };

  const handleStartCheckout = (targetPlan) => {
    setCheckoutPlan(targetPlan);
    setSenderBkash('');
    setTrxId('');
    setFormError('');
    setPaymentSuccess(false);
  };

  const handleCopyBkash = () => {
    navigator.clipboard.writeText(BKASH_MERCHANT_NUMBER.replace(/-/g, ''));
    setCopiedNumber(true);
    if (addToast) addToast('Copied bKash number to clipboard', 'info');
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleProcessBkashPayment = async (e) => {
    e.preventDefault();
    if (!checkoutPlan) return;

    const cleanPhone = senderBkash.replace(/\D/g, '');
    if (cleanPhone.length < 11) {
      setFormError('Please enter a valid 11-digit bKash mobile number (e.g. 017XXXXXXXX).');
      return;
    }
    if (trxId.trim().length < 6) {
      setFormError('Please enter a valid bKash Transaction ID (TrxID).');
      return;
    }

    setFormError('');
    setIsProcessing(true);
    await new Promise(r => setTimeout(r, 850));

    try {
      const txRaw = localStorage.getItem('storagebank_bkash_transactions');
      const txList = txRaw ? JSON.parse(txRaw) : [];
      txList.unshift({
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: user?.id || 'local',
        userName: user?.username || 'Vault User',
        userEmail: user?.email || 'user@storagebank.vault',
        plan: checkoutPlan.displayName,
        amount: checkoutPlan.priceLabel,
        senderBkash: cleanPhone,
        trxId: trxId.trim().toUpperCase(),
        status: 'pending',
        timestamp: new Date().toISOString()
      });
      localStorage.setItem('storagebank_bkash_transactions', JSON.stringify(txList.slice(0, 50)));
    } catch {}

    setIsProcessing(false);
    setPaymentSuccess(true);
    if (addToast) {
      addToast(`bKash TrxID ${trxId.toUpperCase()} submitted for Admin verification.`, 'info');
    }
    setTimeout(() => {
      setCheckoutPlan(null);
      setPaymentSuccess(false);
    }, 2400);
  };

  const planList = [STORAGE_PLANS.FREE, STORAGE_PLANS.PRO, STORAGE_PLANS.ULTRA];

  return (
    <div className="modal-overlay" style={{ zIndex: 4000 }} onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: checkoutPlan ? '500px' : '780px',
          width: '95vw',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '24px',
          borderRadius: '12px',
          position: 'relative',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-subtle)',
          transition: 'all 0.2s ease'
        }}
      >
        <button
          className="btn btn-ghost btn-icon"
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', padding: '4px' }}
        >
          <X size={16} />
        </button>

        {/* ── BKASH CHECKOUT PAYMENT VIEW ──────────────────────────────── */}
        {checkoutPlan ? (
          <div>
            <button
              className="btn btn-ghost"
              onClick={() => { setCheckoutPlan(null); setPaymentSuccess(false); }}
              style={{ padding: '4px 8px', fontSize: '0.78rem', gap: '6px', marginBottom: '14px', borderRadius: '6px' }}
            >
              <ArrowLeft size={13} />
              <span>Back to Plans</span>
            </button>

            {/* bKash Header Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '10px',
              background: 'rgba(226, 19, 110, 0.1)',
              border: '1px solid rgba(226, 19, 110, 0.3)',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '9px',
                  background: '#e2136e',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  flexShrink: 0
                }}>
                  bKash
                </div>
                <div>
                  <h3 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    bKash Payment &bull; {checkoutPlan.name}
                  </h3>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                    {checkoutPlan.quotaGB >= 1024 ? `${checkoutPlan.quotaGB / 1024} TB` : `${checkoutPlan.quotaGB} GB`} Cloud Storage &bull; <strong>{checkoutPlan.price}</strong>
                  </p>
                </div>
              </div>
              <span style={{
                fontSize: '0.88rem',
                fontWeight: 800,
                color: '#f472b6',
                background: 'var(--bg-surface)',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(226, 19, 110, 0.3)'
              }}>
                ৳{checkoutPlan.priceBDT}
              </span>
            </div>

            {paymentSuccess ? (
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '24px',
                borderRadius: '9px',
                textAlign: 'center',
                color: 'var(--accent-emerald)'
              }}>
                <CheckCircle2 size={36} style={{ margin: '0 auto 10px auto', display: 'block' }} />
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>bKash TrxID Submitted for Verification</h4>
                <p style={{ fontSize: '0.82rem', margin: '6px 0 0 0', opacity: 0.9 }}>
                  TrxID <strong>{trxId.toUpperCase()}</strong> has been queued for Admin approval. Your quota will upgrade to {checkoutPlan.displayName} upon verification.
                </p>
              </div>
            ) : (
              <form onSubmit={handleProcessBkashPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* bKash Number Card */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '9px',
                  padding: '14px'
                }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                    STEP 1: SEND MONEY / PAYMENT TO BKASH NUMBER
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Smartphone size={16} color="#e2136e" />
                      <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.03em', fontFamily: 'monospace' }}>
                        {BKASH_MERCHANT_NUMBER}
                      </span>
                      <span style={{
                        fontSize: '0.66rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(226, 19, 110, 0.12)',
                        color: '#f472b6',
                        fontWeight: 600
                      }}>
                        Personal / Payment
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCopyBkash}
                      style={{ padding: '5px 10px', fontSize: '0.74rem', borderRadius: '6px', gap: '5px' }}
                    >
                      {copiedNumber ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                      <span>{copiedNumber ? 'Copied' : 'Copy Number'}</span>
                    </button>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
                    Open your <strong>bKash App</strong> or dial <strong>*247#</strong> &rarr; Send <strong>৳{checkoutPlan.priceBDT} BDT</strong> to <strong>{BKASH_MERCHANT_NUMBER}</strong> &rarr; Enter your bKash number and Transaction ID below.
                  </div>
                </div>

                {formError && (
                  <div style={{
                    padding: '9px 12px',
                    borderRadius: '7px',
                    background: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.25)',
                    color: 'var(--accent-rose)',
                    fontSize: '0.78rem'
                  }}>
                    {formError}
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>
                    YOUR BKASH ACCOUNT NUMBER
                  </label>
                  <input
                    type="tel"
                    className="input-text"
                    placeholder="e.g. 017XXXXXXXX"
                    value={senderBkash}
                    onChange={e => setSenderBkash(e.target.value)}
                    required
                    style={{ width: '100%', padding: '9px 12px', fontSize: '0.86rem', borderRadius: '7px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>
                    BKASH TRANSACTION ID (TrxID)
                  </label>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="e.g. BKS94M2X7Q"
                    value={trxId}
                    onChange={e => setTrxId(e.target.value.toUpperCase())}
                    required
                    style={{ width: '100%', padding: '9px 12px', fontSize: '0.86rem', borderRadius: '7px', fontFamily: 'monospace', letterSpacing: '0.05em' }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isProcessing}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    borderRadius: '7px',
                    marginTop: '4px',
                    justifyContent: 'center',
                    gap: '6px',
                    background: '#e2136e',
                    borderColor: 'rgba(255,255,255,0.18)'
                  }}
                >
                  {isProcessing ? (
                    <><Loader2 size={16} className="spin" /> <span>Verifying bKash TrxID...</span></>
                  ) : (
                    <><Lock size={14} /> <span>Verify ৳{checkoutPlan.priceBDT} bKash Payment &amp; Activate</span></>
                  )}
                </button>
              </form>
            )}
          </div>
        ) : (
          /* ── TIERS OVERVIEW ────────────────────────────────────────── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '9px',
                background: 'var(--bg-surface)', color: 'var(--accent-primary)',
                border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <HardDrive size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Storage Quotas &amp; Subscription Plans (BDT)
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  All accounts include 512 GB free storage. Upgrade anytime via instant bKash payment.
                </p>
              </div>
            </div>

            {/* Active Storage Quota Bar */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '9px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Active Vault Storage Usage
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatBytes(usedBytes)} of {formatBytes(quotaBytes)} used ({usagePercent}%)
                </span>
              </div>
              <div style={{
                height: '7px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.max(1, usagePercent)}%`,
                  borderRadius: '999px',
                  background: 'var(--accent-primary)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.74rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '8px' }}>
                <span>Active Tier: <strong style={{ color: 'var(--text-primary)' }}>{currentPlanObj.displayName}</strong></span>
                <span>bKash Merchant / Payment: <strong style={{ color: '#f472b6', fontFamily: 'monospace' }}>{BKASH_MERCHANT_NUMBER}</strong></span>
                <span>Files Stored: <strong style={{ color: 'var(--text-primary)' }}>{storageStats?.totalFiles || 0}</strong></span>
              </div>
            </div>

            {/* 3 Tier Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              {planList.map(plan => {
                const isActive = currentPlanObj.id === plan.id;
                const isFree = plan.id === 'free';

                return (
                  <div
                    key={plan.id}
                    style={{
                      background: isActive ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
                      border: isActive ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {plan.name}
                        </span>
                        <span style={{
                          fontSize: '0.62rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: isActive ? 'var(--accent-primary)' : 'var(--bg-input)',
                          color: isActive ? '#ffffff' : 'var(--text-muted)',
                          border: '1px solid var(--border-subtle)',
                          fontWeight: 700
                        }}>
                          {plan.badge}
                        </span>
                      </div>

                      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px' }}>
                        {plan.quotaGB >= 1024 ? `${plan.quotaGB / 1024} TB` : `${plan.quotaGB} GB`}
                      </div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isFree ? 'var(--accent-emerald)' : '#f472b6', marginBottom: '14px' }}>
                        {plan.price}
                      </div>

                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        {plan.features.map((feat, fIdx) => (
                          <li key={fIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', lineHeight: 1.35 }}>
                            <Check size={13} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {isActive ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled
                        style={{
                          marginTop: '16px',
                          width: '100%',
                          fontSize: '0.8rem',
                          padding: '8px',
                          justifyContent: 'center',
                          fontWeight: 600,
                          opacity: 0.8
                        }}
                      >
                        Active Plan
                      </button>
                    ) : isFree ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleDowngradeToFree}
                        style={{
                          marginTop: '16px',
                          width: '100%',
                          fontSize: '0.8rem',
                          padding: '8px',
                          justifyContent: 'center',
                          fontWeight: 600
                        }}
                      >
                        Switch to Free (512 GB)
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleStartCheckout(plan)}
                        style={{
                          marginTop: '16px',
                          width: '100%',
                          fontSize: '0.8rem',
                          padding: '8px',
                          justifyContent: 'center',
                          fontWeight: 600,
                          gap: '6px',
                          background: '#e2136e',
                          borderColor: 'rgba(255,255,255,0.16)'
                        }}
                      >
                        <Smartphone size={13} />
                        <span>Pay with bKash ({plan.price.split(' ')[0]})</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-subtle)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} color="var(--accent-emerald)" />
                <span>Free Tier (512 GB) is active by default. Pro (৳199/mo) &amp; Ultra (৳499/mo) activate via bKash verification.</span>
              </div>
              <span style={{ color: '#f472b6', fontWeight: 600 }}>bKash: {BKASH_MERCHANT_NUMBER}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
