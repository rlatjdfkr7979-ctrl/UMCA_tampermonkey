// ==UserScript==
// @name         전자문서 링크 복사 + 붙임 번호 자동 부여
// @namespace    http://tampermonkey.net/
// @version      3.6
// @description  전자문서 링크/문서번호/본문 복사 + 외부 수신문서 최소 링크 + 첨부파일 붙임 번호 자동 부여
// @match        http://10.10.11.20/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const win = unsafeWindow;
    const BASE = 'http://10.10.11.20';

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function hasBlockedTitle() {
        return document.title.includes('울산도시공사 그룹웨어.');
    }

    function htmlDecode(str) {
        const txt = document.createElement('textarea');
        txt.innerHTML = str || '';
        return txt.value;
    }

    function normalizeUrl(raw) {
        if (!raw) return null;
        return htmlDecode(raw).replace(/&amp;/g, '&');
    }

    function stripReturnUrlParam(rawUrl) {
        if (!rawUrl) return null;

        let url = normalizeUrl(rawUrl);

        const idx1 = url.indexOf('&RETURNURLPARAM=');
        const idx2 = url.indexOf('?RETURNURLPARAM=');

        let cutIdx = -1;
        if (idx1 !== -1) cutIdx = idx1;
        else if (idx2 !== -1) cutIdx = idx2;

        if (cutIdx !== -1) {
            url = url.substring(0, cutIdx);
        }

        return url.replace('?&', '?');
    }

    function getCurrentDocURLFromRInfo() {
        try {
            return stripReturnUrlParam(win.rInfo?.currentURL);
        } catch (e) {
            return null;
        }
    }

    function getParamFromUrl(name) {
        try {
            const raw = getCurrentDocURLFromRInfo() || location.href;
            const clean = stripReturnUrlParam(raw);
            const url = new URL(clean, location.origin);
            return url.searchParams.get(name);
        } catch (e) {
            return null;
        }
    }

    function getParam(name) {
        try {
            const p = win.rInfo?.parameterMap;

            if (p) {
                if (typeof p.get === 'function') {
                    const v = p.get(name);
                    if (v !== undefined && v !== null && v !== '') return v;
                } else if (p[name]) {
                    return p[name];
                }
            }
        } catch (e) {}

        try {
            if (name === 'APPRIDLIST' && win.rInfo?.apprMsgID) return win.rInfo.apprMsgID;
            if (name === 'APPRIDXID' && win.rInfo?.apprMsgID) return win.rInfo.apprMsgID;
            if (name === 'DRAFTSRC' && win.rInfo?.draftsrc) return win.rInfo.draftsrc;
            if (name === 'DRAFTSRCLIST' && win.rInfo?.draftsrc) return win.rInfo.draftsrc;
        } catch (e) {}

        return getParamFromUrl(name);
    }

    function isExternalReceiveDoc() {
        return getParam('DRAFTSRC') === '2' || getParam('DRAFTSRCLIST') === '2';
    }

    function getDocId() {
        try {
            const p = win.rInfo?.parameterMap;
            if (p?.get?.('APPRIDLIST')) return p.get('APPRIDLIST');
            if (p?.get?.('APPRIDXID')) return p.get('APPRIDXID');
            if (win.rInfo?.apprMsgID) return win.rInfo.apprMsgID;
        } catch (e) {}

        return getParam('APPRIDLIST') || getParam('APPRIDXID') || getParam('docid');
    }

    function getExternalReceiveShareURL() {
        const docId = getDocId();
        const apprId = getParam('APPRIDLIST') || docId;
        const apprIdxId = getParam('APPRIDXID') || docId;

        return `${BASE}/bms/fe/retrieveDoccrdInqire.act?APPRIDLIST=${encodeURIComponent(apprId)}&APPRIDXID=${encodeURIComponent(apprIdxId)}&DRAFTSRCLIST=2`;
    }

    function getShareURL() {
        const docId = getDocId();

        if (isExternalReceiveDoc()) {
            return getExternalReceiveShareURL();
        }

        if (docId) {
            return `${BASE}/jsp/call/docu_view.jsp?docid=${encodeURIComponent(docId)}`;
        }

        return stripReturnUrlParam(location.href);
    }

    function isBBSPage() {
        return location.href.includes('SLET=bbs.BBSMtrlRead.java');
    }

    function getBBSShareURL() {
        const url = new URL(location.href);
        url.searchParams.delete('_x');
        url.searchParams.delete('K');
        url.searchParams.delete('popup');
        return url.toString();
    }

    function getHwpFieldText(fieldName) {
        try {
            const fe = win.editor('editor1').GetFeEditor();
            const hwp = fe.hwpCtrl;
            return hwp.GetFieldText(fieldName) ?? '';
        } catch (e) {
            return '';
        }
    }

    function getDocumentRef() {
        const docNo = getHwpFieldText('문서번호');
        const date = getHwpFieldText('시행일자') || getHwpFieldText('결재완료일자');
        if (!docNo && !date) return null;
        return `${docNo}(${date})`;
    }

    function getBodyText() {
        return getHwpFieldText('본문');
    }

    function createBBSButton() {
        if (document.getElementById('docBtnWrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'docBtnWrapper';
        wrapper.style.cssText = 'position:fixed;top:10px;right:16px;z-index:9999;display:flex;flex-direction:row;gap:8px;';

        const btnBase = 'padding:7px 14px;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;';

        const shareBtn = document.createElement('button');
        shareBtn.textContent = '🔗 게시글 링크 복사';
        shareBtn.style.cssText = btnBase + 'background:#e65100;';
        shareBtn.addEventListener('click', () => {
            GM_setClipboard(getBBSShareURL());
            shareBtn.textContent = '✅ 복사됨!';
            setTimeout(() => shareBtn.textContent = '🔗 게시글 링크 복사', 2000);
        });

        wrapper.appendChild(shareBtn);
        document.body.appendChild(wrapper);
    }

    function createCopyButton() {
        if (document.getElementById('docBtnWrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'docBtnWrapper';
        wrapper.style.cssText = 'position:fixed;top:10px;right:16px;z-index:9999;display:flex;flex-direction:row;gap:8px;';

        const btnBase = 'padding:7px 14px;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;';

        const linkBtn = document.createElement('button');
        linkBtn.textContent = '🔗 링크 복사';
        linkBtn.style.cssText = btnBase + 'background:#1a6fd4;';
        linkBtn.addEventListener('click', () => {
            GM_setClipboard(getShareURL());
            linkBtn.textContent = '✅ 복사됨!';
            setTimeout(() => linkBtn.textContent = '🔗 링크 복사', 2000);
        });

        const docBtn = document.createElement('button');
        docBtn.textContent = '📋 문서번호 복사';
        docBtn.style.cssText = btnBase + 'background:#2e7d32;';
        docBtn.addEventListener('click', () => {
            const ref = getDocumentRef();
            if (!ref || ref === '()') {
                docBtn.textContent = '❌ 필드 없음';
                setTimeout(() => docBtn.textContent = '📋 문서번호 복사', 2000);
                return;
            }

            GM_setClipboard(ref);
            docBtn.textContent = '✅ 복사됨!';
            setTimeout(() => docBtn.textContent = '📋 문서번호 복사', 2000);
        });

        const bodyBtn = document.createElement('button');
        bodyBtn.textContent = '📄 본문 복사';
        bodyBtn.style.cssText = btnBase + 'background:#6a1b9a;';
        bodyBtn.addEventListener('click', () => {
            const body = getBodyText();
            if (!body || body.trim() === '') {
                bodyBtn.textContent = '❌ 본문 없음';
                setTimeout(() => bodyBtn.textContent = '📄 본문 복사', 2000);
                return;
            }

            GM_setClipboard(body);
            bodyBtn.textContent = '✅ 복사됨!';
            setTimeout(() => bodyBtn.textContent = '📄 본문 복사', 2000);
        });

        wrapper.appendChild(linkBtn);
        wrapper.appendChild(docBtn);
        wrapper.appendChild(bodyBtn);
        document.body.appendChild(wrapper);
    }

    function initCopyButtons() {
        let attempts = 0;

        const bootTimer = setInterval(() => {
            attempts++;

            if (!document.body) return;

            if (hasBlockedTitle()) {
                clearInterval(bootTimer);
                return;
            }

            if (isBBSPage()) {
                createBBSButton();
                clearInterval(bootTimer);
                return;
            }

            if (getDocId() || getCurrentDocURLFromRInfo()) {
                createCopyButton();
                clearInterval(bootTimer);
                return;
            }

            if (attempts >= 80) clearInterval(bootTimer);
        }, 500);
    }

    function isWritingPage() {
        return location.href.includes('retrieveDoccrdWritng.act');
    }

    async function runAutoPrefix() {
        const attachShadow = document.querySelector('fe-attachbox')?.shadowRoot;
        if (!attachShadow) {
            alert('첨부파일 영역을 찾을 수 없습니다.');
            return;
        }

        const feAttaches = attachShadow.querySelectorAll('fe-attach');
        if (feAttaches.length === 0) {
            alert('첨부파일이 없습니다.');
            return;
        }

        for (let i = 0; i < feAttaches.length; i++) {
            const s = feAttaches[i].shadowRoot;
            if (!s) continue;

            const fullName = s.querySelector('a#file-name')?.textContent.trim();
            if (!fullName) continue;

            if (/^붙임\d+\.\s/.test(fullName)) continue;

            const modifyBtn = s.querySelector('button.file-modify');
            const confirmBtn = s.querySelector('button.file-modify-confirm');
            const input = s.querySelector('input.basic_input');

            if (!modifyBtn || !confirmBtn || !input) continue;

            const dotIdx = fullName.lastIndexOf('.');
            const baseName = dotIdx !== -1 ? fullName.substring(0, dotIdx) : fullName;

            modifyBtn.click();
            await delay(300);

            input.value = `붙임${i + 1}. ${baseName}`;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await delay(300);

            confirmBtn.click();
            await delay(300);
        }

        console.log('[붙임 자동 부여] 완료');
    }

    function insertPrefixButton() {
        if (document.getElementById('btn-auto-prefix')) return;

        const attachShadow = document.querySelector('fe-attachbox')?.shadowRoot;
        if (!attachShadow) return;

        const attachBar = attachShadow.querySelector('.attach-bar.top');
        if (!attachBar) return;

        const btn = document.createElement('button');
        btn.id = 'btn-auto-prefix';
        btn.textContent = '붙임 번호 자동 부여';
        btn.style.cssText = `
            margin: 0 0 0 8px;
            padding: 3px 10px;
            font-size: 12px;
            cursor: pointer;
            background: #4a7edc;
            color: #fff;
            border: none;
            border-radius: 3px;
        `;

        btn.addEventListener('click', runAutoPrefix);
        attachBar.appendChild(btn);
    }

    function initPrefixButton() {
        let attempts = 0;

        const timer = setInterval(() => {
            attempts++;

            const attachShadow = document.querySelector('fe-attachbox')?.shadowRoot;
            if (attachShadow?.querySelector('.attach-bar.top')) {
                insertPrefixButton();
                clearInterval(timer);
                return;
            }

            if (attempts >= 40) clearInterval(timer);
        }, 500);
    }

    function main() {
        if (isWritingPage()) {
            if (document.body) {
                initPrefixButton();
            } else {
                document.addEventListener('DOMContentLoaded', initPrefixButton);
            }
        } else {
            initCopyButtons();
        }
    }

    main();

})();
