(function () {
  if (window.__DG_GUARD__) return;
  window.__DG_GUARD__ = true;

  const MAX_ITEMS = 35;
  const MAX_DEEP_NODES = 12000;
  const MAX_TEXT = 300;

  function trunc(s, n = MAX_TEXT) {
    if (s == null) return '';
    s = String(s).trim();
    return s.length > n ? s.slice(0, n) : s;
  }

  function serializeRect(el) {
    try {
      const r = el.getBoundingClientRect();
      return {
        top: r.top + (window.scrollY || 0),
        left: r.left + (window.scrollX || 0),
        width: r.width,
        height: r.height,
      };
    } catch {
      return { top: 0, left: 0, width: 0, height: 0 };
    }
  }

  function isElementVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      return true;
    } catch {
      return false;
    }
  }

  /** Prefer a non-degenerate viewport rect; walk up a few ancestors (common with icon-only controls). */
  function goodRect(el) {
    let cur = el;
    for (let d = 0; d < 8 && cur; d++) {
      const r = serializeRect(cur);
      if (r.width >= 4 && r.height >= 4) return r;
      cur = cur.parentElement;
    }
    return serializeRect(el);
  }

  /** Depth-first element walk including open shadow roots (budget = max nodes visited). */
  function walkElementsDeep(node, visitor, budget) {
    if (!node || budget.n > MAX_DEEP_NODES) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      budget.n++;
      visitor(node);
      const ch = node.children;
      for (let i = 0; i < ch.length; i++) walkElementsDeep(ch[i], visitor, budget);
      if (node.shadowRoot) {
        const sr = node.shadowRoot;
        for (let j = 0; j < sr.children.length; j++) {
          walkElementsDeep(sr.children[j], visitor, budget);
        }
      }
    }
  }

  function queryDeepAll(selector, limit) {
    const out = [];
    const seen = new Set();
    const lim = limit || MAX_ITEMS;
    const budget = { n: 0 };
    const root = document.body || document.documentElement;
    walkElementsDeep(root, (el) => {
      if (out.length >= lim) return;
      try {
        if (seen.has(el) || !el.matches(selector)) return;
        seen.add(el);
        out.push(el);
      } catch (_) {}
    }, budget);
    return out;
  }

  function pushUnique(arr, item, keyFn) {
    if (arr.length >= MAX_ITEMS) return;
    const k = keyFn(item);
    if (arr.some((x) => keyFn(x) === k)) return;
    arr.push(item);
  }

  function getCheckboxLabel(cb) {
    const aria = cb.getAttribute('aria-label');
    if (aria) return trunc(aria);
    if (cb.id) {
      try {
        const lab = document.querySelector(`label[for="${CSS.escape(cb.id)}"]`);
        if (lab) return trunc(lab.innerText || '');
      } catch (_) {}
    }
    let p = cb.parentElement;
    let depth = 0;
    while (p && depth++ < 6) {
      if (p.tagName === 'LABEL') return trunc(p.innerText || '');
      p = p.parentElement;
    }
    return '';
  }

  function parseRgb(color) {
    const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function relLum([r, g, b]) {
    const lin = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  function contrastRatio(fgRgb, bgRgb) {
    if (!fgRgb || !bgRgb) return 10;
    const L1 = relLum(fgRgb) + 0.05;
    const L2 = relLum(bgRgb) + 0.05;
    return L1 > L2 ? L1 / L2 : L2 / L1;
  }

  function extractPageSignals() {
    const buttons = [];
    const seenBtn = new Set();
    const addButton = (el) => {
      if (!el || seenBtn.has(el)) return;
      if (!isElementVisible(el)) return;
      seenBtn.add(el);
      const text = trunc(el.innerText || el.value || el.getAttribute('aria-label') || '');
      if (buttons.length >= MAX_ITEMS) return;
      const r = goodRect(el);
      buttons.push({
        text,
        id: el.id || '',
        classes: typeof el.className === 'string' ? el.className : '',
        rect: r,
        area: Math.max(0, r.width * r.height),
      });
    };

    [
      ...queryDeepAll('button', 45),
      ...queryDeepAll('[role="button"]', 45),
      ...queryDeepAll('a.btn', 25),
      ...queryDeepAll('input[type="submit"]', 25),
    ].forEach(addButton);

    const links = [];
    queryDeepAll('a[href]', MAX_ITEMS + 10).forEach((a) => {
      if (links.length >= MAX_ITEMS) return;
      if (!isElementVisible(a)) return;
      const text = trunc((a.textContent || '').trim(), 200);
      if (text.length < 2) return;
      const href = a.getAttribute('href') || '';
      pushUnique(links, { text, href, rect: goodRect(a) }, (x) => x.href + x.text.slice(0, 40));
    });

    const headings = [];
    queryDeepAll('h1', 6).forEach((h) => {
      if (headings.length >= 8) return;
      const text = trunc((h.textContent || '').trim(), 400);
      if (text) headings.push({ text, tag: h.tagName, rect: goodRect(h) });
    });
    queryDeepAll('h2', 6).forEach((h) => {
      if (headings.length >= 8) return;
      const text = trunc((h.textContent || '').trim(), 400);
      if (text) headings.push({ text, tag: h.tagName, rect: goodRect(h) });
    });

    const checkboxes = [];
    queryDeepAll('input[type="checkbox"]', MAX_ITEMS + 15).forEach((cb) => {
      if (checkboxes.length >= MAX_ITEMS) return;
      checkboxes.push({
        checked: !!cb.checked,
        labelText: getCheckboxLabel(cb),
        rect: goodRect(cb),
      });
    });

    const countdowns = [];
    const countdownSel =
      '[class*="countdown"], [class*="timer"], [id*="countdown"], [id*="timer"]';
    queryDeepAll(countdownSel, 20).forEach((el) => {
      if (countdowns.length >= MAX_ITEMS) return;
      if (!isElementVisible(el)) return;
      const text = trunc(el.innerText || '');
      if (!text) return;
      pushUnique(countdowns, { text, rect: goodRect(el) }, (x) => x.text + JSON.stringify(x.rect));
    });

    const timeRe = /\d{1,2}:\d{2}:\d{2}/;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = tw.nextNode()) && countdowns.length < MAX_ITEMS) {
      const t = (n.textContent || '').trim();
      if (!timeRe.test(t)) continue;
      const el = n.parentElement;
      if (!el || el === document.body) continue;
      const text = trunc(el.innerText || t);
      pushUnique(countdowns, { text, rect: goodRect(el) }, (x) => x.text.slice(0, 80));
    }

    const urgencyPatterns = [
      /only \d+ left/i,
      /\d+ people (are )?(viewing|watching|looking)/i,
      /limited (time|offer|stock)/i,
      /deal ends in/i,
      /selling fast/i,
      /\d+ (sold|bought) (today|this week)/i,
    ];
    const urgencyTexts = [];
    const tw2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    while ((n = tw2.nextNode()) && urgencyTexts.length < MAX_ITEMS) {
      const t = (n.textContent || '').trim();
      if (t.length < 4 || t.length > 500) continue;
      if (!urgencyPatterns.some((re) => re.test(t))) continue;
      const el = n.parentElement;
      if (!el) continue;
      pushUnique(
        urgencyTexts,
        { text: trunc(t), rect: goodRect(el) },
        (x) => x.text.slice(0, 120)
      );
    }

    const priceElements = [];
    const priceSeen = new Set();
    const pushPrice = (el) => {
      if (priceElements.length >= MAX_ITEMS || priceSeen.has(el)) return;
      if (!isElementVisible(el)) return;
      priceSeen.add(el);
      const text = trunc(
        el.innerText ||
          el.getAttribute('content') ||
          el.getAttribute('data-price') ||
          el.getAttribute('aria-label') ||
          ''
      );
      if (!text || text.length < 2) return;
      pushUnique(priceElements, { text, rect: goodRect(el) }, (x) => x.text.slice(0, 100));
    };
    [
      '[class*="price"]',
      '[class*="cost"]',
      '[id*="price"]',
      '[itemprop="price"]',
      '[data-price]',
      '[class*="pricing"]',
      '[class*="amount"]',
    ].forEach((sel) => queryDeepAll(sel, 20).forEach(pushPrice));

    const totalSummaryElements = [];
    const totalSeen = new Set();
    [
      '[class*="total"]',
      '[class*="summary"]',
      '[class*="checkout"]',
      '[id*="total"]',
      '[data-testid*="total"]',
    ].forEach((sel) => {
      queryDeepAll(sel, 18).forEach((el) => {
        if (totalSummaryElements.length >= MAX_ITEMS || totalSeen.has(el)) return;
        if (!isElementVisible(el)) return;
        totalSeen.add(el);
        const text = trunc(el.innerText || '');
        if (!text || text.length < 3) return;
        pushUnique(totalSummaryElements, { text, rect: goodRect(el) }, (x) => x.text.slice(0, 100));
      });
    });

    const feeElements = [];
    const feeSeen = new Set();
    [
      '[class*="fee"]',
      '[class*="surcharge"]',
      '[class*="service-fee"]',
      '[class*="booking-fee"]',
      '[data-fee]',
    ].forEach((sel) => {
      queryDeepAll(sel, 18).forEach((el) => {
        if (feeElements.length >= MAX_ITEMS || feeSeen.has(el)) return;
        if (!isElementVisible(el)) return;
        feeSeen.add(el);
        const text = trunc(el.innerText || '');
        if (!text) return;
        pushUnique(feeElements, { text, rect: goodRect(el) }, (x) => x.text.slice(0, 80));
      });
    });

    const strikethroughPrices = [];
    ['del', 's', '[class*="original"]', '[class*="was"]', '[class*="compare"]'].forEach((sel) => {
      queryDeepAll(sel, 15).forEach((el) => {
        if (strikethroughPrices.length >= MAX_ITEMS) return;
        if (!isElementVisible(el)) return;
        const text = trunc(el.innerText || '');
        if (!/\$|€|£|\d/.test(text)) return;
        pushUnique(strikethroughPrices, { text, rect: goodRect(el) }, (x) => x.text.slice(0, 60));
      });
    });

    const sponsoredBlocks = [];
    const adSeen = new Set();
    [
      '[class*="sponsored"]',
      '[class*="ad-"]',
      '[data-ad]',
      '[class*="advertisement"]',
      '[aria-label*="advertisement" i]',
    ].forEach((sel) => {
      queryDeepAll(sel, 15).forEach((el) => {
        if (sponsoredBlocks.length >= MAX_ITEMS || adSeen.has(el)) return;
        if (!isElementVisible(el)) return;
        adSeen.add(el);
        const text = trunc(el.innerText || '', 200);
        const labeled = /\b(ad|sponsored|paid|advertisement)\b/i.test(text);
        pushUnique(
          sponsoredBlocks,
          { text, rect: goodRect(el), labeled },
          (x) => JSON.stringify(x.rect)
        );
      });
    });

    const cookieBanners = [];
    const cookieSeen = new Set();
    const cookieSelectors = [
      '[id*="cookie" i]',
      '[class*="cookie" i]',
      '[id*="consent" i]',
      '[class*="consent" i]',
      '[id*="gdpr" i]',
      '[class*="gdpr" i]',
      '[aria-label*="cookie" i]',
      '[data-testid*="cookie" i]',
      '[class*="privacy-banner" i]',
      '[id*="privacy-banner" i]',
    ];
    cookieSelectors.forEach((sel) => {
      try {
        queryDeepAll(sel, 12).forEach((el) => {
          if (cookieBanners.length >= MAX_ITEMS || cookieSeen.has(el)) return;
          if (!isElementVisible(el)) return;
          cookieSeen.add(el);
          const text = trunc(el.innerText || '', 500);
          if (!text || text.length < 12) return;
          pushUnique(cookieBanners, { text, rect: goodRect(el) }, (x) => x.text.slice(0, 80));
        });
      } catch (_) {}
    });

    const modals = [];
    const budgetModal = { n: 0 };
    walkElementsDeep(document.body || document.documentElement, (el) => {
      if (modals.length >= MAX_ITEMS || budgetModal.n > 6500) return;
      try {
        const st = window.getComputedStyle(el);
        const pos = st.position;
        if (pos !== 'fixed' && pos !== 'absolute') return;
        const z = parseInt(st.zIndex, 10);
        if (isNaN(z) || z < 40) return;
        const r = el.getBoundingClientRect();
        if (r.width <= 140 || r.height <= 70) return;
        const text = trunc(el.innerText || '', 300);
        if (!text) return;
        pushUnique(modals, { text, rect: goodRect(el) }, (x) => x.text.slice(0, 60));
      } catch (_) {}
    }, budgetModal);

    const hiddenElements = [];
    let hiddenCount = 0;
    const budgetInp = { n: 0 };
    walkElementsDeep(document.body || document.documentElement, (el) => {
      if (el.tagName !== 'INPUT') return;
      if (el.type === 'hidden') {
        hiddenCount++;
        if (hiddenElements.length < MAX_ITEMS) {
          hiddenElements.push({ type: el.type, name: el.name || '' });
        }
        return;
      }
      try {
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') {
          hiddenCount++;
          if (hiddenElements.length < MAX_ITEMS) {
            hiddenElements.push({ type: el.type || 'text', name: el.name || '' });
          }
        }
      } catch (_) {}
    }, budgetInp);

    const hasEmail =
      queryDeepAll('input[type="email"]', 12).length > 0 ||
      queryDeepAll('input[name*="email"]', 10).length > 0 ||
      queryDeepAll('input[name*="Email"]', 6).length > 0;
    const hasPassword =
      queryDeepAll('input[type="password"]', 8).length > 0;
    const priceLikeVisible =
      priceElements.length > 0 &&
      (priceElements.some((p) => (p.rect?.height || 0) > 0) ||
        queryDeepAll('[class*="price"],[id*="price"],[itemprop="price"]', 12).some((el) =>
          isElementVisible(el)
        ));

    const hasPagination = !!document.querySelector(
      '[class*="pagination"],[class*="page-nav"],nav[aria-label*="pagination" i],a[rel="next"]'
    );

    const autoplayMedia = [];
    ['video[autoplay]', 'audio[autoplay]'].forEach((sel) => {
      queryDeepAll(sel, 8).forEach((el) => {
        if (autoplayMedia.length >= MAX_ITEMS) return;
        if (!isElementVisible(el)) return;
        const muted = el.hasAttribute('muted') || el.getAttribute('muted') === 'true';
        if (!muted) {
          autoplayMedia.push({ tag: el.tagName, rect: goodRect(el) });
        }
      });
    });

    const declineCandidates = [];
    const declineSeen = new Set();
    const declineRe =
      /\b(no thanks|decline|skip|not now|cancel|close|dismiss|reject|maybe later|not interested)\b/i;
    [...queryDeepAll('button', 40), ...queryDeepAll('a[href]', 40), ...queryDeepAll('[role="button"]', 30)].forEach(
      (el) => {
        if (declineCandidates.length >= MAX_ITEMS || declineSeen.has(el)) return;
        declineSeen.add(el);
        if (!isElementVisible(el)) return;
        const t = (el.textContent || '').trim();
        if (t.length > 120 || t.length < 2) return;
        if (!declineRe.test(t)) return;
        let ratio = null;
        try {
          const st = window.getComputedStyle(el);
          const fg = parseRgb(st.color);
          const bg = parseRgb(st.backgroundColor);
          if (fg && bg) ratio = contrastRatio(fg, bg);
        } catch (_) {}
        const r = goodRect(el);
        declineCandidates.push({
          text: trunc(t),
          rect: r,
          area: Math.max(0, r.width * r.height),
          contrastRatio: ratio,
        });
      }
    );

    const primaryCandidates = [];
    const primarySeen = new Set();
    const primaryRe =
      /\b(buy|subscribe|continue|checkout|pay|add to cart|get started|sign up|complete order|place order|pay now|confirm)\b/i;
    [
      ...queryDeepAll('button', 40),
      ...queryDeepAll('a[href]', 35),
      ...queryDeepAll('[role="button"]', 25),
      ...queryDeepAll('input[type="submit"]', 15),
    ].forEach((el) => {
      if (primaryCandidates.length >= MAX_ITEMS || primarySeen.has(el)) return;
      primarySeen.add(el);
      if (!isElementVisible(el)) return;
      const t = (el.textContent || el.value || '').trim();
      if (!primaryRe.test(t)) return;
      const r = goodRect(el);
      const area = Math.max(0, r.width * r.height);
      if (area < 320) return;
      primaryCandidates.push({ text: trunc(t), rect: r, area });
    });

    let maxPrimary = 0;
    let maxDecline = 0;
    primaryCandidates.forEach((p) => {
      if (p.area > maxPrimary) maxPrimary = p.area;
    });
    declineCandidates.forEach((d) => {
      if (d.area > maxDecline) maxDecline = d.area;
    });

    const smallPrintHits = [];
    document.querySelectorAll('p,span,div,li,td').forEach((el) => {
      if (smallPrintHits.length >= MAX_ITEMS) return;
      try {
        const st = window.getComputedStyle(el);
        const fs = parseFloat(st.fontSize);
        if (isNaN(fs) || fs >= 11) return;
        const text = (el.textContent || '').trim();
        if (text.length < 15 || text.length > 600) return;
        if (!/auto-?renew|recurring|cancellation|price increase|billed|fee/i.test(text)) return;
        smallPrintHits.push({ text: trunc(text), fontSize: fs, rect: goodRect(el) });
      } catch (_) {}
    });

    const unsubscribeLinks = [];
    queryDeepAll('a[href]', MAX_ITEMS + 10).forEach((a) => {
      if (unsubscribeLinks.length >= MAX_ITEMS) return;
      if (!isElementVisible(a)) return;
      const t = (a.textContent || '').trim();
      if (!/unsubscribe|cancel subscription|manage subscription|opt out/i.test(t)) return;
      const href = a.getAttribute('href') || '';
      const pathDepth = href.split('/').filter(Boolean).length;
      unsubscribeLinks.push({ text: trunc(t), href, pathDepth, rect: goodRect(a) });
    });

    const reviewsSection =
      queryDeepAll('[class*="review"],[id*="review"],[itemprop="review"]', 8).length > 0 ||
      !!document.querySelector('section[aria-label*="review" i]');

    const bodyTextSample = trunc((document.body && document.body.innerText) || '', 4500);

    const scrollHeavy =
      document.body &&
      document.body.scrollHeight > window.innerHeight * 5 &&
      document.querySelectorAll('img,article,[class*="card"]').length > 40;

    const hasFooter = !!(document.querySelector('footer') ||
      document.querySelector('[class*="footer" i]') ||
      document.querySelector('[id*="footer" i]') ||
      document.querySelector('[role="contentinfo"]') ||
      document.querySelector('a[href="#top"], a[href*="back-to-top"]'));

    const viewport = {
      width: window.innerWidth || 800,
      height: window.innerHeight || 600,
    };

    const clickables = [];
    const seenClick = new Set();
    const budgetClick = { n: 0 };
    walkElementsDeep(document.body || document.documentElement, (el) => {
      if (clickables.length >= 55) return;
      const tag = el.tagName;
      const role = el.getAttribute('role');
      const type = (el.getAttribute('type') || '').toLowerCase();
      const isClick =
        tag === 'BUTTON' ||
        (tag === 'A' && el.hasAttribute('href')) ||
        (tag === 'INPUT' && (type === 'submit' || type === 'button' || type === 'image')) ||
        role === 'button' ||
        role === 'link';
      if (!isClick || !isElementVisible(el) || seenClick.has(el)) return;
      const text = trunc(
        el.innerText ||
          el.value ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          '',
        280
      );
      if (text.length < 1 && tag !== 'INPUT') return;
      seenClick.add(el);
      const r = goodRect(el);
      if (r.width < 2 || r.height < 2) return;
      clickables.push({ text, rect: r });
    }, budgetClick);

    return {
      url: window.location.href,
      title: trunc(document.title || '', MAX_TEXT),
      viewport,
      clickables,
      buttons,
      links,
      headings,
      checkboxes,
      countdowns,
      urgencyTexts,
      priceElements,
      totalSummaryElements,
      feeElements,
      strikethroughPrices,
      sponsoredBlocks,
      cookieBanners,
      modals,
      hiddenElements,
      hiddenInputCount: hiddenCount,
      hasEmailAndPasswordInputs: hasEmail && hasPassword,
      priceVisibleOnPage: !!priceLikeVisible,
      hasPagination,
      hasFooter,
      scrollHeavy,
      autoplayMedia,
      declineCandidates,
      primaryCandidates,
      maxPrimaryButtonArea: maxPrimary,
      maxDeclineButtonArea: maxDecline,
      smallPrintHits,
      unsubscribeLinks,
      reviewsSection,
      bodyTextSample,
    };
  }

  /** Check whether an element (or any ancestor) has fixed or sticky positioning. */
  function isFixedOrSticky(el) {
    let cur = el;
    while (cur && cur !== document.documentElement) {
      try {
        const pos = window.getComputedStyle(cur).position;
        if (pos === 'fixed' || pos === 'sticky') return true;
      } catch (_) {}
      cur = cur.parentElement;
    }
    return false;
  }

  /** Try to find the actual DOM element that a finding's rect corresponds to. */
  function findTargetElement(finding) {
    const hint = [finding.targetText, finding.name, finding.patternType]
      .filter(Boolean)
      .join(' ')
      .trim()
      .toLowerCase()
      .slice(0, 120);
    if (!hint) return null;

    // Search clickable/interactive elements for a text match
    const candidates = [
      ...document.querySelectorAll('button, [role="button"], a[href], input[type="submit"], select'),
      ...document.querySelectorAll('[class*="cookie" i], [class*="consent" i], [id*="cookie" i], [id*="consent" i]'),
      ...document.querySelectorAll('[class*="countdown" i], [class*="timer" i]'),
      ...document.querySelectorAll('[class*="price" i], [class*="fee" i], [class*="total" i]'),
    ];
    const words = hint.split(/[\s_]+/).filter((w) => w.length > 3);

    for (const el of candidates) {
      const elText = (el.textContent || '').trim().toLowerCase();
      if (!elText) continue;
      // Exact substring match
      if (elText.includes(hint.slice(0, 50))) return el;
      // Word overlap
      const hits = words.filter((w) => elText.includes(w));
      if (hits.length >= 2) return el;
    }
    return null;
  }

  // State for overlay tracking
  let __dg_overlayEls = [];  // { el, finding, isFixed }
  let __dg_rafScheduled = false;
  let __dg_mutationObs = null;

  function injectOverlayCss() {
    if (window.__DG_OVERLAY_CSS_INJECTED__) return;
    window.__DG_OVERLAY_CSS_INJECTED__ = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('overlay.css');
    link.id = 'dg-overlay-styles';
    document.documentElement.appendChild(link);
  }

  function stopTrackingListeners() {
    window.removeEventListener('scroll', scheduleReposition, true);
    window.removeEventListener('resize', scheduleReposition);
    if (__dg_mutationObs) {
      __dg_mutationObs.disconnect();
      __dg_mutationObs = null;
    }
  }

  function clearOverlays() {
    stopTrackingListeners();
    document.querySelectorAll('.dg-overlay').forEach((el) => el.remove());
    const panel = document.getElementById('dg-panel');
    if (panel) panel.remove();
    __dg_overlayEls = [];
    try {
      chrome.runtime.sendMessage({ type: 'SET_BADGE', count: 0 });
    } catch (_) {}
  }

  function clampOverlayRect(rect, maxW, maxH) {
    let top = Number(rect.top);
    let left = Number(rect.left);
    let w = Math.max(56, Number(rect.width) || 56);
    let h = Math.max(40, Number(rect.height) || 40);
    if (!isFinite(top) || !isFinite(left)) {
      top = 72;
      left = 12;
    }
    top = Math.max(6, Math.min(top, maxH - 12));
    left = Math.max(6, Math.min(left, maxW - 12));
    if (top + h > maxH - 6) top = Math.max(6, maxH - h - 6);
    if (left + w > maxW - 6) left = Math.max(6, maxW - w - 6);
    return { top, left, width: w, height: h };
  }

  /** Reposition all tracked overlays to match their current target rects. */
  function repositionOverlays() {
    const vw = window.innerWidth || 800;
    const vh = window.innerHeight || 600;
    const docW = Math.max(document.documentElement.scrollWidth, vw);
    const docH = Math.max(document.documentElement.scrollHeight, vh);

    for (const entry of __dg_overlayEls) {
      const { el, finding } = entry;
      // Try to find the live DOM element for this finding
      const target = findTargetElement(finding);

      if (target) {
        // We found the actual element — get its CURRENT absolute rect
        const liveRect = target.getBoundingClientRect();
        if (liveRect.width >= 4 && liveRect.height >= 4) {
          const absRect = {
            top: liveRect.top + (window.scrollY || 0),
            left: liveRect.left + (window.scrollX || 0),
            width: liveRect.width,
            height: liveRect.height,
          };

          // Re-check if this target is fixed/sticky
          const nowFixed = isFixedOrSticky(target);
          if (nowFixed !== entry.isFixed) {
            entry.isFixed = nowFixed;
            if (nowFixed) {
              el.classList.add('dg-overlay-fixed');
            } else {
              el.classList.remove('dg-overlay-fixed');
            }
          }

          if (entry.isFixed) {
            // Fixed elements: use viewport-relative rect
            const clamped = clampOverlayRect(
              { top: liveRect.top, left: liveRect.left, width: liveRect.width, height: liveRect.height },
              vw, vh
            );
            el.style.top = `${clamped.top}px`;
            el.style.left = `${clamped.left}px`;
            el.style.width = `${clamped.width}px`;
            el.style.height = `${clamped.height}px`;
          } else {
            // Normal elements: use document-absolute rect
            const clamped = clampOverlayRect(absRect, docW, docH);
            el.style.top = `${clamped.top}px`;
            el.style.left = `${clamped.left}px`;
            el.style.width = `${clamped.width}px`;
            el.style.height = `${clamped.height}px`;
          }
        }
      }
      // If target not found, keep overlay at its current stored absolute position
      // (don't recompute — that would drift on every scroll)
    }
  }

  /** Throttled reposition — called on scroll/resize. */
  function scheduleReposition() {
    if (__dg_rafScheduled) return;
    __dg_rafScheduled = true;
    requestAnimationFrame(() => {
      repositionOverlays();
      __dg_rafScheduled = false;
    });
  }

  /** Start listening for scroll/resize/DOM changes. */
  function startTrackingListeners() {
    window.addEventListener('scroll', scheduleReposition, { passive: true, capture: true });
    window.addEventListener('resize', scheduleReposition, { passive: true });

    // Observe DOM for new elements (cookie popups, modals injected dynamically)
    if (__dg_mutationObs) __dg_mutationObs.disconnect();
    __dg_mutationObs = new MutationObserver(() => {
      scheduleReposition();
    });
    __dg_mutationObs.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }

  function renderOverlays(payload) {
    const findings = payload.findings || [];
    const score = payload.score != null ? payload.score : 100;
    const grade = payload.grade || 'A';
    const label = payload.label || '';

    injectOverlayCss();
    clearOverlays();

    const vw = window.innerWidth || 800;
    const vh = window.innerHeight || 600;
    const docW = Math.max(document.documentElement.scrollWidth, vw);
    const docH = Math.max(document.documentElement.scrollHeight, vh);
    const rootEl = document.documentElement || document.body;

    findings.forEach((finding, idx) => {
      // finding.rect is already document-absolute (serializeRect adds scrollY/X)
      let rect = finding.rect || { top: 8, left: 8, width: 120, height: 40 };
      if (!rect.width || !rect.height || rect.width < 4 || rect.height < 4) {
        const row = Math.floor(idx / 2);
        rect = {
          top: 70 + row * 52 + (window.scrollY || 0),
          left: 12 + (idx % 2) * Math.min(160, vw / 2 - 20),
          width: Math.min(320, vw - 32),
          height: 44,
        };
      }

      // Determine if this finding targets a fixed/sticky element
      const target = findTargetElement(finding);
      const fixed = target ? isFixedOrSticky(target) : false;

      // Use live target rect if we found the element (convert to absolute)
      if (target) {
        const liveRect = target.getBoundingClientRect();
        if (liveRect.width >= 4 && liveRect.height >= 4) {
          rect = {
            top: liveRect.top + (window.scrollY || 0),
            left: liveRect.left + (window.scrollX || 0),
            width: liveRect.width,
            height: liveRect.height,
          };
        }
      }

      let finalRect;
      if (fixed) {
        // Fixed/sticky elements: convert back to viewport-relative for fixed positioning
        const viewportRect = {
          top: rect.top - (window.scrollY || 0),
          left: rect.left - (window.scrollX || 0),
          width: rect.width,
          height: rect.height,
        };
        finalRect = clampOverlayRect(viewportRect, vw, vh);
      } else {
        // Normal elements: rects are already document-absolute
        finalRect = clampOverlayRect(rect, docW, docH);
      }

      const sev = finding.severity || 'low';
      const wrap = document.createElement('div');
      wrap.className = `dg-overlay dg-severity-${sev}${fixed ? ' dg-overlay-fixed' : ''}`;
      wrap.style.top = `${finalRect.top}px`;
      wrap.style.left = `${finalRect.left}px`;
      wrap.style.width = `${finalRect.width}px`;
      wrap.style.height = `${finalRect.height}px`;
      wrap.style.boxSizing = 'border-box';
      wrap.style.setProperty('z-index', '2147483646', 'important');
      wrap.style.setProperty('isolation', 'isolate', 'important');
      wrap.setAttribute(
        'title',
        `${finding.name || finding.patternType || 'Pattern'} — hover for details`
      );

      const badge = document.createElement('div');
      badge.className = 'dg-badge';
      badge.textContent = finding.name || finding.patternType || 'Pattern';

      const tip = document.createElement('div');
      tip.className = 'dg-tooltip';
      const ptype = document.createElement('div');
      ptype.className = 'dg-tooltip-pattern';
      ptype.textContent = finding.patternType ? String(finding.patternType) : '';
      const title = document.createElement('div');
      title.className = 'dg-tooltip-title';
      title.textContent = finding.name || '';
      const desc = document.createElement('div');
      desc.className = 'dg-tooltip-desc';
      desc.textContent = finding.description || '';
      const reg = document.createElement('div');
      reg.className = 'dg-tooltip-reg';
      reg.textContent = finding.regulation || '';
      if (ptype.textContent) tip.appendChild(ptype);
      tip.appendChild(title);
      tip.appendChild(desc);
      tip.appendChild(reg);
      if (finding.corroborated) {
        const c = document.createElement('div');
        c.className = 'dg-tooltip-corr';
        c.textContent = 'Corroborated by multiple analyzers';
        tip.appendChild(c);
      }
      wrap.appendChild(badge);
      wrap.appendChild(tip);
      rootEl.appendChild(wrap);

      // Track this overlay for repositioning
      __dg_overlayEls.push({ el: wrap, finding, isFixed: fixed });
    });

    const panel = document.createElement('div');
    panel.id = 'dg-panel';
    const icon = document.createElement('div');
    icon.style.fontSize = '28px';
    icon.style.lineHeight = '1';
    icon.textContent = '🛡️';
    const meta = document.createElement('div');
    meta.id = 'dg-panel-meta';
    const gradeEl = document.createElement('div');
    gradeEl.id = 'dg-panel-grade';
    gradeEl.className = `grade-${grade.replace('+', 'plus')}`;
    gradeEl.textContent = grade;
    const scoreEl = document.createElement('div');
    scoreEl.id = 'dg-panel-score';
    scoreEl.textContent = `Trust score: ${score}/100`;
    const labelEl = document.createElement('div');
    labelEl.id = 'dg-panel-label';
    labelEl.textContent = label || '';
    const countEl = document.createElement('div');
    countEl.id = 'dg-panel-count';
    countEl.textContent = `${findings.length} finding${findings.length === 1 ? '' : 's'}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'dg-panel-details';
    btn.textContent = 'View Details';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
      } catch (_) {}
    });
    meta.appendChild(gradeEl);
    meta.appendChild(scoreEl);
    if (label) meta.appendChild(labelEl);
    meta.appendChild(countEl);
    meta.appendChild(btn);
    panel.style.setProperty('z-index', '2147483645', 'important');
    panel.appendChild(icon);
    panel.appendChild(meta);
    rootEl.appendChild(panel);

    try {
      chrome.runtime.sendMessage({ type: 'SET_BADGE', count: findings.length });
    } catch (_) {}

    // Start tracking scroll/resize/DOM changes
    startTrackingListeners();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'RENDER_OVERLAYS') {
      renderOverlays(msg);
      sendResponse({ ok: true });
    }
    if (msg.type === 'CLEAR_OVERLAYS') {
      clearOverlays();
      sendResponse({ ok: true });
    }
    if (msg.type === 'GET_SIGNALS') {
      try {
        sendResponse(extractPageSignals());
      } catch (e) {
        sendResponse({ error: String(e && e.message) });
      }
      return true;
    }
    if (msg.type === 'SCROLL_TO_FINDING') {
      const idx = msg.index;
      const entry = __dg_overlayEls[idx];
      if (entry && entry.el) {
        entry.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Pulse animation
        entry.el.classList.remove('dg-overlay-pulse');
        void entry.el.offsetWidth; // force reflow to restart animation
        entry.el.classList.add('dg-overlay-pulse');
        setTimeout(() => entry.el.classList.remove('dg-overlay-pulse'), 1800);
      }
      sendResponse({ ok: true });
    }
    if (msg.type === 'FOCUS_FINDING') {
      const idx = msg.index; // -1 means clear focus (show all)
      for (let i = 0; i < __dg_overlayEls.length; i++) {
        const entry = __dg_overlayEls[i];
        if (!entry || !entry.el) continue;
        if (idx === -1) {
          // Clear all dimming — show everything
          entry.el.classList.remove('dg-overlay-dimmed');
        } else if (i === idx) {
          // This is the focused one — make it bright + pulse
          entry.el.classList.remove('dg-overlay-dimmed');
          entry.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          entry.el.classList.remove('dg-overlay-pulse');
          void entry.el.offsetWidth;
          entry.el.classList.add('dg-overlay-pulse');
          setTimeout(() => entry.el.classList.remove('dg-overlay-pulse'), 1800);
        } else {
          // Dim everything else
          entry.el.classList.add('dg-overlay-dimmed');
        }
      }
      sendResponse({ ok: true });
    }
    if (msg.type === 'FILTER_SEVERITY') {
      const allowed = msg.allowedSeverities || ['high', 'medium', 'low'];
      for (const entry of __dg_overlayEls) {
        if (!entry || !entry.el || !entry.finding) continue;
        const sev = entry.finding.severity || 'low';
        if (allowed.includes(sev)) {
          entry.el.style.display = '';
        } else {
          entry.el.style.display = 'none';
        }
      }
      sendResponse({ ok: true });
    }
  });
})();
