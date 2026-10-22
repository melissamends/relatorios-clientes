window.DASHBOARD_CONFIG = {
  dataCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRY-Nw9XfgAg1COeLZeJSHDGsOYNLsFutIUfaD3MS92sUBCVFbtMb0jiZV09kA1Lor68zVPt4pyNl0T/pub?gid=2086555211&single=true&output=csv",
  client: "SFI CHIPS · Youssef / DD19"
};

// Limpeza automática da base do Youssef antes de o dashboard calcular os KPIs.
// Remove impulsionamentos feitos diretamente pelo Instagram e snapshots duplicados do Windsor.
(() => {
  const originalFetch = window.fetch.bind(window);
  const DATA_GID = "gid=2086555211";

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (c === '"') {
        if (quoted && n === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (c === ',' && !quoted) {
        row.push(cell); cell = "";
      } else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && n === '\n') i++;
        row.push(cell); cell = "";
        if (row.some(v => String(v).trim() !== "")) rows.push(row);
        row = [];
      } else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function csvCell(v) {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCSV(rows) {
    return rows.map(r => r.map(csvCell).join(',')).join('\n');
  }

  function n(v) {
    let s = String(v ?? "").trim().replace(/\s/g, "");
    if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
    else if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    s = s.replace(/[^\d.-]/g, '');
    const x = Number(s);
    return Number.isFinite(x) ? x : 0;
  }

  function clean(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return text;

    const header = rows[0];
    const H = header.map(h => String(h).trim());
    const ix = name => H.indexOf(name);
    const iDate = ix('date');
    const iCampaign = ix('campaign');
    const iSpend = ix('spend');
    const iResults = ix('actions_onsite_conversion_messaging_conversation_started_7d');
    const iClicks = ix('link_clicks');
    const iAdId = ix('ad_id');
    const iCampaignId = ix('campaign_id');
    const iAdName = ix('ad_name');

    if (iDate < 0 || iCampaign < 0) return text;

    const allowed = rows.slice(1).filter(r => {
      const campaign = String(r[iCampaign] ?? '').trim();
      return campaign &&
        !/^Post do Instagram:/i.test(campaign) &&
        !/^Campanha de promoção/i.test(campaign);
    });

    // Windsor pode gravar snapshots repetidos. Mantemos apenas a versão mais completa
    // de cada anúncio em cada dia.
    const best = new Map();
    allowed.forEach(r => {
      const date = String(r[iDate] ?? '').trim();
      const adId = iAdId >= 0 ? String(r[iAdId] ?? '').trim() : '';
      const campaignId = iCampaignId >= 0 ? String(r[iCampaignId] ?? '').trim() : '';
      const adName = iAdName >= 0 ? String(r[iAdName] ?? '').trim() : '';
      const key = `${date}|${adId || campaignId + '|' + adName}`;
      const score = (iSpend >= 0 ? n(r[iSpend]) : 0) * 1000000 +
                    (iResults >= 0 ? n(r[iResults]) : 0) * 1000 +
                    (iClicks >= 0 ? n(r[iClicks]) : 0);
      const prev = best.get(key);
      if (!prev || score > prev.score) best.set(key, { row: r, score });
    });

    const cleaned = [...best.values()].map(x => x.row).sort((a, b) => {
      const da = String(a[iDate] ?? ''), db = String(b[iDate] ?? '');
      return da.localeCompare(db);
    });

    return toCSV([header, ...cleaned]);
  }

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const res = await originalFetch(input, init);
    if (!url.includes(DATA_GID) || !res.ok) return res;

    const text = await res.text();
    const cleaned = clean(text);
    return new Response(cleaned, {
      status: res.status,
      statusText: res.statusText,
      headers: { 'Content-Type': 'text/csv; charset=utf-8' }
    });
  };
})();
