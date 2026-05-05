/**
 * CacheMux — Cookie Manager
 * CRUD operations for cookies using chrome.cookies API.
 * Only operates on the active tab's domain. No background scanning.
 */

window.CookieManager = (function () {
  'use strict';

  var browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

  /**
   * Load all cookies for a given URL.
   * @param {string} url - The active tab URL
   * @returns {Promise<Array>}
   */
  async function load(url) {
    if (!url) return [];
    try {
      var cookies = await browserAPI.cookies.getAll({ url: url });
      return cookies || [];
    } catch (e) {
      console.error('[CacheMux] cookie load error:', e);
      return [];
    }
  }

  /**
   * Set (add or edit) a cookie.
   * @param {Object} details - Cookie details
   * @param {string} tabUrl - The active tab URL for proper URL construction
   * @returns {Promise<Object|null>}
   */
  async function set(details, tabUrl) {
    try {
      var cookieUrl = buildCookieUrl(details.domain || new URL(tabUrl).hostname, details.secure);
      var params = {
        url: cookieUrl,
        name: details.name,
        value: details.value || '',
        path: details.path || '/',
        secure: !!details.secure,
        httpOnly: !!details.httpOnly,
        sameSite: details.sameSite || 'lax'
      };
      if (details.domain) {
        params.domain = details.domain;
      }
      if (details.expirationDate) {
        params.expirationDate = details.expirationDate;
      }
      return await browserAPI.cookies.set(params);
    } catch (e) {
      console.error('[CacheMux] cookie set error:', e);
      return null;
    }
  }

  /**
   * Remove a cookie.
   * @param {string} url - Cookie URL
   * @param {string} name - Cookie name
   * @param {string} storeId - Cookie store ID
   * @returns {Promise<boolean>}
   */
  async function remove(url, name, storeId) {
    try {
      var params = { url: url, name: name };
      if (storeId) params.storeId = storeId;
      await browserAPI.cookies.remove(params);
      return true;
    } catch (e) {
      console.error('[CacheMux] cookie remove error:', e);
      return false;
    }
  }

  /**
   * Remove ALL cookies for a given URL.
   * @param {string} url
   * @returns {Promise<number>} count of removed cookies
   */
  async function clearAll(url) {
    var cookies = await load(url);
    var count = 0;
    for (var i = 0; i < cookies.length; i++) {
      var c = cookies[i];
      var cUrl = buildCookieUrl(c.domain, c.secure);
      var ok = await remove(cUrl, c.name, c.storeId);
      if (ok) count++;
    }
    return count;
  }

  /**
   * Render the cookie list into the DOM.
   * @param {Array} cookies
   * @param {HTMLElement} container
   * @param {string} tabUrl
   * @param {Function} onUpdate - callback after mutation
   */
  function render(cookies, container, tabUrl, onUpdate) {
    container.innerHTML = '';

    cookies.forEach(function (cookie) {
      var el = document.createElement('div');
      el.className = 'entry';
      el.dataset.cookieName = cookie.name;
      el.dataset.cookieDomain = cookie.domain;

      var truncVal = truncate(cookie.value, 30);
      var flags = buildFlags(cookie);
      var expiry = cookie.expirationDate
        ? new Date(cookie.expirationDate * 1000).toLocaleString()
        : 'Session';

      el.innerHTML =
        '<div class="entry-header">' +
          '<span class="entry-name" title="' + escHtml(cookie.name) + '">' + escHtml(cookie.name) + '</span>' +
          '<span class="entry-value" title="' + escHtml(cookie.value) + '">' + escHtml(truncVal) + '</span>' +
          '<div class="entry-actions">' +
            '<button class="entry-btn" data-action="edit" title="Edit">✏️</button>' +
            '<button class="entry-btn entry-btn--danger" data-action="delete" title="Delete">❌</button>' +
            '<button class="entry-btn" data-action="copy" title="Copy value">📋</button>' +
            '<button class="entry-btn entry-btn--predict" data-action="predict" title="Predict encoding">🔮</button>' +
          '</div>' +
        '</div>' +
        '<div class="entry-details">' +
          '<div class="entry-detail-row"><span class="entry-detail-label">Domain</span><span class="entry-detail-value">' + escHtml(cookie.domain) + '</span></div>' +
          '<div class="entry-detail-row"><span class="entry-detail-label">Path</span><span class="entry-detail-value">' + escHtml(cookie.path) + '</span></div>' +
          '<div class="entry-detail-row"><span class="entry-detail-label">Expiry</span><span class="entry-detail-value">' + expiry + '</span></div>' +
          '<div class="entry-detail-row"><span class="entry-detail-label">Flags</span><span class="entry-detail-value">' + flags + '</span></div>' +
        '</div>' +
        '<div class="entry-edit-fields">' +
          '<input class="entry-edit-input" data-field="name" value="' + escAttr(cookie.name) + '" placeholder="Name" spellcheck="false">' +
          '<input class="entry-edit-input" data-field="value" value="' + escAttr(cookie.value) + '" placeholder="Value" spellcheck="false">' +
          '<input class="entry-edit-input" data-field="path" value="' + escAttr(cookie.path) + '" placeholder="Path" spellcheck="false">' +
          '<div class="entry-edit-actions">' +
            '<button class="entry-edit-save" data-action="save">Save</button>' +
            '<button class="entry-edit-cancel" data-action="cancel">Cancel</button>' +
          '</div>' +
        '</div>' +
        '<div class="predict-result">' +
          '<div class="predict-type"></div>' +
          '<div class="predict-decoded"></div>' +
        '</div>';

      // Wire up actions
      el.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) {
          // Click on entry header toggles details
          if (e.target.closest('.entry-header') && !e.target.closest('.entry-actions')) {
            var det = el.querySelector('.entry-details');
            det.classList.toggle('visible');
          }
          return;
        }

        var action = btn.dataset.action;

        if (action === 'edit') {
          el.classList.add('editing');
        } else if (action === 'cancel') {
          el.classList.remove('editing');
        } else if (action === 'save') {
          handleSave(el, cookie, tabUrl, onUpdate);
        } else if (action === 'delete') {
          handleDelete(btn, cookie, tabUrl, onUpdate);
        } else if (action === 'copy') {
          handleCopy(btn, cookie.value);
        } else if (action === 'predict') {
          handlePredict(el, cookie.value);
        }
      });

      container.appendChild(el);
    });
  }

  function handleSave(el, cookie, tabUrl, onUpdate) {
    var nameInput = el.querySelector('[data-field="name"]');
    var valueInput = el.querySelector('[data-field="value"]');
    var pathInput = el.querySelector('[data-field="path"]');

    var cUrl = buildCookieUrl(cookie.domain, cookie.secure);

    // If name changed, delete old cookie first
    var chain = Promise.resolve();
    if (nameInput.value !== cookie.name) {
      chain = chain.then(function () { return remove(cUrl, cookie.name, cookie.storeId); });
    }

    chain.then(function () {
      return set({
        name: nameInput.value,
        value: valueInput.value,
        domain: cookie.domain,
        path: pathInput.value || '/',
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: cookie.expirationDate
      }, tabUrl);
    }).then(function () {
      el.classList.remove('editing');
      if (onUpdate) onUpdate();
    });
  }

  function handleDelete(btn, cookie, tabUrl, onUpdate) {
    if (btn.classList.contains('confirm-delete')) {
      var cUrl = buildCookieUrl(cookie.domain, cookie.secure);
      remove(cUrl, cookie.name, cookie.storeId).then(function () {
        if (onUpdate) onUpdate();
      });
    } else {
      btn.classList.add('confirm-delete');
      btn.textContent = '?';
      btn.title = 'Click again to confirm';
      setTimeout(function () {
        btn.classList.remove('confirm-delete');
        btn.textContent = '❌';
        btn.title = 'Delete';
      }, 2000);
    }
  }

  function handleCopy(btn, value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        btn.classList.add('flash-copy');
        setTimeout(function () { btn.classList.remove('flash-copy'); }, 600);
      }).catch(function () { fallbackCopy(value, btn); });
    } else {
      fallbackCopy(value, btn);
    }
  }

  function fallbackCopy(value, btn) {
    var ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    btn.classList.add('flash-copy');
    setTimeout(function () { btn.classList.remove('flash-copy'); }, 600);
  }

  function handlePredict(el, value) {
    var pr = el.querySelector('.predict-result');
    if (pr.classList.contains('visible')) {
      pr.classList.remove('visible');
      return;
    }
    var result = window.Predict.analyze(value);
    if (result) {
      pr.querySelector('.predict-type').textContent = result.type + ' (' + result.confidence + ')';
      pr.querySelector('.predict-decoded').textContent = result.decoded || '—';
      pr.classList.add('visible');
    } else {
      pr.querySelector('.predict-type').textContent = 'No encoding detected';
      pr.querySelector('.predict-decoded').textContent = '';
      pr.classList.add('visible');
    }
  }

  /* ── Helpers ── */

  function buildCookieUrl(domain, secure) {
    var d = domain.startsWith('.') ? domain.substring(1) : domain;
    return (secure ? 'https://' : 'http://') + d + '/';
  }

  function buildFlags(c) {
    var f = [];
    if (c.secure) f.push('Secure');
    if (c.httpOnly) f.push('HttpOnly');
    if (c.sameSite) f.push('SameSite=' + c.sameSite);
    if (c.session) f.push('Session');
    return f.join(' · ') || '—';
  }

  function truncate(s, len) {
    if (!s) return '';
    return s.length > len ? s.substring(0, len) + '…' : s;
  }

  function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escAttr(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    load: load,
    set: set,
    remove: remove,
    clearAll: clearAll,
    render: render
  };
})();
