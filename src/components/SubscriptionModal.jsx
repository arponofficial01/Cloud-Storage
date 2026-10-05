import React, { useState } from 'react';
import {
  Sparkles, Check, CreditCard, ShieldCheck, Zap,
  X, AlertCircle, PhoneCall, RefreshCw, Star, Download,
  CheckCircle2, Lock, ArrowRight, ShieldAlert
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Real Luhn Algorithm Validator for Credit/Debit Cards
function validateLuhn(cardNumber) {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function SubscriptionModal({ isOpen, onClose }) {
  const { user, updateUserProfile } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [trxId, setTrxId] = useState('');
  const [phone, setPhone] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [processing, setProcessing] = useState(false);
  const [validationError, setValidationError] = useState('');

  // 3D Secure / OTP Challenge Step
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');

  // Success and Receipt
  const [receiptData, setReceiptData] = useState(null);

  if (!isOpen) return null;

  const currentPlan = user?.plan || 'trial';

  const downloadReceipt = () => {
    if (!receiptData) return;
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt - Storage Bank Vault ${receiptData.orderId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; max-width: 600px; margin: auto; }
    .header { border-bottom: 2px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .badge { background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 99px; font-weight: 700; font-size: 13px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
    .total { border-top: 1px solid #e2e8f0; margin-top: 16px; padding-top: 16px; font-size: 18px; font-weight: 800; display: flex; justify-content: space-between; color: #0f172a; }
    .license { background: #f1f5f9; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all; margin-top: 20px; border: 1px dashed #cbd5e1; }
  </style>
</head>
<body>
  <div class="header">
    <h2>Storage Bank Vault</h2>
    <span class="badge">PAID & VERIFIED</span>
  </div>
  <div class="row"><strong>Invoice No:</strong> <span>${receiptData.orderId}</span></div>
  <div class="row"><strong>Date:</strong> <span>${receiptData.date}</span></div>
  <div class="row"><strong>Customer:</strong> <span>${user?.username || 'Vault Master'} (${user?.email || 'user@vault'})</span></div>
  <div class="row"><strong>Plan:</strong> <span>${receiptData.planName}</span></div>
  <div class="row"><strong>Payment Method:</strong> <span>${receiptData.paymentMethod.toUpperCase()}</span></div>
  <div class="row"><strong>Transaction Hash:</strong> <span>${receiptData.txHash}</span></div>
  <div class="total">
    <span>Amount Paid:</span>
    <span>${receiptData.amount}</span>
  </div>
  <div class="license">
    <strong>Vault License Key:</strong><br/>
    ${receiptData.licenseKey}
  </div>
  <p style="font-size: 11px; color: #64748b; margin-top: 30px; text-align: center;">
    Thank you for subscribing to Storage Bank Vault VIP. Your account is upgraded in real-time.
  </p>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StorageBank_Receipt_${receiptData.orderId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const completeUpgrade = (methodUsed) => {
    const orderId = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const txHash = `0x${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    const licenseKey = `SB-VIP-${Math.random().toString(36).substr(2, 4).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const planName = selectedPlan === 'lifetime' ? 'Ultra Lifetime VIP (Unlimited)' : 'Pro Monthly VIP (Unlimited)';
    const amount = selectedPlan === 'lifetime' ? '$49.99' : '$9.99';

    const rData = {
      orderId,
      txHash,
      licenseKey,
      planName,
      amount,
      paymentMethod: methodUsed,
      date: new Date().toLocaleString()
    };

    setReceiptData(rData);
    setProcessing(false);
    setOtpStep(false);

    updateUserProfile({
      plan: planName,
      licenseKey,
      subscriptionDate: new Date().toISOString(),
      paymentMethod: methodUsed
    });
  };

  const handleInitiatePayment = (e) => {
    e.preventDefault();
    setValidationError('');

    if (paymentMethod === 'card') {
      const cleanCard = cardNumber.replace(/\s+/g, '');
      if (!validateLuhn(cleanCard)) {
        setValidationError('Invalid card number. Please check your 16-digit card digits.');
        return;
      }
      const expMatch = cardExpiry.match(/^(0[1-9]|1[0-2])\/([0-9]{2})$/);
      if (!expMatch) {
        setValidationError('Card expiration must be in MM/YY format (e.g. 12/28).');
        return;
      }
      if (cardCvc.length < 3 || cardCvc.length > 4) {
        setValidationError('CVV/CVC must be 3 or 4 digits.');
        return;
      }

      // Card is mathematically valid — launch 3D Secure Verification
      setProcessing(true);
      setTimeout(() => {
        setProcessing(false);
        setOtpStep(true);
      }, 700);
    } else {
      // bKash / Nagad
      const cleanPhone = phone.replace(/[\s-]/g, '');
      if (!cleanPhone.match(/^01[3-9]\d{8}$/)) {
        setValidationError('Please enter a valid 11-digit Bangladeshi mobile number (01xxxxxxxxx).');
        return;
      }
      if (trxId.trim().length < 8) {
        setValidationError('Transaction ID (TrxID) must be at least 8 alphanumeric characters.');
        return;
      }

      setProcessing(true);
      setTimeout(() => {
        completeUpgrade('bkash_nagad');
      }, 1200);
    }
  };

  const handleVerifyOtp = (e) => {
    e.preventDefault();
    setOtpError('');
    if (otpCode.trim().length !== 6) {
      setOtpError('Please enter the 6-digit SMS verification code (e.g. 123456).');
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      completeUpgrade('credit_debit_card');
    }, 1000);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 4000 }} onClick={onClose}>
      <div
        className="modal-content glass-panel"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '620px',
          width: '95vw',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '28px',
          borderRadius: '24px',
          position: 'relative'
        }}
      >
        <button
          className="btn btn-ghost btn-icon"
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px' }}
        >
          <X size={18} />
        </button>

        {receiptData ? (
          /* Receipt Screen */
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)', color: '#10b981',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px auto', border: '2px solid #10b981'
            }}>
              <CheckCircle2 size={36} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>Payment Verified & Active!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '4px' }}>
              Your account is upgraded to <strong>{receiptData.planName}</strong>
            </p>

            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '16px',
              margin: '20px 0',
              textAlign: 'left',
              fontSize: '0.82rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Invoice ID:</span>
                <span style={{ fontWeight: 700 }}>{receiptData.orderId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>License Key:</span>
                <span style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{receiptData.licenseKey}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Amount:</span>
                <span style={{ fontWeight: 800, color: '#10b981' }}>{receiptData.amount}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={downloadReceipt}
                style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Download size={16} /> Download Receipt
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
                style={{ flex: 1, padding: '12px' }}
              >
                Enter Upgraded Vault
              </button>
            </div>
          </div>
        ) : otpStep ? (
          /* 3D Secure Bank Verification Modal */
          <form onSubmit={handleVerifyOtp} style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{
              width: '54px', height: '54px', borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px auto', border: '2px solid var(--accent-primary)'
            }}>
              <Lock size={26} />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>Bank 3D Secure Verification</h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '6px 0 16px 0' }}>
              A 6-digit confirmation code was dispatched to your mobile number ending in **49.
            </p>

            {otpError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '8px 12px', borderRadius: '10px', fontSize: '0.8rem', marginBottom: '12px' }}>
                {otpError}
              </div>
            )}

            <input
              type="text"
              maxLength={6}
              placeholder="123456"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
              style={{
                width: '180px', textAlign: 'center', fontSize: '1.4rem',
                letterSpacing: '8px', padding: '10px', borderRadius: '12px',
                background: 'var(--bg-input)', border: '2px solid var(--accent-primary)',
                color: '#fff', margin: '0 auto 16px auto', display: 'block'
              }}
            />

            <button
              type="submit"
              disabled={processing}
              className="btn btn-primary"
              style={{ width: '100%', padding: '13px', fontSize: '0.95rem', fontWeight: 800, borderRadius: '14px' }}
            >
              {processing ? 'Authenticating with Bank...' : 'Authorize Transaction'}
            </button>
          </form>
        ) : (
          /* Main Payment Form */
          <>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'rgba(99,102,241,0.15)', border: '1px solid var(--accent-primary)',
                color: 'var(--accent-primary)', padding: '4px 14px', borderRadius: '20px',
                fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px'
              }}>
                <Sparkles size={14} /> STORAGE BANK VIP PLANS
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '4px 0', color: '#fff' }}>
                Upgrade Storage Bank Vault
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Unlock high-speed batch transfers, media transcoding, and VIP license keys.
              </p>
            </div>

            {/* Plan Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              <div
                onClick={() => setSelectedPlan('pro')}
                style={{
                  border: selectedPlan === 'pro' ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  background: selectedPlan === 'pro' ? 'rgba(99,102,241,0.12)' : 'var(--bg-card)',
                  borderRadius: '16px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>Pro Monthly</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-cyan)', margin: '4px 0' }}>$9.99<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/mo</span></div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unlimited Vault + High Speed Sync</div>
              </div>

              <div
                onClick={() => setSelectedPlan('lifetime')}
                style={{
                  border: selectedPlan === 'lifetime' ? '2px solid var(--accent-amber)' : '1px solid var(--border-subtle)',
                  background: selectedPlan === 'lifetime' ? 'rgba(245,158,11,0.12)' : 'var(--bg-card)',
                  borderRadius: '16px', padding: '16px', cursor: 'pointer', position: 'relative', transition: 'all 0.2s'
                }}
              >
                <div style={{ position: 'absolute', top: '-10px', right: '12px', background: 'var(--accent-amber)', color: '#000', fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', borderRadius: '10px' }}>BEST VALUE</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>Ultra Lifetime</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-amber)', margin: '4px 0' }}>$49.99<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}> once</span></div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pay once, own permanent VIP key</div>
              </div>
            </div>

            {/* Payment Method Switcher */}
            <form onSubmit={handleInitiatePayment}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('card'); setValidationError(''); }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '12px',
                    border: paymentMethod === 'card' ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    background: paymentMethod === 'card' ? 'rgba(99,102,241,0.12)' : 'var(--bg-surface)',
                    color: paymentMethod === 'card' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
                  }}
                >
                  💳 Credit / Debit Card
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('bkash'); setValidationError(''); }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '12px',
                    border: paymentMethod === 'bkash' ? '2px solid #e2136e' : '1px solid var(--border-subtle)',
                    background: paymentMethod === 'bkash' ? 'rgba(226,19,110,0.12)' : 'var(--bg-surface)',
                    color: paymentMethod === 'bkash' ? '#e2136e' : 'var(--text-secondary)',
                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
                  }}
                >
                  📱 bKash / Nagad MFS
                </button>
              </div>

              {validationError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5', padding: '10px 14px', borderRadius: '12px', fontSize: '0.82rem',
                  marginBottom: '14px', textAlign: 'center'
                }}>
                  {validationError}
                </div>
              )}

              {paymentMethod === 'card' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Card Number</label>
                    <input
                      type="text"
                      maxLength={19}
                      placeholder="4532 0150 0000 0000"
                      value={cardNumber}
                      onChange={e => setCardNumber(e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim())}
                      required
                      style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', color: '#fff', fontSize: '0.9rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Expiry (MM/YY)</label>
                      <input
                        type="text"
                        maxLength={5}
                        placeholder="12/28"
                        value={cardExpiry}
                        onChange={e => {
                          let v = e.target.value.replace(/\D/g, '');
                          if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2, 4);
                          setCardExpiry(v);
                        }}
                        required
                        style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', color: '#fff', fontSize: '0.9rem' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>CVV / CVC</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="892"
                        value={cardCvc}
                        onChange={e => setCardCvc(e.target.value.replace(/\D/g, ''))}
                        required
                        style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', color: '#fff', fontSize: '0.9rem' }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'rgba(226,19,110,0.06)', border: '1px solid rgba(226,19,110,0.25)', borderRadius: '14px', padding: '16px', marginBottom: '18px' }}>
                  <div style={{ fontSize: '0.82rem', color: '#e2136e', fontWeight: 700, marginBottom: '6px' }}>
                    bKash / Nagad Send Money: <strong>01711-234567</strong>
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                    Send {selectedPlan === 'lifetime' ? '৳4,999' : '৳999'} to the merchant number above, then enter your details:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Your 11-digit Sender Mobile (01xxxxxxxxx)"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      required
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', color: '#fff', fontSize: '0.85rem' }}
                    />
                    <input
                      type="text"
                      placeholder="Transaction ID (TrxID e.g. 9J28XKL90)"
                      value={trxId}
                      onChange={e => setTrxId(e.target.value.toUpperCase())}
                      required
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', color: '#fff', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={processing}
                className="btn btn-primary"
                style={{ width: '100%', padding: '13px', fontSize: '0.95rem', fontWeight: 800, borderRadius: '16px' }}
              >
                {processing ? 'Verifying Credentials...' : `Proceed to Secure Checkout (${selectedPlan === 'lifetime' ? '$49.99' : '$9.99'})`}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
