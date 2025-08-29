const GAS_URL="https://script.google.com/macros/s/AKfycbytPvlFPvOmcaNr0u4LgLqG7VWYOa9oFz6HjV00RaNv1zTMRlzLyuv-X1a5qVH7bqVY0w/exec";

const App={}

App.showOverlay=function(msg){let ov=document.getElementById("syncOverlay");if(!ov){ov=document.createElement("div");ov.id="syncOverlay";ov.innerHTML='<div id="syncBox"><div id="syncText"></div><div id="syncBar"></div></div>';document.body.appendChild(ov);}ov.style.display="flex";document.getElementById("syncText").textContent=msg||"";}
App.hideOverlay=function(){const ov=document.getElementById("syncOverlay");if(ov)ov.style.display="none";}

App.updateIndexCounts=function(){["yamato","ebina","chofu"].forEach(c=>{const s=JSON.parse(localStorage.getItem("junkai_"+c)||'{"items":[],"checked":[],"flags":[]}');const n=s.items.length;let d=0,st=0,sk=0;s.items.forEach((_,i)=>{if(s.checked[i])d++;if(s.flags[i]==="stopped")st++;if(s.flags[i]==="skip")sk++;});const el=document.getElementById(c+"_count");if(el)el.innerHTML=`<span class='badge done'>済 ${d}</span><span class='badge stop'>停 ${st}</span><span class='badge skip'>不 ${sk}</span><span class='badge total'>総 ${n}</span>`;});};

App.initIndex=function(){const btn=document.getElementById("btnSync");if(btn)btn.addEventListener("click",App.doSync);const rc=document.getElementById("btnRecalc");if(rc)rc.addEventListener("click",App.updateIndexCounts);App.updateIndexCounts();}

App.doSync=async function(){App.showOverlay("同期開始…");try{const res=await fetch(GAS_URL+"?action=pull");if(!res.ok)throw new Error(res.statusText);const obj=await res.json();if(!obj.ok||!Array.isArray(obj.data))throw new Error("JSON不正"); // save
    localStorage.setItem("list:yamato",JSON.stringify(obj.data.filter(r=>r.city.includes("大和"))));
    localStorage.setItem("list:ebina",JSON.stringify(obj.data.filter(r=>r.city.includes("海老名"))));
    localStorage.setItem("list:chofu",JSON.stringify(obj.data.filter(r=>r.city.includes("調布"))));
    App.updateIndexCounts();document.getElementById("syncText").textContent="同期完了！";setTimeout(App.hideOverlay,600);}
catch(e){alert("同期に失敗しました："+e.message);App.hideOverlay();}}
