/**
 * CacheMux — Storage Manager
 * CRUD operations for localStorage and sessionStorage via chrome.scripting API.
 * All data access runs in the active tab's context only.
 */

window.StorageManager = (function () {
  'use strict';

  var browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

  /**
   * Load all key-value pairs from a storage type.
   * @param {number} tabId - Active tab ID
   * @param {'local'|'session'} type
   * @returns {Promise<Array<{key:string, value:string}>>}
   */
  async function load(tabId, type) {
    var storageObj = type === 'session' ? 'sessionStorage' : 'localStorage';
    try {
      var results = await browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        func: function (storeName) {
          try {
            var store = storeName === 'sessionStorage' ? sessionStorage : localStorage;
            var items = [];
            for (var i = 0; i < store.length; i++) {
              var key = store.key(i);
              items.push({ key: key, value: store.getItem(key) });
            }
            return items;
          } catch (e) {
            return [];
          }
        },
        args: [storageObj]
      });
      return (results && results[0] && results[0].result) || [];
    } catch (e) {
      console.error('[CacheMux] storage load error:', e);
      return [];
    }
  }

  /**
   * Set a key-value pair in storage.
   * @param {number} tabId
   * @param {'local'|'session'} type
   * @param {string} key
   * @param {string} value
   * @returns {Promise<boolean>}
   */
  async function set(tabId, type, key, value) {
    var storageObj = type === 'session' ? 'sessionStorage' : 'localStorage';
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        func: function (storeName, k, v) {
          var store = storeName === 'sessionStorage' ? sessionStorage : localStorage;
          store.setItem(k, v);
        },
        args: [storageObj, key, value]
      });
      return true;
    } catch (e) {
      console.error('[CacheMux] storage set error:', e);
      return false;
    }
  }

  /**
   * Remove a key from storage.
   * @param {number} tabId
   * @param {'local'|'session'} type
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async function remove(tabId, type, key) {
    var storageObj = type === 'session' ? 'sessionStorage' : 'localStorage';
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        func: function (storeName, k) {
          var store = storeName === 'sessionStorage' ? sessionStorage : localStorage;
          store.removeItem(k);
        },
        args: [storageObj, key]
      });
      return true;
    } catch (e) {
      console.error('[CacheMux] storage remove error:', e);
      return false;
    }
  }

  /**
   * Clear all entries in storage.
   * @param {number} tabId
   * @param {'local'|'session'} type
   * @returns {Promise<boolean>}
   */
  async function clearAll(tabId, type) {
    var storageObj = type === 'session' ? 'sessionStorage' : 'localStorage';
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        func: function (storeName) {
          var store = storeName === 'sessionStorage' ? sessionStorage : localStorage;
          store.clear();
        },
        args: [storageObj]
      });
      return true;
    } catch (e) {
      console.error('[CacheMux] storage clear error:', e);
      return false;
    }
  }

  /**
   * Render storage entries into the DOM.
   * @param {Array} items - Array of {key, value}
   * @param {HTMLElement} container
   * @param {number} tabId
   * @param {'local'|'session'} type
   * @param {Function} onUpdate
   */
  function render(items, container, tabId, type, onUpdate) {
    container.innerHTML = '';

    items.forEach(function (item) {
      var el = document.createElement('div');
      el.className = 'entry';
      el.dataset.storageKey = item.key;

      var truncVal = truncate(item.value, 40);

      el.innerHTML =
        '<div class="entry-header">' +
          '<span class="entry-name" title="' + escHtml(item.key) + '">' + escHtml(item.key) + '</span>' +
          '<span class="entry-value" title="' + escHtml(item.value) + '">' + escHtml(truncVal) + '</span>' +
          '<div class="entry-actions">' +
            '<button class="entry-btn" data-action="edit" title="Edit">✏️</button>' +
            '<button class="entry-btn entry-btn--danger" data-action="delete" title="Delete">❌</button>' +
            '<button class="entry-btn" data-action="copy" title="Copy value">📋</button>' +
            '<button class="entry-btn entry-btn--predict" data-action="predict" title="Predict encoding">🔮</button>' +
          '</div>' +
        '</div>' +
        '<div class="entry-details">' +
          '<div class="entry-detail-row"><span class="entry-detail-label">Key</span><span class="entry-detail-value">' + escHtml(item.key) + '</span></div>' +
          '<div class="entry-detail-row"><span class="entry-detail-label">Value</span><span class="entry-detail-value" style="max-height:80px;overflow-y:auto;">' + escHtml(item.value) + '</span></div>' +
          '<div class="entry-detail-row"><span class="entry-detail-label">Size</span><span class="entry-detail-value">' + byteSize(item.key + item.value) + '</span></div>' +
        '</div>' +
        '<div class="entry-edit-fields">' +
          '<input class="entry-edit-input" data-field="key" value="' + escAttr(item.key) + '" placeholder="Key" spellcheck="false">' +
          '<input class="entry-edit-input" data-field="value" value="' + escAttr(item.value) + '" placeholder="Value" spellcheck="false">' +
          '<div class="entry-edit-actions">' +
            '<button class="entry-edit-save" data-action="save">Save</button>' +
            '<button class="entry-edit-cancel" data-action="cancel">Cancel</button>' +
          '</div>' +
        '</div>' +
        '<div class="predict-result">' +
          '<div class="predict-type"></div>' +
          '<div class="predict-decoded"></div>' +
        '</div>';

      el.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) {
          if (e.target.closest('.entry-header') && !e.target.closest('.entry-actions')) {
            el.querySelector('.entry-details').classList.toggle('visible');
          }
          return;
        }

        var action = btn.dataset.action;

        if (action === 'edit') {
          el.classList.add('editing');
        } else if (action === 'cancel') {
          el.classList.remove('editing');
        } else if (action === 'save') {
          handleSave(el, item, tabId, type, onUpdate);
        } else if (action === 'delete') {
          handleDelete(btn, item, tabId, type, onUpdate);
        } else if (action === 'copy') {
          handleCopy(btn, item.value);
        } else if (action === 'predict') {
          handlePredict(el, item.value);
        }
      });

      container.appendChild(el);
    });
  }

  function handleSave(el, item, tabId, type, onUpdate) {
    var keyInput = el.querySelector('[data-field="key"]');
    var valueInput = el.querySelector('[data-field="value"]');
    var newKey = keyInput.value;
    var newValue = valueInput.value;

    var chain = Promise.resolve();

    // If key changed, remove old key first
    if (newKey !== item.key) {
      chain = chain.then(function () { return remove(tabId, type, item.key); });
    }

    chain
      .then(function () { return set(tabId, type, newKey, newValue); })
      .then(function () {
        el.classList.remove('editing');
        if (onUpdate) onUpdate();
      });
  }

  function handleDelete(btn, item, tabId, type, onUpdate) {
    if (btn.classList.contains('confirm-delete')) {
      remove(tabId, type, item.key).then(function () {
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

  function byteSize(s) {
    var bytes = new Blob([s]).size;
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  return {
    load: load,
    set: set,
    remove: remove,
    clearAll: clearAll,
    render: render
  };
})();
