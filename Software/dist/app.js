import { WAVELENGTHS as DEFAULT_WAVELENGTHS, DEFAULT_CATALOG, CHARACTERS, MAX_ACTIVE, LINK_TTL, REPORT_TTL, emptyReports, effectiveStatus, normalizeWavelength, validCatalog, canReportOn, themeForWavelength, validCharacterAssignments } from './model.js';

const $ = id => document.getElementById(id);
const networkMode = !!document.querySelector('meta[name="weld-network"]');
const desktopApp = !!(window.weldNative || window.weldDesktop);
const previewMode = !!window.weldPreview && !networkMode;
const requiresPi = desktopApp && !networkMode && !previewMode;
const catalogStorageKey = 'weld-lab-wavelengths', charactersStorageKey = 'weld-lab-characters';
const themeStorageKey = 'weld-lab-star-wars-mode', spaceStorageKey = 'weld-lab-space-background';
let wavelengths = [...DEFAULT_CATALOG], characterAssignments = {}, starWarsEnabled = true, spaceEnabled = false;
try {
  const catalog = JSON.parse(localStorage.getItem(catalogStorageKey));
  if (validCatalog(catalog)) wavelengths = catalog;
  const choices = JSON.parse(localStorage.getItem(charactersStorageKey));
  if (validCharacterAssignments(choices)) characterAssignments = choices;
  starWarsEnabled = localStorage.getItem(themeStorageKey) !== 'off';
  spaceEnabled = localStorage.getItem(spaceStorageKey) === 'on';
  if (!networkMode && !desktopApp && localStorage.getItem('weld-lab-character-picker-v1') !== 'ready') {
    for (const nm of DEFAULT_CATALOG) if (!wavelengths.includes(nm)) wavelengths.push(nm);
    localStorage.setItem(catalogStorageKey, JSON.stringify(wavelengths));
    localStorage.setItem('weld-lab-character-picker-v1', 'ready');
  }
} catch {}
if (validCatalog(window.weldDesktop?.wavelengths)) wavelengths = window.weldDesktop.wavelengths;
if (validCharacterAssignments(window.weldDesktop?.characters)) characterAssignments = window.weldDesktop.characters;
if (typeof window.weldDesktop?.starWarsEnabled === 'boolean') starWarsEnabled = window.weldDesktop.starWarsEnabled;
if (typeof window.weldDesktop?.spaceEnabled === 'boolean') spaceEnabled = window.weldDesktop.spaceEnabled;
const characterImages = { green: 'assets/luke-skywalker.png', infrared: 'assets/darth-vader.png', palpatine: 'assets/emperor-palpatine.png', chewbacca: 'assets/chewbacca.png' };
const sourceId = crypto.randomUUID?.() ?? String(Math.random());
let channel = null;
try { if (!networkMode && !requiresPi && !previewMode && 'BroadcastChannel' in window) channel = new BroadcastChannel('weld-lab-laser-reports-v2'); } catch {}
let reports = emptyReports(wavelengths), lastRender = '', toastTimeout, wakeLock = null;
if (previewMode) {
  for (const nm of wavelengths) reports[nm] = {state:'off', reportedAt:Date.now()};
  const banner = document.createElement('div');
  banner.textContent = 'Preview · sample reports · Settings to change the display';
  banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10;padding:8px 16px;border-radius:16px;background:#ffffffed;color:#222;font:13px system-ui;text-align:center;max-width:85vw;pointer-events:none';
  document.body.appendChild(banner);
}
let networkUpdatedAt = 0, serverInstance = '', serverRevision = -1, networkError = '';
const nativeMessage = value => window.webkit?.messageHandlers?.weldApp?.postMessage(value);
const networkFresh = () => networkUpdatedAt && Date.now() - networkUpdatedAt <= LINK_TTL;
const statesNow = () => networkMode && !networkFresh() ? wavelengths.map(() => 'unknown') : wavelengths.map(nm => effectiveStatus(reports[nm], 'manual', 0));
const canEdit = () => !requiresPi && (!networkMode || !!networkFresh());
const send = value => channel?.postMessage({ ...value, sender: sourceId });
const broadcast = () => send({ type: 'snapshot', wavelengths, reports });
function showToast(message) {
  clearTimeout(toastTimeout); $('toast').textContent = message; $('toast').hidden = false;
  toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 3500);
}
function setText(id, value) { if ($(id) && $(id).textContent !== value) $(id).textContent = value; }
function showError(error) { setText('controls-message', error.message); showToast(error.message); render(); }

// Decorative only: capped resolution and 30 fps, with no work when hidden or off.
function createSpaceBackground(canvas) {
  const context = canvas.getContext('2d', { alpha: false });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = false, width = 0, height = 0, focal = 1, stars = [];
  let frame = null, lastFrame = null, travelTime = 0;
  function resetStar(star, initial = false) {
    star.x = (Math.random() - .5) * width / focal * 1.15;
    star.y = (Math.random() - .5) * height / focal * 1.15;
    star.z = initial ? .12 + Math.random() * .88 : 1;
    return star;
  }
  function resize() {
    width = Math.max(1, innerWidth); height = Math.max(1, innerHeight); focal = Math.min(width, height) * .65;
    const scale = Math.min(devicePixelRatio || 1, 1.5, 1600 / width, 1000 / height);
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    context?.setTransform(scale, 0, 0, scale, 0, 0);
    stars = Array.from({ length: Math.min(360, Math.max(180, Math.round(width * height / 3500))) }, () => resetStar({}, true));
    if (enabled) draw(0);
  }
  function draw(delta) {
    if (!context) return;
    context.fillStyle = '#000'; context.fillRect(0, 0, width, height);
    travelTime += delta;
    const speed = .28 * Math.min(1, .25 + travelTime / 1.2);
    context.lineCap = 'round';
    for (const star of stars) {
      star.z -= delta * speed;
      if (star.z < .045) resetStar(star);
      let x = width / 2 + star.x * focal / star.z;
      let y = height / 2 + star.y * focal / star.z;
      if (x < -20 || x > width + 20 || y < -20 || y > height + 20) {
        resetStar(star); x = width / 2 + star.x * focal; y = height / 2 + star.y * focal;
      }
      const proximity = 1 - star.z;
      context.globalAlpha = .24 + proximity * .76;
      context.fillStyle = '#fff'; context.strokeStyle = '#fff';
      if (reducedMotion.matches) {
        context.beginPath(); context.arc(x, y, .55 + proximity, 0, Math.PI * 2); context.fill();
      } else {
        const trailDepth = star.z + speed * .11;
        const dx = star.x * focal * (1 / trailDepth - 1 / star.z);
        const dy = star.y * focal * (1 / trailDepth - 1 / star.z);
        const limit = Math.min(1, 90 / (Math.hypot(dx, dy) || 1));
        context.lineWidth = .6 + proximity * 1.25;
        context.beginPath(); context.moveTo(x + dx * limit, y + dy * limit); context.lineTo(x, y); context.stroke();
      }
    }
    context.globalAlpha = 1;
  }
  function animate(now) {
    frame = null;
    if (!enabled || document.hidden || reducedMotion.matches || !context) return;
    if (lastFrame === null || now - lastFrame >= 1000 / 30) {
      const delta = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, .08);
      lastFrame = now; draw(delta);
    }
    frame = requestAnimationFrame(animate);
  }
  function refresh() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null; lastFrame = null;
    if (!enabled) return;
    if (!width) resize();
    draw(0);
    if (!document.hidden && !reducedMotion.matches && context) frame = requestAnimationFrame(animate);
  }
  window.addEventListener('resize', () => { if (enabled) resize(); else width = 0; });
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  reducedMotion.addEventListener('change', refresh);
  return value => { enabled = value; travelTime = 0; canvas.hidden = !value; refresh(); };
}
const updateSpaceBackground = createSpaceBackground($('space-background'));
function setStarWarsMode(enabled, persist = true) {
  if (persist && networkMode) { networkCommand('/api/preferences', { starWarsEnabled: !!enabled }).catch(showError); return; }
  starWarsEnabled = !!enabled;
  document.body.classList.toggle('star-wars-off', !starWarsEnabled);
  $('star-wars-toggle').setAttribute('aria-checked', String(starWarsEnabled));
  $('settings-star-wars').setAttribute('aria-checked', String(starWarsEnabled));
  if (persist) {
    try { localStorage.setItem(themeStorageKey, starWarsEnabled ? 'on' : 'off'); } catch {}
    nativeMessage({ action: 'starWars', enabled: starWarsEnabled });
  }
}
function setSpaceBackground(enabled, persist = true) {
  if (persist && networkMode) { networkCommand('/api/preferences', { spaceEnabled: !!enabled }).catch(showError); return; }
  spaceEnabled = !!enabled;
  document.body.classList.toggle('space-on', spaceEnabled);
  $('settings-space').setAttribute('aria-checked', String(spaceEnabled));
  document.querySelector('meta[name="theme-color"]').content = spaceEnabled ? '#000000' : '#e7eaf1';
  updateSpaceBackground(spaceEnabled);
  if (desktopApp) nativeMessage({ action: 'spaceAppearance', enabled: spaceEnabled });
  if (persist) {
    try { localStorage.setItem(spaceStorageKey, spaceEnabled ? 'on' : 'off'); } catch {}
    nativeMessage({ action: 'spaceBackground', enabled: spaceEnabled });
  }
}
function setCharacterAssignments(values, persist = true) {
  if (!validCharacterAssignments(values)) return;
  characterAssignments = { ...values };
  if (persist) {
    try { localStorage.setItem(charactersStorageKey, JSON.stringify(characterAssignments)); } catch {}
    nativeMessage({ action: 'characters', values: characterAssignments });
  }
  render();
}
function persistCatalog() {
  try { localStorage.setItem(catalogStorageKey, JSON.stringify(wavelengths)); } catch {}
  nativeMessage({ action: 'wavelengths', values: wavelengths });
}

function render() {
  const states = statesNow(), on = wavelengths.filter((nm,i) => states[i] === 'on'), unknown = wavelengths.filter((nm,i) => states[i] === 'unknown');
  $('empty-screen').hidden = on.length !== 0 || unknown.length !== 0;
  $('unknown-screen').hidden = on.length !== 0 || unknown.length === 0;
  setText('unknown-screen', requiresPi ? 'Connect your display computer.' : 'AWAITING REPORTS');
  $('unknown-detail').hidden = on.length === 0 || unknown.length === 0;
  setText('unknown-detail', unknown.map(nm => `${nm} nm`).join(' · ') + ' · status unknown');
  $('laser-grid').hidden = on.length === 0;
  $('laser-grid').classList.toggle('single', on.length === 1);
  $('laser-grid').classList.toggle('multi', on.length > 2);
  document.querySelector('.display-surface').classList.toggle('multi-active', on.length > 2);
  setText('active-limit-count', `${on.length} / ${MAX_ACTIVE} lasers on`);
  const signature = JSON.stringify([states,wavelengths,characterAssignments]);
  if (signature !== lastRender) {
    lastRender = signature;
    $('laser-grid').innerHTML = on.map(nm => {
      const theme = themeForWavelength(nm,wavelengths,characterAssignments), image = characterImages[theme];
      return `<article class="laser-blob ${theme} ${String(nm).length > 6 ? 'very-long-wavelength' : String(nm).length > 4 ? 'long-wavelength' : ''}" aria-label="${nm} nanometers on">${image ? `<div class="character-art" aria-hidden="true"><img src="${image}" alt="" decoding="async"></div>` : ''}<div class="glass-reflection" aria-hidden="true"></div><div class="blob-content"><div class="wavelength"><strong>${nm}</strong><span>nm</span></div><div class="on-label">ON</div></div></article>`;
    }).join('');
  }
  wavelengths.forEach((nm,i) => {
    setText(`control-status-${nm}`, states[i] === 'unknown' ? 'Status unknown' : `Reported ${states[i].toUpperCase()}`);
    const select = $(`character-${nm}`);
    if (select) { select.value = themeForWavelength(nm,wavelengths,characterAssignments); select.disabled = !canEdit(); }
    document.querySelectorAll(`[data-nm="${nm}"][data-state]`).forEach(button => {
      button.disabled = !canEdit() || button.dataset.state === 'on' && !canReportOn(nm,reports,'manual',0,wavelengths);
      button.classList.toggle('selected', button.dataset.state === states[i]);
      button.setAttribute('aria-pressed', String(button.dataset.state === states[i]));
    });
  });
  document.querySelectorAll('[data-remove]').forEach(button => { button.disabled = !canEdit() || reports[Number(button.dataset.remove)]?.state === 'on'; });
  $('add-wavelength').disabled = !canEdit(); $('reset-reports').disabled = !canEdit();
  $('star-wars-toggle').disabled = networkMode && !networkFresh();
  $('settings-star-wars').disabled = networkMode && !networkFresh();
  $('settings-space').disabled = networkMode && !networkFresh();
  setText('connection-status', requiresPi ? 'Connect this Mac to the display computer that drives your monitor.' : networkMode ? networkFresh() ? 'Connected · changes are shared with the monitor.' : networkError || 'Connecting to the display computer…' : previewMode ? 'Preview on this Mac. These sample reports are separate from the lab display. Enter the Windows PC address above to connect.' : 'This window only. Use the display computer address for shared PC controls.');
}
function renderReportControls() {
  $('report-controls').innerHTML = wavelengths.map(nm => {
    const theme = themeForWavelength(nm,wavelengths,characterAssignments);
    const options = (Object.hasOwn(CHARACTERS,theme) ? '' : '<option value="custom-channel">None</option>') + Object.entries(CHARACTERS).map(([value,label]) => `<option value="${value}"${value === theme ? ' selected' : ''}>${label}</option>`).join('');
    return `<div class="report-control"><div class="laser-identity"><strong>${nm} nm</strong><p id="control-status-${nm}">Status unknown</p><select class="character-select" id="character-${nm}" data-character="${nm}" aria-label="Character for ${nm} nanometers">${options}</select></div><div class="report-buttons"><button data-nm="${nm}" data-state="on" aria-label="Report ${nm} nanometers on">ON</button><button data-nm="${nm}" data-state="off" aria-label="Report ${nm} nanometers off">OFF</button>${DEFAULT_WAVELENGTHS.includes(nm) ? '<span class="remove-placeholder" aria-hidden="true"></span>' : `<button class="remove-wavelength" data-remove="${nm}" aria-label="Remove ${nm} nanometers" title="Turn this laser off before removing">×</button>`}</div></div>`;
  }).join('');
}
function applyServerState(data) {
  if (!data || data.v !== 1 || typeof data.instance !== 'string' || !Number.isSafeInteger(data.revision) || !validCatalog(data.wavelengths) || typeof data.starWarsEnabled !== 'boolean' || typeof data.spaceEnabled !== 'boolean' || !data.reports || !data.characters) throw new Error('The display computer sent an invalid status.');
  const choices = Object.fromEntries(Object.entries(data.characters).map(([nm,value]) => [Number(nm),value]));
  const incoming = Object.fromEntries(Object.entries(data.reports).map(([nm,value]) => [Number(nm),value]));
  if (!validCharacterAssignments(choices) || !data.wavelengths.every(nm => incoming[nm] && ['on','off','unknown'].includes(incoming[nm].state) && Number.isFinite(incoming[nm].ageMs) && incoming[nm].ageMs >= 0)) throw new Error('The display computer sent an invalid status.');
  if (data.instance === serverInstance && data.revision < serverRevision) return;
  const changed = JSON.stringify(wavelengths) !== JSON.stringify(data.wavelengths), now = Date.now();
  serverInstance = data.instance; serverRevision = data.revision; networkUpdatedAt = now; networkError = '';
  wavelengths = data.wavelengths; characterAssignments = choices;
  reports = Object.fromEntries(wavelengths.map(nm => [nm,{state:incoming[nm].state,reportedAt:now-incoming[nm].ageMs}]));
  if (starWarsEnabled !== data.starWarsEnabled) setStarWarsMode(data.starWarsEnabled,false);
  if (spaceEnabled !== data.spaceEnabled) setSpaceBackground(data.spaceEnabled,false);
  if (changed) renderReportControls();
  render();
}
async function apiRequest(path, data) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),2500);
  try {
    const response = await fetch(path,{method:data ? 'POST' : 'GET',cache:'no-store',signal:controller.signal,...(data ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The display computer could not accept that change.');
    return result;
  } finally { clearTimeout(timeout); }
}
async function networkCommand(path,data) {
  try { const result = await apiRequest(path,data); applyServerState(result); setText('controls-message',''); }
  catch (error) { if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Could not reach the display computer. Check the lab network.'); throw error; }
}
async function pollServer() {
  try { applyServerState(await apiRequest('/api/state')); }
  catch { networkError = 'Connection lost · laser status is unknown.'; render(); }
  finally { setTimeout(pollServer,1000); }
}
async function requestReport(nm,state) {
  try {
    if (!canEdit()) throw new Error('Connect to the display computer before reporting.');
    if (!wavelengths.includes(nm)) throw new Error('Add that wavelength in Settings first.');
    if (state === 'on' && !canReportOn(nm,reports,'manual',0,wavelengths)) throw new Error('Maximum four lasers on. Turn one off before switching another on.');
    if (networkMode) await networkCommand('/api/report',{nm,state});
    else { reports[nm] = {state,reportedAt:Date.now()}; render(); broadcast(); }
    showToast(`${nm} nm ${state.toUpperCase()}`);
  } catch (error) { showError(error); }
}

$('star-wars-toggle').addEventListener('click',() => setStarWarsMode(!starWarsEnabled));
$('settings-star-wars').addEventListener('click',() => setStarWarsMode(!starWarsEnabled));
$('settings-space').addEventListener('click',() => setSpaceBackground(!spaceEnabled));
$('open-settings').addEventListener('click',() => $('settings-dialog').showModal());
$('pi-connection').hidden = !desktopApp;
$('pi-address').value = networkMode ? location.origin : window.weldNative?.piAddress || window.weldDesktop?.piAddress || '';
$('connect-pi').addEventListener('click',() => nativeMessage({action:'connectPi',address:$('pi-address').value.trim()}));
$('pi-address').addEventListener('keydown',event => { if (event.key === 'Enter') { event.preventDefault(); $('connect-pi').click(); } });
window.addEventListener('storage',event => {
  if (networkMode) return;
  if (event.key === themeStorageKey) setStarWarsMode(event.newValue !== 'off',false);
  if (event.key === spaceStorageKey) setSpaceBackground(event.newValue === 'on',false);
  if (event.key === charactersStorageKey) { try { setCharacterAssignments(JSON.parse(event.newValue) ?? {},false); } catch {} }
});
window.addEventListener('weld-star-wars-mode',event => { if (!networkMode) setStarWarsMode(event.detail,false); });
window.addEventListener('weld-space-background',event => { if (!networkMode) setSpaceBackground(event.detail,false); });
window.addEventListener('weld-characters',event => { if (!networkMode) setCharacterAssignments(event.detail,false); });
$('report-controls').addEventListener('change',event => {
  const select = event.target.closest('select[data-character]');
  if (!select || !Object.hasOwn(CHARACTERS,select.value)) return;
  if (networkMode) networkCommand('/api/character',{nm:Number(select.dataset.character),character:select.value}).catch(showError);
  else setCharacterAssignments({...characterAssignments,[select.dataset.character]:select.value});
});
$('report-controls').addEventListener('click',async event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.nm) { requestReport(Number(button.dataset.nm),button.dataset.state); return; }
  if (button.dataset.remove) {
    const nm = Number(button.dataset.remove);
    try {
      if (networkMode) await networkCommand('/api/wavelengths',{action:'remove',nm});
      else {
        if (reports[nm]?.state === 'on' || DEFAULT_WAVELENGTHS.includes(nm)) return;
        wavelengths = wavelengths.filter(value => value !== nm); delete reports[nm];
        const choices = {...characterAssignments}; delete choices[nm]; setCharacterAssignments(choices);
        persistCatalog(); renderReportControls(); render(); broadcast();
      }
    } catch (error) { showError(error); }
  }
});
$('add-wavelength-form').addEventListener('submit',async event => {
  event.preventDefault();
  try {
    const nm = normalizeWavelength($('new-wavelength').value);
    if (networkMode) await networkCommand('/api/wavelengths',{action:'add',nm});
    else {
      if (wavelengths.includes(nm)) throw new Error('That wavelength is already in your list.');
      wavelengths.push(nm); reports[nm] = {state:'unknown',reportedAt:0};
      persistCatalog(); renderReportControls(); render(); broadcast();
    }
    $('new-wavelength').value = ''; setText('controls-message',`${nm} nm added.`);
  } catch (error) { showError(error); }
});
$('reset-reports').addEventListener('click',async () => {
  try {
    if (networkMode) await networkCommand('/api/reset',{});
    else { reports = emptyReports(wavelengths); render(); broadcast(); }
  } catch (error) { showError(error); }
});
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click',() => button.closest('dialog').close()));
$('settings-dialog').addEventListener('click',event => {
  if (event.target === $('settings-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); }
});
$('open-display').addEventListener('click',() => {
  if (desktopApp) { nativeMessage({action:'monitorWindow'}); return; }
  const target = new URL(location.href); target.searchParams.delete('control'); target.searchParams.set('display','1');
  if (!window.open(target,'_blank')) showToast('Allow pop-ups to open the monitor view.');
});
$('fullscreen').addEventListener('click',async () => {
  $('settings-dialog').close();
  if (desktopApp) { nativeMessage({action:'fullscreen'}); return; }
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); await requestWakeLock(); }
  catch { showToast('Use your browser’s full-screen option.'); }
});
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || document.hidden) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
channel?.addEventListener('message',({data}) => {
  if (!data || data.sender === sourceId) return;
  if (data.type === 'hello') { broadcast(); return; }
  if (data.type === 'snapshot' && validCatalog(data.wavelengths) && data.reports && data.wavelengths.every(nm => data.reports[nm] && ['on','off','unknown'].includes(data.reports[nm].state) && Number.isFinite(data.reports[nm].reportedAt)) && data.wavelengths.filter(nm => effectiveStatus(data.reports[nm],'manual',0) === 'on').length <= MAX_ACTIVE) {
    wavelengths = data.wavelengths; reports = data.reports; persistCatalog(); renderReportControls(); render();
  }
});
let keyboardBuffer = '', lastKeyAt = 0;
document.addEventListener('keydown',event => {
  if (document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey || event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const now = Date.now();
  if (/^[0-9.]$/.test(event.key)) { if (now-lastKeyAt > 2000) keyboardBuffer = ''; keyboardBuffer = (keyboardBuffer+event.key).slice(-24); lastKeyAt = now; }
  else if (event.key === 'Enter') { const nm = Number(keyboardBuffer); keyboardBuffer = ''; if (now-lastKeyAt <= 2000 && wavelengths.includes(nm)) { event.preventDefault(); requestReport(nm,statesNow()[wavelengths.indexOf(nm)] === 'on' ? 'off' : 'on'); } }
  else keyboardBuffer = '';
});
document.addEventListener('visibilitychange',() => { render(); if (!document.hidden && new URLSearchParams(location.search).has('display')) requestWakeLock(); });
setStarWarsMode(starWarsEnabled,false); setSpaceBackground(spaceEnabled,false); renderReportControls(); render();
if (networkMode) pollServer(); else send({type:'hello'});
if (new URLSearchParams(location.search).has('display')) requestWakeLock();
if (new URLSearchParams(location.search).has('control')) $('settings-dialog').showModal();
setInterval(render,1000);
