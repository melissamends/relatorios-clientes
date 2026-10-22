(() => {
  const C = window.DASHBOARD_CONFIG;
  const $ = (s) => document.querySelector(s);
  let ALL = [];

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
      } else {
        cell += c;
      }
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function num(v) {
    if (v == null || v === "") return 0;
    let s = String(v).trim().replace(/\s/g, "");
    if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
    else if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
    s = s.replace(/[^\d.-]/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function validISO(v) {
    const s = String(v ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return "";
  }

  function money(n) {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function int(n) {
    return Math.round(n).toLocaleString("pt-BR");
  }

  function humanDate(iso) {
    const s = validISO(iso);
    if (!s) return "—";
    const [y, m, d] = s.split("-");
    const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return `${d} de ${months[Number(m) - 1]} de ${y}`;
  }

  function excludedCampaign(name) {
    const s = String(name || "").trim();
    return /^Post do Instagram:/i.test(s) || /^Campanha de promoção/i.test(s);
  }

  function normalizeRows(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map(h => String(h).trim());
    const parsed = rows.slice(1).map(r => {
      const o = {};
      headers.forEach((h, i) => o[h] = r[i] ?? "");
      return {
        date: validISO(o.date || o.Date),
        campaign: o.campaign || o.Campaign || "",
        campaign_id: o.campaign_id || o["Campaign ID"] || "",
        spend: num(o.spend || o["Amount Spent"]),
        results: num(o.actions_onsite_conversion_messaging_conversation_started_7d || o["Messaging conversation started"]),
        ad_name: o.ad_name || o["Ad Name"] || "",
        link_clicks: num(o.link_clicks || o["Link Clicks"]),
        ad_id: o.ad_id || o["Ad ID"] || "",
        thumbnail_url: o.thumbnail_url || o["Ad Creative Thumbnail URL"] || ""
      };
    }).filter(r => r.date && !excludedCampaign(r.campaign));

    // O Windsor vem gravando novamente blocos já existentes na mesma aba.
    // Para não somar o mesmo anúncio mais de uma vez no mesmo dia,
    // mantemos apenas a ÚLTIMA ocorrência de cada date + ad_id.
    const map = new Map();
    parsed.forEach(r => {
      const fallback = `${r.campaign_id}|${r.ad_name}`;
      const key = `${r.date}|${r.ad_id || fallback}`;
      map.set(key, r);
    });

    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function minDate(rows = ALL) {
    return rows.length ? rows[0].date : "";
  }

  function maxDate(rows = ALL) {
    return rows.length ? rows[rows.length - 1].date : "";
  }

  function addDays(iso, delta) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }

  function clampDate(iso, min, max) {
    const s = validISO(iso);
    if (!s) return "";
    if (s < min) return min;
    if (s > max) return max;
    return s;
  }

  function filterPeriod(from, to) {
    return ALL.filter(r => r.date >= from && r.date <= to);
  }

  function sum(arr, key) {
    return arr.reduce((acc, r) => acc + (r[key] || 0), 0);
  }

  function groupBy(arr, keyFn) {
    const m = new Map();
    arr.forEach(r => {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return m;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }

  function attr(s) { return esc(s); }

  function aggregateCampaigns(rows) {
    return [...groupBy(rows, r => r.campaign_id || r.campaign).values()].map(rs => {
      const spend = sum(rs, "spend");
      const results = sum(rs, "results");
      const clicks = sum(rs, "link_clicks");
      return {
        name: rs[0].campaign || "Campanha sem nome",
        spend,
        results,
        clicks,
        cpr: results ? spend / results : null
      };
    }).filter(x => x.spend > 0 || x.results > 0 || x.clicks > 0)
      .sort((a, b) => b.results - a.results || b.spend - a.spend);
  }

  function aggregateCreatives(rows) {
    return [...groupBy(rows, r => `${r.ad_id || r.ad_name}|${r.campaign_id || r.campaign}`).values()].map(rs => {
      const spend = sum(rs, "spend");
      const results = sum(rs, "results");
      const clicks = sum(rs, "link_clicks");
      return {
        name: rs[0].ad_name || "Criativo sem nome",
        campaign: rs[0].campaign || "",
        thumbnail: rs.find(x => x.thumbnail_url)?.thumbnail_url || "",
        spend,
        results,
        clicks,
        cpr: results ? spend / results : null
      };
    }).filter(x => x.spend > 0 || x.results > 0 || x.clicks > 0)
      .sort((a, b) => b.results - a.results || (a.cpr ?? 999999) - (b.cpr ?? 999999));
  }

  function renderCampaigns(camps) {
    const tb = $("#campaignRows"), empty = $("#campaignEmpty"), wrap = $("#campaignTableWrap");
    if (!camps.length) {
      wrap.style.display = "none";
      empty.style.display = "block";
      return;
    }
    wrap.style.display = "block";
    empty.style.display = "none";
    tb.innerHTML = camps.map(c => `<tr>
      <td><span class="campaign-name">${esc(c.name)}</span></td>
      <td class="num">${money(c.spend)}</td>
      <td class="num">${int(c.results)}</td>
      <td class="num">${c.cpr == null ? "—" : money(c.cpr)}</td>
      <td class="num">${int(c.clicks)}</td>
      <td>${c.spend > 0 && c.results === 0 ? '<span class="status bad">Sem resultado no período</span>' : '<span class="status good">Gerando resultados</span>'}</td>
    </tr>`).join("");
  }

  function renderCreatives(items) {
    const grid = $("#creativeGrid"), empty = $("#creativeEmpty");
    if (!items.length) {
      grid.style.display = "none";
      empty.style.display = "block";
      return;
    }
    grid.style.display = "grid";
    empty.style.display = "none";
    grid.innerHTML = items.slice(0, 9).map(c => `<article class="creative">
      <div class="thumb">${c.thumbnail ? `<img src="${attr(c.thumbnail)}" loading="lazy" alt="">` : '<div class="thumb-fallback">Sem miniatura</div>'}</div>
      <div class="creative-body">
        <div class="creative-title">${esc(c.name)}</div>
        <div class="creative-campaign">${esc(c.campaign)}</div>
        <div class="creative-stats">
          <div class="mini"><b>${money(c.spend)}</b><span>INVESTIDO</span></div>
          <div class="mini"><b>${int(c.results)}</b><span>CONVERSAS</span></div>
          <div class="mini"><b>${c.cpr == null ? "—" : money(c.cpr)}</b><span>CPR</span></div>
        </div>
      </div>
    </article>`).join("");
  }

  function renderInsights(rows, camps, creatives) {
    const spend = sum(rows, "spend"), results = sum(rows, "results");
    const bestC = camps.filter(x => x.results > 0).sort((a, b) => (a.cpr ?? 999999) - (b.cpr ?? 999999))[0];
    const zero = camps.filter(x => x.spend > 0 && x.results === 0);
    const bestAd = creatives.filter(x => x.results > 0).sort((a, b) => b.results - a.results || (a.cpr ?? 999999) - (b.cpr ?? 999999))[0];
    const cards = [];
    if (bestC) cards.push({ t: "Melhor eficiência de campanha", p: `${bestC.name} teve ${int(bestC.results)} conversa(s) e CPR de ${money(bestC.cpr)}.` });
    if (bestAd) cards.push({ t: "Criativo com maior volume", p: `${bestAd.name} gerou ${int(bestAd.results)} conversa(s), com ${money(bestAd.spend)} investidos.` });
    if (zero.length) cards.push({ t: "Ponto de atenção", p: `${zero.length} campanha(s) tiveram investimento sem conversa atribuída no período.` });
    if (!cards.length && spend === 0) cards.push({ t: "Sem atividade", p: "Não houve investimento registrado no período selecionado." });
    if (cards.length < 3 && results > 0) cards.push({ t: "Resultado consolidado", p: `${int(results)} conversa(s) com custo médio de ${money(spend / results)}.` });
    $("#autoInsights").innerHTML = cards.slice(0, 3).map(x => `<div class="insight"><strong>${esc(x.t)}</strong><p>${esc(x.p)}</p></div>`).join("");
  }

  function renderChart(rows) {
    const svg = $("#trendChart");
    const days = [...groupBy(rows, r => r.date).entries()].map(([date, rs]) => ({
      date,
      spend: sum(rs, "spend"),
      results: sum(rs, "results")
    })).sort((a, b) => a.date.localeCompare(b.date));

    if (!days.length) { svg.innerHTML = ""; return; }

    const W = 760, H = 245, L = 48, R = 18, T = 18, B = 35;
    const iw = W - L - R, ih = H - T - B;
    const maxS = Math.max(...days.map(d => d.spend), 1);
    const maxR = Math.max(...days.map(d => d.results), 1);
    const x = i => L + (days.length === 1 ? iw / 2 : i * iw / (days.length - 1));
    const ys = v => T + ih - (v / maxS) * ih;
    const yr = v => T + ih - (v / maxR) * ih;
    const path = (key, fn) => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${fn(d[key]).toFixed(1)}`).join(" ");

    let out = "";
    for (let i = 0; i <= 4; i++) {
      const y = T + i * ih / 4;
      out += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="#23232a" stroke-width="1"/>`;
      out += `<text x="${L - 8}" y="${y + 3}" text-anchor="end" class="axis-text">R$ ${Math.round(maxS * (1 - i / 4))}</text>`;
    }
    out += `<path d="${path("spend", ys)}" class="line-spend"/>`;
    out += `<path d="${path("results", yr)}" class="line-results"/>`;

    days.forEach((d, i) => {
      out += `<circle cx="${x(i)}" cy="${ys(d.spend)}" r="3.2" class="dot-spend"><title>${humanDate(d.date)}: ${money(d.spend)}</title></circle>`;
      out += `<circle cx="${x(i)}" cy="${yr(d.results)}" r="3.4" class="dot-results"><title>${humanDate(d.date)}: ${int(d.results)} conversas</title></circle>`;
      const show = days.length <= 8 || i === 0 || i === days.length - 1 || i % Math.ceil(days.length / 6) === 0;
      if (show) {
        const [y, m, day] = d.date.split("-");
        out += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="axis-text">${day}/${m}</text>`;
      }
    });
    svg.innerHTML = out;
  }

  function render(from, to, push = true) {
    const min = minDate(), max = maxDate();
    from = clampDate(from, min, max);
    to = clampDate(to, min, max);
    if (!from || !to) return;
    if (from > to) [from, to] = [to, from];

    const rows = filterPeriod(from, to);
    const spend = sum(rows, "spend"), results = sum(rows, "results"), clicks = sum(rows, "link_clicks");
    const cpr = results ? spend / results : null;

    $("#mSpend").textContent = money(spend);
    $("#mResults").textContent = int(results);
    $("#mCpr").textContent = cpr == null ? "—" : money(cpr);
    $("#mClicks").textContent = int(clicks);
    $("#periodLabel").textContent = `${humanDate(from)} → ${humanDate(to)}`;
    $("#dateFrom").value = from;
    $("#dateTo").value = to;

    const camps = aggregateCampaigns(rows);
    const creatives = aggregateCreatives(rows);
    renderCampaigns(camps);
    renderCreatives(creatives);
    renderInsights(rows, camps, creatives);
    renderChart(rows);

    if (push) {
      const u = new URL(location.href);
      u.searchParams.set("de", from);
      u.searchParams.set("ate", to);
      history.replaceState(null, "", u);
    }
  }

  async function boot() {
    try {
      const sep = C.dataCsvUrl.includes("?") ? "&" : "?";
      const res = await fetch(`${C.dataCsvUrl}${sep}_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Falha ao carregar base (${res.status})`);

      ALL = normalizeRows(parseCSV(await res.text()));
      if (!ALL.length) throw new Error("Nenhuma linha válida encontrada em Dados_Meta");

      const min = minDate(), max = maxDate();
      [$("#dateFrom"), $("#dateTo")].forEach(el => { el.min = min; el.max = max; });

      const u = new URL(location.href);
      const qFrom = clampDate(u.searchParams.get("de"), min, max);
      const qTo = clampDate(u.searchParams.get("ate"), min, max);
      const to = qTo || max;
      const defaultFrom = addDays(to, -6) < min ? min : addDays(to, -6);
      const from = qFrom || defaultFrom;

      render(from, to, false);
      $("#dataStatus").textContent = `Atualizado até ${humanDate(max)}`;
    } catch (e) {
      console.error(e);
      $("#dataStatus").textContent = "Erro ao carregar Dados_Meta";
      $("#autoInsights").innerHTML = `<div class="insight"><strong>Não foi possível carregar a base</strong><p>${esc(e.message)}</p></div>`;
    } finally {
      $("#loading").classList.add("hidden");
    }
  }

  $("#applyBtn").addEventListener("click", () => render($("#dateFrom").value, $("#dateTo").value));
  $("#last7Btn").addEventListener("click", () => {
    const max = maxDate(), min = minDate();
    const from = addDays(max, -6) < min ? min : addDays(max, -6);
    render(from, max);
  });
  $("#monthBtn").addEventListener("click", () => {
    const max = maxDate(), min = minDate();
    const monthStart = `${max.slice(0, 7)}-01`;
    render(monthStart < min ? min : monthStart, max);
  });

  boot();
})();
