// ====== 設定 ======
const Junkai = (()=>{

  const GAS_URL = "https://script.google.com/macros/s/AKfycbyXbPaarnD7mQa_rqm6mk-Os3XBH6C731aGxk7ecJC5U3XjtwfMkeF429rezkAo79jN/exec";
  const TIRE_APP_URL = "https://rkworks2025-coder.github.io/r.k.w-/";
  const CITIES = ["大和市","海老名市","調布市"];
  const PREFIX = { "大和市":"Y", "海老名市":"E", "調布市":"C" };
  const LS_KEY = (c) => `junkai:city:${c}`;
  const TIMEOUT_MS = 15000;
  const DEBUG_ERRORS = true;

  // ===== utils =====
  const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

  /**
   * Show or hide the progress modal and optionally update its bar width.
   * @param {boolean} on Whether to show the modal.
   * @param {number} pct Percentage (0–100) of the progress bar width.
   */
  function showProgress(on, pct){
    const m = document.getElementById('progressModal');
    const bar = document.getElementById('progressBar');
    if(!m) return;
    if(on) m.classList.add('show'); else m.classList.remove('show');
    if(bar && typeof pct==='number') bar.style.width = Math.max(0,Math.min(100,pct)) + '%';
  }
  /**
   * Update the status text displayed on the index page.
   * @param {string} txt The text to display.
   */
  function status(txt){
    const el = document.getElementById
