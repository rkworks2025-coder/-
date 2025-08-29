const GAS_URL="https://script.google.com/macros/s/AKfycby9NsfFHpjMI2GGQA2Jw8DcFuRs9aU74cuNWWvRWWe9SiWivhm6PtFmw5nCdsgxpTvLFw/exec";
const App={};
App.initIndex=()=>{document.getElementById("btnSync").onclick=()=>alert("同期処理実行");};
App.renderArea=(c)=>{document.getElementById("list").innerHTML="<div>["+c+"] データ</div>";};