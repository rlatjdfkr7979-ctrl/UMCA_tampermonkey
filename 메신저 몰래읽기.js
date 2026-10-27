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

  // 화면 전체 테두리로 상태 표시 (ON: 주황 테두리, OFF: 없음). 클릭을 가리지 않음
  const frame = document.createElement('div');
  frame.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;transition:box-shadow .15s';
  document.body.appendChild(frame);
  function render() {
    frame.style.boxShadow = state.on ? 'inset 0 0 0 4px #f59e0b' : 'none';
    document.title = document.title.replace(/^\[안읽음 유지\] /, '');
    if (state.on) document.title = '[안읽음 유지] ' + document.title;
  }
  const MY_CHAT = '나와의 대화방';
  const items = () => [...document.querySelectorAll('.js-gnb-list-item')];
  // 아바타([size])를 제외한 텍스트 말단 요소들: 첫 번째는 방 이름, 이후 숫자는 안읽음 배지
  const textLeaves = item => [...item.querySelectorAll('*')]
    .filter(el => !el.firstElementChild && el.textContent.trim() && !el.closest('[size]'));
  const nameOf = item => (textLeaves(item)[0] || {}).textContent?.trim() || '';
  const unreadOf = item => {
    const badge = textLeaves(item).slice(1).find(el => /^\d+\+?$/.test(el.textContent.trim()));
    return badge ? parseInt(badge.textContent, 10) : 0;
  };
  // 현재 열린 방: 대부분과 클래스가 다른 유일한 항목 (선택 상태 스타일)
  const currentItem = () => {
    const all = items(), cnt = new Map();
    all.forEach(el => cnt.set(el.className, (cnt.get(el.className) || 0) + 1));
    const odd = all.filter(el => cnt.get(el.className) === 1);
    return odd.length === 1 ? odd[0] : null;
  };
  // 안읽은 방을 순차 방문: 몰래읽기 ON이면 배지가 안 사라지므로 방문 기록으로 중복을 막음
  const cycle = { visited: new Set(), last: null };
  function nextRoom() {
    const cur = currentItem(), curName = cur ? nameOf(cur) : '';
    const unread = () => items().filter(el => unreadOf(el) > 0 && !cycle.visited.has(nameOf(el)) && nameOf(el) !== curName);
    if (curName === MY_CHAT) {
      cycle.visited.clear(); cycle.last = null;
      const n = unread()[0];
      if (!n) return console.log('읽지 않은 방 없음');
      return openRoom(n);
    }
    if (cycle.last && curName === cycle.last) {
      const n = unread()[0];
      if (n) return openRoom(n);
      cycle.visited.clear(); cycle.last = null; // 한 바퀴 끝 → 나와의 대화방으로 복귀
    }
    openMyChat();
  }
  function openRoom(item) {
    const name = nameOf(item);
    cycle.visited.add(name); cycle.last = name;
    // 방에 들어가며 읽음 처리되지 않도록 먼저 몰래읽기를 켬
    state.on = true; render();
    clickItem(item);
  }
  // 좌측 채널 목록의 "나와의 대화방" 열기
  function openMyChat() {
    const item = items().find(el => nameOf(el) === MY_CHAT);
    if (!item) return console.log('나와의 대화방 항목을 찾을 수 없음');
    clickItem(item);
  }
  function clickItem(item) {
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
    if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'e') {
      e.preventDefault(); e.stopPropagation();
      nextRoom();
    } else if (k === 'd') {
      e.preventDefault(); e.stopPropagation();
      state.on = !state.on; render();
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
  console.log('안읽음 유지 ON. 토글: Ctrl+D, 나와의 대화방/다음 안읽은 방: Ctrl+E, 해제: __keepUnread.off(),일괄 읽음 처리: __keepUnread.flush()');
})();
