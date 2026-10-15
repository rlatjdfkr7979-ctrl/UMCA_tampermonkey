// ==UserScript==
// @name         국민신문고 민원 정보 복사
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  민원 상세 페이지에서 신청번호/접수번호/민원인 성명을 추출해 엑셀용 1행으로 복사
// @author       김성락
// @match        https://gov.epeople.go.kr/*
// @grant        none
// @updateURL    https://github.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/raw/refs/heads/main/shinmoongo.user.js
// @downloadURL    https://github.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/raw/refs/heads/main/shinmoongo.user.js
// ==/UserScript==

(function () {
    'use strict';

    const FUNC_NAME = 'fn_epst_snd_popup_re';
    const RCVNR_RE = /"rcvnrList\[(\d+)\]\.(\w+)"\s*:\s*"([^"]*)"/g;

    // ── 데이터 추출 ────────────────────────────────────────
    function collectWindows(win, out) {
        out.push(win);
        for (let i = 0; i < win.frames.length; i++) {
            try {
                if (win.frames[i].document) collectWindows(win.frames[i], out);
            } catch (e) { /* cross-origin frame 무시 */ }
        }
        return out;
    }

    function findSource() {
        const wins = collectWindows(window, []);
        for (const w of wins) {
            try {
                if (typeof w[FUNC_NAME] === 'function') return w[FUNC_NAME].toString();
            } catch (e) { /* 접근 불가 */ }
        }
        // 함수가 노출되지 않은 경우 인라인 스크립트 텍스트에서 탐색
        for (const w of wins) {
            try {
                for (const s of w.document.scripts) {
                    if (s.textContent.includes('rcvnrList[0].rqstNo')) return s.textContent;
                }
            } catch (e) { /* 접근 불가 */ }
        }
        return null;
    }

    function extractRcvnrList() {
        const src = findSource();
        if (!src) return null;
        const re = new RegExp(RCVNR_RE.source, 'g');
        const list = [];
        let m;
        while ((m = re.exec(src)) !== null) {
            const idx = +m[1];
            list[idx] = list[idx] || {};
            list[idx][m[2]] = m[3];
        }
        return list.length ? list : null;
    }

    function getFirstRcvnr() {
        const list = extractRcvnrList();
        return list && list[0] ? list[0] : null;
    }

    // ── 클립보드 / 알림 ────────────────────────────────────
    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
            ta.remove();
            return ok;
        }
    }

    function showToast(message, isError) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 90px;
            right: 30px;
            z-index: 100000;
            padding: 10px 16px;
            border-radius: 6px;
            color: #fff;
            font-size: 13px;
            background: ${isError ? '#d9534f' : '#333'};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    async function copyAndNotify(label, text) {
        const ok = await copyText(text);
        showToast(ok ? `${label} 복사됨: ${text}` : '복사에 실패했습니다.', !ok);
    }

    // ── 버튼 동작 ──────────────────────────────────────────
    function handle(label, build) {
        const data = getFirstRcvnr();
        if (!data) {
            showToast('민원 데이터를 찾을 수 없습니다.', true);
            return;
        }
        copyAndNotify(label, build(data));
    }

    // 엑셀 한 번에 붙여넣기: 탭 구분 1행 (신청번호 / 접수번호 / 민원인 성명)
    const onCopyRow = () => handle('1행', d => [d.rqstNo, d.rcptNo, d.rcvnrNm].map(v => v || '').join('\t'));
    const onCopyRqst = () => handle('신청번호', d => d.rqstNo || '');
    const onCopyRcpt = () => handle('접수번호', d => d.rcptNo || '');

    // ── 버튼 UI ────────────────────────────────────────────
    function createButton(text, color, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.style.cssText = `
            padding: 8px 14px;
            background: ${color};
            color: #fff;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        `;
        btn.addEventListener('click', onClick);
        return btn;
    }

    function init() {
        // iframe 내부에서 중복 생성되지 않도록 최상위 문서에서만 생성
        if (window.top !== window) return;
        if (document.getElementById('epeople-copy-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'epeople-copy-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 99999;
            display: flex;
            gap: 6px;
        `;
        panel.append(
            createButton('신청번호', '#5a6e8c', onCopyRqst),
            createButton('접수번호', '#5a8c6e', onCopyRcpt),
            createButton('엑셀용 1행', '#2b6cb0', onCopyRow)
        );
        document.body.appendChild(panel);
    }

    if (document.body) init();
    else window.addEventListener('DOMContentLoaded', init);
})();
