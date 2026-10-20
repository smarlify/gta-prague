const DEFAULTS = {
  checkout: 'https://europe-west1-smarlify-api.cloudfunctions.net/createBillboardCheckout',
  confirm: 'https://europe-west1-smarlify-api.cloudfunctions.net/confirmBillboardCheckout',
  account: 'https://europe-west1-smarlify-api.cloudfunctions.net/settleBillboardAccount',
  creatives: 'https://europe-west1-smarlify-api.cloudfunctions.net/listBillboardCreatives',
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
  };
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
