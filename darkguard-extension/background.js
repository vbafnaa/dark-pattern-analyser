const SESSION_PREFIX = 'dg_tab_';

function calculateScore(findings) {
  const weights = { high: 20, medium: 10, low: 4 };
  let penalty = 0;
  findings.forEach((f) => {
    const w = weights[f.severity] || 5;
    penalty += f.corroborated ? w * 1.5 : w;
  });
  const score = Math.max(0, Math.round(100 - penalty));
  const grade =
    score >= 90
      ? 'A+'
      : score >= 80
        ? 'A'
        : score >= 70
          ? 'B'
          : score >= 55
            ? 'C'
            : score >= 40
              ? 'D'
              : score >= 20
                ? 'E'
                : 'F';
  const label =
    score >= 90
      ? 'Excellent — no significant manipulation detected'
      : score >= 80
        ? 'Good — minor issues only'
        : score >= 70
          ? 'Fair — some manipulative patterns present'
          : score >= 55
            ? 'Poor — multiple dark patterns found'
            : score >= 40
              ? 'Very poor — significant manipulation'
              : score >= 20
                ? 'Failing — pervasive deceptive design'
                : 'Critical — severe consumer rights violations';
  return { score, grade, label };
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

function mergeFindings(domFindings, textFindings, aiFindings) {
  const labeled = [
    ...domFindings.map((f) => ({ ...f, _src: 'DOM' })),
    ...textFindings.map((f) => ({ ...f, _src: 'Text' })),
    ...aiFindings.map((f) => ({ ...f, _src: 'AI' })),
  ];
  const byType = new Map();
  for (const f of labeled) {
    const key = f.patternType || f.name || 'unknown';
    if (!byType.has(key)) {
      byType.set(key, []);
    }
    byType.get(key).push(f);
  }
  const merged = [];
  for (const [, group] of byType) {
    const analyzers = [...new Set(group.map((g) => g._src))];
    const corroborated = analyzers.length >= 2;
    let best = group[0];
    for (const g of group) {
      const r1 = SEVERITY_RANK[g.severity] || 0;
      const r0 = SEVERITY_RANK[best.severity] || 0;
      if (r1 > r0) best = g;
    }
    const { _src, ...rest } = best;
    let conf = rest.confidence ?? 0.5;
    if (corroborated) conf = Math.min(1, conf + 0.1);
    merged.push({
      ...rest,
      confidence: conf,
      corroborated,
      analyzer: rest.analyzer || best._src,
    });
  }
  return merged;
}

function defaultRect(signals) {
  return { top: 72, left: 16, width: 280, height: 48 };
}

function textPool(signals) {
  const out = [];
  const push = (text, rect) => {
    if (text == null || !rect) return;
    const t = String(text).trim();
    if (t.length < 1) return;
    out.push({ text: t, rect });
  };
  (signals.clickables || []).forEach((x) => push(x.text, x.rect));
  (signals.buttons || []).forEach((b) => push(b.text, b.rect));
  (signals.links || []).forEach((l) => push(l.text, l.rect));
  (signals.headings || []).forEach((h) => push(h.text, h.rect));
  (signals.urgencyTexts || []).forEach((u) => push(u.text, u.rect));
  (signals.cookieBanners || []).forEach((c) => push(c.text, c.rect));
  (signals.modals || []).forEach((m) => push(m.text, m.rect));
  (signals.priceElements || []).forEach((p) => push(p.text, p.rect));
  (signals.totalSummaryElements || []).forEach((p) => push(p.text, p.rect));
  (signals.feeElements || []).forEach((p) => push(p.text, p.rect));
  (signals.strikethroughPrices || []).forEach((p) => push(p.text, p.rect));
  (signals.smallPrintHits || []).forEach((p) => push(p.text, p.rect));
  (signals.declineCandidates || []).forEach((p) => push(p.text, p.rect));
  (signals.primaryCandidates || []).forEach((p) => push(p.text, p.rect));
  (signals.countdowns || []).forEach((p) => push(p.text, p.rect));
  return out;
}

function isBadRect(r) {
  if (!r || typeof r !== 'object') return true;
  const w = Number(r.width);
  const h = Number(r.height);
  if (!isFinite(w) || !isFinite(h) || w < 3 || h < 3) return true;
  return false;
}

function attachRects(findings, signals) {
  return findings.map((f, i) => resolveFindingRect(f, signals, i));
}

function resolveFindingRect(finding, signals, idx) {
  let r = finding.rect;
  if (!isBadRect(r)) {
    return {
      ...finding,
      rect: {
        top: r.top,
        left: r.left,
        width: Math.max(48, r.width),
        height: Math.max(32, r.height),
      },
    };
  }
  const hint = [finding.targetText, finding.patternType?.replace(/_/g, ' '), finding.name]
    .filter(Boolean)
    .join(' ')
    .slice(0, 120);
  const hit = findRectForTarget(hint, signals);
  if (!isBadRect(hit)) {
    return {
      ...finding,
      rect: {
        top: hit.top,
        left: hit.left,
        width: Math.max(48, hit.width),
        height: Math.max(32, hit.height),
      },
    };
  }
  const vw = signals.viewport?.width || 800;
  const vh = signals.viewport?.height || 600;
  const row = Math.floor(idx / 2);
  const col = idx % 2;
  return {
    ...finding,
    rect: {
      top: 56 + row * 50,
      left: 10 + col * Math.min(150, Math.max(80, vw / 2 - 30)),
      width: Math.min(320, vw - 24),
      height: 44,
    },
  };
}

function rectForSnippet(snippet, signals) {
  const s = (snippet || '').trim().slice(0, 80).toLowerCase();
  if (!s) return defaultRect(signals);
  const pool = textPool(signals);
  for (const p of pool) {
    const t = (p.text || '').toLowerCase();
    if (t.includes(s) || s.split(/\s+/).some((w) => w.length > 4 && t.includes(w))) {
      return p.rect;
    }
  }
  return (signals.cookieBanners && signals.cookieBanners[0]?.rect) || defaultRect(signals);
}

function extractMoneyValues(text) {
  const m = String(text || '').match(/\$[\d,]+(?:\.\d{2})?|\d+[\d,]*(?:\.\d{2})?\s*(?:USD|EUR|£)/gi);
  if (!m) return [];
  return m
    .map((x) => parseFloat(x.replace(/[^\d.]/g, '')))
    .filter((n) => !isNaN(n) && n > 0);
}

function runDOMAnalyzer(signals) {
  const findings = [];
  const push = (f) => findings.push(f);

  const priceInLabel = (label) =>
    /\$|\/mo\b|\/month|\/year|\/week/i.test(label || '');

  const trialInLabel = (label) =>
    /trial|free trial|prime|member|membership/i.test(label || '');

  const marketingInLabel = (label) =>
    /email|newsletter|offers|promotions|updates|marketing/i.test(label || '');

  const dataShareInLabel = (label) =>
    /partner|third party|third-party|share|affiliate/i.test(label || '');

  for (const cb of signals.checkboxes || []) {
    if (!cb.checked) continue;
    const label = cb.labelText || '';
    if (priceInLabel(label)) {
      push({
        patternType: 'pre_checked_subscription',
        name: 'Pre-checked Subscription',
        severity: 'high',
        description:
          'Auto-enrolls user in paid recurring charge without explicit opt-in.',
        regulation: 'FTC Negative Option Rule; GDPR Art.7',
        rect: cb.rect,
        analyzer: 'DOM',
        confidence: 0.85,
      });
    }
    if (trialInLabel(label)) {
      push({
        patternType: 'pre_checked_trial',
        name: 'Pre-checked Free Trial',
        severity: 'high',
        description: 'Trial converts to paid automatically unless unchecked.',
        regulation: 'FTC Negative Option Rule; GDPR Art.7',
        rect: cb.rect,
        analyzer: 'DOM',
        confidence: 0.82,
      });
    }
    if (marketingInLabel(label)) {
      push({
        patternType: 'pre_checked_marketing',
        name: 'Pre-checked Marketing Consent',
        severity: 'medium',
        description: 'Consent to marketing communications assumed rather than given.',
        regulation: 'GDPR Art.7; CCPA',
        rect: cb.rect,
        analyzer: 'DOM',
        confidence: 0.72,
      });
    }
    if (dataShareInLabel(label)) {
      push({
        patternType: 'pre_checked_data_sharing',
        name: 'Pre-checked Data Sharing',
        severity: 'high',
        description: 'Data sharing with third parties pre-authorized via pre-ticked box.',
        regulation: 'GDPR Art.7; CCPA §1798.120',
        rect: cb.rect,
        analyzer: 'DOM',
        confidence: 0.78,
      });
    }
    if (/re-?subscribe|keep receiving|stay subscribed|keep me subscribed/i.test(label)) {
      push({
        patternType: 'trick_unsubscribe',
        name: 'Misleading Unsubscribe',
        severity: 'high',
        description: 'Unsubscribe flow may use pre-checked options to keep subscriptions active.',
        regulation: 'CAN-SPAM Act; GDPR',
        rect: cb.rect,
        analyzer: 'DOM',
        confidence: 0.7,
      });
    }
  }

  const hasHms = (signals.countdowns || []).some((c) =>
    /\d{1,2}:\d{2}:\d{2}/.test(c.text || '')
  );
  if ((signals.countdowns || []).length > 0 && hasHms) {
    const r = signals.countdowns[0].rect;
    push({
      patternType: 'fake_countdown',
      name: 'Fake Countdown Timer',
      severity: 'high',
      description:
        'Countdown timers often reset on reload — manufactured urgency.',
      regulation: 'FTC Act §5; EU DSA Art.25',
      rect: r,
      analyzer: 'DOM',
      confidence: 0.7,
    });
  }

  const allPrices = [
    ...(signals.priceElements || []).map((p) => p.text),
    ...(signals.totalSummaryElements || []).map((p) => p.text),
  ].join(' ');
  const nums = extractMoneyValues(allPrices);
  if (nums.length >= 2) {
    const hi = Math.max(...nums);
    const lo = Math.min(...nums);
    if (lo > 0 && hi > lo * 1.25 && hi - lo >= 15) {
      const rect =
        (signals.totalSummaryElements && signals.totalSummaryElements[0]?.rect) ||
        (signals.priceElements && signals.priceElements[0]?.rect) ||
        defaultRect(signals);
      push({
        patternType: 'hidden_price_increase',
        name: 'Hidden Price Increase',
        severity: 'high',
        description:
          'Displayed totals or summaries diverge substantially from earlier price cues.',
        regulation: 'FTC Act §5; EU Consumer Rights Directive',
        rect,
        analyzer: 'DOM',
        confidence: 0.55,
      });
    }
  }

  const hid = signals.hiddenInputCount || (signals.hiddenElements || []).length;
  const sensitiveHidden = (signals.hiddenElements || []).some((h) =>
    /subscribe|opt|consent|agree/i.test(h.name || '')
  );
  if (hid > 12 || sensitiveHidden) {
    push({
      patternType: 'hidden_inputs',
      name: 'Suspicious Hidden Fields',
      severity: 'low',
      description:
        'Hidden fields may pre-select options or pass undisclosed subscription/consent data.',
      regulation: 'FTC Act §5',
      rect: defaultRect(signals),
      analyzer: 'DOM',
      confidence: 0.52,
    });
  }

  const mp = signals.maxPrimaryButtonArea || 0;
  const md = signals.maxDeclineButtonArea || 0;
  if (mp > 0 && md > 0 && mp > md * 3) {
    const pr =
      (signals.primaryCandidates || []).sort((a, b) => b.area - a.area)[0] || null;
    push({
      patternType: 'interface_interference_cta',
      name: 'Asymmetric CTA Sizing',
      severity: 'medium',
      description: 'Primary action is much larger than decline/cancel, skewing choice architecture.',
      regulation: 'EU DSA Art.25; CPRA',
      rect: pr ? pr.rect : defaultRect(signals),
      analyzer: 'DOM',
      confidence: 0.6,
    });
  }

  for (const d of signals.declineCandidates || []) {
    if (d.contrastRatio != null && d.contrastRatio < 3) {
      push({
        patternType: 'low_contrast_decline',
        name: 'Low Contrast Decline Option',
        severity: 'medium',
        description: 'Decline/skip control has weak contrast, making opt-out harder to see.',
        regulation: 'WCAG 2.1; EU DSA Art.25',
        rect: d.rect,
        analyzer: 'DOM',
        confidence: 0.65,
      });
      break;
    }
  }

  for (const u of signals.unsubscribeLinks || []) {
    const h = (u.href || '').toLowerCase();
    if (/login|signin|sign-in|account|auth/i.test(h) || u.pathDepth >= 5) {
      push({
        patternType: 'roach_motel_depth',
        name: 'Deep Cancellation Flow',
        severity: 'high',
        description:
          'Unsubscribe/cancel link routes through sign-in or an unusually deep path.',
        regulation: 'FTC Act §5; EU DSA Art.25',
        rect: u.rect,
        analyzer: 'DOM',
        confidence: 0.58,
      });
      break;
    }
  }

  const btnLinkTexts = [
    ...(signals.buttons || []).map((b) => b.text || ''),
    ...(signals.links || []).map((l) => l.text || ''),
  ];
  const hasRejectAll = btnLinkTexts.some((t) =>
    /reject all|decline all|deny all/i.test(t)
  );
  const hasAcceptBtn = btnLinkTexts.some((t) =>
    /accept all|allow all|accept cookies|i agree|got it/i.test(t)
  );
  if ((signals.cookieBanners || []).length > 0 && hasAcceptBtn && !hasRejectAll) {
    push({
      patternType: 'missing_reject_all',
      name: 'Missing Reject All Cookie Option',
      severity: 'medium',
      description: 'Cookie UI without an equally clear reject-all / deny-all control.',
      regulation: 'GDPR Art.7; ePrivacy Directive',
      rect: signals.cookieBanners[0].rect,
      analyzer: 'DOM',
      confidence: 0.62,
    });
  }

  if (signals.hasEmailAndPasswordInputs && !signals.priceVisibleOnPage) {
    push({
      patternType: 'forced_account_creation',
      name: 'Forced Account Creation',
      severity: 'medium',
      description: 'Email/password gate appears before clear pricing is shown.',
      regulation: 'EU Consumer Rights Directive',
      rect: defaultRect(signals),
      analyzer: 'DOM',
      confidence: 0.5,
    });
  }

  if ((signals.autoplayMedia || []).length > 0) {
    const autoRect = signals.autoplayMedia[0].rect;
    push({
      patternType: 'auto_playing_media',
      name: 'Autoplay Media',
      severity: 'low',
      description: 'Autoplaying audio/video can hijack attention without explicit consent.',
      regulation: 'EU DSA Art.25',
      rect: autoRect,
      analyzer: 'DOM',
      confidence: 0.56,
    });
  }

  if (!signals.hasPagination && !signals.hasFooter && signals.scrollHeavy) {
    push({
      patternType: 'infinite_scroll',
      name: 'Infinite Scroll Without Pagination',
      severity: 'low',
      description: 'Very long scroll-heavy layout with no clear pagination controls and no visible footer.',
      regulation: 'EU DSA Art.25',
      rect: defaultRect(signals),
      analyzer: 'DOM',
      confidence: 0.45,
    });
  }

  for (const s of signals.sponsoredBlocks || []) {
    if (!s.labeled && (s.text || '').length > 5) {
      push({
        patternType: 'disguised_ad',
        name: 'Disguised Advertisement',
        severity: 'high',
        description: 'Sponsored/ad slot lacks clear “Ad” or “Sponsored” labeling.',
        regulation: 'FTC Native Advertising Guidelines; EU DSA',
        rect: s.rect,
        analyzer: 'DOM',
        confidence: 0.6,
      });
      break;
    }
  }

  const early = ((signals.bodyTextSample || '').slice(0, 800) || '').toLowerCase();
  if (/turn on notifications|enable notifications|get notifications|allow notifications/i.test(early)) {
    push({
      patternType: 'nagging_notification',
      name: 'Notification Permission Nagging',
      severity: 'medium',
      description: 'Notification opt-in messaging appears before meaningful engagement.',
      regulation: 'EU DSA Art.25',
      rect: defaultRect(signals),
      analyzer: 'DOM',
      confidence: 0.42,
    });
  }

  if ((signals.smallPrintHits || []).length > 0) {
    const h = signals.smallPrintHits[0];
    push({
      patternType: 'visual_misdirection',
      name: 'Visual Misdirection',
      severity: 'medium',
      description:
        'Renewal, fee, or billing language appears in very small type vs surrounding content.',
      regulation: 'FTC Act §5',
      rect: h.rect,
      analyzer: 'DOM',
      confidence: 0.55,
    });
  }

  if (
    (signals.strikethroughPrices || []).length > 0 &&
    (signals.priceElements || []).length > 0
  ) {
    push({
      patternType: 'price_anchoring_fake',
      name: 'Fake Original Price',
      severity: 'medium',
      description: 'Strikethrough “original” pricing paired with a promotional price — often unverified.',
      regulation: 'FTC Guides Against Deceptive Pricing',
      rect: signals.strikethroughPrices[0].rect,
      analyzer: 'DOM',
      confidence: 0.5,
    });
  }

  if (
    (signals.feeElements || []).length >= 2 &&
    ((signals.totalSummaryElements || []).length > 0 ||
      /checkout|cart|payment|book/i.test(signals.url || ''))
  ) {
    push({
      patternType: 'drip_pricing',
      name: 'Drip Pricing / Fee Reveal',
      severity: 'high',
      description: 'Multiple fee/surcharge lines surface near checkout or totals.',
      regulation: 'FTC Act §5; EU Consumer Rights Directive',
      rect: signals.feeElements[0].rect,
      analyzer: 'DOM',
      confidence: 0.58,
    });
  }

  return findings;
}

function approxReadingDifficulty(text) {
  const s = String(text || '').trim();
  if (!s) return { aps: 0, asw: 0 };
  const sentences = s.split(/[.!?]+/).filter(Boolean).length || 1;
  const words = s.split(/\s+/).filter(Boolean);
  const syll = words.reduce((acc, w) => {
    const m = w.toLowerCase().replace(/[^a-z]/g, '').match(/[aeiouy]+/g);
    return acc + (m ? m.length : 1);
  }, 0);
  return { aps: words.length / sentences, asw: syll / Math.max(1, words.length) };
}

function runTextAnalyzer(signals) {
  const findings = [];
  const blob = [
    signals.bodyTextSample || '',
    ...(signals.buttons || []).map((b) => b.text),
    ...(signals.links || []).map((l) => l.text),
    ...(signals.headings || []).map((h) => h.text),
    ...(signals.cookieBanners || []).map((c) => c.text),
    ...(signals.modals || []).map((m) => m.text),
  ].join('\n');
  const lower = blob.toLowerCase();

  const add = (def, matchSnippet) => {
    findings.push({
      patternType: def.patternType,
      name: def.name,
      severity: def.severity,
      description: def.description,
      regulation: def.regulation,
      rect: rectForSnippet(matchSnippet || def.fallbackSnippet || '', signals),
      analyzer: 'Text',
      confidence: def.confidence ?? 0.65,
    });
  };

  const textRules = [
    {
      patternType: 'confirmshaming',
      name: 'Confirmshaming',
      severity: 'medium',
      re: /no thanks.*i prefer|no.*i don.?t want|i hate (saving|deals|money|discounts)|no.*i.?d rather pay more|i don.?t want (free|savings|to save)/i,
      description: 'Decline option uses guilt or shame to steer users away from opting out.',
      regulation: 'EU DSA Art.25; CPRA',
      confidence: 0.78,
    },
    {
      patternType: 'false_scarcity_stock',
      name: 'False Stock Scarcity',
      severity: 'high',
      re: /only \d+ (items?|units?|left|remaining) in stock|\d+ (items?|units?) left|almost (gone|sold out)|hurry.*stock/i,
      description: 'Unverifiable low-stock messaging pressures immediate purchase.',
      regulation: 'FTC Act §5; EU DSA Art.25',
      confidence: 0.72,
    },
    {
      patternType: 'false_scarcity_time',
      name: 'False Time Scarcity',
      severity: 'high',
      re: /offer (expires?|ends?) (today|tonight|soon|in \d+)|deal ends in|today only|limited time offer|price (increases?|goes up) (at|on|after)/i,
      description: 'Artificial deadlines exaggerate urgency to convert sales.',
      regulation: 'FTC Act §5',
      confidence: 0.7,
    },
    {
      patternType: 'fake_social_proof_viewers',
      name: 'Fake Viewer Count',
      severity: 'medium',
      re: /\d+ (people|customers?|shoppers?|users?) (are\s)?(currently\s)?(viewing|watching|looking at|browsing)/i,
      description: 'Live viewer counts are rarely verifiable and often fabricated.',
      regulation: 'FTC Act §5',
      confidence: 0.66,
    },
    {
      patternType: 'fake_social_proof_buyers',
      name: 'Fake Purchase Count',
      severity: 'medium',
      re: /\d+ (people\s)?(bought|purchased|ordered) (this|today|in the last)|\d+\+ (sold|orders?) (today|this week|this hour)/i,
      description: 'Purchase volume claims used to simulate demand.',
      regulation: 'FTC Act §5',
      confidence: 0.64,
    },
    {
      patternType: 'fake_social_proof_trending',
      name: 'Fake Trending Label',
      severity: 'low',
      re: /(#\d+\s)?(best\s?seller|trending|most popular|top rated)\s*(this week|today|right now)/i,
      description: 'Trending/bestseller labels without transparent methodology.',
      regulation: 'FTC Act §5',
      confidence: 0.50,
    },
    {
      patternType: 'misleading_free',
      name: 'Misleading “Free” Label',
      severity: 'high',
      re: /\bfree\b[\s\S]{0,120}(\$\d+|per month|per year|after trial|then \$|billed)/i,
      description: '“Free” framing conceals automatic paid conversion or billing.',
      regulation: 'FTC Act §5',
      confidence: 0.68,
    },
    {
      patternType: 'hidden_auto_renewal',
      name: 'Hidden Auto-Renewal',
      severity: 'high',
      re: /auto-?renew|automatically renew|recurring (charge|billing|payment)/i,
      description: 'Auto-renewal disclosed only generically, often buried near pricing.',
      regulation: 'FTC Negative Option Rule; ROSCA',
      confidence: 0.62,
    },
    {
      patternType: 'cancellation_penalty',
      name: 'Hidden Cancellation Penalty',
      severity: 'high',
      re: /cancel.*fee|cancellation.*charge|early termination|\d+%.*remaining.*balance|penalty.*cancel/i,
      description: 'Cancellation fees or penalties surfaced as fine print.',
      regulation: 'EU Consumer Rights Directive; FTC Act §5',
      confidence: 0.6,
    },
    {
      patternType: 'misleading_discount',
      name: 'Misleading Discount Framing',
      severity: 'medium',
      re: /\d{1,3}%\s*(off|discount)/i,
      extra: () => {
        // Don't fire if strikethrough/reference prices exist (discount is substantiated)
        if ((signals.strikethroughPrices || []).length > 0) return false;
        // Don't fire if reference price words exist near the top of the page
        if (/\b(was|originally|list price|regular price|compare at|retail price)\b/i.test(lower.slice(0, 3500))) return false;
        return true;
      },
      description: 'Percent-off claims with weak or missing reference pricing nearby.',
      regulation: 'FTC Guides Against Deceptive Pricing',
      confidence: 0.55,
    },
    {
      patternType: 'fake_urgency_low_price',
      name: 'Fake Price-Lock Urgency',
      severity: 'medium',
      re: /prices? (may|will) (increase|go up|change)|lock in.*price|price (guaranteed|locked).*only.*\d+ (hours?|days?)/i,
      description: 'Manufactured urgency around future price changes.',
      regulation: 'FTC Act §5',
      confidence: 0.55,
    },
    {
      patternType: 'scare_language',
      name: 'Scare/Fear Language',
      severity: 'medium',
      re: /your (account|data|privacy|security) (is\s)?(at risk|may be compromised|is unprotected)/i,
      description: 'Fear-based copy pushes upgrades or consent without substantiation.',
      regulation: 'FTC Act §5; EU DSA Art.25',
      confidence: 0.57,
    },
    {
      patternType: 'fake_personalization',
      name: 'Fake Personalization',
      severity: 'low',
      re: /chosen (just\s)?for you|specially selected|based on your (preferences|history|behavior)/i,
      description: 'Implausible personalization claims to increase trust.',
      regulation: 'FTC Act §5',
      confidence: 0.45,
    },
    {
      patternType: 'guilt_retention',
      name: 'Guilt-Based Retention',
      severity: 'medium',
      re: /are you sure.*cancel|we.?ll miss you|your (progress|streak|savings|benefits) will be lost|\d+ (days?|weeks?|months?) of.*gone/i,
      description: 'Loss-aversion language obstructs cancellations or downgrades.',
      regulation: 'EU DSA Art.25',
      confidence: 0.58,
    },
    {
      patternType: 'misleading_opt_out',
      name: 'Misleading Opt-Out Framing',
      severity: 'high',
      re: /uncheck.*to (not\s)?receive|deselect.*if you (don.?t\s)?want|untick.*to opt out/i,
      description: 'Double-negative phrasing confuses what opting in or out means.',
      regulation: 'GDPR Art.7; CCPA',
      confidence: 0.7,
    },
    {
      patternType: 'negative_option',
      name: 'Negative Option Marketing',
      severity: 'high',
      re: /unless you cancel|until you cancel|automatically added|you will be charged.*unless/i,
      description: 'Charges continue unless the user actively cancels.',
      regulation: 'FTC Negative Option Rule; ROSCA',
      confidence: 0.65,
    },
    {
      patternType: 'dark_enrollment',
      name: 'Stealth Enrollment',
      severity: 'high',
      re: /by (clicking|proceeding|continuing|placing your order).*you (agree to|are enrolling in|are signing up for)/i,
      description: 'Bundled enrollment language is secondary to the primary CTA.',
      regulation: 'FTC Act §5; ROSCA',
      confidence: 0.62,
    },
    {
      patternType: 'subscription_trap',
      name: 'Subscription Trap Language',
      severity: 'high',
      re: /free.*\d+ (days?|weeks?|months?).*(then|after).*\$\d+/i,
      description: 'Free trial copy downplays the paid conversion that follows.',
      regulation: 'FTC Negative Option Rule',
      confidence: 0.64,
    },
    {
      patternType: 'forced_continuity',
      name: 'Forced Continuity',
      severity: 'high',
      re: /after your (free\s)?trial.*charged automatically|no (need\s)?to (do anything|take action)/i,
      description: 'Post-trial billing framed as requiring no further user action.',
      regulation: 'FTC Negative Option Rule',
      confidence: 0.63,
    },
    {
      patternType: 'bait_and_switch',
      name: 'Bait and Switch',
      severity: 'high',
      re: /./,
      description: 'Heading/title price cues diverge sharply from primary CTA amounts.',
      regulation: 'FTC Act §5',
      confidence: 0.5,
      custom: true,
    },
  ];

  const seen = new Set();
  for (const rule of textRules) {
    if (rule.custom && rule.patternType === 'bait_and_switch') {
      const h1 = (signals.headings || []).find((h) => h.tag === 'H1');
      const h1Prices = h1 ? extractMoneyValues(h1.text) : [];
      const btnMoney = extractMoneyValues(
        (signals.buttons || []).map((b) => b.text).join(' ')
      );
      if (
        h1Prices.length &&
        btnMoney.length &&
        Math.abs(Math.max(...h1Prices) - Math.max(...btnMoney)) >= 5
      ) {
        if (!seen.has(rule.patternType)) {
          seen.add(rule.patternType);
          add(rule, h1.text);
        }
      }
      continue;
    }
    if (rule.extra && !rule.extra()) continue;
    if (rule.re.test(blob) && !seen.has(rule.patternType)) {
      seen.add(rule.patternType);
      const m = blob.match(rule.re);
      add(rule, m ? m[0] : '');
    }
  }

  if (signals.reviewsSection && /verified purchase|verified buyer/i.test(blob)) {
    if (!seen.has('fake_review_signals')) {
      seen.add('fake_review_signals');
      add(
        {
          patternType: 'fake_review_signals',
          name: 'Suspicious Review Patterns',
          severity: 'medium',
          description: 'Review UI shows “verified” labels without obvious verification context.',
          regulation: 'FTC Endorsement Guides',
          confidence: 0.48,
        },
        'verified'
      );
    }
  }

  if (
    /\$\d+[^\n]{0,50}\/mo\b/i.test(blob) &&
    /(\$\d+[^\n]{0,50}\/(yr|year)|per\s+year)/i.test(blob) &&
    !seen.has('price_confusion')
  ) {
    seen.add('price_confusion');
    add(
      {
        patternType: 'price_confusion',
        name: 'Confusing Price Display',
        severity: 'medium',
        description: 'Monthly and yearly prices appear in proximity — period labeling may confuse users.',
        regulation: 'EU Consumer Rights Directive',
        confidence: 0.45,
      },
      '/mo /yr'
    );
  }

  const cookieBlob = (signals.cookieBanners || []).map((c) => c.text).join('\n');
  if (cookieBlob.length > 800) {
    const rd = approxReadingDifficulty(cookieBlob);
    if (rd.aps > 25 && rd.asw > 2) {
      if (!seen.has('privacy_zuckering')) {
        seen.add('privacy_zuckering');
        add(
          {
            patternType: 'privacy_zuckering',
            name: 'Confusing Privacy Language',
            severity: 'medium',
            description: 'Consent copy is unusually long or structurally complex.',
            regulation: 'GDPR Art.7 Recital 32',
            confidence: 0.52,
          },
          cookieBlob.slice(0, 40)
        );
      }
    }
  }

  const hasCookie = (signals.cookieBanners || []).length > 0;
  const poolTexts = [...(signals.buttons || []).map((b) => b.text), ...(signals.links || []).map((l) => l.text)];
  const hasRejectAll = poolTexts.some((t) => /reject all|decline all|deny all/i.test(t));
  const hasAccept = poolTexts.some((t) =>
    /accept all|allow all|accept cookies|i agree/i.test(t)
  );
  if (hasCookie && hasAccept && !hasRejectAll && !seen.has('missing_reject_all')) {
    seen.add('missing_reject_all');
    add(
      {
        patternType: 'missing_reject_all',
        name: 'Missing Reject All Cookie Option',
        severity: 'medium',
        description: 'Accept-all path exists without a matching reject-all / deny-all control.',
        regulation: 'GDPR Art.7; ePrivacy Directive',
        confidence: 0.66,
      },
      'cookie'
    );
  }

  if (
    (signals.modals || []).length > 0 &&
    !seen.has('forced_registration')
  ) {
    // Check if modal text itself contains subscribe/sign-up language
    const modalBlob = (signals.modals || []).map((m) => m.text).join('\n').toLowerCase();
    const modalHasSignup = /\bsubscribe\b|\bsign up\b|\bsign.in\b|\bcreate.*(account|profile)\b|\bregist/i.test(modalBlob);
    if (modalHasSignup) {
      seen.add('forced_registration');
      add(
        {
          patternType: 'forced_registration',
          name: 'Forced Registration Prompt',
          severity: 'low',
          description: 'Subscribe/sign-up prompts appear inside blocking overlays.',
          regulation: 'GDPR Art.7',
          confidence: 0.55,
        },
        'subscribe'
      );
    }
  }

  const recurring = (signals.priceElements || []).some((p) => /\/mo\b|\/month|per month/i.test(p.text || ''));
  if (recurring) {
    for (const b of signals.buttons || []) {
      if (/\bfree\b/i.test(b.text || '') && !seen.has('misleading_free_label')) {
        seen.add('misleading_free_label');
        findings.push({
          patternType: 'misleading_free_label',
          name: 'Misleading “Free” Label',
          severity: 'medium',
          description: '“Free” CTA paired with recurring price cues elsewhere on the page.',
          regulation: 'FTC Act §5; EU UCPD',
          rect: b.rect,
          analyzer: 'Text',
          confidence: 0.58,
        });
        break;
      }
    }
  }

  return findings;
}

const GEMINI_MODEL = 'gemini-2.0-flash';

async function getGeminiApiKey() {
  try {
    const data = await chrome.storage.local.get('GEMINI_API_KEY');
    return data.GEMINI_API_KEY || '';
  } catch {
    return '';
  }
}

function buildPrompt(signals) {
  const btnLines = (signals.buttons || [])
    .slice(0, 15)
    .map((b) => `- "${(b.text || '').slice(0, 200)}"`)
    .join('\n');
  const linkLines = (signals.links || [])
    .slice(0, 12)
    .map((l) => `- "${(l.text || '').slice(0, 120)}" (${(l.href || '').slice(0, 80)})`)
    .join('\n');
  const urg = (signals.urgencyTexts || []).map((u) => `- "${(u.text || '').slice(0, 200)}"`).join('\n');
  const cookies = (signals.cookieBanners || [])
    .map((c) => `- "${(c.text || '').slice(0, 200)}"`)
    .join('\n');
  const pre = (signals.checkboxes || [])
    .filter((c) => c.checked)
    .map((c) => `- Checked: "${(c.labelText || '').slice(0, 200)}"`)
    .join('\n');
  const mods = (signals.modals || []).map((m) => `- "${(m.text || '').slice(0, 200)}"`).join('\n');
  const headings = (signals.headings || []).map((h) => `- ${h.tag}: "${(h.text || '').slice(0, 200)}"`).join('\n');
  const bodySample = (signals.bodyTextSample || '').slice(0, 2500);

  return `You are a dark pattern detection expert. Analyze the following webpage signals and identify any dark patterns.

URL: ${signals.url || ''}
PAGE TITLE: ${signals.title || ''}

HEADINGS:
${headings || '(none)'}

BUTTONS:
${btnLines || '(none)'}

LINKS (sample):
${linkLines || '(none)'}

BODY TEXT SAMPLE (truncated):
${bodySample || '(none)'}

URGENCY/SCARCITY SNIPPETS:
${urg || 'None'}

COOKIE BANNERS:
${cookies || 'None'}

PRE-CHECKED CHECKBOXES:
${pre || 'None'}

MODALS/OVERLAYS:
${mods || 'None'}

Also specifically look for these harder-to-detect patterns:

1. MISDIRECTION: Visual design drawing attention AWAY from important information (bright upsell vs grey fine print on price/terms).
2. ROACH MOTEL: Easy signup but hard cancel (buried cancel, phone-only, login wall).
3. TRICK QUESTIONS: Confusing or double-negative checkboxes/toggles.
4. HIDDEN SUBSCRIPTION: One-time purchase that enrolls in recurring billing.
5. PRICE OBFUSCATION: True total cost unclear or scattered across elements.
6. PRIVACY ZUCKERING: Accept-all prominent; granular privacy controls buried.
7. ENSHITTIFICATION: Free features paywalled; vague "plan updates" that reduce value.
8. NAGGING: Repeated popups, notification prompts, or upsell modals interrupting flow.
9. DISGUISED ADS: Sponsored content without clear "Ad/Sponsored/Paid" labeling.
10. BASKET SNEAKING: Items or add-ons in cart/order without explicit user selection.

Respond with ONLY a JSON array. No explanation. No markdown. Each item:
{
  "patternType": "snake_case_name",
  "name": "Human readable name",
  "severity": "high" | "medium" | "low",
  "description": "One sentence explaining why this is manipulative",
  "regulation": "Relevant regulation e.g. FTC Act §5, GDPR Art.7, EU DSA Art.25",
  "targetText": "The exact button/text that triggered this (max 50 chars)"
}

Only flag real dark patterns you are confident about. Return [] if none found. Max 8 items.`;
}

function stripCodeFences(text) {
  let t = String(text || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}

function findRectForTarget(targetText, signals) {
  const raw = (targetText || '').trim();
  const t = raw.toLowerCase().slice(0, 120);
  const pools = textPool(signals);
  if (!t) return defaultRect(signals);
  let best = null;
  let bestScore = -1;
  for (const p of pools) {
    const pt = (p.text || '').toLowerCase();
    if (!pt) continue;
    if (pt.includes(t) || (t.length > 5 && t.includes(pt.slice(0, Math.min(48, pt.length))))) {
      const score = Math.min(pt.length, t.length);
      if (score > bestScore) {
        bestScore = score;
        best = p.rect;
      }
    }
  }
  if (best) return best;
  const words = t.split(/[\s_]+/).filter((w) => w.length > 3);
  for (const p of pools) {
    const pt = (p.text || '').toLowerCase();
    const hits = words.filter((w) => pt.includes(w));
    if (hits.length >= 2 || (hits.length === 1 && hits[0].length > 6)) {
      return p.rect;
    }
  }
  for (const p of pools) {
    const pt = (p.text || '').toLowerCase();
    if (words.some((w) => w.length > 4 && pt.includes(w))) return p.rect;
  }
  return defaultRect(signals);
}

function parseAIResponse(text, signals) {
  try {
    const raw = stripCodeFences(text);
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 8).map((item) => {
      const targetText = String(item.targetText || '');
      return {
        patternType: String(item.patternType || 'ai_pattern'),
        name: String(item.name || 'AI finding'),
        severity: ['high', 'medium', 'low'].includes(item.severity) ? item.severity : 'low',
        description: String(item.description || ''),
        regulation: String(item.regulation || ''),
        targetText,
        rect: findRectForTarget(targetText, signals),
        analyzer: 'AI',
        confidence: 0.75,
      };
    });
  } catch (e) {
    console.warn('DarkGuard parseAIResponse:', e);
    return [];
  }
}

async function runAIAnalyzer(signals) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) return [];

  const prompt = buildPrompt(signals);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.3,
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('DarkGuard Gemini HTTP error:', response.status, data.error || data);
      return [];
    }
    const parts = data.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => p.text || '').join('') : '';
    if (!text && data.promptFeedback) {
      console.warn('DarkGuard Gemini promptFeedback:', data.promptFeedback);
    }
    return parseAIResponse(text, signals);
  } catch (e) {
    console.error('DarkGuard AI analyzer error:', e);
    return [];
  }
}

async function runAnalyzers(signals) {
  const [domFindings, textFindings, aiFindings] = await Promise.all([
    Promise.resolve(runDOMAnalyzer(signals)),
    Promise.resolve(runTextAnalyzer(signals)),
    runAIAnalyzer(signals),
  ]);
  return mergeFindings(domFindings, textFindings, aiFindings);
}

function setBadgeForTab(tabId, findings) {
  const n = findings.length;
  const text = n > 0 ? String(n) : '';
  chrome.action.setBadgeText({ tabId, text });
  if (n === 0) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#666666' });
    return;
  }
  const hasHigh = findings.some((f) => f.severity === 'high');
  const hasMed = findings.some((f) => f.severity === 'medium');
  if (hasHigh) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#e94560' });
  } else if (hasMed) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#f5a623' });
  } else {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b82f6' });
  }
}

async function sendMessageToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    await new Promise((r) => setTimeout(r, 500));
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

async function ensureContentInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['content.js'],
    });
  } catch (e) {
    console.warn('DarkGuard executeScript:', e);
    throw e;
  }
  try {
    await chrome.scripting.insertCSS({
      target: { tabId, allFrames: false },
      files: ['overlay.css'],
    });
  } catch (e) {
    console.warn('DarkGuard insertCSS:', e);
  }
}

async function analyzeTab(tabId) {
  if (tabId == null) throw new Error('Invalid tab');

  await ensureContentInjected(tabId);

  let signals;
  try {
    signals = await sendMessageToTab(tabId, { type: 'GET_SIGNALS' });
  } catch (e2) {
    throw new Error('Could not read page signals. Try refreshing the tab.');
  }

  if (signals && signals.error) {
    throw new Error(signals.error);
  }

  let findings = await runAnalyzers(signals);
  findings = attachRects(findings, signals);
  const { score, grade, label } = calculateScore(findings);

  await chrome.storage.session.set({
    [`${SESSION_PREFIX}${tabId}`]: {
      findings,
      score,
      grade,
      label,
      url: signals.url,
      at: Date.now(),
    },
  });

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'RENDER_OVERLAYS',
      findings,
      score,
      grade,
      label,
    });
  } catch (e) {
    console.warn('DarkGuard RENDER_OVERLAYS:', e);
  }

  setBadgeForTab(tabId, findings);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SCAN_REQUEST') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        if (tabId == null) {
          sendResponse({ ok: false, error: 'No active tab' });
          return;
        }
        const url = tabs[0].url || '';
        if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
          sendResponse({ ok: false, error: 'Cannot scan this page.' });
          return;
        }
        await analyzeTab(tabId);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  if (msg.type === 'SET_BADGE') {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      const c = Number(msg.count) || 0;
      chrome.action.setBadgeText({ tabId, text: c > 0 ? String(c) : '' });
      if (c === 0) {
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#666666' });
      }
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'OPEN_POPUP') {
    chrome.action.openPopup().catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'GET_POPUP_DATA') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        if (tabId == null) {
          sendResponse({ ok: false, data: null });
          return;
        }
        const session = await chrome.storage.session.get(`${SESSION_PREFIX}${tabId}`);
        const data = session[`${SESSION_PREFIX}${tabId}`] || null;
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, data: null, error: String(e) });
      }
    })();
    return true;
  }

  return false;
});
