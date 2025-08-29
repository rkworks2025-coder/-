const GAS_URL="https://script.google.com/macros/s/AKfycby9NsfFHpjMI2GGQA2Jw8DcFuRs9aU74cuNWWvRWWe9SiWivhm6PtFmw5nCdsgxpTvLFw/exec";
const App={};
App.syncAll=()=>{alert("同期処理 202508292301")};
App.renderArea=(c)=>{document.getElementById("list").innerHTML="<div>"+c+"リスト</div>";};
App.initIndex=()=>{document.getElementById("btnSync").onclick=App.syncAll;};