// Where Checkout may send the browser. The in-game modal must not land on /ads.html.
export function billboardCheckoutUrls({origin, boardId = '', surface = 'page', embedded = false} = {}) {
  const base = String(origin || '').replace(/\/$/, '');
  const board = boardId ? `&board=${encodeURIComponent(boardId)}` : '';
  const session = 'session_id={CHECKOUT_SESSION_ID}';
  if (surface === 'game' || embedded) {
    return {
      returnUrl: `${base}/?checkout=success&${session}${board}`,
      successUrl: `${base}/billboard-checkout-return.html?checkout=success&${session}${board}`,
      cancelUrl: `${base}/billboard-checkout-return.html?checkout=cancel${board}`,
    };
  }
  return {
    returnUrl: `${base}/ads.html?checkout=success&${session}${board}`,
    successUrl: `${base}/ads.html?checkout=success&${session}${board}`,
    cancelUrl: `${base}/ads.html?checkout=cancel${board}`,
  };
}
