import React,{useState,useEffect,useCallback,useMemo,useRef} from "react";
import{createRoot}from "react-dom/client";
import{BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip as RTooltip,ResponsiveContainer,PieChart,Pie,Cell,Legend}from "recharts";
const h=React.createElement;

/* ─── CONSTANTS ─── */
const AGENCIES=["BEJAIA","BOUIRA_SEC","HASSI AMEUR","LLK","PARTENAIRE_BOUIRA","PARTENAIRE_ALGER","PARTENAIRE_BEJAIA","PARTENAIRE_SETIF","SETIF","BOUIRA_FRAIS","FARES"];
const WILAYAS=["Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar","Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger","Djelfa","Jijel","Sétif","Saïda","Skikda","Sidi Bel Abbès","Annaba","Guelma","Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla","Oran","El Bayadh","Illizi","Bordj Bou Arreridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued","Khenchela","Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent","Ghardaïa","Relizane","Timimoun","Bordj Badji Mokhtar","Ouled Djellal","Béni Abbès","In Salah","In Guezzam","Touggourt","Djanet","El M'Ghair","El Meniaa"];
const DESTINATIONS_SOUHAITEES=["LAGHOUAT","SBA","OUED RHIOU","ALGER","TIZI","BLIDA","MEDEA","ANNABA","CONSTANTINE","BATNA","JIJEL","BEJAIA","SETIF"];
const REFUSAL_REASONS=["Refus d'orientation","Déchargement demain","En panne"];
const DESTINATIONS=[...DESTINATIONS_SOUHAITEES];
const Page={SUIVI:"suivi",PLANIFICATION:"planification",ANALYTIQUE:"analytique"};
const LS_PREFIX="BRANDT_PRO_DATA_",VERSION_PREFIX="BRANDT_PRO_VER_",MAX_VERSIONS=5;
const getTonnage=a=>a==="FARES"?"5T":"20T";
const fmtTime=ts=>{if(!ts)return"";return new Date(ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})};

/* ─── EXCEL BACKUP/RESTORE ─── */
function backupToExcel(showToast){
  const wb=window.XLSX.utils.book_new();const allKeys=[];
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(LS_PREFIX))allKeys.push(k)}
  if(!allKeys.length){showToast("Aucune donnée","warning");return}
  const sR=[["__DATE__","__ID__","Source","Véhicule","Agence","Chauffeur","Dest_Souhaitée","Wilaya_J1","Horaire","Sur_Site","Cable_Tir","Confirmation","Cause_Refus","Confirm_Time"]];
  const oR=[["__DATE__","__ORDER_ID__","Destination","Type","OriginDate"]];
  const aR=[["__DATE__","__ORDER_ID__","__RESOURCE_ID__"]];
  allKeys.sort().forEach(key=>{const ds=key.replace(LS_PREFIX,"");try{const st=JSON.parse(localStorage.getItem(key));
    (st.suivi||[]).forEach(r=>sR.push([ds,r.id,r.source||"",r.vehicule||"",r.agence||"",r.chauffeur||"",r.destinationSouhaitee||"",r.wilayaDemain||"",r.horaire||"",r.surSite?"Oui":"Non",r.cableDeTir?"Oui":"Non",r.confirmation||"",r.causeRefus||"",r.confirmationTime||""]));
    (st.plan?.orders||[]).forEach(o=>oR.push([ds,o.id,o.destination||"",o.type||"",o.originDate||""]));
    Object.entries(st.plan?.assignments||{}).forEach(([oid,rids])=>(rids||[]).forEach(rid=>aR.push([ds,oid,rid])))}catch(e){}});
  const ws1=window.XLSX.utils.aoa_to_sheet(sR);ws1['!cols']=[{wch:12},{wch:38},{wch:8},{wch:16},{wch:22},{wch:22},{wch:16},{wch:16},{wch:10},{wch:8},{wch:10},{wch:12},{wch:22},{wch:16}];window.XLSX.utils.book_append_sheet(wb,ws1,"Suivi");
  const ws2=window.XLSX.utils.aoa_to_sheet(oR);ws2['!cols']=[{wch:12},{wch:38},{wch:18},{wch:8}];window.XLSX.utils.book_append_sheet(wb,ws2,"Commandes");
  const ws3=window.XLSX.utils.aoa_to_sheet(aR);ws3['!cols']=[{wch:12},{wch:38},{wch:38}];window.XLSX.utils.book_append_sheet(wb,ws3,"Affectations");
  window.XLSX.writeFile(wb,`BRANDT_Backup_${new Date().toISOString().slice(0,10)}.xlsx`);showToast(`Backup Excel — ${allKeys.length} jour(s)`,"success");
}
function restoreFromExcel(file,selectedDate,setState,showToast){
  const reader=new FileReader();reader.onload=ev=>{try{
    const data=new Uint8Array(ev.target.result);const wb=window.XLSX.read(data,{type:"array"});
    const sSheet=wb.Sheets["Suivi"],cSheet=wb.Sheets["Commandes"],aSheet=wb.Sheets["Affectations"];
    if(!sSheet){showToast("Feuille 'Suivi' introuvable","error");return}
    const sRows=window.XLSX.utils.sheet_to_json(sSheet),cRows=cSheet?window.XLSX.utils.sheet_to_json(cSheet):[],aRows=aSheet?window.XLSX.utils.sheet_to_json(aSheet):[];
    const byDate={};
    sRows.forEach(r=>{const d=r["__DATE__"];if(!d)return;if(!byDate[d])byDate[d]={date:d,suivi:[],plan:{orders:[],assignments:{}}};
      byDate[d].suivi.push({id:r["__ID__"]||crypto.randomUUID(),source:r["Source"]||"import",vehicule:r["Véhicule"]||"",agence:r["Agence"]||"",chauffeur:r["Chauffeur"]||"",destinationSouhaitee:r["Dest_Souhaitée"]||"",wilayaDemain:r["Wilaya_J1"]||"",horaire:r["Horaire"]||"",horaireSouhaitee:"",surSite:r["Sur_Site"]==="Oui",cableDeTir:r["Cable_Tir"]==="Oui",confirmation:r["Confirmation"]||"",causeRefus:r["Cause_Refus"]||"",typeRM:"",confirmationTime:r["Confirm_Time"]?Number(r["Confirm_Time"]):null})});
    cRows.forEach(r=>{const d=r["__DATE__"];if(!d)return;if(!byDate[d])byDate[d]={date:d,suivi:[],plan:{orders:[],assignments:{}}};
      byDate[d].plan.orders.push({id:r["__ORDER_ID__"]||crypto.randomUUID(),destination:r["Destination"]||"",type:r["Type"]||"CMD",priority:false,originDate:r["OriginDate"]||null})});
    aRows.forEach(r=>{const d=r["__DATE__"],oid=r["__ORDER_ID__"],rid=r["__RESOURCE_ID__"];if(!d||!oid||!rid)return;
      if(!byDate[d])byDate[d]={date:d,suivi:[],plan:{orders:[],assignments:{}}};if(!byDate[d].plan.assignments[oid])byDate[d].plan.assignments[oid]=[];byDate[d].plan.assignments[oid].push(rid)});
    let cnt=0;Object.entries(byDate).forEach(([date,st])=>{localStorage.setItem(`${LS_PREFIX}${date}`,JSON.stringify(st));cnt++});
    const raw=localStorage.getItem(`${LS_PREFIX}${selectedDate}`);if(raw)setState(JSON.parse(raw));
    showToast(`${cnt} jour(s) restauré(s)`,"success");
  }catch(err){showToast("Erreur: "+err.message,"error")}};reader.readAsArrayBuffer(file);
}

/* ─── SHARED COMPONENTS ─── */
function ConfirmModal({title,message,onConfirm,onCancel,danger}){
  useEffect(()=>{const fn=e=>{if(e.key==="Escape")onCancel();if(e.key==="Enter")onConfirm()};window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn)},[onConfirm,onCancel]);
  return h("div",{className:"modal-bg",onClick:onCancel},
    h("div",{className:"modal-box",onClick:e=>e.stopPropagation()},
      h("div",{style:{padding:"28px 28px 0"}},
        h("h3",{className:"font-display",style:{fontSize:18,fontWeight:800,marginBottom:8}},title),
        h("p",{style:{fontSize:14,color:"var(--text-secondary)",lineHeight:1.6}},message)),
      h("div",{style:{padding:"20px 28px 24px",display:"flex",gap:10,justifyContent:"flex-end"}},
        h("button",{onClick:onCancel,className:"btn btn-ghost"},"Annuler"),
        h("button",{onClick:onConfirm,className:danger?"btn btn-danger-ghost":"btn btn-brand"},danger?"Supprimer":"Confirmer"))))
}
function Toast({message,type="success",onClose}){
  useEffect(()=>{const t=setTimeout(onClose,3000);return()=>clearTimeout(t)},[onClose]);
  const ic={success:"✓",error:"✕",info:"ℹ",warning:"!"};
  const cl={success:"var(--success)",error:"var(--danger)",info:"var(--brand)",warning:"var(--warning)"};
  return h("div",{className:"toast"},
    h("span",{style:{width:22,height:22,borderRadius:"50%",background:cl[type],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}},ic[type]),
    h("span",{style:{fontWeight:600,fontSize:13}},message))
}
function ThemeToggle(){
  const[isDark,setIsDark]=useState(()=>{const s=localStorage.getItem('theme');return s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme:dark)').matches)});
  useEffect(()=>{document.documentElement.setAttribute('data-theme',isDark?'dark':'light');localStorage.setItem('theme',isDark?'dark':'light')},[isDark]);
  return h("button",{onClick:()=>setIsDark(!isDark),className:"btn-icon",title:isDark?"Mode clair":"Mode sombre"},isDark?"☀️":"🌙")
}

/* ─── ALERT BANNER — Critical info visibility ─── */
function AlertBanner({items}){
  if(!items||!items.length)return null;
  const item=items[0];
  const cls={warning:"alert-banner-warning",danger:"alert-banner-danger",info:"alert-banner-info"};
  const dotCls={warning:"var(--warning)",danger:"var(--danger)",info:"var(--brand)"};
  return h("div",{className:`alert-banner ${cls[item.type]||cls.info}`},
    h("span",{className:"alert-dot",style:{background:dotCls[item.type]||dotCls.info}}),
    h("span",null,item.text),
    items.length>1&&h("span",{style:{opacity:.6,marginLeft:4}},`+${items.length-1} autre(s)`))
}

/* ─── STAT CARD ─── */
function StatCard({label,value,accent}){
  const accentColors={brand:"var(--brand)",success:"var(--success)",danger:"var(--danger)",warning:"var(--warning)",purple:"var(--purple)"};
  return h("div",{className:"stat-card"},
    h("span",{className:"stat-label"},label),
    h("span",{className:"stat-value",style:{color:accentColors[accent]||"var(--text)"}},value))
}

/* ─── LAYOUT ─── */
function Layout({children,currentPage,setCurrentPage,selectedDate,setSelectedDate,isSaving,onBackup,onRestore,showToast,alerts}){
  const fileRef=useRef(null);
  const pageCritical=useMemo(()=>{
    const planAlerts=(alerts||[]).filter(a=>a.page==="plan");
    return{suivi:(alerts||[]).filter(a=>a.page==="suivi").length,plan:planAlerts.length}
  },[alerts]);
  const setToday=()=>setSelectedDate(new Date().toISOString().split("T")[0]);
  const setTomorrow=()=>{const t=new Date();t.setDate(t.getDate()+1);setSelectedDate(t.toISOString().split("T")[0])};
  const pageAlerts=(alerts||[]).filter(a=>!a.page||a.page===currentPage);

  return h("div",{style:{minHeight:"100vh",display:"flex",flexDirection:"column"}},
    /* ─ Header ─ */
    h("header",{style:{background:"var(--bg-elevated)",borderBottom:"1px solid var(--border)",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,position:"sticky",top:0,zIndex:50,boxShadow:"var(--shadow-sm)"}},
      h("div",{style:{display:"flex",alignItems:"center",gap:14}},
        h("div",{style:{width:34,height:34,borderRadius:10,background:"var(--brand)",display:"flex",alignItems:"center",justifyContent:"center"}},
          h("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:"#fff",strokeWidth:2.5,strokeLinecap:"round",strokeLinejoin:"round"},h("path",{d:"M13 10V3L4 14h7v7l9-11h-7z"}))),
        h("div",null,
          h("span",{className:"font-display",style:{fontWeight:800,fontSize:15,letterSpacing:"-.01em"}},"BRANDT"),
          h("span",{style:{fontWeight:800,fontSize:15,color:"var(--brand)",marginLeft:5}},"Dispatch"))),
      h("div",{style:{display:"flex",alignItems:"center",gap:8}},
        h("div",{className:"hide-mobile",style:{display:"flex",alignItems:"center",gap:6,marginRight:8}},
          h("span",{style:{width:7,height:7,borderRadius:"50%",background:isSaving?"var(--warning)":"var(--success)",animation:isSaving?"pulse-dot 1s infinite":"none"}}),
          h("span",{style:{fontSize:11,fontWeight:600,color:"var(--text-tertiary)"}},isSaving?"Sauvegarde...":"Synchronisé")),
        h("input",{type:"date",value:selectedDate,onChange:e=>setSelectedDate(e.target.value),className:"input-sm input",style:{width:140}}),
        h("button",{onClick:setToday,className:"btn btn-ghost",style:{padding:"6px 10px",fontSize:12}},"Auj."),
        h("button",{onClick:setTomorrow,className:"btn btn-ghost hide-mobile",style:{padding:"6px 10px",fontSize:12}},"Dem."),
        h("div",{className:"hide-mobile",style:{width:1,height:24,background:"var(--border)",margin:"0 4px"}}),
        h("button",{onClick:onBackup,className:"btn-icon hide-mobile",title:"Backup Excel"},"💾"),
        h("button",{onClick:()=>fileRef.current?.click(),className:"btn-icon hide-mobile",title:"Restaurer"},"📂"),
        h("input",{type:"file",ref:fileRef,onChange:e=>{const f=e.target.files?.[0];if(f)onRestore(f);if(fileRef.current)fileRef.current.value=""},style:{display:"none"},accept:".xlsx,.xls"}),
        h(ThemeToggle))),

    /* ─ Nav ─ */
    h("nav",{style:{background:"var(--bg-elevated)",borderBottom:"1px solid var(--border)",padding:"0 24px",display:"flex",gap:0}},
      [{id:Page.SUIVI,label:"Suivi Opérationnel",icon:"📊",crit:pageCritical.suivi},{id:Page.PLANIFICATION,label:"Planification",icon:"🗓️",crit:pageCritical.plan},{id:Page.ANALYTIQUE,label:"Analytique",icon:"📈",crit:0}].map(it=>
        h("button",{key:it.id,onClick:()=>setCurrentPage(it.id),className:`tab-btn ${currentPage===it.id?"active":""}`},
          h("span",null,it.icon),
          h("span",{className:"hide-mobile"},it.label),
          it.crit>0&&h("span",{className:"tab-badge"},it.crit)))),

    /* ─ Content ─ */
    h("main",{style:{flex:1,padding:"20px 24px",overflow:"hidden",display:"flex",flexDirection:"column",gap:16}},
      pageAlerts.length>0&&h(AlertBanner,{items:pageAlerts}),
      children))
}

/* ══════════════════════════════════════
   SUIVI
   ══════════════════════════════════════ */
function Suivi({state,updateSuivi,addResource,deleteResource,clearDay,importData,showToast,requestConfirm}){
  const[search,setSearch]=useState("");const[activeFilters,setActiveFilters]=useState([]);const[selectedIds,setSelectedIds]=useState([]);const[compactMode,setCompactMode]=useState(false);const[sortConfig,setSortConfig]=useState({key:null,direction:"asc"});const fileRef=useRef(null);
  const dups=useMemo(()=>{const c={};state.suivi.forEach(r=>{const v=(r.vehicule||"").trim().toUpperCase();if(v)c[v]=(c[v]||0)+1});return new Set(Object.keys(c).filter(k=>c[k]>1))},[state.suivi]);
  const filtered=useMemo(()=>{let res=state.suivi.filter(r=>{const ms=`${r.vehicule} ${r.chauffeur} ${r.agence} ${r.wilayaDemain}`.toLowerCase().includes(search.toLowerCase());if(!activeFilters.length)return ms;return ms&&activeFilters.some(f=>{if(f==='confirmed')return r.confirmation==='Oui';if(f==='refused')return r.confirmation==='Non';if(f==='pending')return r.confirmation==='';if(f==='onsite')return r.surSite;if(f==='cable')return r.cableDeTir;if(f==='duplicate')return dups.has((r.vehicule||"").trim().toUpperCase());return true})});if(sortConfig.key){res=[...res].sort((a,b)=>{const av=a[sortConfig.key]||"",bv=b[sortConfig.key]||"";return sortConfig.direction==="asc"?(av<bv?-1:av>bv?1:0):(av>bv?-1:av<bv?1:0)})}return res},[state.suivi,search,activeFilters,sortConfig,dups]);
  const counts={confirmed:state.suivi.filter(r=>r.confirmation==='Oui').length,refused:state.suivi.filter(r=>r.confirmation==='Non').length,pending:state.suivi.filter(r=>r.confirmation==='').length,onsite:state.suivi.filter(r=>r.surSite).length,cable:state.suivi.filter(r=>r.cableDeTir).length,dup:state.suivi.filter(r=>dups.has((r.vehicule||"").trim().toUpperCase())).length};
  const fOpts=[{key:'confirmed',label:'Confirmés',count:counts.confirmed},{key:'refused',label:'Refusés',count:counts.refused},{key:'pending',label:'En attente',count:counts.pending},{key:'onsite',label:'Sur site',count:counts.onsite},{key:'cable',label:'Cable',count:counts.cable},{key:'duplicate',label:'Doublons',count:counts.dup}];

  const handleImport=e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{try{
    const data=new Uint8Array(ev.target.result);const wb=window.XLSX.read(data,{type:"array"});const sheet=wb.Sheets[wb.SheetNames[0]];const rows=window.XLSX.utils.sheet_to_json(sheet);
    if(!rows.length){showToast("Fichier vide","warning");return}
    const parsed=rows.map(row=>{const find=keys=>{const k=Object.keys(row).find(rk=>keys.some(pk=>rk.toLowerCase().includes(pk.toLowerCase())));return k?(row[k]?.toString().trim()??""):""};
      const rawDS=find(["destination souhait","dest souhait","souhaite"]);const mDS=DESTINATIONS_SOUHAITEES.find(d=>rawDS.toLowerCase().includes(d.toLowerCase())||d.toLowerCase().includes(rawDS.toLowerCase()))||rawDS||"";
      const findExact=name=>{const k=Object.keys(row).find(rk=>rk.trim().toLowerCase()===name.toLowerCase());return k?(row[k]?.toString().trim()??""):""};
      const rawW=findExact("Wilaya Demain")||find(["wilaya demain","wilaya_demain"]);
      const rawC=find(["cable de tir","cable","équipement","equipement"]);const hasC=rawC&&(rawC.toLowerCase().includes("oui")||rawC.toLowerCase().includes("yes")||rawC.toLowerCase().includes("cable")||rawC==="1");
      return{id:crypto.randomUUID(),source:"import",vehicule:find(["véhicule","matricule","camion","vehicule"]).toUpperCase(),agence:find(["agence","depot","site","dépôt"]),chauffeur:find(["chauffeur","conducteur","nom"]),destinationSouhaitee:mDS,wilayaDemain:rawW,horaire:find(["horaire j+1","horaire","heure j+1","heure","prev"]),horaireSouhaitee:"",surSite:false,confirmation:"",causeRefus:"",typeRM:"",cableDeTir:hasC,confirmationTime:null}});
    importData(parsed);showToast(`${parsed.length} véhicules importés`,'success')}catch(err){showToast("Erreur: "+err.message,"error")}};reader.readAsArrayBuffer(file);if(fileRef.current)fileRef.current.value=""};

  const exportSuivi=()=>{const wb=window.XLSX.utils.book_new();const d=[["Véhicule","Agence","Chauffeur","Dest. Souhaitée","Wilaya J+1","Horaire","Sur Site","Cable","Confirmation","Motif","H. Confirm."]];
    state.suivi.forEach(r=>d.push([r.vehicule,r.agence,r.chauffeur,r.destinationSouhaitee,r.wilayaDemain,r.horaire,r.surSite?"Oui":"Non",r.cableDeTir?"Oui":"Non",r.confirmation,r.causeRefus,r.confirmationTime?fmtTime(r.confirmationTime):""]));
    const ws=window.XLSX.utils.aoa_to_sheet(d);ws['!cols']=[{wch:16},{wch:20},{wch:22},{wch:18},{wch:16},{wch:10},{wch:8},{wch:8},{wch:12},{wch:22},{wch:14}];window.XLSX.utils.book_append_sheet(wb,ws,"Suivi");
    window.XLSX.writeFile(wb,`BRANDT_Suivi_${(state.date||"").replace(/-/g,"")}.xlsx`);showToast('Export OK','success')};

  const hdrs=[{key:"vehicule",label:"Véhicule",s:1},{key:"agence",label:"Agence",s:1},{key:"chauffeur",label:"Chauffeur",s:1},{key:"destinationSouhaitee",label:"Dest. Souh.",s:1,ht:1},{key:"wilayaDemain",label:"Wilaya J+1",s:1},{key:"horaire",label:"Horaire"},{key:"surSite",label:"Sur Site"},{key:"cableDeTir",label:"Cable"},{key:"confirmation",label:"Confirmation"},{key:"causeRefus",label:"Motif",ht:1},{key:"actions",label:"",r:1}];

  const getRowAccent=(r)=>{if(r.surSite)return"row-accent-success";if(r.confirmation==="Oui")return"row-accent-brand";if(r.confirmation==="Non")return"row-accent-danger";if(!r.wilayaDemain)return"row-accent-warning";return""};

  return h("div",{style:{display:"flex",flexDirection:"column",gap:16,flex:1,overflow:"hidden"},className:"anim-fade"},
    /* Stats */
    h("div",{className:"stat-grid-5",style:{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}},
      h(StatCard,{label:"Flotte totale",value:state.suivi.length,accent:"brand"}),
      h(StatCard,{label:"Confirmés",value:counts.confirmed,accent:"success"}),
      h(StatCard,{label:"Refusés",value:counts.refused,accent:"danger"}),
      h(StatCard,{label:"Sur site",value:counts.onsite,accent:"purple"}),
      h(StatCard,{label:"En attente",value:counts.pending,accent:"warning"})),

    /* Filters */
    h("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}},
      h("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
        fOpts.map(f=>h("button",{key:f.key,onClick:()=>setActiveFilters(p=>p.includes(f.key)?p.filter(x=>x!==f.key):[...p,f.key]),className:`fchip ${activeFilters.includes(f.key)?'on':''}`},f.label,f.count>0&&h("span",{style:{fontSize:10,fontWeight:800,opacity:.7}},f.count)))),
      h("div",{style:{display:"flex",gap:8,alignItems:"center"}},
        activeFilters.length>0&&h("button",{onClick:()=>setActiveFilters([]),style:{fontSize:12,fontWeight:600,color:"var(--brand)",background:"none",border:"none",cursor:"pointer"}},"Réinitialiser"))),

    /* Table card */
    h("div",{className:"card",style:{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}},
      /* Table toolbar */
      h("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border-light)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}},
        h("div",{style:{display:"flex",alignItems:"center",gap:12}},
          h("div",{style:{position:"relative"}},
            h("svg",{style:{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",opacity:.35},width:15,height:15,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2.5},h("circle",{cx:11,cy:11,r:8}),h("path",{d:"M21 21l-4.35-4.35"})),
            h("input",{type:"text",placeholder:"Rechercher véhicule, chauffeur, wilaya...",value:search,onChange:e=>setSearch(e.target.value),className:"input",style:{paddingLeft:34,width:340,fontSize:12}})),
          h("span",{style:{fontSize:12,fontWeight:600,color:"var(--text-tertiary)"}},`${filtered.length} / ${state.suivi.length}`)),
        h("div",{style:{display:"flex",gap:8}},
          h("button",{onClick:()=>fileRef.current?.click(),className:"btn btn-ghost",style:{fontSize:12}},"📥 Import"),
          h("input",{type:"file",ref:fileRef,onChange:handleImport,style:{display:"none"},accept:".xlsx,.xls"}),
          h("button",{onClick:exportSuivi,className:"btn btn-ghost hide-mobile",style:{fontSize:12}},"📤 Export"),
          h("button",{onClick:addResource,className:"btn btn-brand",style:{fontSize:12}},"+ Ajouter"),
          h("button",{onClick:()=>requestConfirm("Vider la liste","Supprimer tous les véhicules de cette journée ?",()=>{clearDay();showToast('Liste vidée','info')},true),className:"btn-icon",style:{color:"var(--danger)"}},"🗑️"))),

      /* Batch actions */
      selectedIds.length>0&&h("div",{style:{padding:"8px 16px",background:"var(--brand-surface)",borderBottom:"1px solid var(--border-light)",display:"flex",alignItems:"center",gap:10},className:"anim-slide-down"},
        h("span",{style:{fontSize:12,fontWeight:700,color:"var(--brand)"}},`${selectedIds.length} sélectionné(s)`),
        h("button",{onClick:()=>{selectedIds.forEach(id=>updateSuivi(id,{confirmation:"Oui",confirmationTime:Date.now()}));setSelectedIds([]);showToast(`${selectedIds.length} confirmés`,'success')},className:"btn",style:{fontSize:11,padding:"4px 12px",background:"var(--success)",color:"#fff"}},"✓ Confirmer"),
        h("button",{onClick:()=>{selectedIds.forEach(id=>updateSuivi(id,{confirmation:"Non",confirmationTime:Date.now()}));setSelectedIds([]);showToast(`${selectedIds.length} refusés`,'success')},className:"btn",style:{fontSize:11,padding:"4px 12px",background:"var(--danger)",color:"#fff"}},"✕ Refuser"),
        h("button",{onClick:()=>setSelectedIds([]),style:{fontSize:12,fontWeight:600,color:"var(--text-secondary)",background:"none",border:"none",cursor:"pointer"}},"Désélectionner")),

      /* Table */
      h("div",{style:{flex:1,overflow:"auto"}},
        h("table",{className:"tbl"},
          h("thead",null,h("tr",null,
            h("th",{style:{width:40}},h("input",{type:"checkbox",onChange:e=>setSelectedIds(e.target.checked?filtered.map(r=>r.id):[]),checked:selectedIds.length===filtered.length&&filtered.length>0,className:"check"})),
            hdrs.map(c=>h("th",{key:c.key,className:`${c.ht?"hide-tablet":""} ${c.s?"":""}`,style:{cursor:c.s?"pointer":undefined,userSelect:c.s?"none":undefined,textAlign:c.r?"right":undefined},onClick:c.s?()=>setSortConfig(p=>({key:c.key,direction:p.key===c.key&&p.direction==="asc"?"desc":"asc"})):undefined},
              h("span",{style:{display:"flex",alignItems:"center",gap:4}},c.label,c.s&&sortConfig.key===c.key&&h("span",{style:{color:"var(--brand)"}},sortConfig.direction==="asc"?"↑":"↓")))))),
          h("tbody",null,filtered.map(r=>{
            const isDup=dups.has((r.vehicule||"").trim().toUpperCase())&&(r.vehicule||"").trim()!=="";
            const accent=isDup?"row-accent-warning":getRowAccent(r);
            return h("tr",{key:r.id,className:accent,style:{background:r.confirmation==="Non"?"var(--danger-surface)":r.surSite?"var(--success-surface)":undefined}},
              h("td",null,h("input",{type:"checkbox",checked:selectedIds.includes(r.id),onChange:()=>setSelectedIds(p=>p.includes(r.id)?p.filter(id=>id!==r.id):[...p,r.id]),className:"check"})),
              /* Véhicule */
              h("td",null,h("div",{style:{display:"flex",alignItems:"center",gap:6}},
                h("input",{value:r.vehicule||"",onChange:e=>updateSuivi(r.id,{vehicule:e.target.value.toUpperCase()}),className:"font-mono",style:{background:"transparent",border:"none",padding:0,width:100,outline:"none",fontSize:12,fontWeight:700,letterSpacing:".03em",color:isDup?"var(--warning)":"var(--text)"},placeholder:"MAT-000-00"}),
                isDup&&h("span",{className:"badge badge-warning",style:{fontSize:9,padding:"1px 6px"}},"DUP"))),
              /* Agence */
              h("td",null,h("select",{value:r.agence||"",onChange:e=>updateSuivi(r.id,{agence:e.target.value}),className:"input-sm input",style:{border:"none",padding:"4px 24px 4px 6px",fontSize:12,fontWeight:600,background:"transparent",maxWidth:130}},h("option",{value:""},"—"),AGENCIES.map(a=>h("option",{key:a,value:a},a)))),
              /* Chauffeur */
              h("td",null,h("input",{value:r.chauffeur||"",onChange:e=>updateSuivi(r.id,{chauffeur:e.target.value}),style:{background:"transparent",border:"none",padding:0,width:"100%",outline:"none",fontSize:12,fontWeight:500,maxWidth:140},placeholder:"Nom du chauffeur"})),
              /* Dest Souh. */
              h("td",{className:"hide-tablet"},h("select",{value:r.destinationSouhaitee||"",onChange:e=>updateSuivi(r.id,{destinationSouhaitee:e.target.value}),className:"input-sm input",style:{border:"none",padding:"4px 24px 4px 6px",fontSize:12,fontWeight:700,background:"transparent",color:r.destinationSouhaitee?"var(--purple)":"var(--text-tertiary)",maxWidth:120}},h("option",{value:""},"Dest..."),DESTINATIONS_SOUHAITEES.map(w=>h("option",{key:w,value:w},w)))),
              /* Wilaya J+1 */
              h("td",null,h("input",{list:`wl-${r.id}`,value:r.wilayaDemain||"",onChange:e=>updateSuivi(r.id,{wilayaDemain:e.target.value}),placeholder:!r.wilayaDemain?"⚠ Manquante":"",style:{background:"transparent",border:"none",padding:0,fontSize:12,fontWeight:700,outline:"none",width:"100%",maxWidth:110,color:r.wilayaDemain?"var(--brand)":"var(--danger)"}}),h("datalist",{id:`wl-${r.id}`},WILAYAS.map(w=>h("option",{key:w,value:w})))),
              /* Horaire */
              h("td",null,h("input",{value:r.horaire||"",onChange:e=>updateSuivi(r.id,{horaire:e.target.value}),className:"font-mono",style:{background:"transparent",border:"none",padding:0,width:60,outline:"none",fontSize:12,fontWeight:500,color:"var(--text-secondary)"},placeholder:"--:--"})),
              /* Sur Site */
              h("td",null,h("label",{style:{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}},h("input",{type:"checkbox",checked:!!r.surSite,onChange:e=>updateSuivi(r.id,{surSite:e.target.checked}),className:"check"}),r.surSite&&h("span",{className:"badge badge-success",style:{padding:"1px 6px",fontSize:10}},"Oui"))),
              /* Cable */
              h("td",null,h("label",{style:{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}},h("input",{type:"checkbox",checked:!!r.cableDeTir,onChange:e=>updateSuivi(r.id,{cableDeTir:e.target.checked}),className:"check"}),r.cableDeTir&&h("span",{className:"badge badge-brand",style:{padding:"1px 6px",fontSize:10}},"Oui"))),
              /* Confirmation — REDESIGNED: Large status buttons */
              h("td",null,h("div",{style:{display:"flex",gap:4,alignItems:"center"}},
                h("button",{onClick:()=>{updateSuivi(r.id,{confirmation:"Oui",confirmationTime:Date.now()});showToast('Confirmé','success')},style:{width:32,height:28,borderRadius:8,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,transition:"all .15s",background:r.confirmation==="Oui"?"var(--success)":"var(--bg-subtle)",color:r.confirmation==="Oui"?"#fff":"var(--text-tertiary)"}},"✓"),
                h("button",{onClick:()=>{updateSuivi(r.id,{confirmation:"Non",confirmationTime:Date.now()})},style:{width:32,height:28,borderRadius:8,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,transition:"all .15s",background:r.confirmation==="Non"?"var(--danger)":"var(--bg-subtle)",color:r.confirmation==="Non"?"#fff":"var(--text-tertiary)"}},"✕"),
                h("button",{onClick:()=>{updateSuivi(r.id,{confirmation:"",confirmationTime:null})},style:{width:28,height:28,borderRadius:8,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,transition:"all .15s",background:r.confirmation===""&&state.suivi.length?"var(--warning)":"var(--bg-subtle)",color:r.confirmation===""&&state.suivi.length?"#fff":"var(--text-tertiary)"}},"?"),
                r.confirmationTime&&r.confirmation&&h("span",{className:"font-mono",style:{fontSize:10,color:"var(--text-tertiary)",marginLeft:2}},fmtTime(r.confirmationTime)))),
              /* Motif */
              h("td",{className:"hide-tablet"},r.confirmation==="Non"?h("select",{value:r.causeRefus||"",onChange:e=>updateSuivi(r.id,{causeRefus:e.target.value}),className:"input-sm input",style:{fontSize:11,fontWeight:600,border:"1.5px solid var(--danger-light)",background:"var(--danger-surface)",maxWidth:160}},h("option",{value:""},"Choisir motif..."),REFUSAL_REASONS.map(rr=>h("option",{key:rr,value:rr},rr))):h("span",{style:{color:"var(--text-tertiary)",fontSize:12}},"—")),
              /* Delete */
              h("td",{style:{textAlign:"right"}},h("button",{onClick:()=>requestConfirm("Supprimer",`Supprimer ${r.vehicule||'ce véhicule'} ?`,()=>{deleteResource(r.id);showToast('Supprimé','info')},true),className:"btn-icon",style:{opacity:.3,transition:"opacity .2s",color:"var(--danger)"},onMouseEnter:e=>e.currentTarget.style.opacity=1,onMouseLeave:e=>e.currentTarget.style.opacity=.3},"🗑")))}))),
        filtered.length===0&&h("div",{style:{padding:80,textAlign:"center"}},
          h("p",{style:{fontSize:40,opacity:.15,marginBottom:8}},search||activeFilters.length>0?"🔍":"🚚"),
          h("p",{style:{fontSize:13,fontWeight:600,color:"var(--text-tertiary)"}},search||activeFilters.length>0?"Aucun résultat":"Importez un fichier Excel ou ajoutez manuellement")))))
}

/* ══════════════════════════════════════
   PLANIFICATION
   ══════════════════════════════════════ */
function Planification({state,assignResource,removeAssignment,addOrders,deleteOrder,rescheduleUnassignedOrders,showToast,requestConfirm}){
  const[showModal,setShowModal]=useState(false);const[dragOverId,setDragOverId]=useState(null);const[draggingResourceId,setDraggingResourceId]=useState(null);const[resourceSearch,setResourceSearch]=useState("");
  const ordersScrollRef=useRef(null);
  const unassigned=state.plan.orders.filter(o=>!(state.plan.assignments[o.id]?.length));
  const confirmed=state.suivi.filter(r=>r.confirmation==="Oui");
  const assignedIds=useMemo(()=>new Set(Object.values(state.plan.assignments).flat()),[state.plan.assignments]);
  const filteredRes=useMemo(()=>{if(!resourceSearch)return confirmed;const q=resourceSearch.toLowerCase();return confirmed.filter(r=>`${r.vehicule} ${r.agence} ${r.wilayaDemain} ${r.chauffeur}`.toLowerCase().includes(q))},[confirmed,resourceSearch]);
  const sortedRes=useMemo(()=>[...filteredRes].sort((a,b)=>(assignedIds.has(a.id)?1:0)-(assignedIds.has(b.id)?1:0)),[filteredRes,assignedIds]);

  const handleOrdersPanelDragOver=useCallback((e)=>{e.preventDefault();const c=ordersScrollRef.current;if(!c)return;const r=c.getBoundingClientRect();const y=e.clientY;const EDGE=60,SPEED=14;if(y-r.top<EDGE)c.scrollTop-=SPEED;else if(r.bottom-y<EDGE)c.scrollTop+=SPEED},[]);

  const exportXls=()=>{const wb=window.XLSX.utils.book_new();const pd=[["NUM","DESTINATION","T","IMMATRICULATION","Agence","Nom & Prénom","Équipement","Position"]];let n=1;
    state.plan.orders.forEach(o=>{const aids=state.plan.assignments[o.id]||[];if(!aids.length){pd.push([n,`${o.type} ${o.destination}`,"","Non affecté","","","",""]);n++}else aids.forEach(rid=>{const r=state.suivi.find(x=>x.id===rid);if(r)pd.push([n,`${o.type} ${o.destination}`,getTonnage(r.agence),r.vehicule||"",r.agence||"",r.chauffeur||"",r.cableDeTir?"cable de tir":"",r.surSite?"sur site":(r.horaire||"")]);else pd.push([n,`${o.type} ${o.destination}`,"","?","","","",""]);n++})});
    const ws1=window.XLSX.utils.aoa_to_sheet(pd);ws1['!cols']=[{wch:6},{wch:25},{wch:6},{wch:18},{wch:20},{wch:25},{wch:15},{wch:15}];window.XLSX.utils.book_append_sheet(wb,ws1,"Plan");
    const sd=[["Véhicule","Agence","Chauffeur","Wilaya J+1","Horaire","Sur Site","Cable","Confirmation","Motif"]];state.suivi.forEach(r=>sd.push([r.vehicule,r.agence,r.chauffeur,r.wilayaDemain,r.horaire,r.surSite?"Oui":"Non",r.cableDeTir?"Oui":"Non",r.confirmation,r.causeRefus]));
    const ws2=window.XLSX.utils.aoa_to_sheet(sd);ws2['!cols']=[{wch:16},{wch:20},{wch:22},{wch:16},{wch:10},{wch:8},{wch:8},{wch:12},{wch:22}];window.XLSX.utils.book_append_sheet(wb,ws2,"Suivi");
    window.XLSX.writeFile(wb,`BRANDT_Dispatch_${(state.date||"").replace(/-/g,"")}.xlsx`);showToast('Export OK','success')};

  return h("div",{style:{display:"flex",flexDirection:"column",gap:16,flex:1,overflow:"hidden"},className:"anim-fade"},
    /* Header */
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}},
      h("div",null,
        h("h2",{className:"font-display",style:{fontSize:20,fontWeight:800,letterSpacing:"-.02em"}},"Plan de Chargement"),
        h("div",{style:{display:"flex",gap:16,marginTop:6}},
          unassigned.length>0&&h("span",{className:"badge badge-danger",style:{fontSize:12,padding:"4px 12px"}},"● "+unassigned.length+" non affectée(s)"),
          h("span",{className:"badge badge-brand",style:{fontSize:12,padding:"4px 12px"}},confirmed.length+" confirmé(s)"),
          h("span",{className:"badge badge-success hide-mobile",style:{fontSize:12,padding:"4px 12px"}},confirmed.filter(r=>!assignedIds.has(r.id)).length+" libre(s)"))),
      h("div",{style:{display:"flex",gap:8}},
        h("button",{onClick:exportXls,className:"btn btn-ghost",style:{fontSize:12}},"📊 Export"),
        h("button",{onClick:rescheduleUnassignedOrders,className:"btn btn-ghost",style:{fontSize:12}},"➡️ Reporter"),
        h("button",{onClick:()=>setShowModal(true),className:"btn btn-brand",style:{fontSize:12}},"+ Commande"))),

    /* Split layout */
    h("div",{className:"plan-split",style:{flex:1,display:"flex",gap:16,overflow:"hidden",flexDirection:"row"}},

      /* LEFT: Resources */
      h("div",{className:"plan-left card",style:{width:300,minWidth:260,flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden"}},
        h("div",{style:{padding:14,borderBottom:"1px solid var(--border-light)"}},
          h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}},
            h("span",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)"}},"🚛 Ressources"),
            h("span",{className:"badge badge-brand"},confirmed.length)),
          h("input",{type:"text",placeholder:"Filtrer chauffeur, véhicule...",value:resourceSearch,onChange:e=>setResourceSearch(e.target.value),className:"input input-sm"})),
        h("div",{style:{flex:1,overflow:"auto",padding:10,display:"flex",flexDirection:"column",gap:8}},
          sortedRes.length===0&&h("div",{style:{padding:40,textAlign:"center"}},h("p",{style:{fontSize:32,opacity:.15}},"🚛"),h("p",{style:{fontSize:11,color:"var(--text-tertiary)",fontWeight:600}},confirmed.length===0?"Aucun confirmé":"Aucun résultat")),
          sortedRes.map(r=>{
            const isA=assignedIds.has(r.id);const ac=Object.values(state.plan.assignments).filter(ids=>ids.includes(r.id)).length;const isD=draggingResourceId===r.id;
            return h("div",{key:r.id,draggable:ac<2,onDragStart:e=>{if(ac>=2){e.preventDefault();return}e.dataTransfer.setData("rid",r.id);setDraggingResourceId(r.id)},onDragEnd:()=>setDraggingResourceId(null),className:`res-card ${isA?"is-assigned":""} ${ac>=2?"is-full":""} ${isD?"is-dragging":""}`},
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
                h("span",{className:"font-display",style:{fontWeight:700,fontSize:13}},r.chauffeur||"Sans nom"),
                ac>0&&h("span",{className:`badge ${ac>=2?"badge-warning":"badge-brand"}`,style:{fontSize:10}},`${ac}/2`)),
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}},
                h("span",{className:"font-mono",style:{fontSize:11,fontWeight:600,color:"var(--text-tertiary)"}},r.vehicule||"—"),
                h("span",{style:{fontSize:11,fontWeight:700,color:"var(--brand)"}},r.wilayaDemain||h("span",{style:{color:"var(--danger)",fontStyle:"italic"}},"N/A"))),
              h("div",{style:{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}},
                h("span",{className:"badge badge-neutral",style:{fontSize:10}},getTonnage(r.agence)),
                r.cableDeTir&&h("span",{className:"badge badge-warning",style:{fontSize:10}},"🔌 Cable"),
                r.surSite&&h("span",{className:"badge badge-success",style:{fontSize:10}},"📍 Site"),
                r.horaire&&h("span",{className:"badge badge-neutral font-mono",style:{fontSize:10}},r.horaire)))})),
        h("div",{style:{padding:"10px 14px",borderTop:"1px solid var(--border-light)",display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700}},
          h("span",{style:{color:"var(--success)"}},`${confirmed.filter(r=>!assignedIds.has(r.id)).length} libres`),
          h("span",{style:{color:"var(--brand)"}},`${[...assignedIds].filter(id=>confirmed.some(r=>r.id===id)).length} affectés`))),

      /* RIGHT: Orders */
      h("div",{className:"plan-right card",style:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}},
        h("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border-light)",display:"flex",justifyContent:"space-between",alignItems:"center"}},
          h("div",{style:{display:"flex",alignItems:"center",gap:10}},
            h("span",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)"}},"📦 Commandes"),
            h("span",{className:"badge badge-brand"},state.plan.orders.length)),
          unassigned.length>0&&h("span",{className:"badge badge-danger"},`${unassigned.length} en attente`)),
        h("div",{ref:ordersScrollRef,onDragOver:handleOrdersPanelDragOver,style:{flex:1,overflow:"auto"}},
          h("table",{className:"tbl"},
            h("thead",null,h("tr",null,h("th",{style:{width:40,textAlign:"center"}},"#"),h("th",null,"Destination"),h("th",null,"Type"),h("th",null,"Véhicule affecté"),h("th",{style:{width:40}}))),
            h("tbody",null,state.plan.orders.map((o,idx)=>{
              const aids=state.plan.assignments[o.id]||[];const isH=dragOverId===o.id;
              const dRes=draggingResourceId?state.suivi.find(r=>r.id===draggingResourceId):null;
              const compat=dRes&&(dRes.wilayaDemain||"").toLowerCase()===(o.destination||"").toLowerCase();
              return h("tr",{key:o.id,style:{background:aids.length===0?"var(--danger-surface)":undefined}},
                h("td",{style:{textAlign:"center"}},h("span",{className:"font-mono",style:{fontSize:11,fontWeight:600,color:"var(--text-tertiary)"}},idx+1)),
                h("td",null,
                  h("span",{className:"font-display",style:{fontWeight:700,fontSize:13,textTransform:"uppercase",letterSpacing:".02em"}},o.destination),
                  o.originDate&&h("span",{className:"badge badge-warning",style:{marginLeft:8,fontSize:9}},"📅 "+o.originDate)),
                h("td",null,h("span",{className:`badge ${o.type==="CLR"?"badge-purple":"badge-brand"}`},o.type)),
                h("td",null,
                  h("div",{onDragOver:e=>{e.preventDefault();setDragOverId(o.id)},onDragLeave:()=>setDragOverId(null),onDrop:e=>{setDragOverId(null);const rid=e.dataTransfer.getData("rid");if(rid){const curA=state.plan.assignments[o.id]||[];if(curA.length>=1){showToast('Commande déjà affectée','warning');return}const tc=Object.values(state.plan.assignments).filter(ids=>(ids||[]).includes(rid)).length;if(tc>=2){showToast('Camion déjà à 2 commandes','warning');return}assignResource(o.id,rid);showToast('Affecté','success')}},className:`drop-zone ${aids.length>0?"has-item":""} ${isH?"is-over":draggingResourceId&&compat&&aids.length===0?"is-compat":""}`},
                    aids.map(rid=>{const res=state.suivi.find(x=>x.id===rid);const isM=(res?.wilayaDemain||"").toLowerCase()===(o.destination||"").toLowerCase();
                      return h("div",{key:rid,className:"assign-chip",style:{borderLeft:isM?"3px solid var(--success)":"3px solid var(--warning)"}},
                        h("span",null,res?.chauffeur||"?"),
                        h("span",{style:{opacity:.5,fontSize:10}},res?.vehicule),
                        !isM&&h("span",{style:{color:"#fbbf24"}},"⚠"),
                        h("button",{onClick:()=>{removeAssignment(o.id,rid);showToast('Retiré','info')},style:{background:"none",border:"none",color:"rgba(255,255,255,.5)",cursor:"pointer",fontSize:12,marginLeft:2}},"✕"))}),
                    aids.length===0&&!isH&&h("span",{style:{fontSize:11,color:"var(--text-tertiary)",fontWeight:500,fontStyle:"italic",margin:"auto"}},draggingResourceId&&compat?"✅ Compatible — lâcher ici":draggingResourceId?"Glisser ici":"← Glisser un véhicule"),
                    isH&&aids.length===0&&h("span",{style:{fontSize:11,color:"var(--brand)",fontWeight:700,margin:"auto"}},"Lâcher pour affecter"))),
                h("td",null,h("button",{onClick:()=>requestConfirm("Supprimer",`Supprimer ${o.type} ${o.destination} ?`,()=>{deleteOrder(o.id);showToast('Supprimée','info')},true),className:"btn-icon",style:{opacity:.2,fontSize:14},onMouseEnter:e=>e.currentTarget.style.opacity=1,onMouseLeave:e=>e.currentTarget.style.opacity=.2},"🗑")))}))),
          state.plan.orders.length===0&&h("div",{style:{padding:80,textAlign:"center"}},h("p",{style:{fontSize:40,opacity:.15,marginBottom:8}},"📦"),h("p",{style:{fontSize:13,fontWeight:600,color:"var(--text-tertiary)"}},"Aucune commande"))))),

    /* Modal */
    showModal&&h("div",{className:"modal-bg",onClick:()=>setShowModal(false)},h("div",{className:"modal-box",onClick:e=>e.stopPropagation()},
      h("div",{style:{padding:28}},
        h("h3",{className:"font-display",style:{fontSize:18,fontWeight:800,marginBottom:24}},"Nouvelle commande"),
        h("div",{style:{display:"flex",flexDirection:"column",gap:16}},
          h("div",null,h("label",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)",display:"block",marginBottom:6}},"Destination"),h("input",{list:"dests",id:"m-dest",className:"input",placeholder:"Sélectionner une destination..."}),h("datalist",{id:"dests"},DESTINATIONS.map(d=>h("option",{key:d,value:d})))),
          h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}},
            h("div",null,h("label",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)",display:"block",marginBottom:6}},"Nombre"),h("input",{type:"number",id:"m-count",defaultValue:"1",min:"1",className:"input"})),
            h("div",null,h("label",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)",display:"block",marginBottom:6}},"Type"),h("select",{id:"m-type",className:"input"},h("option",{value:"CLR"},"CLR"),h("option",{value:"CMD"},"CMD")))),
          h("div",{style:{display:"flex",gap:10,marginTop:8}},
            h("button",{onClick:()=>setShowModal(false),className:"btn btn-ghost",style:{flex:1}},"Annuler"),
            h("button",{onClick:()=>{const d=document.getElementById("m-dest").value;const c=parseInt(document.getElementById("m-count").value)||1;const t=document.getElementById("m-type").value;if(!d){showToast("Destination requise","warning");return}addOrders(d,t,c);setShowModal(false);showToast(`${c} commande${c>1?'s':''} créée${c>1?'s':''}`,'success')},className:"btn btn-brand",style:{flex:1}},"Créer")))))))
}

/* ══════════════════════════════════════
   ANALYTIQUE
   ══════════════════════════════════════ */
function Analytics({state,selectedDate}){
  const[viewMode,setViewMode]=useState("day");
  const total=state.suivi.length,confirmed=state.suivi.filter(r=>r.confirmation==="Oui").length,refused=state.suivi.filter(r=>r.confirmation==="Non").length,pending=state.suivi.filter(r=>r.confirmation==="").length,surSite=state.suivi.filter(r=>r.surSite).length;
  const totalOrders=state.plan.orders.length,assignedOrders=state.plan.orders.filter(o=>(state.plan.assignments[o.id]?.length||0)>0).length;
  const assignmentRate=totalOrders>0?Math.round((assignedOrders/totalOrders)*100):0;
  const usedIds=new Set(Object.values(state.plan.assignments).flat());const cRes=state.suivi.filter(r=>r.confirmation==="Oui");const usedRes=cRes.filter(r=>usedIds.has(r.id)).length;
  const utilRate=cRes.length>0?Math.round((usedRes/cRes.length)*100):0;
  const weekly=useMemo(()=>{if(viewMode!=="week")return[];const days=[];for(let i=6;i>=0;i--){const d=new Date(selectedDate);d.setDate(d.getDate()-i);const ds=d.toISOString().split("T")[0];const raw=localStorage.getItem(`${LS_PREFIX}${ds}`);const s=raw?JSON.parse(raw):{suivi:[],plan:{orders:[],assignments:{}}};days.push({date:d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"}),confirmed:s.suivi.filter(r=>r.confirmation==="Oui").length,refused:s.suivi.filter(r=>r.confirmation==="Non").length,assigned:s.plan.orders.filter(o=>(s.plan.assignments[o.id]?.length||0)>0).length})}return days},[viewMode,selectedDate]);
  const byAgency=useMemo(()=>{const c={};state.suivi.forEach(r=>{const a=r.agence||"?";c[a]=(c[a]||0)+1});return Object.entries(c).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)},[state.suivi]);
  const confStatus=useMemo(()=>[{name:"Confirmés",value:confirmed,color:"#059669"},{name:"Refusés",value:refused,color:"#DC2626"},{name:"En attente",value:pending,color:"#D97706"}].filter(v=>v.value>0),[confirmed,refused,pending]);
  const refBreak=useMemo(()=>{const c={};state.suivi.filter(r=>r.confirmation==="Non"&&r.causeRefus).forEach(r=>{c[r.causeRefus]=(c[r.causeRefus]||0)+1});return Object.entries(c).map(([name,value])=>({name,value}))},[state.suivi]);
  const topDest=useMemo(()=>{const c={};state.suivi.filter(r=>r.confirmation==="Oui").forEach(r=>{const d=r.wilayaDemain||"?";c[d]=(c[d]||0)+1});return Object.entries(c).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,6)},[state.suivi]);

  if(total===0&&totalOrders===0&&viewMode==="day")return h("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,color:"var(--text-tertiary)"}},h("p",{style:{fontSize:48,opacity:.15,marginBottom:8}},"📊"),h("p",{style:{fontSize:14,fontWeight:600}},"Aucune donnée pour cette journée"),h("button",{onClick:()=>setViewMode("week"),className:"btn btn-ghost",style:{marginTop:16}},"Voir les 7 derniers jours"));

  const Circ=({pct,label,color})=>{const r=54,c=2*Math.PI*r,o=c-(pct/100)*c;
    return h("div",{style:{position:"relative",width:140,height:140}},h("svg",{viewBox:"0 0 140 140",style:{width:"100%",height:"100%",transform:"rotate(-90deg)"}},h("circle",{cx:70,cy:70,r,fill:"none",stroke:"var(--border)",strokeWidth:10}),h("circle",{cx:70,cy:70,r,fill:"none",stroke:color,strokeWidth:10,strokeLinecap:"round",strokeDasharray:c,strokeDashoffset:o,style:{transition:"stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)"}})),h("div",{style:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}},h("span",{className:"font-display",style:{fontSize:26,fontWeight:800}},`${pct}%`),h("span",{style:{fontSize:10,fontWeight:700,color:"var(--text-tertiary)",textTransform:"uppercase",marginTop:2}},label)))};

  const chartStyle={background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"12px",fontSize:"11px",fontWeight:"bold"};

  return h("div",{style:{overflow:"auto",flex:1,display:"flex",flexDirection:"column",gap:20,paddingBottom:40},className:"anim-fade"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
      h("h2",{className:"font-display",style:{fontSize:20,fontWeight:800,letterSpacing:"-.02em"}},"Analytique"),
      h("div",{style:{display:"flex",gap:2,background:"var(--bg-subtle)",borderRadius:10,padding:3}},
        h("button",{onClick:()=>setViewMode("day"),style:{padding:"6px 16px",borderRadius:8,fontSize:12,fontWeight:600,border:"none",cursor:"pointer",background:viewMode==="day"?"var(--bg-elevated)":"transparent",color:viewMode==="day"?"var(--brand)":"var(--text-secondary)",boxShadow:viewMode==="day"?"var(--shadow-sm)":"none"}},"Jour"),
        h("button",{onClick:()=>setViewMode("week"),style:{padding:"6px 16px",borderRadius:8,fontSize:12,fontWeight:600,border:"none",cursor:"pointer",background:viewMode==="week"?"var(--bg-elevated)":"transparent",color:viewMode==="week"?"var(--brand)":"var(--text-secondary)",boxShadow:viewMode==="week"?"var(--shadow-sm)":"none"}},"7 Jours"))),
    viewMode==="week"&&h("div",{className:"card",style:{padding:24}},h("h4",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)",marginBottom:16}},"Tendance 7 jours"),h(ResponsiveContainer,{width:"100%",height:250},h(BarChart,{data:weekly},h(CartesianGrid,{strokeDasharray:"3 3",vertical:false,stroke:"var(--border)"}),h(XAxis,{dataKey:"date",fontSize:10,tick:{fill:"var(--text-secondary)"},axisLine:false,tickLine:false}),h(YAxis,{fontSize:10,tick:{fill:"var(--text-secondary)"},axisLine:false,tickLine:false}),h(RTooltip,{contentStyle:chartStyle}),h(Legend,{wrapperStyle:{fontSize:"11px",fontWeight:"600"}}),h(Bar,{dataKey:"confirmed",fill:"#059669",name:"Confirmés",radius:[4,4,0,0],barSize:16}),h(Bar,{dataKey:"refused",fill:"#DC2626",name:"Refusés",radius:[4,4,0,0],barSize:16}),h(Bar,{dataKey:"assigned",fill:"#1D4ED8",name:"Affectées",radius:[4,4,0,0],barSize:16})))),
    h("div",{className:"stat-grid-6",style:{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:12}},h(StatCard,{label:"Flotte",value:total,accent:"brand"}),h(StatCard,{label:"Confirmés",value:confirmed,accent:"success"}),h(StatCard,{label:"Sur site",value:surSite,accent:"purple"}),h(StatCard,{label:"Commandes",value:totalOrders,accent:"brand"}),h(StatCard,{label:"Tx Affect.",value:`${assignmentRate}%`,accent:"success"}),h(StatCard,{label:"Tx Util.",value:`${utilRate}%`,accent:"warning"})),
    h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}},
      h("div",{className:"card",style:{padding:24,display:"flex",flexDirection:"column",alignItems:"center"}},h("h4",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)",marginBottom:16,alignSelf:"flex-start"}},"Taux d'Affectation"),h(Circ,{pct:assignmentRate,label:"Affecté",color:assignmentRate>=75?"#059669":assignmentRate>=50?"#D97706":"#DC2626"}),h("p",{style:{fontSize:12,color:"var(--text-tertiary)",marginTop:12,fontWeight:600}},`${assignedOrders} / ${totalOrders}`)),
      h("div",{className:"card",style:{padding:24,display:"flex",flexDirection:"column",alignItems:"center"}},h("h4",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)",marginBottom:16,alignSelf:"flex-start"}},"Taux d'Utilisation"),h(Circ,{pct:utilRate,label:"Utilisé",color:utilRate>=75?"#059669":utilRate>=50?"#D97706":"#DC2626"}),h("p",{style:{fontSize:12,color:"var(--text-tertiary)",marginTop:12,fontWeight:600}},`${usedRes} / ${cRes.length}`)),
      h("div",{className:"card",style:{padding:24}},h("h4",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)",marginBottom:16}},"Confirmation"),h(ResponsiveContainer,{width:"100%",height:160},h(PieChart,null,h(Pie,{data:confStatus.length?confStatus:[{name:"Vide",value:1,color:"#e2e8f0"}],cx:"50%",cy:"50%",innerRadius:50,outerRadius:70,paddingAngle:4,dataKey:"value"},(confStatus.length?confStatus:[{color:"#e2e8f0"}]).map((e,i)=>h(Cell,{key:i,fill:e.color}))),h(RTooltip,{contentStyle:chartStyle}))),h("div",{style:{display:"flex",justifyContent:"center",gap:16,marginTop:8}},confStatus.map(it=>h("div",{key:it.name,style:{display:"flex",alignItems:"center",gap:5}},h("div",{style:{width:8,height:8,borderRadius:"50%",background:it.color}}),h("span",{style:{fontSize:10,fontWeight:600,color:"var(--text-secondary)"}},`${it.name}: ${it.value}`)))))),
    h("div",{style:{display:"grid",gridTemplateColumns:"3fr 2fr",gap:16}},
      h("div",{className:"card",style:{padding:24}},h("h4",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)",marginBottom:16}},"Volume par Agence"),h(ResponsiveContainer,{width:"100%",height:220},h(BarChart,{data:byAgency},h(CartesianGrid,{strokeDasharray:"3 3",vertical:false,stroke:"var(--border)"}),h(XAxis,{dataKey:"name",fontSize:9,tick:{fill:"var(--text-secondary)"},axisLine:false,tickLine:false}),h(YAxis,{fontSize:9,tick:{fill:"var(--text-secondary)"},axisLine:false,tickLine:false}),h(RTooltip,{contentStyle:chartStyle}),h(Bar,{dataKey:"value",fill:"#1D4ED8",radius:[5,5,0,0],barSize:28})))),
      h("div",{className:"card",style:{padding:24}},h("h4",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)",marginBottom:16}},"Motifs de Refus"),refBreak.length>0?h("div",{style:{display:"flex",flexDirection:"column",gap:12}},refBreak.map(it=>h("div",{key:it.name},h("div",{style:{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,marginBottom:4}},h("span",null,it.name),h("span",{style:{color:"var(--danger)"}},it.value)),h("div",{style:{width:"100%",background:"var(--bg-subtle)",borderRadius:4,height:6}},h("div",{style:{background:"var(--danger)",borderRadius:4,height:6,width:`${(it.value/refused)*100}%`,transition:"width .5s ease"}}))))):h("p",{style:{fontSize:12,color:"var(--text-tertiary)",textAlign:"center",padding:"40px 0"}},"Aucun refus"))),
    h("div",{className:"card",style:{padding:24}},h("h4",{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-tertiary)",marginBottom:20}},"Top Destinations"),topDest.length>0?h("div",{style:{display:"flex",flexWrap:"wrap",gap:32,alignItems:"flex-end",justifyContent:"center"}},topDest.map(it=>h("div",{key:it.name,style:{display:"flex",flexDirection:"column",alignItems:"center"}},h("div",{style:{width:48,background:"linear-gradient(180deg,#3B82F6,#1D4ED8)",borderRadius:"8px 8px 0 0",boxShadow:"var(--shadow-sm)",height:`${(it.value/(topDest[0]?.value||1))*120}px`,transition:"height .5s ease"}}),h("span",{className:"font-display",style:{fontSize:14,fontWeight:800,color:"var(--brand)",marginTop:8}},it.value),h("span",{style:{fontSize:10,fontWeight:700,color:"var(--text-secondary)",marginTop:2,textTransform:"uppercase"}},it.name)))):h("p",{style:{fontSize:12,color:"var(--text-tertiary)",textAlign:"center",padding:"40px 0"}},"Aucune destination")))
}

/* ══════════════════════════════════════
   APP
   ══════════════════════════════════════ */
function App(){
  const[currentPage,setCurrentPage]=useState(Page.SUIVI);const[selectedDate,setSelectedDate]=useState(new Date().toISOString().split("T")[0]);const[isSaving,setIsSaving]=useState(false);const[toast,setToast]=useState(null);const[confirmDialog,setConfirmDialog]=useState(null);
  const[state,setState]=useState(()=>{const t=new Date().toISOString().split("T")[0];const r=localStorage.getItem(`${LS_PREFIX}${t}`);return r?JSON.parse(r):{date:t,suivi:[],plan:{orders:[],assignments:{}}}});
  const showToast=useCallback((m,t='success')=>setToast({message:m,type:t}),[]);
  const requestConfirm=useCallback((t,m,fn,d=false)=>setConfirmDialog({title:t,message:m,onConfirm:fn,danger:d}),[]);
  useEffect(()=>{const r=localStorage.getItem(`${LS_PREFIX}${selectedDate}`);setState(r?JSON.parse(r):{date:selectedDate,suivi:[],plan:{orders:[],assignments:{}}})},[selectedDate]);
  useEffect(()=>{if(!state.date||state.date!==selectedDate)return;setIsSaving(true);const tm=setTimeout(()=>{localStorage.setItem(`${LS_PREFIX}${selectedDate}`,JSON.stringify(state));const vk=`${VERSION_PREFIX}${selectedDate}`;const v=JSON.parse(localStorage.getItem(vk)||"[]");v.push({timestamp:Date.now(),data:state});if(v.length>MAX_VERSIONS)v.shift();try{localStorage.setItem(vk,JSON.stringify(v))}catch(e){}setIsSaving(false)},600);return()=>clearTimeout(tm)},[state,selectedDate]);
  useEffect(()=>{const fn=e=>{if(e.ctrlKey||e.metaKey){if(e.key==="1"){e.preventDefault();setCurrentPage(Page.SUIVI)}if(e.key==="2"){e.preventDefault();setCurrentPage(Page.PLANIFICATION)}if(e.key==="3"){e.preventDefault();setCurrentPage(Page.ANALYTIQUE)}}};window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn)},[]);

  /* ─ Compute alerts ─ */
  const alerts=useMemo(()=>{const a=[];
    const pending=state.suivi.filter(r=>r.confirmation==="").length;
    const noWilaya=state.suivi.filter(r=>!r.wilayaDemain&&r.confirmation!=="Non").length;
    const unassigned=state.plan.orders.filter(o=>!(state.plan.assignments[o.id]?.length)).length;
    if(pending>0)a.push({type:"warning",text:`${pending} véhicule(s) en attente de confirmation`,page:"suivi"});
    if(noWilaya>0)a.push({type:"danger",text:`${noWilaya} véhicule(s) sans Wilaya J+1`,page:"suivi"});
    if(unassigned>0)a.push({type:"danger",text:`${unassigned} commande(s) non affectée(s)`,page:"plan"});
    return a},[state]);

  const handleBackup=useCallback(()=>backupToExcel(showToast),[showToast]);
  const handleRestore=useCallback(f=>restoreFromExcel(f,selectedDate,setState,showToast),[selectedDate,showToast]);
  const updateSuivi=useCallback((id,u)=>setState(p=>({...p,suivi:p.suivi.map(r=>r.id===id?{...r,...u}:r)})),[]);
  const addResource=useCallback(()=>setState(p=>({...p,suivi:[{id:crypto.randomUUID(),source:"manual",vehicule:"",agence:"",chauffeur:"",destinationSouhaitee:"",wilayaDemain:"",horaire:"",horaireSouhaitee:"",surSite:false,confirmation:"",causeRefus:"",typeRM:"",cableDeTir:false,confirmationTime:null},...p.suivi]})),[]);
  const deleteResource=useCallback(id=>setState(p=>({...p,suivi:p.suivi.filter(r=>r.id!==id),plan:{...p.plan,assignments:Object.fromEntries(Object.entries(p.plan.assignments).map(([k,v])=>[k,(v||[]).filter(rid=>rid!==id)]))}})),[]);
  const addOrders=useCallback((d,t,c)=>{const o=Array.from({length:c},()=>({id:crypto.randomUUID(),destination:d,type:t,priority:false,originDate:null}));setState(p=>({...p,plan:{...p.plan,orders:[...p.plan.orders,...o]}}))},[]);
  const deleteOrder=useCallback(id=>setState(p=>{const{[id]:_,...rest}=p.plan.assignments;return{...p,plan:{orders:p.plan.orders.filter(o=>o.id!==id),assignments:rest}}}),[]);
  const assignResource=useCallback((oid,rid)=>setState(p=>{const cur=p.plan.assignments[oid]||[];if(cur.length>=1)return p;const tc=Object.values(p.plan.assignments).filter(ids=>(ids||[]).includes(rid)).length;if(tc>=2)return p;return{...p,plan:{...p.plan,assignments:{...p.plan.assignments,[oid]:[rid]}}}}),[]);
  const removeAssignment=useCallback((oid,rid)=>setState(p=>({...p,plan:{...p.plan,assignments:{...p.plan.assignments,[oid]:(p.plan.assignments[oid]||[]).filter(id=>id!==rid)}}})),[]);
  const reschedule=useCallback(()=>{const un=state.plan.orders.filter(o=>!(state.plan.assignments[o.id]?.length));if(!un.length){showToast("Rien à reporter","warning");return}const nd=new Date(selectedDate);nd.setDate(nd.getDate()+1);const nds=nd.toISOString().split("T")[0];requestConfirm("Reporter",`Reporter ${un.length} commande(s) + véhicules non confirmés au ${nds} ?`,()=>{const raw=localStorage.getItem(`${LS_PREFIX}${nds}`);let ns=raw?JSON.parse(raw):{date:nds,suivi:[],plan:{orders:[],assignments:{}}};ns.plan.orders=[...ns.plan.orders,...un.map(o=>({...o,id:crypto.randomUUID(),originDate:o.originDate||selectedDate}))];const pend=state.suivi.filter(r=>r.confirmation!=="Oui");const ex=new Set(ns.suivi.map(r=>(r.vehicule||"").toUpperCase()));const nr=pend.filter(r=>!ex.has((r.vehicule||"").toUpperCase()));ns.suivi=[...ns.suivi,...nr.map(r=>({...r,id:crypto.randomUUID(),confirmation:"",causeRefus:"",confirmationTime:null}))];localStorage.setItem(`${LS_PREFIX}${nds}`,JSON.stringify(ns));setState(p=>({...p,plan:{...p.plan,orders:p.plan.orders.filter(o=>(p.plan.assignments[o.id]?.length||0)>0)}}));showToast(`${un.length} cmd + ${nr.length} véh. reportés`,'success')})},[state,selectedDate,showToast,requestConfirm]);

  return h(React.Fragment,null,
    h(Layout,{currentPage,setCurrentPage,selectedDate,setSelectedDate,isSaving,onBackup:handleBackup,onRestore:handleRestore,showToast,alerts},
      h("div",{style:{flex:1,maxWidth:1800,margin:"0 auto",width:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}},
        currentPage===Page.SUIVI&&h(Suivi,{state,updateSuivi,addResource,deleteResource,clearDay:()=>setState(p=>({...p,suivi:[]})),importData:d=>setState(s=>({...s,suivi:[...s.suivi,...d]})),showToast,requestConfirm}),
        currentPage===Page.PLANIFICATION&&h(Planification,{state,assignResource,removeAssignment,addOrders,deleteOrder,rescheduleUnassignedOrders:reschedule,showToast,requestConfirm}),
        currentPage===Page.ANALYTIQUE&&h(Analytics,{state,selectedDate}))),
    toast&&h(Toast,{message:toast.message,type:toast.type,onClose:()=>setToast(null)}),
    confirmDialog&&h(ConfirmModal,{title:confirmDialog.title,message:confirmDialog.message,danger:confirmDialog.danger,onConfirm:()=>{confirmDialog.onConfirm();setConfirmDialog(null)},onCancel:()=>setConfirmDialog(null)}))
}
const root=document.getElementById("root");if(root)createRoot(root).render(h(React.StrictMode,null,h(App)));
