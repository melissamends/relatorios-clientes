
(function(){
  const $ = s => document.querySelector(s);

  function parseCSV(text){
    const rows=[]; let row=[], cell="", quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if(c === '"'){
        if(quoted && n === '"'){ cell+='"'; i++; }
        else quoted=!quoted;
      } else if(c === ',' && !quoted){
        row.push(cell); cell="";
      } else if((c === '\n' || c === '\r') && !quoted){
        if(c === '\r' && n === '\n') i++;
        row.push(cell); cell="";
        if(row.some(v => String(v).trim() !== "")) rows.push(row);
        row=[];
      } else cell+=c;
    }
    if(cell.length || row.length){ row.push(cell); rows.push(row); }
    return rows;
  }

  function toMap(rows){
    const map={};
    rows.forEach(r=>{
      const key=(r[0]||"").trim();
      if(key && key !== "Campo" && !key.startsWith("RELATÓRIO") && !key.startsWith("Edite apenas")){
        map[key]=(r[1]||"").trim();
      }
    });
    return map;
  }

  function parseNum(v){
    if(v == null || v === "") return null;
    let s=String(v).trim().replace(/\s/g,"");
    if(s.includes(",") && s.includes(".")) s=s.replace(/\./g,"").replace(",",".");
    else if(s.includes(",")) s=s.replace(",",".");
    s=s.replace(/[^\d.-]/g,"");
    const n=Number(s);
    return Number.isFinite(n)?n:null;
  }
  const money = n => n==null ? "—" : n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const integer = n => n==null ? "—" : Math.round(n).toLocaleString("pt-BR");
  const pct = n => n==null ? "—" : (n > 1 ? n : n*100).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%";

  function fromSheet(m){
    const investimento=parseNum(m.investimento);
    const conversas=parseNum(m.conversas);
    const cpr=parseNum(m.cpr) ?? (investimento!=null && conversas ? investimento/conversas : null);
    const nova=parseNum(m.nova_estrutura);
    const ctr=parseNum(m.ctr_link);
    const cpc=parseNum(m.cpc_link);
    const alcance=parseNum(m.alcance);
    const imp=parseNum(m.impressoes);

    const metrics=[
      {label:"Investimento",value:money(investimento),note:"Período analisado"},
      {label:"Conversas iniciadas",value:integer(conversas),note:"WhatsApp + Instagram"},
      {label:"Custo médio por conversa",value:money(cpr),note:"Investimento ÷ conversas"},
      {label:"Nova estrutura",value:integer(nova),note:"Conversas geradas",highlight:true}
    ];
    if(ctr!=null) metrics.push({label:"CTR de link",value:pct(ctr),note:"Taxa de cliques"});
    if(cpc!=null) metrics.push({label:"CPC de link",value:money(cpc),note:"Custo por clique"});
    if(alcance!=null) metrics.push({label:"Alcance",value:integer(alcance),note:"Pessoas alcançadas"});
    if(imp!=null) metrics.push({label:"Impressões",value:integer(imp),note:"Exibições"});

    const share = conversas && nova!=null ? Math.max(0,Math.min(100,(nova/conversas)*100)) : 0;

    return {
      client:{
        brand:m.cliente || "Cliente",
        unit:m.unidade || "",
        period:m.periodo || "",
        platform:m.plataforma || "",
        logoText:(m.cliente || "R").split(/\s+/).slice(0,3).map(x=>x[0]).join("").toUpperCase(),
        accentLabel:"RELATÓRIO DE PERFORMANCE"
      },
      metrics,
      summary:m.resumo || "",
      performance:[
        {label:"Volume de conversas",value:conversas ? 86 : 0,text:conversas?integer(conversas)+" conversas":"—"},
        {label:"Eficiência de custo",value:cpr ? 74 : 0,text:cpr?money(cpr)+" / conversa":"—"},
        {label:"Participação da nova estrutura",value:share,text:(nova!=null&&conversas)?integer(nova)+" de "+integer(conversas)+" conversas":"—"}
      ],
      insights:[
        {title:"O que funcionou",body:m.o_que_funcionou || "—"},
        {title:"Ponto de atenção",body:m.ponto_atencao || "—"},
        {title:"Próximo movimento",body:m.proximo_movimento || "—"}
      ],
      nextSteps:[m.proximo_passo_1,m.proximo_passo_2,m.proximo_passo_3,m.proximo_passo_4].filter(Boolean),
      footer:"Relatório estratégico desenvolvido para acompanhamento de mídia paga."
    };
  }

  function render(d){
    $("#logoText").textContent=d.client.logoText;
    $("#accentLabel").textContent=d.client.accentLabel;
    $("#brand").textContent=d.client.brand;
    $("#unit").textContent=d.client.unit;
    $("#platform").textContent=d.client.platform;
    $("#period").textContent=d.client.period;
    $("#summary").textContent=d.summary;
    $("#footer").textContent=d.footer;

    $("#metrics").innerHTML=d.metrics.map(m=>`
      <article class="card ${m.highlight?"highlight":""}">
        <div class="label">${m.label}</div>
        <div><div class="value">${m.value}</div><div class="note">${m.note}</div></div>
      </article>`).join("");

    $("#performance").innerHTML=d.performance.map(p=>`
      <article class="perf-card">
        <div class="perf-row"><strong>${p.label}</strong><span>${p.text}</span></div>
        <div class="track"><div class="fill" style="width:${p.value}%"></div></div>
      </article>`).join("");

    $("#insights").innerHTML=d.insights.map(i=>`
      <article class="insight"><h3>${i.title}</h3><p>${i.body}</p></article>`).join("");

    $("#steps").innerHTML=d.nextSteps.map(s=>`<div class="step">${s}</div>`).join("");
    const status=$("#dataStatus");
    if(status) status.textContent="Dados atualizados pela planilha";
  }

  async function boot(){
    const url=window.REPORT_CONFIG?.sheetCsvUrl || "";
    if(url && !url.includes("COLE_AQUI")){
      try{
        const r=await fetch(url,{cache:"no-store"});
        if(!r.ok) throw new Error("HTTP "+r.status);
        const map=toMap(parseCSV(await r.text()));
        if(!map.cliente) throw new Error("CSV não contém o campo cliente");
        render(fromSheet(map));
        return;
      }catch(e){
        console.warn("Falha ao carregar planilha:",e);
      }
    }
    if(window.REPORT_CONFIG?.fallbackToLocalData && window.REPORT_DATA){
      render(window.REPORT_DATA);
      const status=$("#dataStatus");
      if(status) status.textContent="Usando dados locais — falta conectar o CSV";
    }
  }
  boot();
})();
