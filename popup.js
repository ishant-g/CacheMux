/**
 * CacheMux — Popup Controller
 * Main entry point. Coordinates tab switching, data loading, quick actions,
 * and the add-entry form. No network requests. All operations are local.
 */

(function () {
  'use strict';

  var browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

  /* ── State ── */
  var state = {
    tabId: null,
    tabUrl: null,
    activeTab: 'cookies' // 'cookies' | 'local' | 'session'
  };

  /* ── DOM refs ── */
  var dom = {};

  function cacheDom() {
    dom.currentDomain = document.getElementById('currentDomain');
    dom.tabBar = document.getElementById('tabBar');
    dom.tabs = document.querySelectorAll('.tab');
    dom.panels = {
      cookies: document.getElementById('panelCookies'),
      local: document.getElementById('panelLocal'),
      session: document.getElementById('panelSession')
    };
    dom.lists = {
      cookies: document.getElementById('cookieList'),
      local: document.getElementById('localList'),
      session: document.getElementById('sessionList')
    };
    dom.empties = {
      cookies: document.getElementById('cookieEmpty'),
      local: document.getElementById('localEmpty'),
      session: document.getElementById('sessionEmpty')
    };
    dom.counts = {
      cookies: document.getElementById('cookieCount'),
      local: document.getElementById('localCount'),
      session: document.getElementById('sessionCount')
    };
    dom.statusBar = document.getElementById('statusBar');
    dom.statusMessage = document.getElementById('statusMessage');

    // Quick actions
    dom.btnRefresh = document.getElementById('btnRefresh');
    dom.btnClearCookies = document.getElementById('btnClearCookies');
    dom.btnClearLocal = document.getElementById('btnClearLocal');
    dom.btnClearSession = document.getElementById('btnClearSession');
    dom.btnAddEntry = document.getElementById('btnAddEntry');

    // Add form
    dom.addForm = document.getElementById('addForm');
    dom.addFormClose = document.getElementById('addFormClose');
    dom.addFormSubmit = document.getElementById('addFormSubmit');
    dom.addCookieFields = document.getElementById('addCookieFields');
    dom.addStorageFields = document.getElementById('addStorageFields');
    dom.addCookieName = document.getElementById('addCookieName');
    dom.addCookieValue = document.getElementById('addCookieValue');
    dom.addCookieDomain = document.getElementById('addCookieDomain');
    dom.addCookiePath = document.getElementById('addCookiePath');
    dom.addCookieSecure = document.getElementById('addCookieSecure');
    dom.addCookieHttpOnly = document.getElementById('addCookieHttpOnly');
    dom.addCookieSameSite = document.getElementById('addCookieSameSite');
    dom.addStorageKey = document.getElementById('addStorageKey');
    dom.addStorageValue = document.getElementById('addStorageValue');
  }

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', function () {
    cacheDom();
    bindEvents();
    getActiveTab().then(function () {
      loadActivePanel();
    });
  });

  /** Get the active tab info */
  async function getActiveTab() {
    try {
      var tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        state.tabId = tabs[0].id;
        state.tabUrl = tabs[0].url;
        try {
          var hostname = new URL(state.tabUrl).hostname;
          dom.currentDomain.textContent = hostname;
          dom.currentDomain.title = state.tabUrl;
          // Pre-fill domain for add cookie
          dom.addCookieDomain.value = '.' + hostname;
        } catch (e) {
          dom.currentDomain.textContent = 'N/A';
        }
      }
    } catch (e) {
      console.error('[CacheMux] tab query error:', e);
    }
  }

  /* ── Event Binding ── */
  function bindEvents() {
    // Tab switching
    dom.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.dataset.tab;
        switchTab(target);
      });
    });

    // Quick actions
    dom.btnRefresh.addEventListener('click', handleRefresh);
    dom.btnClearCookies.addEventListener('click', handleClearCookies);
    dom.btnClearLocal.addEventListener('click', handleClearLocal);
    dom.btnClearSession.addEventListener('click', handleClearSession);
    dom.btnAddEntry.addEventListener('click', toggleAddForm);

    // Add form
    dom.addFormClose.addEventListener('click', closeAddForm);
    dom.addFormSubmit.addEventListener('click', handleAddSubmit);
  }

  /* ── Tab Switching ── */
  function switchTab(target) {
    state.activeTab = target;

    dom.tabs.forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === target);
    });

    Object.keys(dom.panels).forEach(function (k) {
      dom.panels[k].classList.toggle('active', k === target);
    });

    // Update add form fields visibility
    if (!dom.addForm.classList.contains('hidden')) {
      updateAddFormFields();
    }

    loadActivePanel();
  }

  /* ── Data Loading ── */
  function loadActivePanel() {
    switch (state.activeTab) {
      case 'cookies': loadCookies(); break;
      case 'local': loadStorage('local'); break;
      case 'session': loadStorage('session'); break;
    }
  }

  async function loadCookies() {
    if (!state.tabUrl) return;
    var cookies = await window.CookieManager.load(state.tabUrl);
    dom.counts.cookies.textContent = cookies.length;

    if (cookies.length === 0) {
      dom.lists.cookies.innerHTML = '';
      dom.empties.cookies.classList.remove('hidden');
    } else {
      dom.empties.cookies.classList.add('hidden');
      window.CookieManager.render(cookies, dom.lists.cookies, state.tabUrl, function () {
        loadCookies();
      });
    }
  }

  async function loadStorage(type) {
    if (!state.tabId) return;
    var items = await window.StorageManager.load(state.tabId, type);
    dom.counts[type].textContent = items.length;

    if (items.length === 0) {
      dom.lists[type].innerHTML = '';
      dom.empties[type].classList.remove('hidden');
    } else {
      dom.empties[type].classList.add('hidden');
      window.StorageManager.render(items, dom.lists[type], state.tabId, type, function () {
        loadStorage(type);
      });
    }
  }

  /* ── Quick Actions ── */
  function handleRefresh() {
    if (!state.tabId) return;
    browserAPI.tabs.reload(state.tabId, {}, function () {
      // Small delay to let the page reload
      setTimeout(function () {
        loadActivePanel();
        showStatus('Page refreshed');
      }, 500);
    });
  }

  function handleClearCookies() {
    if (!state.tabUrl) return;
    window.CookieManager.clearAll(state.tabUrl).then(function (count) {
      loadCookies();
      showStatus(count + ' cookie(s) cleared');
    });
  }

  function handleClearLocal() {
    if (!state.tabId) return;
    window.StorageManager.clearAll(state.tabId, 'local').then(function () {
      loadStorage('local');
      showStatus('localStorage cleared');
    });
  }

  function handleClearSession() {
    if (!state.tabId) return;
    window.StorageManager.clearAll(state.tabId, 'session').then(function () {
      loadStorage('session');
      showStatus('sessionStorage cleared');
    });
  }

  /* ── Add Form ── */
  function toggleAddForm() {
    if (dom.addForm.classList.contains('hidden')) {
      dom.addForm.classList.remove('hidden');
      updateAddFormFields();
    } else {
      closeAddForm();
    }
  }

  function closeAddForm() {
    dom.addForm.classList.add('hidden');
    clearAddForm();
  }

  function updateAddFormFields() {
    if (state.activeTab === 'cookies') {
      dom.addCookieFields.classList.remove('hidden');
      dom.addStorageFields.classList.add('hidden');
    } else {
      dom.addCookieFields.classList.add('hidden');
      dom.addStorageFields.classList.remove('hidden');
    }
  }

  function clearAddForm() {
    dom.addCookieName.value = '';
    dom.addCookieValue.value = '';
    dom.addCookiePath.value = '/';
    dom.addCookieSecure.checked = false;
    dom.addCookieHttpOnly.checked = false;
    dom.addStorageKey.value = '';
    dom.addStorageValue.value = '';
  }

  async function handleAddSubmit() {
    if (state.activeTab === 'cookies') {
      var name = dom.addCookieName.value.trim();
      if (!name) { showStatus('Name is required', true); return; }

      await window.CookieManager.set({
        name: name,
        value: dom.addCookieValue.value,
        domain: dom.addCookieDomain.value || undefined,
        path: dom.addCookiePath.value || '/',
        secure: dom.addCookieSecure.checked,
        httpOnly: dom.addCookieHttpOnly.checked,
        sameSite: dom.addCookieSameSite.value
      }, state.tabUrl);

      closeAddForm();
      loadCookies();
      showStatus('Cookie added');
    } else {
      var key = dom.addStorageKey.value.trim();
      if (!key) { showStatus('Key is required', true); return; }

      var type = state.activeTab; // 'local' or 'session'
      await window.StorageManager.set(state.tabId, type, key, dom.addStorageValue.value);

      closeAddForm();
      loadStorage(type);
      showStatus(type + 'Storage entry added');
    }
  }

  /* ── Status Bar ── */
  var statusTimeout = null;

  function showStatus(message, isError) {
    dom.statusBar.classList.remove('hidden', 'error');
    if (isError) dom.statusBar.classList.add('error');
    dom.statusMessage.textContent = message;

    if (statusTimeout) clearTimeout(statusTimeout);
    statusTimeout = setTimeout(function () {
      dom.statusBar.classList.add('hidden');
      statusTimeout = null;
    }, 2000);
  }

})();
