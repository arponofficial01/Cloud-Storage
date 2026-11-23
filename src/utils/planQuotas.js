/**
 * Unified Storage Quota & Subscription Tier Management for StorageBank
 * Priced in BDT (৳) with bKash payment verification.
 * Every user receives 512 GB free storage with full AES-256 client encryption.
 * Upgrades expand storage to 2 TB (Pro) or 10 TB (Ultra).
 */

export const BKASH_MERCHANT_NUMBER = '01711-284930';

export const STORAGE_PLANS = {
  FREE: {
    id: 'free',
    name: 'Free Vault',
    displayName: 'Free Tier (512 GB)',
    quotaGB: 512,
    quotaBytes: 512 * 1024 * 1024 * 1024,
    price: '৳0 / Forever',
    priceBDT: 0,
    badge: 'DEFAULT',
    features: [
      '512 GB Vault Storage Included',
      'Client-Side AES-256-GCM Encryption',
      'High-Speed Cloud Vault Sync',
      'Instant Document, PDF & Video Studio',
      'Full Drag & Drop and Category Folders',
      'Windows Desktop Cloud Drive Mount'
    ]
  },
  PRO: {
    id: 'pro',
    name: 'Pro Vault',
    displayName: 'Pro Tier (2 TB)',
    quotaGB: 2048,
    quotaBytes: 2 * 1024 * 1024 * 1024 * 1024,
    price: '৳199 / Month',
    priceBDT: 199,
    badge: 'POPULAR',
    features: [
      '2 TB High-Speed Cloud Vault Storage',
      'Multi-Device Cloud & PC Drive Sync',
      'Gemini AI Vault Copilot Assistant',
      'Priority Batch Format Conversion',
      'Unlimited Version History & Recovery',
      '4K Video & Lossless Audio Streaming'
    ]
  },
  ULTRA: {
    id: 'ultra',
    name: 'Ultra Vault',
    displayName: 'Ultra Tier (10 TB)',
    quotaGB: 10240,
    quotaBytes: 10 * 1024 * 1024 * 1024 * 1024,
    price: '৳499 / Month',
    priceBDT: 499,
    badge: 'MAXIMUM',
    features: [
      '10 TB Enterprise-Grade Cloud Storage',
      'Zero-Knowledge End-to-End Encryption',
      'Dedicated High-Bandwidth CDN Stream',
      'Multi-Drive Windows Explorer Mounts',
      '24/7 Priority Support & Audit Logs',
      'Full PDF, Word & Media Production Suite'
    ]
  }
};

export function getPlanQuota(planName) {
  if (!planName) return STORAGE_PLANS.FREE;
  const p = String(planName).toLowerCase();
  if (p.includes('ultra') || p.includes('10 tb') || p.includes('enterprise')) {
    return STORAGE_PLANS.ULTRA;
  }
  if (p.includes('pro') || p.includes('2 tb') || p.includes('lifetime')) {
    return STORAGE_PLANS.PRO;
  }
  return STORAGE_PLANS.FREE;
}

export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
