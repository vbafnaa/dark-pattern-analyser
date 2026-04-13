const SESSION_PREFIX = 'dg_tab_';
const RING_LEN = 2 * Math.PI * 42;

function setRing(score) {
  const fg = document.getElementById('dg-ring-fg');
  if (!fg) return;
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const off = RING_LEN * (1 - s / 100);
  fg.style.strokeDashoffset = String(off);
  if (s >= 75) fg.style.stroke = '#4ade80';
  else if (s >= 55) fg.style.stroke = '#facc15';
  else if (s >= 35) fg.style.stroke = '#f5a623';
  else fg.style.stroke = '#e94560';
}

function showError(msg) {
  const el = document.getElementById('dg-error');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function renderFindings(findings) {
  const list = document.getElementById('dg-findings-list');
  const empty = document.getElementById('dg-empty');
  if (!list || !empty) return;
  list.innerHTML = '';
  if (!findings || findings.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...findings].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
  );
  for (const f of sorted) {
    const sev = f.severity || 'low';
    const div = document.createElement('div');
    div.className = `dg-finding ${sev}`;
    const name = document.createElement('div');
    name.className = 'dg-finding-name';
    name.textContent = f.name || f.patternType || 'Finding';
    const desc = document.createElement('div');
    desc.className = 'dg-finding-desc';
    desc.textContent = f.description || '';
    const meta = document.createElement('div');
    meta.className = 'dg-finding-meta';
    meta.textContent = [f.regulation, f.analyzer ? `via ${f.analyzer}` : '']
      .filter(Boolean)
      .join(' · ');
    div.appendChild(name);
    div.appendChild(desc);
    div.appendChild(meta);
    if (f.corroborated) {
      const c = document.createElement('div');
      c.className = 'dg-finding-corr';
      c.textContent = 'Corroborated by multiple analyzers';
      div.appendChild(c);
    }
    list.appendChild(div);
  }
}

function applyData(data) {
  const gradeEl = document.getElementById('dg-grade');
  const scoreNum = document.getElementById('dg-score-num');
  const summaryEl = document.getElementById('dg-trust-summary');
  if (!data) {
    if (gradeEl) {
      gradeEl.textContent = '—';
      gradeEl.className = 'dg-grade';
    }
    if (scoreNum) scoreNum.textContent = '—';
    if (summaryEl) {
      summaryEl.hidden = true;
      summaryEl.textContent = '';
    }
    setRing(0);
    renderFindings([]);
    return;
  }
  const { score, grade, label, findings } = data;
  const validGrade = grade && /^(A\+|[A-F])$/.test(grade) ? grade : '';
  if (gradeEl) {
    gradeEl.textContent = validGrade || '—';
    gradeEl.className = validGrade
      ? `dg-grade grade-${validGrade.replace('+', 'plus')}`
      : 'dg-grade';
  }
  if (scoreNum) scoreNum.textContent = `${score ?? '—'}/100`;
  if (summaryEl) {
    if (label) {
      summaryEl.hidden = false;
      summaryEl.textContent = label;
    } else {
      summaryEl.hidden = true;
      summaryEl.textContent = '';
    }
  }
  setRing(score != null ? score : 0);
  renderFindings(findings || []);
}

async function loadPopupData() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_POPUP_DATA' });
    if (res && res.ok && res.data) {
      applyData(res.data);
    } else {
      applyData(null);
    }
  } catch (e) {
    applyData(null);
  }
}

async function loadApiKeyField() {
  try {
    const { GEMINI_API_KEY } = await chrome.storage.local.get('GEMINI_API_KEY');
    const input = document.getElementById('dg-api-key');
    if (input && GEMINI_API_KEY) input.value = GEMINI_API_KEY;
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', () => {
  const ringFg = document.getElementById('dg-ring-fg');
  if (ringFg) {
    ringFg.style.strokeDasharray = String(RING_LEN);
    ringFg.style.strokeDashoffset = String(RING_LEN);
  }

  loadApiKeyField();
  loadPopupData();

  document.getElementById('dg-save-key')?.addEventListener('click', async () => {
    const input = document.getElementById('dg-api-key');
    const msg = document.getElementById('dg-save-msg');
    const key = (input && input.value.trim()) || '';
    try {
      await chrome.storage.local.set({ GEMINI_API_KEY: key });
      if (msg) {
        msg.hidden = false;
        setTimeout(() => {
          msg.hidden = true;
        }, 2000);
      }
    } catch (e) {
      showError('Could not save API key.');
    }
  });

  document.getElementById('dg-scan')?.addEventListener('click', async () => {
    const btn = document.getElementById('dg-scan');
    showError('');
    if (btn) btn.disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SCAN_REQUEST' });
      if (res && res.ok) {
        await loadPopupData();
      } else {
        showError((res && res.error) || 'Scan failed.');
      }
    } catch (e) {
      showError(e.message || 'Scan failed.');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById('dg-clear')?.addEventListener('click', async () => {
    showError('');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (tabId != null) {
        try {
          await chrome.tabs.sendMessage(tabId, { type: 'CLEAR_OVERLAYS' });
        } catch (_) {}
        await chrome.storage.session.remove(`${SESSION_PREFIX}${tabId}`);
        chrome.action.setBadgeText({ tabId, text: '' });
      }
      await loadPopupData();
    } catch (e) {
      showError(e.message || 'Clear failed.');
    }
  });
});
