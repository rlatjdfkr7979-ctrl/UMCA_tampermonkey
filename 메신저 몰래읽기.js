(() => {
  if (window.__keepUnread) return console.log('이미 설치됨');
  const W = window;
  const SEQ_RE = /\/channel\/(\d+)\/member\/seq/;
  const state = { on: true, blocked: 0, pending: new Map() };

  const record = (url, body) => {
    const m = url.match(SEQ_RE); if (!m) return;
    let seq = null; try { seq = JSON.parse(body).readSeq; } catch (e) {}
    state.blocked++;
    if (seq != null) state.pending.set(m[1], Math.max(seq, state.pending.get(m[1]) || 0));
    render();
  };
  const fake = (url, body) => {
    const m = url.match(SEQ_RE); let seq = 0;
    try { seq = JSON.parse(body).readSeq; } catch (e) {}
    return JSON.stringify({ header:{resultCode:0,resultMessage:'',isSuccessful:true},
      result:{content:{channelId:m?m[1]:'',readSeq:seq,unreadCount:0,mentionCount:0}} });
  };
  const should = (m, u) => state.on && (m||'').toUpperCase()==='PUT' && SEQ_RE.test(u||'');

  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = String(u||''); return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    if (should(this.__m, this.__u)) {
      record(this.__u, body);
      const text = fake(this.__u, body), x = this;
      const def = (k, v) => Object.defineProperty(x, k, { configurable:true, value:v });
      setTimeout(() => {
        def('readyState',4); def('status',200); def('statusText','OK');
        def('responseText',text); def('response', x.responseType==='json'?JSON.parse(text):text);
        x.dispatchEvent(new Event('readystatechange'));
        x.dispatchEvent(new ProgressEvent('load')); x.dispatchEvent(new ProgressEvent('loadend'));
        if (typeof x.onreadystatechange==='function') x.onreadystatechange();
        if (typeof x.onload==='function') x.onload();
      }, 0);
      return;
    }
    return XS.apply(this, arguments);
  };

  const OF = W.fetch;
  W.fetch = function (input, init) {
    const url = typeof input==='string' ? input : (input&&input.url)||'';
    const method = (init&&init.method)||(input&&input.method)||'GET';
    if (should(method, url)) {
      record(url, init&&init.body);
      return Promise.resolve(new Response(fake(url, init&&init.body), {status:200, headers:{'Content-Type':'application/json'}}));
    }
    return OF.apply(this, arguments);
  };

  async function flush() {
    for (const [cid, seq] of [...state.pending]) {
      await OF.call(W, `/messenger/v1/api/channel/${cid}/member/seq`, {
        method:'PUT', credentials:'include',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({readSeq:seq}) });
    }
    state.pending.clear(); state.blocked = 0; render();
  }

  // 작은 상태 표시 버튼
  const btn = document.createElement('div');
  btn.style.cssText = 'position:fixed;right:70px;bottom:20px;z-index:2147483647;padding:7px 12px;border-radius:16px;font:600 12px/1 sans-serif;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)';
  document.body.appendChild(btn);
  function render() {
    btn.style.background = state.on ? '#f59e0b' : '#6b7280';
    btn.textContent = `안읽음 유지 ${state.on?'ON':'OFF'}` + (state.blocked?` · ${state.blocked}`:'');
  }
  btn.onclick = () => { state.on = !state.on; render(); };
  // 좌측 채널 목록의 "나와의 대화방" 열기
  function openMyChat() {
    const item = [...document.querySelectorAll('.js-gnb-list-item')]
      .find(el => el.textContent.trim() === '나와의 대화방');
    if (!item) return console.log('나와의 대화방 항목을 찾을 수 없음');
    // 가장 안쪽 텍스트 요소에 실제 클릭과 같은 이벤트 순서로 전달
    let target = item;
    while (target.firstElementChild && target.textContent.trim() === target.firstElementChild.textContent.trim()) {
      target = target.firstElementChild;
    }
    const r = target.getBoundingClientRect();
    const opt = { bubbles:true, cancelable:true, view:W, button:0, clientX:r.left + r.width/2, clientY:r.top + r.height/2 };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ev = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      target.dispatchEvent(new Ev(type, opt));
    }
  }
  const onKey = e => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase()==='e') {
      e.preventDefault(); e.stopPropagation();
      state.on = !state.on; render();
      openMyChat();
    }
  };
  // 포커스가 iframe 안에 있어도 동작하도록 window와 동일 출처 iframe 모두에 등록
  const hooked = new WeakSet();
  const hookKeys = win => {
    let doc; try { doc = win.document; } catch (e) { return; }
    if (hooked.has(doc)) return; // iframe이 다시 로드되면 document가 바뀌므로 재등록됨
    hooked.add(doc);
    win.addEventListener('keydown', onKey, true);
  };
  const hookFrames = () => {
    hookKeys(W);
    document.querySelectorAll('iframe').forEach(f => {
      try { if (f.contentWindow && f.contentDocument) hookKeys(f.contentWindow); } catch (e) {}
    });
  };
  hookFrames();
  new MutationObserver(hookFrames).observe(document.documentElement, { childList:true, subtree:true });
  setInterval(hookFrames, 2000); // iframe이 새로 로드되며 리스너가 사라지는 경우 대비
  W.addEventListener('focus', hookFrames);
  render();

  W.__keepUnread = { state, on:()=>{state.on=true;render();}, off:()=>{state.on=false;render();}, flush };
  console.log('안읽음 유지 ON. 토글: Ctrl+E, 해제: __keepUnread.off(),일괄 읽음 처리: __keepUnread.flush()');
})();
