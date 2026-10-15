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
  document.addEventListener('keydown', e => { if (e.altKey && e.key.toLowerCase()==='u') { state.on = !state.on; render(); } });
  render();

  W.__keepUnread = { state, on:()=>{state.on=true;render();}, off:()=>{state.on=false;render();}, flush };
  console.log('안읽음 유지 ON. 해제: __keepUnread.off(), 일괄 읽음 처리: __keepUnread.flush()');
})();
