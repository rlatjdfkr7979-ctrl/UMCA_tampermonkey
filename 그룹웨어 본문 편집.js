// ==UserScript==
// @name         전자문서 링크 복사 + 붙임 번호 자동 부여
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  전자문서 열람 시 링크/문서번호/본문 복사 버튼 + 게시판 공유링크 복사 + 첨부파일 붙임 번호 자동 부여
// @match        http://10.10.11.20/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const win = unsafeWindow;

    // ══════════════════════════════════════════
    // 공통 유틸
    // ══════════════════════════════════════════
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function hasBlockedTitle() {
        return document.title.includes('울산도시공사 그룹웨어.');
    }

    // ══════════════════════════════════════════
    // 링크 복사 버튼 (문서 열람 창)
    // ══════════════════════════════════════════
    function getShareURL(docId) {
        return `http://10.10.11.20/jsp/call/docu_view.jsp?docid=${docId}`;
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

    function getDocInfo() {
        try {
            if (win.rInfo && win.rInfo.apprMsgID) {
                return { docId: win.rInfo.apprMsgID };
            }
        } catch(e) {}
        const checkbox = document.querySelector('input[id^="flag_JHOMS"]');
        if (checkbox) return { docId: checkbox.id.replace('flag_', '') };
        return null;
    }

    function getHwpFieldText(fieldName) {
        try {
            const fe = win.editor('editor1').GetFeEditor();
            const hwp = fe.hwpCtrl;
            return hwp.GetFieldText(fieldName) ?? '';
        } catch (e) { return ''; }
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

    function createCopyButton(docId) {
        if (document.getElementById('docBtnWrapper')) return;
        const wrapper = document.createElement('div');
        wrapper.id = 'docBtnWrapper';
        wrapper.style.cssText = 'position:fixed;top:10px;right:16px;z-index:9999;display:flex;flex-direction:row;gap:8px;';
        const btnBase = 'padding:7px 14px;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;';

        const linkBtn = document.createElement('button');
        linkBtn.textContent = '🔗 링크 복사';
        linkBtn.style.cssText = btnBase + 'background:#1a6fd4;';
        linkBtn.addEventListener('click', () => {
            GM_setClipboard(getShareURL(docId));
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
            if (hasBlockedTitle()) { clearInterval(bootTimer); return; }

            if (isBBSPage()) {
                createBBSButton();
                clearInterval(bootTimer);
                return;
            }

            const info = getDocInfo();
            if (info) {
                createCopyButton(info.docId);
                clearInterval(bootTimer);
                return;
            }

            if (attempts >= 40) clearInterval(bootTimer);
        }, 500);
    }

    // ══════════════════════════════════════════
    // 붙임 번호 자동 부여 (기안 작성 창)
    // ══════════════════════════════════════════
    function isWritingPage() {
        return location.href.includes('retrieveDoccrdWritng.act');
    }

    async function runAutoPrefix() {
        const attachShadow = document.querySelector('fe-attachbox')?.shadowRoot;
        if (!attachShadow) { alert('첨부파일 영역을 찾을 수 없습니다.'); return; }

        const feAttaches = attachShadow.querySelectorAll('fe-attach');
        if (feAttaches.length === 0) { alert('첨부파일이 없습니다.'); return; }

        for (let i = 0; i < feAttaches.length; i++) {
            const s = feAttaches[i].shadowRoot;
            if (!s) continue;

            // 표시 파일명 (확장자 포함)
            const fullName = s.querySelector('a#file-name')?.textContent.trim();
            if (!fullName) continue;

            // 이미 붙임 번호 있으면 스킵
            if (/^붙임\d+\.\s/.test(fullName)) continue;

            const modifyBtn = s.querySelector('button.file-modify');
            const confirmBtn = s.querySelector('button.file-modify-confirm');
            const input = s.querySelector('input.basic_input');
            if (!modifyBtn || !confirmBtn || !input) continue;

            // 확장자 분리
            const dotIdx = fullName.lastIndexOf('.');
            const baseName = dotIdx !== -1 ? fullName.substring(0, dotIdx) : fullName;

            // 수정 버튼 클릭
            modifyBtn.click();
            await delay(300);

            // input에 붙임N. 파일명 입력 (확장자 제외 — 시스템이 자동 추가)
            input.value = `붙임${i + 1}. ${baseName}`;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await delay(300);

            // 저장 버튼 클릭
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
        // fe-attachbox 웹 컴포넌트가 로딩될 때까지 대기
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

    // ══════════════════════════════════════════
    // 진입점
    // ══════════════════════════════════════════
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
