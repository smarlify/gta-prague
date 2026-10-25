// Auth actions for the advertiser page. The page passes a stub in tests
// and the billboards Firebase app in the browser.

export function advertiserIsSignedIn(user) {
  return !!(user && user.isAnonymous !== true);
}

export function advertiserAccess(signedIn) {
  return {
    signedOutHidden: signedIn,
    paymentHidden: !signedIn,
    accountHidden: !signedIn,
  };
}

export function applyAdvertiserAccess(root, user) {
  const access = advertiserAccess(advertiserIsSignedIn(user));
  const signedOut = root.querySelector('#ads-signed-out');
  const payment = root.querySelector('#board-payment');
  const account = root.querySelector('#ads-account');
  if (signedOut) signedOut.hidden = access.signedOutHidden;
  if (payment) payment.hidden = access.paymentHidden;
  if (account) account.hidden = access.accountHidden;
  return access;
}

export async function submitAdvertiserAuth(mode, email, password, auth) {
  const address = String(email || '').trim();
  const secret = String(password || '');
  if (!address || !secret) throw new Error('Enter an email and a password.');
  if (secret.length < 6) throw new Error('Use a password of at least 6 characters.');
  switch (mode) {
    case 'create':
      return auth.create(address, secret);
    case 'sign-in':
      return auth.signIn(address, secret);
    default: {
      const unknown = mode;
      throw new Error(`Unknown advertiser auth mode: ${String(unknown)}`);
    }
  }
}
