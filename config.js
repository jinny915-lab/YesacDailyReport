// Paste the Apps Script Web App URL here after deployment (ends with /exec)
https://script.google.com/macros/s/AKfycbxWytDdT6nHcLyqbu6TwtWK9n49t_0xRAVOeYUg_qkt8NNnGAdyXrD18Rlhi0O6e6U/exec
window.YESAC_API_URL = 'PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE';

// Common API call. text/plain avoids a CORS preflight that Apps Script cannot answer.
window.yesacApi = async function (payload) {
  if (!window.YESAC_API_URL || window.YESAC_API_URL.indexOf('PASTE_') === 0) {
    throw new Error('API URL is not set in config.js');
  }
  const res = await fetch(window.YESAC_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data;
};

// Key handling: ?k=KEY in the link is saved to this browser, then removed from the address bar.
window.yesacKey = function (storeName) {
  const u = new URL(location.href);
  const k = u.searchParams.get('k');
  try {
    if (k) {
      localStorage.setItem(storeName, k);
      u.searchParams.delete('k');
      history.replaceState(null, '', u.toString());
      return k;
    }
    return localStorage.getItem(storeName) || '';
  } catch (e) {
    return k || '';
  }
};
