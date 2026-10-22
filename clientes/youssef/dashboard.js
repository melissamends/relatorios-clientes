(() => {
const C = window.DASHBOARD_CONFIG;
const $ = s => document.querySelector(s);
let ALL = [];

function parseCSV(text){
  const rows=[]; let row=[], cell="", quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(c === '"'){
      if(quoted && n === '"'){cell+='"';i++;} else quoted=!quoted;
    } else if(c===',' && !quoted){row.push(cell);cell="";}
    else if((c==='\n'||c==='\r') && !quoted){
      if(c==='\r'&&n==='\n')i++;
      row.push(cell);cell="";
      if(row.some(v=>String(v).trim()!==""))rows.push(row);
      row=[];
    } else cell+=c;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  return rows;
}
function num(v){
  if(v==null||v==="") return 0;
  let s=String(v).trim().replace(/\s/g,"");
  if(s.includes(",")&&!s.includes(".")) s=s.replace(",",".");
  else if(s.includes(",")&&s.includes(".")) s=s.replace(/\./g,"").replace(",",".");
  s=s.replace(/[^\d.-]/g,"");
  const n=Number(s); return Number.isFinite(n)?n:0;
}
function money(n){return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function int(n){return Math.round(n).toLocaleString("pt-BR");}
function normalizeDate(v){
  const s=String(v??"").trim();
  if(!s) return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if(m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  const d=new Date(s);
  if(Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function humanDate(value){
  const iso=normalizeDate(value);
  if(!iso)return "—";
  const d=new Date(iso+"T12:00:00");
  if(Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}).replace(".","");
}
function normalizeRows(rows){
  if(!rows.length)return[];
  const headers=rows[0].map(h=>String(h).trim());
  return rows.slice(1).map(r=>{
    const o={}; headers.forEach((h,i)=>o[h]=r[i]??"");
    return {
      date:normalizeDate(o.date||o.Date||""),
      campaign:o.campaign||o.Campaign||"",
      campaign_id:o.campaign_id||o["Campaign ID"]||"",
      spend:num(o.spend||o["Amount Spent"]),
      results:num(o.actions_onsite_conversion_messaging_conversation_started_7d||o["Messaging conversation started"]),
      ad_name:o.ad_name||o["Ad Name"]||"",
      link_clicks:num(o.link_clicks||o["Link Clicks"]),
      ad_id:o.ad_id||o["Ad ID"]||"",
      thumbnail_url:o.thumbnail_url||o["Ad Creative Thumbnail URL"]||""
    };
  }).filter(r=>r.date);
}
function isoToday(){
  const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function maxDate(rows){return rows.map(r=>r.date).filter(Boolean).sort().at(-1)||isoToday();}
function minDate(rows){return rows.map(r=>r.date).filter(Boolean).sort()[0]||isoToday();}
function addDays(iso,delta){
  const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+delta);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function filterPeriod(from,to){return ALL.filter(r=>r.date>=from&&r.date<=to);}
function sum(arr,key){return arr.reduce((a,r)=>a+(r[key]||0),0);}
function groupBy(arr,keyFn){
  const m=new Map();
  arr.forEach(r=>{const k=keyFn(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r);});
  return m;
}
function setMetric(id,value){$(id).textContent=value;}
function aggregateCampaigns(rows){
  return [...groupBy(rows,r=>r.campaign_id||r.campaign).entries()].map(([key,rs])=>{
    const spend=sum(rs,"spend"),results=sum(rs,"results"),clicks=sum(rs,"link_clicks");
    return {name:rs[0].campaign||"Campanha sem nome",spend,results,clicks,cpr:results?spend/results:null};
  }).filter(x=>x.spend>0||x.results>0||x.clicks>0).sort((a,b)=>b.results-a.results||b.spend-a.spend);
}
function aggregateCreatives(rows){
  return [...groupBy(rows,r=>(r.ad_id||r.ad_name)+"|"+(r.campaign_id||r.campaign)).entries()].map(([key,rs])=>{
    const spend=sum(rs,"spend"),results=sum(rs,"results"),clicks=sum(rs,"link_clicks");
    return {
      name:rs[0].ad_name||"Criativo sem nome",campaign:rs[0].campaign||"",
      thumbnail:rs.find(x=>x.thumbnail_url)?.thumbnail_url||"",
      spend,results,clicks,cpr:results?spend/results:null
    };
  }).filter(x=>x.spend>0||x.results>0||x.clicks>0).sort((a,b)=>b.results-a.results||(a.cpr??9999)-(b.cpr??9999)||b.spend-a.spend);
}
function renderCampaigns(camps){
  const tb=$("#campaignRows"), empty=$("#campaignEmpty"), wrap=$("#campaignTableWrap");
  if(!camps.length){wrap.style.display="none";empty.style.display="block";return;}
  wrap.style.display="block";empty.style.display="none";
  tb.innerHTML=camps.map(c=>`<tr>
    <td><span class="campaign-name">${esc(c.name)}</span></td>
    <td class="num">${money(c.spend)}</td>
    <td class="num">${int(c.results)}</td>
    <td class="num">${c.cpr==null?"—":money(c.cpr)}</td>
    <td class="num">${int(c.clicks)}</td>
    <td>${c.spend>0&&c.results===0?'<span class="status bad">Sem resultado no período</span>':'<span class="status good">Gerando resultados</span>'}</td>
  </tr>`).join("");
}
function renderCreatives(items){
  const grid=$("#creativeGrid"), empty=$("#creativeEmpty");
  if(!items.length){grid.style.display="none";empty.style.display="block";return;}
  grid.style.display="grid";empty.style.display="none";
  grid.innerHTML=items.slice(0,9).map(c=>`<article class="creative">
    <div class="thumb">${c.thumbnail?`<img src="${attr(c.thumbnail)}" loading="lazy" alt="">`:`<div class="thumb-fallback">Sem miniatura</div>`}</div>
    <div class="creative-body">
      <div class="creative-title">${esc(c.name)}</div>
      <div class="creative-campaign">${esc(c.campaign)}</div>
      <div class="creative-stats">
        <div class="mini"><b>${money(c.spend)}</b><span>INVESTIDO</span></div>
        <div class="mini"><b>${int(c.results)}</b><span>CONVERSAS</span></div>
        <div class="mini"><b>${c.cpr==null?"—":money(c.cpr)}</b><span>CPR</span></div>
      </div>
    </div>
  </article>`).join("");
}
function renderInsights(rows,camps,creatives){
  const spend=sum(rows,"spend"),results=sum(rows,"results");
  const bestC=camps.filter(x=>x.results>0).sort((a,b)=>(a.cpr??9999)-(b.cpr??9999))[0];
  const zero=camps.filter(x=>x.spend>0&&x.results===0);
  const bestAd=creatives.filter(x=>x.results>0).sort((a,b)=>b.results-a.results||(a.cpr??9999)-(b.cpr??9999))[0];
  const cards=[];
  if(bestC) cards.push({t:"Melhor eficiência de campanha",p:`${bestC.name} fechou o período com ${int(bestC.results)} conversa(s) e CPR de ${money(bestC.cpr)}.`});
  if(bestAd) cards.push({t:"Criativo com maior volume",p:`${bestAd.name} gerou ${int(bestAd.results)} conversa(s), com ${money(bestAd.spend)} investidos.`});
  if(zero.length) cards.push({t:"Ponto de atenção",p:`${zero.length} campanha(s) tiveram investimento no período sem gerar conversa atribuída.`});
  if(!cards.length && spend===0) cards.push({t:"Sem atividade",p:"Não houve investimento registrado no período selecionado."});
  if(cards.length<3 && results>0) cards.push({t:"Resultado consolidado",p:`Foram ${int(results)} conversa(s) com custo médio de ${money(spend/results)} no intervalo selecionado.`});
  $("#autoInsights").innerHTML=cards.slice(0,3).map(x=>`<div class="insight"><strong>${esc(x.t)}</strong><p>${esc(x.p)}</p></div>`).join("");
}
function renderChart(rows){
  const svg=$("#trendChart");
  const days=[...groupBy(rows,r=>r.date).entries()].map(([date,rs])=>({date,spend:sum(rs,"spend"),results:sum(rs,"results")})).sort((a,b)=>a.date.localeCompare(b.date));
  if(!days.length){svg.innerHTML="";return;}
  const W=760,H=245,L=45,R=18,T=18,B=35,iw=W-L-R,ih=H-T-B;
  const maxS=Math.max(...days.map(d=>d.spend),1), maxR=Math.max(...days.map(d=>d.results),1);
  const x=i=>L+(days.length===1?iw/2:i*iw/(days.length-1));
  const ys=v=>T+ih-(v/maxS)*ih, yr=v=>T+ih-(v/maxR)*ih;
  const path=(key,yf)=>days.map((d,i)=>(i?"L":"M")+x(i).toFixed(1)+","+yf(d[key]).toFixed(1)).join(" ");
  let out="";
  for(let i=0;i<=4;i++){
    const y=T+i*ih/4;
    out+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="#23232a" stroke-width="1"/>`;
    const val=maxS*(1-i/4);
    out+=`<text x="${L-8}" y="${y+3}" text-anchor="end" class="axis-text">R$ ${Math.round(val)}</text>`;
  }
  out+=`<path d="${path("spend",ys)}" class="line-spend"/>`;
  out+=`<path d="${path("results",yr)}" class="line-results"/>`;
  days.forEach((d,i)=>{
    out+=`<circle cx="${x(i)}" cy="${ys(d.spend)}" r="3.2" class="dot-spend"><title>${d.date}: ${money(d.spend)}</title></circle>`;
    out+=`<circle cx="${x(i)}" cy="${yr(d.results)}" r="3.4" class="dot-results"><title>${d.date}: ${int(d.results)} conversas</title></circle>`;
    const show=days.length<=8||i===0||i===days.length-1||i%Math.ceil(days.length/6)===0;
    if(show){
      const label=humanDate(d.date).slice(0,5);
      out+=`<text x="${x(i)}" y="${H-10}" text-anchor="middle" class="axis-text">${label}</text>`;
    }
  });
  svg.innerHTML=out;
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function attr(s){return esc(s);}
function apply(from,to,push=true){
  from=normalizeDate(from);to=normalizeDate(to);
  if(!from||!to||from>to)return;
  const rows=filterPeriod(from,to);
  const spend=sum(rows,"spend"),results=sum(rows,"results"),clicks=sum(rows,"link_clicks"),cpr=results?spend/results:null;
  setMetric("#mSpend",money(spend));setMetric("#mResults",int(results));setMetric("#mCpr",cpr==null?"—":money(cpr));setMetric("#mClicks",int(clicks));
  $("#periodLabel").textContent=`${humanDate(from)} → ${humanDate(to)}`;
  $("#dateFrom").value=from;$("#dateTo").value=to;
  const camps=aggregateCampaigns(rows), creatives=aggregateCreatives(rows);
  renderCampaigns(camps);renderCreatives(creatives);renderInsights(rows,camps,creatives);renderChart(rows);
  if(push){
    const u=new URL(location.href);u.searchParams.set("de",from);u.searchParams.set("ate",to);history.replaceState(null,"",u);
  }
}
async function boot(){
  try{
    const separator=C.dataCsvUrl.includes("?")?"&":"?";
    const res=await fetch(`${C.dataCsvUrl}${separator}_=${Date.now()}`,{cache:"no-store"});
    if(!res.ok)throw new Error("Falha ao carregar dados");
    ALL=normalizeRows(parseCSV(await res.text()));
    if(!ALL.length)throw new Error("A planilha Dados_Meta_Limpo está vazia");
    const min=minDate(ALL),max=maxDate(ALL);
    $("#dateFrom").min=min;$("#dateFrom").max=max;$("#dateTo").min=min;$("#dateTo").max=max;
    const u=new URL(location.href),qf=normalizeDate(u.searchParams.get("de")),qt=normalizeDate(u.searchParams.get("ate"));
    const to=(qt&&qt>=min&&qt<=max)?qt:max;
    const from=(qf&&qf>=min&&qf<=to)?qf:(addDays(to,-6)<min?min:addDays(to,-6));
    apply(from,to,false);
    $("#dataStatus").textContent=`Atualizado até ${humanDate(max)}`;
  }catch(e){
    $("#dataStatus").textContent="Erro ao carregar Dados_Meta_Limpo";
    $("#autoInsights").innerHTML=`<div class="insight"><strong>Não foi possível carregar a base</strong><p>${esc(e.message)}</p></div>`;
  }finally{$("#loading").classList.add("hidden");}
}
$("#applyBtn").addEventListener("click",()=>apply($("#dateFrom").value,$("#dateTo").value));
$("#last7Btn").addEventListener("click",()=>{const to=maxDate(ALL);apply(addDays(to,-6)<minDate(ALL)?minDate(ALL):addDays(to,-6),to);});
$("#monthBtn").addEventListener("click",()=>{const to=maxDate(ALL),d=new Date(to+"T12:00:00");const from=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;apply(from<minDate(ALL)?minDate(ALL):from,to);});
boot();
})();
