import {boardId, httpUrl} from '../firebase/functions/ad-credits.js';

const DEFAULTS = {
  checkout: 'https://europe-west1-smarlify-api.cloudfunctions.net/createBillboardCheckout',
  confirm: 'https://europe-west1-smarlify-api.cloudfunctions.net/confirmBillboardCheckout',
  account: 'https://europe-west1-smarlify-api.cloudfunctions.net/settleBillboardAccount',
  creatives: 'https://europe-west1-smarlify-api.cloudfunctions.net/listBillboardCreatives',
  open: 'https://europe-west1-smarlify-api.cloudfunctions.net/openBillboardVisit',
};

function configured(name, fallback) {
  const env = import.meta.env || {};
  return env[name] || fallback;
}

export function adsEndpoints() {
  return {
    checkout: configured('VITE_ADS_CHECKOUT_URL', DEFAULTS.checkout),
    confirm: configured('VITE_ADS_CONFIRM_URL', DEFAULTS.confirm),
    account: configured('VITE_ADS_ACCOUNT_URL', DEFAULTS.account),
    creatives: configured('VITE_ADS_CREATIVES_URL', DEFAULTS.creatives),
    open: configured('VITE_ADS_OPEN_URL', DEFAULTS.open),
  };
}

// The server debits the board owner's shared pool and returns that board's public URL.
export async function requestBillboardOpen(siteId) {
  const id = boardId(siteId);
  if (!id) return {url: '', status: 400};
  try {
    const response = await fetch(adsEndpoints().open, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({boardId: id}),
    });
    const payload = await response.json().catch(() => ({}));
    return {url: response.ok ? httpUrl(payload?.url) : '', status: response.status};
  } catch {
    return {url: '', status: 0};
  }
}

export async function fetchLiveCreatives() {
  try {
    const response = await fetch(adsEndpoints().creatives);
    if (!response.ok) return [];
    const body = await response.json();
    return Array.isArray(body.creatives) ? body.creatives : [];
  } catch {
    return [];
  }
}
