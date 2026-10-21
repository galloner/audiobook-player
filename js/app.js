/* 有声书在线播放 v3：居中书架 / 三视图导航 / 艺术标题 / 增强背景 (纯静态) */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    audio: $('audio'),
    bookList: $('bookList'), chapterList: $('chapterList'),
    bookCount: $('bookCount'), chapterCount: $('chapterCount'), sideFoot: $('sideFoot'),
    bookGrid: $('bookGrid'), homeEmpty: $('homeEmpty'),
    chapterTitleArt: $('chapterTitleArt'), progressPct: $('progressPct'),
    ringFill: $('ringFill'),
    progress: $('progress'), bar: $('bar'), knob: $('knob'),
    timeNow: $('timeNow'), timeLeft: $('timeLeft'), timeTotal: $('timeTotal'),
    playBtn: $('playBtn'), prevBtn: $('prevBtn'), nextBtn: $('nextBtn'),
    backBtn: $('backBtn'), fwdBtn: $('fwdBtn'), rateSel: $('rateSel'), volRange: $('volRange'),
    autoNext: $('autoNext'),
    homeView: $('homeView'), playerView: $('playerView'),
    bookView: $('bookView'), chapterView: $('chapterView'),
    sidebar: $('sidebar'), sidebarToggle: $('sidebarToggle'),
    backBtn2: $('backBtn2'), chapterPager: $('chapterPager'),
    pagePrev: $('pagePrev'), pageInfo: $('pageInfo'), pageNext: $('pageNext'),
    bgBtn: $('bgBtn'), subBtn: $('subBtn'), setBtn: $('setBtn'),
    setPanel: $('setPanel'), subPosSel: $('subPosSel'), subFontRange: $('subFontRange'),
    subFontVal: $('subFontVal'), subFontFamilySel: $('subFontFamilySel'), pipChk: $('pipChk'),
    showTitleChk: $('showTitleChk'), showPctChk: $('showPctChk'), showControlsChk: $('showControlsChk'),
    bgmAudio: $('bgmAudio'), bgmChk: $('bgmChk'), bgmTrackSel: $('bgmTrackSel'),
    bgmVolRange: $('bgmVolRange'), bgmVolVal: $('bgmVolVal'),
    bgmTrackRow: $('bgmTrackRow'), bgmVolRow: $('bgmVolRow'),
    subOverlay: $('subOverlay'), subLine: $('subLine'),
    lyricsWrap: $('lyricsWrap'), lyricsList: $('lyricsList'), lyricsEmpty: $('lyricsEmpty'),
    toast: $('toast')
  };

  const LS = window.localStorage;
  const SUB_MODES = ['single', 'expanded', 'hidden'];
  const audio = el.audio;
  const state = {
    manifest: null, books: [],
    bookIdx: -1, bookConfig: null,
    chapIdx: -1, chapterPage: 0, chapterGroupSize: 0,
    cues: [], cueIdx: -1,
    subMode: 'single', subPos: 'bottom', subFont: 18, subFontFamily: '', fontList: [],
    pipOn: false, dragging: false, ready: false,
    showTitle: true, showPct: true, showControls: true,
    bgmList: [], bgmOn: false, bgmIdx: 0, bgmVol: 0.3
  };

  /* ---------- 工具 ---------- */
  const enc = (p) => String(p).split('/').map(encodeURIComponent).join('/');
  function resolveUrl(path) {
    if (!path) return '';
    if (/^(https?:)?\/\//.test(path)) return path;
    const base = state.manifest && state.manifest.baseURL || '';
    return enc((base && !base.endsWith('/') ? base + '/' : base) + path);
  }
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s);
    const m = Math.floor(s / 60), ss = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  };
  const chapters = () => state.bookConfig ? state.bookConfig.chapters : [];
  function chapterKey() {
    if (!state.bookConfig || state.chapIdx < 0) return '';
    const ch = state.bookConfig.chapters[state.chapIdx];
    if (!ch || !ch.id) return '';
    return state.bookConfig.id + '/' + ch.id;
  }
  let toastTimer = 0;
  function toast(html, ms) {
    el.toast.innerHTML = html; el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms || 4200);
  }

  /* ---------- SRT/VTT 解析（供 _verify.mjs） ---------- */
  const TS = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/;
  function parseSubtitle(text) {
    const cues = [];
    const blocks = text.replace(/\r\n?/g, '\n').replace(/^WEBVTT[^\n]*\n/, '').split('\n\n');
    for (const block of blocks) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      const ti = lines.findIndex(l => l.indexOf('-->') >= 0);
      if (ti < 0) continue;
      const [a, b] = lines[ti].split('-->');
      const ma = TS.exec(a), mb = TS.exec(b);
      if (!ma || !mb) continue;
      const ms = (m) => ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000) + +m[4].padEnd(3, '0');
      const txt = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim();
      if (txt) cues.push({ start: ms(ma), end: ms(mb), text: txt });
    }
    return cues;
  }

  /* ---------- 视图切换 ---------- */
  function showHome() {
    el.homeView.style.display = '';
    el.playerView.style.display = 'none';
    document.body.classList.remove('player-active');
    document.body.classList.add('no-sidebar');
    el.sidebarToggle.style.display = 'none';
  }
  function showPlayer() {
    el.homeView.style.display = 'none';
    el.playerView.style.display = '';
    document.body.classList.add('player-active');
    // 目录自动收缩隐藏
    document.body.classList.add('no-sidebar');
    el.sidebarToggle.style.display = '';
    poke();
  }

  /* ---------- 书架（主页居中卡片） ---------- */
  function renderBookGrid() {
    el.bookGrid.innerHTML = '';
    state.books.forEach((b, i) => {
      const card = document.createElement('div');
      card.className = 'book-card';
      card.innerHTML = '<div class="book-card-title"></div><div class="book-card-meta"></div>';
      card.querySelector('.book-card-title').textContent = b.title;
      card.querySelector('.book-card-meta').textContent = b.description || '';
      card.onclick = () => selectBook(i);
      el.bookGrid.appendChild(card);
    });
    el.homeEmpty.style.display = state.books.length ? 'none' : '';
  }

  /* ---------- 侧边栏书目列表 ---------- */
  function renderBooks() {
    el.bookList.innerHTML = '';
    state.books.forEach((b, i) => {
      const li = document.createElement('li');
      li.className = 'book-item' + (i === state.bookIdx ? ' active' : '');
      li.innerHTML = '<span class="t"></span><span class="desc"></span>';
      li.querySelector('.t').textContent = b.title;
      li.querySelector('.desc').textContent = b.description || '';
      li.onclick = () => selectBook(i);
      el.bookList.appendChild(li);
    });
    el.bookCount.textContent = ' / ' + state.books.length;
  }

  /* ---------- 章节列表（分页） ---------- */
  function renderChapters() {
    const chaps = chapters();
    if (!chaps.length) { el.chapterList.innerHTML = ''; el.chapterPager.style.display = 'none'; el.chapterCount.textContent = ''; return; }
    const gs = state.chapterGroupSize > 0 ? state.chapterGroupSize : chaps.length;
    const total = Math.ceil(chaps.length / gs);
    if (state.chapterPage >= total) state.chapterPage = total - 1;
    const start = state.chapterPage * gs, end = Math.min(start + gs, chaps.length);
    el.chapterList.innerHTML = '';
    for (let i = start; i < end; i++) {
      const c = chaps[i];
      const li = document.createElement('li');
      li.innerHTML = '<span class="idx"></span><span class="t"></span><span class="dur"></span>';
      li.querySelector('.idx').textContent = c.id;
      li.querySelector('.t').textContent = c.title;
      li.querySelector('.dur').textContent = (c.audio && c.audio.duration) ? fmt(c.audio.duration) : '';
      li.className = i === state.chapIdx ? 'active' : '';
      li.onclick = () => selectChapter(i);
      el.chapterList.appendChild(li);
    }
    el.chapterCount.textContent = ' / ' + chaps.length;
    el.chapterPager.style.display = total > 1 ? '' : 'none';
    el.pageInfo.textContent = (state.chapterPage + 1) + ' / ' + total;
    el.pagePrev.disabled = state.chapterPage === 0;
    el.pageNext.disabled = state.chapterPage >= total - 1;
  }

  function highlightChapters() {
    [...el.chapterList.children].forEach((li, i) => {
      const realIdx = state.chapterPage * (state.chapterGroupSize || chapters().length) + i;
      li.classList.toggle('active', realIdx === state.chapIdx);
    });
  }

  function setHue(i) {
    const hues = [210, 285, 165, 32, 330, 195, 265];
    const h = hues[i % hues.length];
    document.documentElement.style.setProperty('--hue', String(h));
    if (window.BG) window.BG.setHue(h);
  }

  /* ---------- 选书 ---------- */
  async function selectBook(i) {
    if (i === state.bookIdx && state.bookConfig) {
      // 已加载，直接显示章节列表
      document.body.classList.remove('no-sidebar');
      showChapterView();
      return;
    }
    audio.pause(); audio.removeAttribute('src');
    if (state.chapIdx >= 0) save();         // 切书前保存旧书进度
    state.bookIdx = i; state.chapIdx = -1; state.chapterPage = 0; state.bookConfig = null;
    setHue(i); renderBooks();
    const book = state.books[i];
    // 显示侧边栏
    document.body.classList.remove('no-sidebar');
    showChapterView();
    el.chapterList.innerHTML = '<li class="empty muted">加载中…</li>';
    el.chapterPager.style.display = 'none';
    el.chapterCount.textContent = ' / 加载中…';
    try {
      const res = await fetch(resolveUrl(book.config), { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const cfg = await res.json();
      state.bookConfig = cfg;
      state.chapterGroupSize = cfg.chapterGroupSize || 0;
      el.chapterCount.textContent = ' / ' + (cfg.chapterCount || cfg.chapters.length);
      renderChapters();
    } catch (e) {
      el.chapterList.innerHTML = '<li class="empty muted">加载失败：' + e.message + '</li>';
      toast('加载书籍配置失败：' + e.message);
    }
  }

  function showChapterView() {
    el.bookView.style.display = 'none';
    el.chapterView.style.display = '';
  }
  function showBookView() {
    el.bookView.style.display = '';
    el.chapterView.style.display = 'none';
  }

  function backToBooks() {
    save();                                 // 先保存当前位置再清空状态
    audio.pause(); audio.removeAttribute('src');
    state.bookIdx = -1; state.chapIdx = -1; state.chapterPage = 0; state.bookConfig = null;
    showBookView(); renderBooks();
    document.body.classList.add('no-sidebar');
    showHome();
  }

  /* ---------- 字幕 ---------- */
  function clearLyrics(hint) {
    state.cues = []; state.cueIdx = -1;
    el.subLine.textContent = ''; el.subOverlay.classList.remove('show');
    el.lyricsList.innerHTML = '';
    el.lyricsEmpty.textContent = hint || '本章无字幕';
    el.lyricsEmpty.style.display = '';
    state.ready = false;
    if (state.pipOn) sendPipSubtitle('');
  }

  async function loadSubtitle(chap) {
    const sub = chap.subtitle;
    if (!sub || !sub.json) { clearLyrics('本章没有字幕'); return; }
    try {
      const res = await fetch(resolveUrl(sub.json), { cache: 'no-cache' });
      if (!res.ok) { clearLyrics('字幕未找到 (HTTP ' + res.status + ')，请运行 build_manifest.py'); return; }
      const cues = await res.json();
      if (!cues.length) { clearLyrics('字幕内容为空'); return; }
      state.cues = cues; state.cueIdx = -1;
      renderLyrics();
      if (audio.currentTime > 0) syncSingleLine(audio.currentTime * 1000);
    } catch (e) { clearLyrics('字幕加载失败：' + e.message); }
  }

  /* ---------- 字幕设置 ---------- */
  function applySubSettings() {
    document.documentElement.style.setProperty('--sub-font', state.subFont + 'px');
    el.subFontVal.textContent = state.subFont + 'px';
    document.body.classList.remove('sub-pos-bottom', 'sub-pos-center', 'sub-pos-top');
    document.body.classList.add('sub-pos-' + state.subPos);
    // 显示开关
    document.body.classList.toggle('hide-title', !state.showTitle);
    document.body.classList.toggle('hide-pct', !state.showPct);
    document.body.classList.toggle('hide-controls', !state.showControls);
  }
  function setSubPos(p) { state.subPos = p; LS.setItem('subPos', p); applySubSettings(); }
  function setSubFont(px) { state.subFont = px; LS.setItem('subFont', String(px)); applySubSettings(); syncPipFont(); }

  function setSubFontFamily(family) {
    state.subFontFamily = family;
    LS.setItem('subFontFamily', family);
    applySubFontFamily();
    syncPipFont();
  }
  function applySubFontFamily() {
    const f = state.subFontFamily;
    if (!f) return;
    // FontFace API 加载（确保字体文件就绪后才应用）
    const ff = state.fontList.find(x => x.family === f);
    if (ff) {
      const url = resolveUrl('fonts/' + ff.file);
      const font = new FontFace(f, 'url("' + url + '")');
      font.load().then(() => {
        document.fonts.add(font);
        document.documentElement.style.setProperty('--sub-font-family', '"' + f + '", "PingFang SC", sans-serif');
        syncPipFont();
      }).catch(() => {});
    } else {
      document.documentElement.style.setProperty('--sub-font-family', f);
    }
  }

  async function loadFonts() {
    try {
      const res = await fetch('fonts/fonts.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const list = await res.json();
      state.fontList = Array.isArray(list) ? list : [];
    } catch (e) { state.fontList = []; }
    const sel = el.subFontFamilySel;
    sel.innerHTML = '';
    // 默认选项：系统字体
    const def = document.createElement('option');
    def.value = ''; def.textContent = '系统默认';
    sel.appendChild(def);
    state.fontList.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.family;
      opt.textContent = f.name;
      sel.appendChild(opt);
    });
    sel.value = state.subFontFamily || '';
    if (state.subFontFamily) applySubFontFamily();
  }

  function setSubMode(mode) {
    state.subMode = mode;
    document.body.classList.remove('sub-single', 'sub-expanded', 'sub-hidden');
    document.body.classList.add('sub-' + mode);
    const labels = { single: '单行', expanded: '展开', hidden: '关' };
    const lbl = el.subBtn.querySelector('.lbl');
    if (lbl) lbl.textContent = '字幕：' + labels[mode];
    LS.setItem('subMode', mode);
    if (state.cues.length && audio.currentTime > 0) syncSingleLine(audio.currentTime * 1000);
    if (mode === 'hidden') { el.subLine.textContent = ''; el.subOverlay.classList.remove('show'); }
  }
  function cycleSubMode() {
    setSubMode(SUB_MODES[(SUB_MODES.indexOf(state.subMode) + 1) % SUB_MODES.length]);
  }

  /* ---------- 悬浮字幕弹窗（独立浏览器窗口） ---------- */
  var pipWin = null, pipMsgHandler = null;

  // 弹窗 HTML 模板（通过 document.write 写入独立窗口）
  var PIP_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'html,body{width:100%;height:100%;overflow:hidden}'
    + 'body{display:flex;flex-direction:column;background:rgba(10,12,22,.92)}'
    + '.body{flex:1;overflow-y:auto;display:flex;align-items:center;justify-content:center;padding:14px 18px}'
    + '.sub{color:#fff;text-align:center;text-shadow:0 1px 6px rgba(0,0,0,.8);word-break:break-word;font-size:18px;line-height:1.6;font-family:sans-serif}'
    + '.ctrl{display:flex;align-items:center;justify-content:center;padding:4px 8px 6px;background:rgba(0,0,0,.2);border-top:1px solid rgba(255,255,255,.06);opacity:0;transition:opacity .2s}'
    + 'body:hover .ctrl{opacity:1}'
    + '.ctrl button{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.8);border-radius:6px;width:32px;height:26px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center}'
    + '.ctrl button:hover{background:rgba(255,255,255,.18);color:#fff}'
    + '</style></head><body>'
    + '<div class="body"><div class="sub" id="s"></div></div>'
    + '<div class="ctrl"><button id="pp" title="暂停/播放">⏸</button></div>'
    + '<script>'
    + 'var pp=document.getElementById("pp"),s=document.getElementById("s");'
    + 'pp.onclick=function(){window.opener.postMessage({type:"pip-play-pause"},"*");};'
    + 'window.addEventListener("message",function(e){'
    + 'if(!e.data||e.data.source!=="audiobook")return;'
    + 'if(e.data.type==="sub"){s.textContent=e.data.text||"";}'
    + 'if(e.data.type==="state"){pp.textContent=e.data.paused?"▶":"⏸";}'
    + 'if(e.data.type==="font"){'
    + 's.style.fontSize=e.data.size+"px";'
    + 's.style.fontFamily=e.data.family||"sans-serif";'
    + 'if(e.data.url){'
    + 'var ss=document.getElementById("pipfont");'
    + 'if(!ss){ss=document.createElement("style");ss.id="pipfont";document.head.appendChild(ss);}'
    + 'ss.textContent=\'@font-face{font-family:"\'+e.data.name+\'";src:url("\'+e.data.url+\'");}\';'
    + '}'
    + '}'
    + '});'
    + 'window.addEventListener("load",function(){window.focus();});'
    + '<\/script>'
    + '</body></html>';

  function sendPip(msg) {
    if (pipWin && !pipWin.closed) {
      msg.source = 'audiobook';
      pipWin.postMessage(msg, '*');
    }
  }
  function sendPipSubtitle(text) { sendPip({ type: 'sub', text: text || '' }); }
  function sendPipState() { sendPip({ type: 'state', paused: audio.paused }); }
  function syncPipFont() {
    if (!state.pipOn) return;
    var f = state.subFontFamily;
    var ff = state.fontList.find(function(x) { return x.family === f; });
    var family = 'sans-serif', url = '', name = '';
    if (ff) {
      name = f;
      family = '"' + f + '", sans-serif';
      url = new URL(resolveUrl('fonts/' + ff.file), location.href).href;
    } else if (f) {
      family = '"' + f + '", sans-serif';
    }
    sendPip({ type: 'font', name: name, url: url, size: state.subFont, family: family });
  }
  function startPip() {
    if (state.pipOn) return;
    pipWin = window.open('', '_blank', 'width=420,height=160,left=200,top=200,resizable=yes');
    if (!pipWin) {
      toast('弹窗被浏览器拦截，请在地址栏允许弹窗后重试');
      el.pipChk.checked = false;
      return;
    }
    state.pipOn = true;
    el.pipChk.checked = true;
    pipWin.document.write(PIP_HTML);
    pipWin.document.close();
    pipMsgHandler = function(e) {
      if (!pipWin || e.source !== pipWin) return;
      if (e.data && e.data.type === 'pip-play-pause') {
        audio.paused ? audio.play().catch(function() {}) : audio.pause();
      }
    };
    window.addEventListener('message', pipMsgHandler);
    sendPipState();
    syncPipFont();
    if (state.cues.length && state.cueIdx >= 0) sendPipSubtitle(state.cues[state.cueIdx].text || '');
    (function checkPipClosed() {
      if (state.pipOn && pipWin && pipWin.closed) stopPip();
      else if (state.pipOn) setTimeout(checkPipClosed, 500);
    })();
  }
  function stopPip() {
    state.pipOn = false;
    el.pipChk.checked = false;
    if (pipWin) { try { pipWin.close(); } catch(e) {} pipWin = null; }
    if (pipMsgHandler) { window.removeEventListener('message', pipMsgHandler); pipMsgHandler = null; }
  }
  window.addEventListener('beforeunload', function() {
    if (pipWin) { try { pipWin.close(); } catch(e) {} }
  });

  /* ---------- 背景音乐 ---------- */
  function loadBgmList() {
    const sel = el.bgmTrackSel;
    sel.innerHTML = '';
    if (!state.bgmList.length) {
      el.bgmTrackRow.style.display = 'none';
      el.bgmVolRow.style.display = 'none';
      el.bgmChk.disabled = true;
      el.bgmChk.title = 'manifest.json 中 bgm 数组为空，请将音乐文件放入 bgm/ 目录后运行 build_manifest.py';
      return;
    }
    el.bgmChk.disabled = false;
    state.bgmList.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = p.replace(/^bgm\//, '').replace(/\.[^.]+$/, '');
      sel.appendChild(opt);
    });
    sel.value = String(state.bgmIdx);
    el.bgmTrackRow.style.display = '';
    el.bgmVolRow.style.display = '';
  }
  function setBgmVol(v) {
    state.bgmVol = v;
    el.bgmAudio.volume = v;
    el.bgmVolVal.textContent = Math.round(v * 100) + '%';
    LS.setItem('bgmVol', String(v));
  }
  function playBgm() {
    if (!state.bgmList.length) return;
    const src = resolveUrl(state.bgmList[state.bgmIdx]);
    if (!src) return;
    el.bgmAudio.src = src;
    el.bgmAudio.volume = state.bgmVol;
    el.bgmAudio.play().catch(e => { toast('背景音乐播放失败：' + e.message); });
  }
  function pauseBgm() {
    el.bgmAudio.pause();
    el.bgmAudio.removeAttribute('src');
    el.bgmAudio.load();
  }
  function toggleBgm() {
    state.bgmOn = !state.bgmOn;
    el.bgmChk.checked = state.bgmOn;
    LS.setItem('bgmOn', state.bgmOn ? '1' : '0');
    if (state.bgmOn) {
      el.bgmTrackRow.style.display = '';
      el.bgmVolRow.style.display = '';
      playBgm();
    } else {
      el.bgmTrackRow.style.display = 'none';
      el.bgmVolRow.style.display = 'none';
      pauseBgm();
    }
  }
  el.bgmChk.onchange = toggleBgm;
  el.bgmTrackSel.onchange = () => {
    state.bgmIdx = parseInt(el.bgmTrackSel.value) || 0;
    LS.setItem('bgmIdx', String(state.bgmIdx));
    if (state.bgmOn) playBgm();
  };
  el.bgmVolRange.oninput = () => {
    setBgmVol(parseFloat(el.bgmVolRange.value) / 100);
  };

  /* ---------- 字幕同步 ---------- */
  function findCueIdx(tMs) {
    const cues = state.cues; if (!cues.length) return -1;
    let lo = 0, hi = cues.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tMs < cues[mid].start) hi = mid - 1;
      else if (tMs > cues[mid].end) lo = mid + 1;
      else { idx = mid; break; }
    }
    if (idx < 0) idx = cues[cues.length - 1].end < tMs ? cues.length - 1 : Math.max(0, lo - 1);
    return idx;
  }
  function syncSingleLine(tMs) {
    const idx = findCueIdx(tMs); if (idx < 0) return;
    const text = state.cues[idx].text;
    if (el.subLine.textContent !== text) {
      el.subLine.textContent = text;
      el.subOverlay.classList.add('show');
      if (state.pipOn) sendPipSubtitle(text);
    }
    if (idx !== state.cueIdx) {
      state.cueIdx = idx;
      if (state.subMode === 'expanded') updateExpandedLyrics(idx);
    }
  }

  /* ---------- 展开字幕列表 ---------- */
  function renderLyrics() {
    if (!el.lyricsList) return;
    el.lyricsList.innerHTML = '';
    el.lyricsEmpty.style.display = 'none';
    if (!state.cues.length) { el.lyricsEmpty.style.display = ''; return; }
    const frag = document.createDocumentFragment();
    state.cues.forEach((c, i) => {
      const li = document.createElement('li');
      li.dataset.i = i;
      li.innerHTML = '<span class="idx">' + (i + 1) + '</span><span class="txt"></span>';
      li.querySelector('.txt').textContent = c.text;
      li.onclick = () => { seek(c.start / 1000 + 0.01); syncSingleLine(c.start); };
      frag.appendChild(li);
    });
    el.lyricsList.appendChild(frag);
  }
  function updateExpandedLyrics(idx) {
    if (!el.lyricsList) return;
    const items = el.lyricsList.querySelectorAll('li');
    items.forEach((li, i) => {
      li.classList.toggle('active', i === idx);
      li.classList.toggle('done', i < idx);
    });
    const cur = items[idx];
    if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* ---------- 章节加载 ---------- */
  async function selectChapter(i, opts) {
    const chaps = chapters(); const chap = chaps[i]; if (!chap) return;
    // 切换前先保存当前章节进度（此时 bookConfig/chapIdx 仍指向旧章节）
    if (state.chapIdx >= 0 && state.chapIdx !== i) save();

    state.chapIdx = i;
    highlightChapters();
    el.chapterTitleArt.textContent = chap.title;
    el.progressPct.textContent = '0%';
    clearLyrics('');
    showPlayer();

    const auto = !opts || opts.auto !== false;
    el.audio.src = resolveUrl(chap.audio.src);
    state.ready = true;
    if (auto) { try { await el.audio.play(); } catch (e) {} }
    else { setPlayIcon(false); }
    loadResume();
    loadSubtitle(chap);
    updateMediaSession();
    // 记录当前阅读位置（书籍 + 章节），供下次打开恢复
    save(false);
  }

  /* ---------- 播放控制 ---------- */
  function seek(sec) {
    const d = audio.duration;
    if (!isFinite(d) || d <= 0) return false;
    if (!isSeekable()) { warnNotSeekable(); return false; }
    const target = Math.max(0, Math.min(d - 0.05, sec));
    try { audio.currentTime = target; } catch (e) { return false; }
    return true;
  }
  function togglePlay() {
    if (state.chapIdx < 0) { toast('请先选择章节'); return; }
    if (audio.paused) audio.play().catch(() => toast('浏览器阻止自动播放，请再点一次'));
    else audio.pause();
  }
  function stepChapter(delta) {
    const chaps = chapters(); if (!chaps.length) return;
    const next = state.chapIdx + delta;
    if (next < 0 || next >= chaps.length) { toast(delta > 0 ? '最后一章' : '第一章'); return; }
    const gs = state.chapterGroupSize || chaps.length;
    const newPage = Math.floor(next / gs);
    if (newPage !== state.chapterPage) { state.chapterPage = newPage; renderChapters(); }
    selectChapter(next);
  }

  const RING_CIRC = 339.292; // 2 * π * 54
  function updateTimes() {
    const d = audio.duration || 0, c = audio.currentTime || 0;
    // 拖动中不覆盖进度条视觉与时间文字（由 moveDrag 接管）
    if (!state.dragging) {
      el.timeNow.textContent = fmt(c);
      el.timeLeft.textContent = '-' + fmt(Math.max(0, d - c));
    }
    el.timeTotal.textContent = fmt(d);
    if (state.dragging) return;
    const p = d ? (c / d) * 100 : 0;
    el.bar.style.width = p + '%';
    el.knob.style.left = p + '%';
    // 艺术百分比 + 环形进度条
    el.progressPct.textContent = Math.round(p) + '%';
    el.ringFill.style.strokeDashoffset = RING_CIRC * (1 - p / 100);
  }

  /* ---------- 音频事件 ---------- */
  let lastSaveTs = 0;
  audio.addEventListener('timeupdate', () => {
    updateTimes();
    if (!state.dragging && state.subMode !== 'hidden') syncSingleLine(audio.currentTime * 1000);
    const now = performance.now();
    if (state.chapIdx >= 0 && now - lastSaveTs > 5000) { lastSaveTs = now; save(true); }
  });
  audio.addEventListener('durationchange', updateTimes);
  // src 赋值后浏览器异步重置 playbackRate，必须在 metadata 加载完成后恢复
  audio.addEventListener('loadedmetadata', () => {
    const r = parseFloat(el.rateSel.value) || 1;
    if (audio.playbackRate !== r) audio.playbackRate = r;
  });
  /* ---------- 播放按钮图标 ---------- */
  function setPlayIcon(playing) {
    el.playBtn.classList.toggle('is-playing', !!playing);
    el.playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
  }

  audio.addEventListener('play', () => {
    setPlayIcon(true);
    startAnalyser(); poke();
    if (state.pipOn) sendPipState();
  });
  audio.addEventListener('pause', () => {
    setPlayIcon(false);
    if (state.pipOn) sendPipState();
  });
  audio.addEventListener('error', () => { if (state.chapIdx >= 0) toast('音频加载失败'); });
  audio.addEventListener('ended', () => {
    setPlayIcon(false);
    if (el.autoNext.checked) stepChapter(1);
  });

  /* ---------- 音频分析 → 背景（可选增强，绝不影响声音输出） ----------
     注意：不要用 createMediaElementSource(audio)。
     它会把 <audio> 的输出从扬声器劫持到 WebAudio 图，一旦 AudioContext
     处于 suspended（浏览器自动播放策略），声音会完全消失，而 currentTime
     照常前进 —— 表现为"在播放但没声音"。
     这里改用 captureStream() 旁路取流：<audio> 保持原生输出，
     分析失败最多是背景动画不响应。 */
  let analyser = null, freq = null, ac = null, levelRaf = 0;
  let prevBass = 0;
  let analyserTried = false;

  function startAnalyser() {
    if (analyser) { startLevelLoop(); return; }
    if (analyserTried) return;          // 已尝试过且失败，不再反复重试
    analyserTried = true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      // 旁路捕获音频流（不影响扬声器输出）
      const capture = audio.captureStream || audio.mozCaptureStream;
      if (typeof capture !== 'function') return;

      const stream = capture.call(audio);
      if (!stream || !stream.getAudioTracks || !stream.getAudioTracks().length) return;

      ac = new Ctx();
      const src = ac.createMediaStreamSource(stream);
      analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      // 只接到 analyser，不接 destination —— 不参与声音输出
      src.connect(analyser);
      freq = new Uint8Array(analyser.frequencyBinCount);

      // AudioContext 可能因自动播放策略处于 suspended，异步恢复（只影响分析数据）
      if (ac.state === 'suspended') {
        ac.resume().catch(() => {});
      }
      ac.addEventListener && ac.addEventListener('statechange', () => {
        if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
      });

      startLevelLoop();
    } catch (e) {
      // 分析功能失败不影响播放，静默降级
      analyser = null;
    }
  }
  function startLevelLoop() {
    if (levelRaf) return;
    const tick = () => {
      // 没有分析器时停止循环，避免无意义空转
      if (!analyser) { levelRaf = 0; return; }
      levelRaf = requestAnimationFrame(tick);
      if (!window.BG) return;
      analyser.getByteFrequencyData(freq);
      const n = freq.length;
      let bass = 0, mid = 0, treble = 0;
      const bEnd = Math.floor(n / 8), mEnd = Math.floor(n / 3);
      for (let i = 0; i < bEnd; i++) bass += freq[i];
      for (let i = bEnd; i < mEnd; i++) mid += freq[i];
      for (let i = mEnd; i < n; i++) treble += freq[i];
      bass = Math.min(1, (bass / bEnd) / 130);
      mid = Math.min(1, (mid / (mEnd - bEnd)) / 110);
      treble = Math.min(1, (treble / (n - mEnd)) / 90);
      const level = (bass + mid + treble) / 3;
      // beat 检测
      const beat = bass > 0.55 && bass > prevBass * 1.35;
      prevBass = bass;
      window.BG.setAudioData({ level, bass, mid, treble, beat });
    };
    tick();
  }

  /* ---------- 进度条拖动 ---------- */
  let dragPct = 0;
  let seekWarned = false;

  // 检测当前音频是否可 seek（依赖服务端支持 HTTP Range）
  function isSeekable() {
    try {
      const ranges = audio.seekable;
      return !!(ranges && ranges.length > 0 && ranges.end(ranges.length - 1) > 0);
    } catch (e) { return false; }
  }
  // 一次性提示：服务端不支持 Range 时，seek 会失败
  function warnNotSeekable() {
    if (seekWarned) return;
    seekWarned = true;
    toast('当前服务不支持音频分段加载，进度条无法拖动。<br>'
        + '本地开发请用 <code>python serve.py</code> 启动；'
        + '静态托管（Cloudflare Pages 等）本身支持，请确认已正确部署。', 8000);
  }

  function pctFromEvent(e) {
    const r = el.progress.getBoundingClientRect();
    if (!r.width) return 0;
    const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX
                  : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX
                  : e.clientX;
    const x = clientX - r.left;
    return Math.max(0, Math.min(1, x / r.width));
  }
  function beginDrag(e) {
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    if (!isSeekable()) { warnNotSeekable(); return; }
    state.dragging = true;
    el.progress.classList.add('dragging');
    dragPct = pctFromEvent(e);
    // 拖动期间由拖动逻辑接管进度条视觉，updateTimes 不再覆盖
    el.bar.style.width = (dragPct * 100) + '%';
    el.knob.style.left = (dragPct * 100) + '%';
    if (e.cancelable) e.preventDefault();
  }
  function moveDrag(e) {
    if (!state.dragging) return;
    dragPct = pctFromEvent(e);
    el.bar.style.width = (dragPct * 100) + '%';
    el.knob.style.left = (dragPct * 100) + '%';
    // 拖动时实时预览时间
    const d = audio.duration || 0;
    el.timeNow.textContent = fmt(d * dragPct);
    el.timeLeft.textContent = '-' + fmt(Math.max(0, d - d * dragPct));
    if (e.cancelable) e.preventDefault();
  }
  function endDrag(e) {
    if (!state.dragging) return;
    state.dragging = false;
    el.progress.classList.remove('dragging');
    const d = audio.duration || 0;
    if (d > 0) seek(d * dragPct);
    if (e && e.cancelable) e.preventDefault();
  }

  // Pointer 事件（鼠标 + 触摸 + 触控笔统一）
  el.progress.addEventListener('pointerdown', (e) => {
    beginDrag(e);
    try { el.progress.setPointerCapture(e.pointerId); } catch (_) {}
  });
  el.progress.addEventListener('pointermove', moveDrag);
  el.progress.addEventListener('pointerup', endDrag);
  el.progress.addEventListener('pointercancel', endDrag);
  // 兜底：捕获丢失 / 指针离开窗口
  window.addEventListener('pointerup', (e) => {
    if (state.dragging) endDrag(e);
  });
  el.progress.addEventListener('lostpointercapture', (e) => {
    if (state.dragging) endDrag(e);
  });
  // 键盘可达性
  el.progress.addEventListener('keydown', (e) => {
    if (!isFinite(audio.duration)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); seek(audio.currentTime - 5); }
    if (e.key === 'ArrowRight') { e.preventDefault(); seek(audio.currentTime + 5); }
    if (e.key === 'Home') { e.preventDefault(); seek(0); }
    if (e.key === 'End') { e.preventDefault(); seek(audio.duration - 0.1); }
  });

  /* ---------- 按钮 ---------- */
  el.playBtn.onclick = togglePlay;
  el.prevBtn.onclick = () => stepChapter(-1);
  el.nextBtn.onclick = () => stepChapter(1);
  el.backBtn.onclick = () => seek(audio.currentTime - 10);
  el.fwdBtn.onclick = () => seek(audio.currentTime + 10);
  el.rateSel.onchange = () => { audio.playbackRate = parseFloat(el.rateSel.value) || 1; LS.setItem('rate', el.rateSel.value); };
  el.volRange.oninput = () => { audio.volume = parseFloat(el.volRange.value); LS.setItem('volume', el.volRange.value); };
  el.autoNext.onchange = () => LS.setItem('autoNext', el.autoNext.checked ? '1' : '0');
  el.bgBtn.onclick = () => {
    const m = window.BG.nextMode();
    const lbl = el.bgBtn.querySelector('.lbl');
    if (lbl) lbl.textContent = window.BG.label(m);
  };
  el.subBtn.onclick = cycleSubMode;
  function toggleSetPanel(force) {
    const isHidden = el.setPanel.style.display === 'none';
    const show = typeof force === 'boolean' ? force : isHidden;
    el.setPanel.style.display = show ? '' : 'none';
  }
  el.setBtn.onclick = (e) => {
    e.stopPropagation();          // 阻止冒泡到 document，避免"刚打开就被关掉"
    toggleSetPanel();
  };
  el.subPosSel.onchange = () => setSubPos(el.subPosSel.value);
  el.subFontRange.oninput = () => setSubFont(parseInt(el.subFontRange.value));
  el.subFontFamilySel.onchange = () => setSubFontFamily(el.subFontFamilySel.value);
  el.pipChk.onchange = () => { el.pipChk.checked ? startPip() : stopPip(); };
  el.showTitleChk.onchange = () => { state.showTitle = el.showTitleChk.checked; LS.setItem('showTitle', state.showTitle ? '1' : '0'); applySubSettings(); };
  el.showPctChk.onchange = () => { state.showPct = el.showPctChk.checked; LS.setItem('showPct', state.showPct ? '1' : '0'); applySubSettings(); };
  el.showControlsChk.onchange = () => { state.showControls = el.showControlsChk.checked; LS.setItem('showControls', state.showControls ? '1' : '0'); applySubSettings(); };
  el.sidebarToggle.onclick = () => { document.body.classList.toggle('no-sidebar'); };
  el.backBtn2.onclick = backToBooks;
  el.pagePrev.onclick = () => { if (state.chapterPage > 0) { state.chapterPage--; renderChapters(); } };
  el.pageNext.onclick = () => {
    const gs = state.chapterGroupSize || chapters().length;
    const total = Math.ceil(chapters().length / gs);
    if (state.chapterPage < total - 1) { state.chapterPage++; renderChapters(); }
  };
  // 点击面板外部关闭：用 closest() 判断，兼容 SVG 子元素（点图标时 e.target 是 path/svg）
  document.addEventListener('click', (e) => {
    if (el.setPanel.style.display === 'none') return;
    if (el.setPanel.contains(e.target)) return;
    if (e.target.closest && e.target.closest('#setBtn')) return;
    toggleSetPanel(false);
  });

  /* ---------- 闲置自动隐藏 ---------- */
  let idleTimer = 0;
  function poke() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    if (document.body.classList.contains('player-active') && !audio.paused)
      idleTimer = setTimeout(() => document.body.classList.add('idle'), 3500);
  }
  document.addEventListener('mousemove', poke, { passive: true });
  document.addEventListener('touchstart', poke, { passive: true });

  /* ---------- 进度记忆 ---------- */
  // quick=true  : 只写当前章节播放位置（timeupdate 高频调用）
  // quick=false : 额外写"最后阅读"书籍/章节 id（切章/离开时调用）
  function save(quick) {
    if (state.bookIdx < 0 || state.chapIdx < 0) return;
    const key = chapterKey();
    if (!key) return;                       // 配置未就绪时不写垃圾 key
    const t = audio.currentTime;
    try {
      // 只有播放位置有效（>0）才写，避免新章节 src 刚赋值时的 0 覆盖旧进度
      if (isFinite(t) && t > 0) LS.setItem('pos:' + key, String(Math.floor(t)));
      if (!quick) {
        const book = state.books[state.bookIdx];
        const ch = state.bookConfig.chapters[state.chapIdx];
        if (book && book.id) LS.setItem('lastBook', book.id);
        if (ch && ch.id) LS.setItem('lastChap', ch.id);
      }
    } catch (e) {}
  }

  // 读取某章的已存进度（秒）
  function getSavedPos(bookId, chapId) {
    const v = parseFloat(LS.getItem('pos:' + bookId + '/' + chapId) || '0');
    return isFinite(v) && v > 0 ? v : 0;
  }

  // 恢复当前章节的播放位置
  function loadResume() {
    const key = chapterKey();
    if (!key) return;
    const p = getSavedPos(state.bookConfig.id, state.bookConfig.chapters[state.chapIdx].id);
    if (!(p > 3)) return;                   // 3 秒以内不恢复，避免开头反复跳
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      const d = audio.duration;
      // 距离结尾太近则从头开始
      const target = (isFinite(d) && d > 0 && p > d - 5) ? 0 : p;
      if (!seek(target)) return;
      updateTimes();
      audio.removeEventListener('loadedmetadata', apply);
      audio.removeEventListener('canplay', apply);
    };
    if (audio.readyState >= 1) apply();
    else {
      audio.addEventListener('loadedmetadata', apply);
      audio.addEventListener('canplay', apply);
    }
  }

  addEventListener('beforeunload', () => save());
  // 移动端切后台 / 关闭标签页时也保存
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  addEventListener('pagehide', () => save());

  /* ---------- MediaSession ---------- */
  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !state.bookConfig) return;
    const chap = state.bookConfig.chapters[state.chapIdx]; if (!chap) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({ title: chap.title, artist: state.bookConfig.title, album: '有声书' });
      const H = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      H('play', () => audio.play()); H('pause', () => audio.pause());
      H('previoustrack', () => stepChapter(-1)); H('nexttrack', () => stepChapter(1));
      H('seekbackward', () => seek(audio.currentTime - 10)); H('seekforward', () => seek(audio.currentTime + 10));
    } catch (e) {}
  }

  /* ---------- 快捷键 ---------- */
  function setVol(d) { const v = Math.max(0, Math.min(1, (audio.volume || 0) + d)); audio.volume = v; el.volRange.value = String(v); LS.setItem('volume', String(v)); }
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.matches && e.target.matches('input, select, textarea')) return;
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': seek(audio.currentTime - 5); break;
      case 'ArrowRight': seek(audio.currentTime + 5); break;
      case 'ArrowUp': e.preventDefault(); setVol(0.05); break;
      case 'ArrowDown': e.preventDefault(); setVol(-0.05); break;
      case 'n': case 'N': stepChapter(1); break;
      case 'p': case 'P': stepChapter(-1); break;
      case 'c': case 'C': cycleSubMode(); break;
      case 'l': case 'L': el.sidebarToggle.click(); break;
      case 'b': case 'B': el.bgBtn.click(); break;
      case 'm': case 'M': el.bgmChk.click(); break;
      case 'Escape':
        // 优先关闭设置面板；面板已关时再切换侧边栏
        if (el.setPanel.style.display !== 'none') { toggleSetPanel(false); }
        else if (document.body.classList.contains('player-active')) { document.body.classList.toggle('no-sidebar'); }
        break;
    }
  });

  /* ---------- 偏好恢复 ---------- */
  function restorePrefs() {
    const vol = parseFloat(LS.getItem('volume') || '1');
    audio.volume = isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 1;
    el.volRange.value = String(audio.volume);
    el.rateSel.value = LS.getItem('rate') || '1'; audio.playbackRate = parseFloat(el.rateSel.value) || 1;
    el.autoNext.checked = LS.getItem('autoNext') !== '0';
    const sm = LS.getItem('subMode') || 'single';
    setSubMode(SUB_MODES.includes(sm) ? sm : 'single');
    state.subPos = ['bottom', 'center', 'top'].includes(LS.getItem('subPos')) ? LS.getItem('subPos') : 'bottom';
    el.subPosSel.value = state.subPos;
    state.subFont = isFinite(parseInt(LS.getItem('subFont'))) ? Math.max(14, Math.min(32, parseInt(LS.getItem('subFont')))) : 18;
    el.subFontRange.value = String(state.subFont);
    state.subFontFamily = LS.getItem('subFontFamily') || '';
    el.subFontFamilySel.value = state.subFontFamily;
    state.showTitle = LS.getItem('showTitle') !== '0'; el.showTitleChk.checked = state.showTitle;
    state.showPct = LS.getItem('showPct') !== '0'; el.showPctChk.checked = state.showPct;
    state.showControls = LS.getItem('showControls') !== '0'; el.showControlsChk.checked = state.showControls;
    const bgmVol = parseFloat(LS.getItem('bgmVol'));
    state.bgmVol = isFinite(bgmVol) ? Math.max(0, Math.min(1, bgmVol)) : 0.3;
    el.bgmVolRange.value = String(Math.round(state.bgmVol * 100));
    el.bgmVolVal.textContent = Math.round(state.bgmVol * 100) + '%';
    state.bgmOn = false;  // 浏览器阻止自动播放，需用户手动开启
    el.bgmChk.checked = false;
    state.bgmIdx = isFinite(parseInt(LS.getItem('bgmIdx'))) ? Math.max(0, parseInt(LS.getItem('bgmIdx'))) : 0;
    applySubSettings();
    const bgm = LS.getItem('bgMode'); if (bgm && window.BG) window.BG.setMode(bgm);
    const bgLbl = el.bgBtn.querySelector('.lbl');
    if (bgLbl) bgLbl.textContent = window.BG ? window.BG.label() : '极光';
  }

  /* ---------- 启动 ---------- */
  async function init() {
    restorePrefs();
    let data;
    try {
      const res = await fetch('manifest.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (e) {
      el.homeEmpty.textContent = '无法读取 manifest.json';
      toast('读取 manifest.json 失败：' + e.message + '<br>请运行 python build_manifest.py 并用 http 服务打开', 15000);
      showHome(); return;
    }
    if (!data || !Array.isArray(data.books) || !data.books.length) {
      el.homeEmpty.textContent = '书架是空的，请运行 python build_manifest.py';
      showHome(); return;
    }
    state.manifest = data;
    state.books = data.books;
    state.bgmList = Array.isArray(data.bgm) ? data.bgm : [];
    el.sideFoot.textContent = data.bookCount + ' 本书';
    loadBgmList();
    loadFonts();
    renderBooks();
    renderBookGrid();
    showHome();
    // 恢复上次阅读位置（书 + 章），失败则停留在书架
    await restoreLastReading();
  }

  /* ---------- 恢复上次阅读 ---------- */
  async function restoreLastReading() {
    const lastBookId = LS.getItem('lastBook');
    const lastChapId = LS.getItem('lastChap');
    if (!lastBookId) return false;
    const bi = state.books.findIndex((b) => b.id === lastBookId);
    if (bi < 0) { LS.removeItem('lastBook'); LS.removeItem('lastChap'); return false; }

    await selectBook(bi);
    if (!state.bookConfig) return false;
    const ci = state.bookConfig.chapters.findIndex((c) => c.id === lastChapId);
    if (ci < 0) return false;

    // 定位到该章所在分页
    const gs = state.chapterGroupSize || state.bookConfig.chapters.length;
    const page = Math.floor(ci / gs);
    if (page !== state.chapterPage) { state.chapterPage = page; renderChapters(); }

    // 不自动播放（浏览器策略），用户点一下即从上次位置继续
    await selectChapter(ci, { auto: false });

    // 章节列表滚动到当前章
    const activeLi = el.chapterList.querySelector('li.active');
    if (activeLi) activeLi.scrollIntoView({ block: 'center' });

    if (state.chapIdx >= 0) {
      const key = chapterKey();
      const pos = key ? parseFloat(LS.getItem('pos:' + key) || '0') : 0;
      if (pos > 3) toast('已恢复到上次位置 ' + fmt(pos), 2600);
    }
    return true;
  }

  init();
})();
