"use strict";
// theme.js — Vurgu rengi, tema editörü, toggle helper
function applyAccentColor(hex) {
  if (!hex || !/^#[0-9a-fA-F]{3,6}$/.test(hex)) return;
  const r=parseInt(hex.slice(1,3)||"b0",16), g=parseInt(hex.slice(3,5)||"6a",16), b=parseInt(hex.slice(5,7)||"3a",16);
  const soft = `rgba(${r},${g},${b},0.14)`;
  // Dedicated style tag — body[data-theme] rules'u !important ile ezer
  let el = document.getElementById("_accent_ovr");
  if (!el) { el=document.createElement("style"); el.id="_accent_ovr"; document.head.appendChild(el); }
  el.textContent = `body{--accent:${hex}!important;--accent-soft:${soft}!important;}`;
  // customCss'e de kaydet (persist + reload sonrası da çalışsın)
  const existing = (S.settings.customCss||"").replace(/\/\*_ac_start_\*\/[\s\S]*?\/\*_ac_end_\*\//g,"").trim();
  const block = `/*_ac_start_*/body{--accent:${hex}!important;--accent-soft:${soft}!important;}/*_ac_end_*/`;
  S.settings.customCss = (existing + "\n" + block).trim();
  persistSoon();
  // Inject immediately without full updateSettings (no syncInternals loop)
  let css = document.getElementById("_ill_css");
  if (css) css.textContent = S.settings.customCss;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMA & KİŞİSELLEŞTİRME PANELİ
// ═══════════════════════════════════════════════════════════════════════════
let _teEl=null;

const THEME_PRESETS={
  // ── Açık temalar ───────────────────────────────────────────────────────
  mist:    {label:"Mist",        bg:"#e8e2db", panel:"#f8f4ee", text:"#1e1510", accent:"#b06a3a", dark:false},
  paper:   {label:"Paper",       bg:"#edeae4", panel:"#fcfaf7", text:"#1a1614", accent:"#4e7080", dark:false},
  sand:    {label:"Sand",        bg:"#f0e8d8", panel:"#fcf6ec", text:"#2c2018", accent:"#c47828", dark:false},
  sepia:   {label:"Sepia",       bg:"#f4ead8", panel:"#faf2e2", text:"#2a1e0e", accent:"#8b5e2e", dark:false},
  arctic:  {label:"Arctic",      bg:"#eaf2f8", panel:"#f8fcff", text:"#0e2030", accent:"#1e7fc0", dark:false},
  rose:    {label:"Rose",        bg:"#faeef0", panel:"#fff8fa", text:"#2e1018", accent:"#d4506a", dark:false},
  macos:   {label:"macOS",       bg:"#d8d8e0", panel:"#fafafa", text:"#1c1c1e", accent:"#007aff", dark:false},
  // ── Koyu temalar ───────────────────────────────────────────────────────
  night:   {label:"Night",       bg:"#111214", panel:"#1e2026", text:"#dde1e7", accent:"#7aa0d4", dark:true},
  obsidian:{label:"Obsidian",    bg:"#080a0c", panel:"#14161a", text:"#f0f2f5", accent:"#c4956a", dark:true},
  forest:  {label:"Forest",      bg:"#1a2218", panel:"#1c2a1a", text:"#d4e8cc", accent:"#6abf5e", dark:true},
  dusk:    {label:"Dusk",        bg:"#1c1828", panel:"#221e30", text:"#e2ddf5", accent:"#b09be8", dark:true},
  liquid:  {label:"Liquid Glass",bg:"#08080f", panel:"rgba(22,22,40,.65)", text:"#f0f0ff", accent:"#a78bfa", dark:true},
};

const ACCENT_PALETTES=[
  {label:"Turuncu",   value:"#b06a3a"},
  {label:"Mavi",      value:"#2563eb"},
  {label:"Mor",       value:"#7c3aed"},
  {label:"Yeşil",     value:"#16a34a"},
  {label:"Kırmızı",   value:"#dc2626"},
  {label:"Pembe",     value:"#db2777"},
  {label:"Camgöbeği", value:"#0891b2"},
  {label:"Altın",     value:"#d97706"},
];

function toggleThemeEditor(){
  closeToolsMenu();
  if(_teEl){_teEl.remove();_teEl=null;return;}
  const p=document.createElement("div");_teEl=p;
  p.style.cssText="position:fixed;top:50%;right:20px;transform:translateY(-50%);z-index:10002;width:320px;max-height:90vh;background:var(--panel);border:1px solid var(--line-mid);border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden";

  // Header
  const hdr=document.createElement("div");hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);flex-shrink:0";
  hdr.innerHTML='<span style="font-size:13px;font-weight:700;color:var(--text)">Tema & Kişiselleştirme</span>';
  const cls=document.createElement("button");cls.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2L2 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  cls.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:3px;display:flex";cls.addEventListener("click",()=>{p.remove();_teEl=null;});hdr.appendChild(cls);p.appendChild(hdr);

  const body=document.createElement("div");body.style.cssText="flex:1;overflow-y:auto;padding:14px 16px";body.style.colorScheme="inherit";

  // ── Tema seçimi ──
  const tLabel=document.createElement("div");tLabel.style.cssText="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px";tLabel.textContent="Tema";body.appendChild(tLabel);
  const tGrid=document.createElement("div");tGrid.style.cssText="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:16px";
  // Açık/Koyu grupları
  const lightLabel=document.createElement("div");
  lightLabel.style.cssText="font-size:10px;color:var(--text-2);margin-bottom:4px;margin-top:2px";
  lightLabel.textContent="🌤 Açık"; body.appendChild(lightLabel);
  const tGridLight=document.createElement("div");
  tGridLight.style.cssText="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:10px";
  const darkLabel=document.createElement("div");
  darkLabel.style.cssText="font-size:10px;color:var(--text-2);margin-bottom:4px";
  darkLabel.textContent="🌙 Koyu";
  const tGridDark=document.createElement("div");
  tGridDark.style.cssText="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:16px";

  function makeThemeBtn(id, preset) {
    const btn=document.createElement("button");
    const isActive=S.settings.theme===id;
    btn.style.cssText=`padding:7px 4px;border:2px solid ${isActive?"var(--accent)":"transparent"};border-radius:9px;background:${preset.bg};cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;transition:border-color 120ms;outline:1px solid rgba(0,0,0,.12)`;
    const swatch=document.createElement("div");
    swatch.style.cssText=`width:24px;height:14px;border-radius:4px;background:${preset.panel};border:1px solid rgba(0,0,0,.1);position:relative;overflow:hidden`;
    const dot=document.createElement("div");
    dot.style.cssText=`width:7px;height:7px;border-radius:50%;background:${preset.accent};position:absolute;bottom:2px;right:2px`;
    swatch.appendChild(dot);
    const name=document.createElement("span");
    name.style.cssText=`font-size:9px;font-weight:600;color:${preset.dark?"#ccc":"#444"};white-space:nowrap`;
    name.textContent=preset.label;
    btn.append(swatch,name);
    btn.title=preset.label;
    btn.addEventListener("click",()=>{
      document.querySelectorAll("#_te_theme_btns_l button, #_te_theme_btns_d button").forEach(b=>b.style.borderColor="transparent");
      btn.style.borderColor="var(--accent)";
      updateSettings({theme:id});
      const cc=(S.settings.customCss||"").replace(/\/\*_ac_\*\/[\s\S]*?\/\*_ac_\*\//g,"").trim();
      if(cc!==(S.settings.customCss||"").trim()) updateSettings({customCss:cc});
      document.documentElement.removeAttribute("style");
    });
    return btn;
  }

  Object.entries(THEME_PRESETS).forEach(([id,preset])=>{
    const btn = makeThemeBtn(id, preset);
    if(preset.dark) tGridDark.appendChild(btn);
    else tGridLight.appendChild(btn);
  });

  tGridLight.id="_te_theme_btns_l";
  tGridDark.id="_te_theme_btns_d";
  body.appendChild(tGridLight);
  body.appendChild(darkLabel);
  body.appendChild(tGridDark);

  // ── Vurgu rengi ──
  const aLabel=document.createElement("div");aLabel.style.cssText="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px";aLabel.textContent="Vurgu Rengi";body.appendChild(aLabel);
  const aGrid=document.createElement("div");aGrid.style.cssText="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px";
  // Şu anki accent'ı bul (customCss'den veya preset'ten)
  const currentAccent = (()=>{
    const m=(S.settings.customCss||"").match(/--accent:#([0-9a-fA-F]{3,6})/);
    return m?"#"+m[1]:null;
  })();
  const acBtns=[];
  ACCENT_PALETTES.forEach(ac=>{
    const isSelected = currentAccent && currentAccent.toLowerCase()===ac.value.toLowerCase();
    const btn=document.createElement("button");btn.title=ac.label;
    btn.style.cssText=`width:32px;height:32px;border-radius:50%;background:${ac.value};border:3px solid ${isSelected?"white":"transparent"};outline:2px solid ${isSelected?ac.value:"transparent"};cursor:pointer;transition:all 120ms;position:relative`;
    if(isSelected){const ck=document.createElement("span");ck.textContent="✓";ck.style.cssText="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:700";btn.appendChild(ck);}
    btn.addEventListener("mouseenter",()=>btn.style.transform="scale(1.15)");
    btn.addEventListener("mouseleave",()=>btn.style.transform="scale(1)");
    btn.addEventListener("click",()=>{
      acBtns.forEach(b=>{b.style.border="3px solid transparent";b.style.outline="2px solid transparent";b.innerHTML="";});
      btn.style.border="3px solid white";btn.style.outline=`2px solid ${ac.value}`;
      const ck2=document.createElement("span");ck2.textContent="✓";ck2.style.cssText="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:700";btn.appendChild(ck2);
      applyAccentColor(ac.value);
      showToast("Vurgu rengi değişti: " + ac.label);
    });
    acBtns.push(btn);
    aGrid.appendChild(btn);
  });
  // Özel renk seçici
  const customAc=document.createElement("input");customAc.type="color";customAc.title="Özel renk";
  customAc.style.cssText="width:28px;height:28px;border:2px solid var(--line-mid);border-radius:50%;cursor:pointer;padding:2px;background:0";
  customAc.addEventListener("input",()=>{ applyAccentColor(customAc.value); });
  aGrid.appendChild(customAc);
  body.appendChild(aGrid);

  // ── Yazı tipi büyüklüğü ──
  const fsLabel=document.createElement("div");fsLabel.style.cssText="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px";fsLabel.textContent="Yazı Boyutu";body.appendChild(fsLabel);
  const fsRow=document.createElement("div");fsRow.style.cssText="display:flex;gap:6px;margin-bottom:16px";
  [{id:"small",label:"Küçük"},{id:"medium",label:"Normal"},{id:"large",label:"Büyük"}].forEach(fs=>{
    const btn=document.createElement("button");
    const isActive=S.settings.fontSize===fs.id;
    btn.textContent=fs.label;btn.style.cssText=`flex:1;height:32px;border:1px solid ${isActive?"var(--accent)":"var(--line-mid)"};border-radius:8px;background:${isActive?"var(--accent-soft)":"transparent"};color:${isActive?"var(--accent)":"var(--text-2)"};cursor:pointer;font-size:12px;font-weight:${isActive?"600":"400"};transition:all 120ms`;
    btn.addEventListener("click",()=>{
      fsRow.querySelectorAll("button").forEach(b=>{b.style.borderColor="var(--line-mid)";b.style.background="transparent";b.style.color="var(--text-2)";b.style.fontWeight="400";});
      btn.style.borderColor="var(--accent)";btn.style.background="var(--accent-soft)";btn.style.color="var(--accent)";btn.style.fontWeight="600";
      updateSettings({fontSize:fs.id});
    });
    fsRow.appendChild(btn);
  });
  body.appendChild(fsRow);

  // ── UI Fontu — buton grid ──
  const uiLabel=document.createElement("div");uiLabel.style.cssText="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px";uiLabel.textContent="Arayüz Fontu";body.appendChild(uiLabel);
  const FONTS=[
    {v:"",           l:"Sistem",      sample:"Aa"},
    {v:"'Inter'",    l:"Inter",       sample:"Aa"},
    {v:"'Roboto'",   l:"Roboto",      sample:"Aa"},
    {v:"'Open Sans'",l:"Open Sans",   sample:"Aa"},
    {v:"'Nunito'",   l:"Nunito",      sample:"Aa"},
    {v:"'Lato'",     l:"Lato",        sample:"Aa"},
    {v:"'Poppins'",  l:"Poppins",     sample:"Aa"},
    {v:"Georgia",    l:"Georgia",     sample:"Aa"},
    {v:"'Courier New'",l:"Mono",      sample:"Aa"},
  ];
  const fontGrid=document.createElement("div");fontGrid.style.cssText="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:16px";
  FONTS.forEach(({v,l,sample})=>{
    const isActive=(S.settings.uiFont||"")===(v||"");
    const btn=document.createElement("button");
    btn.style.cssText=`padding:8px 6px;border:2px solid ${isActive?"var(--accent)":"var(--line-mid)"};border-radius:9px;background:var(--panel-soft);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font-family:${v||"inherit"};transition:border-color 120ms`;
    const sampleEl=document.createElement("span");sampleEl.style.cssText=`font-size:18px;font-weight:500;color:var(--text);font-family:${v||"inherit"}`;sampleEl.textContent=sample;
    const nameEl=document.createElement("span");nameEl.style.cssText="font-size:10px;color:var(--text-2);font-family:inherit";nameEl.textContent=l;
    btn.append(sampleEl,nameEl);
    btn.addEventListener("click",()=>{
      fontGrid.querySelectorAll("button").forEach(b=>b.style.borderColor="var(--line-mid)");
      btn.style.borderColor="var(--accent)";
      updateSettings({uiFont:v});
    });
    fontGrid.appendChild(btn);
  });
  body.appendChild(fontGrid);

  // ── Yer imi şeridi ──
  const bmRow=document.createElement("div");bmRow.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--panel-soft);border-radius:8px;margin-bottom:6px";
  bmRow.innerHTML='<span style="font-size:12.5px;color:var(--text)">Yer imi şeridini göster</span>';
  const bmTog=_makeToggle(S.settings.showBookmarkStrip!==false);
  bmTog.addEventListener("change",()=>updateSettings({showBookmarkStrip:bmTog.checked}));
  bmRow.appendChild(bmTog);body.appendChild(bmRow);

  // ── Tam URL göster ──
  const urlRow=document.createElement("div");urlRow.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--panel-soft);border-radius:8px;margin-bottom:16px";
  urlRow.innerHTML='<span style="font-size:12.5px;color:var(--text)">Adres çubuğunda tam URL</span>';
  const urlTog=_makeToggle(Boolean(S.settings.showFullUrl));
  urlTog.addEventListener("change",()=>updateSettings({showFullUrl:urlTog.checked}));
  urlRow.appendChild(urlTog);body.appendChild(urlRow);

  // ── Sıfırla ──
  const resetBtn=document.createElement("button");resetBtn.textContent="Özelleştirmeleri sıfırla";
  resetBtn.style.cssText="width:100%;height:32px;border:1px solid var(--line-mid);background:0;color:var(--text-2);border-radius:8px;cursor:pointer;font-size:12px";
  resetBtn.addEventListener("click",()=>{
    const css=(S.settings.customCss||"").replace(/\/\*accent-override\*\/[\s\S]*?\/\*\/accent-override\*\//g,"").trim();
    document.documentElement.removeAttribute("style");
    updateSettings({customCss:css});
    showToast("Sıfırlandı");
  });
  body.appendChild(resetBtn);

  p.appendChild(body);document.body.appendChild(p);
}

function _makeToggle(checked){
  const label=document.createElement("label");label.style.cssText="position:relative;display:inline-block;width:36px;height:20px;flex-shrink:0";
  const inp=document.createElement("input");inp.type="checkbox";inp.checked=checked;inp.style.cssText="opacity:0;width:0;height:0;position:absolute";
  const span=document.createElement("span");
  span.style.cssText=`position:absolute;inset:0;border-radius:10px;background:${checked?"var(--accent)":"var(--line-mid)"};transition:background 200ms;cursor:pointer`;
  const dot=document.createElement("span");dot.style.cssText=`position:absolute;top:3px;left:${checked?"17px":"3px"};width:14px;height:14px;border-radius:50%;background:#fff;transition:left 200ms;box-shadow:0 1px 3px rgba(0,0,0,.2)`;
  span.appendChild(dot);label.append(inp,span);
  inp.addEventListener("change",()=>{span.style.background=inp.checked?"var(--accent)":"var(--line-mid)";dot.style.left=inp.checked?"17px":"3px";});
  return label;
}

