/**
 * CacheMux — Predict Module
 * Lightweight encoding detection and decoding for cookie/storage values.
 * No network requests. No heavy computation. Pure local analysis.
 */

window.Predict = (function () {
  'use strict';

  /**
   * Analyze a value and return detected encoding info.
   * @param {string} value - The string to analyze
   * @returns {{ type: string, confidence: string, decoded: string|null }|null}
   */
  function analyze(value) {
    if (!value || typeof value !== 'string' || value.length < 2) return null;

    var v = value.trim();

    // Order matters: most specific first
    var checks = [
      detectJWT,
      detectURLEncoded,
      detectBase64,
      detectBase32,
      detectHex,
      detectRandomToken
    ];

    for (var i = 0; i < checks.length; i++) {
      var result = checks[i](v);
      if (result) return result;
    }

    return null;
  }

  /** JWT: three base64url segments separated by dots, starting with eyJ */
  function detectJWT(v) {
    if (!/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)) return null;

    var parts = v.split('.');
    if (parts.length !== 3) return null;

    try {
      var header = JSON.parse(b64urlDecode(parts[0]));
      var payload = JSON.parse(b64urlDecode(parts[1]));
      var preview = 'Header: ' + JSON.stringify(header) + '\nPayload: ' + JSON.stringify(payload);
      if (preview.length > 300) preview = preview.substring(0, 300) + '…';
      return { type: 'JWT', confidence: 'high', decoded: preview };
    } catch (e) {
      return { type: 'JWT', confidence: 'medium', decoded: '(decode failed)' };
    }
  }

  /** URL Encoded: contains %XX sequences */
  function detectURLEncoded(v) {
    if (!/%[0-9A-Fa-f]{2}/.test(v)) return null;

    // Must have at least 2 encoded chars to be meaningful
    var matches = v.match(/%[0-9A-Fa-f]{2}/g);
    if (!matches || matches.length < 2) return null;

    try {
      var decoded = decodeURIComponent(v);
      if (decoded === v) return null;
      if (decoded.length > 200) decoded = decoded.substring(0, 200) + '…';
      return { type: 'URL Encoded', confidence: 'high', decoded: decoded };
    } catch (e) {
      return null;
    }
  }

  /** Base64: standard base64 with optional padding */
  function detectBase64(v) {
    if (v.length < 8) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return null;
    if (v.length % 4 !== 0) return null;

    try {
      var decoded = atob(v);
      // Check if result is mostly printable
      var printable = 0;
      for (var i = 0; i < decoded.length && i < 200; i++) {
        var c = decoded.charCodeAt(i);
        if (c >= 32 && c < 127) printable++;
      }
      var ratio = printable / Math.min(decoded.length, 200);
      if (ratio < 0.7) return null;

      if (decoded.length > 200) decoded = decoded.substring(0, 200) + '…';
      return { type: 'Base64', confidence: ratio > 0.9 ? 'high' : 'medium', decoded: decoded };
    } catch (e) {
      return null;
    }
  }

  /** Base32: A-Z and 2-7 with optional = padding */
  function detectBase32(v) {
    if (v.length < 8) return null;
    if (!/^[A-Z2-7]+=*$/.test(v)) return null;

    return { type: 'Base32', confidence: 'medium', decoded: '(base32 detected, length: ' + v.length + ')' };
  }

  /** Hex: 0-9 and a-f, even length */
  function detectHex(v) {
    if (v.length < 8) return null;
    if (v.length % 2 !== 0) return null;
    if (!/^[0-9a-fA-F]+$/.test(v)) return null;

    try {
      var decoded = '';
      for (var i = 0; i < v.length && i < 400; i += 2) {
        var c = parseInt(v.substr(i, 2), 16);
        if (c >= 32 && c < 127) decoded += String.fromCharCode(c);
        else decoded += '.';
      }
      if (decoded.length > 200) decoded = decoded.substring(0, 200) + '…';
      return { type: 'Hex', confidence: 'medium', decoded: decoded };
    } catch (e) {
      return { type: 'Hex', confidence: 'low', decoded: null };
    }
  }

  /** Random Token: high entropy alphanumeric string */
  function detectRandomToken(v) {
    if (v.length < 16) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(v)) return null;

    var entropy = calcEntropy(v);
    if (entropy < 3.5) return null;

    return {
      type: 'Random Token',
      confidence: entropy > 4.5 ? 'high' : 'medium',
      decoded: 'Entropy: ' + entropy.toFixed(2) + ' bits/char, Length: ' + v.length
    };
  }

  /** Calculate Shannon entropy */
  function calcEntropy(s) {
    var freq = {};
    for (var i = 0; i < s.length; i++) {
      freq[s[i]] = (freq[s[i]] || 0) + 1;
    }
    var entropy = 0;
    var len = s.length;
    for (var ch in freq) {
      var p = freq[ch] / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  /** Decode base64url */
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return atob(s);
  }

  return { analyze: analyze };
})();
