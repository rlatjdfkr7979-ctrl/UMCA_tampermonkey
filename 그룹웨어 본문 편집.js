// ==UserScript==
// @name         전자문서 링크 복사 버튼
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  전자문서 열람 시 링크 복사 + 문서번호 복사 + 본문 복사 버튼 자동 생성
// @match        http://10.10.11.20/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const BASE_URL = 'http://10.10.11.20/jsp/call/docu_view.jsp?docid=';

    function getDocId() {
        const checkbox = document.querySelector('input[id^="flag_JHOMS"]');
        return checkbox ? checkbox.id.replace('flag_', '') : null;
    }

    function getHwpFieldText(fieldName) {
        try {
            const hwp = document
                .getElementById('editor1').contentWindow
                .document.getElementById('Document_HwpCtrl').contentWindow
                .HwpCtrl;
            return hwp.GetFieldText(fieldName) ?? '';
        } catch (e) {
            return '';
        }
    }

    function getDocumentRef() {
        const docNo = getHwpFieldText('문서번호');
        const date  = getHwpFieldText('시행일자') || getHwpFieldText('결재완료일자');
        if (!docNo && !date) return null;
        return `${docNo}(${date})`;
    }

    // ✅ 추가: 본문 텍스트 추출
    function getBodyText() {
        return getHwpFieldText('본문');
    }

    function createCopyButton(docId) {
        if (document.getElementById('docBtnWrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'docBtnWrapper';
        wrapper.style.cssText = `
            position: fixed;
            top: 10px;
            right: 16px;
            z-index: 9999;
            display: flex;
            flex-direction: row;
            gap: 8px;
        `;

        const btnBase = `
            padding: 7px 14px;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            white-space: nowrap;
        `;

        // 🔗 링크 복사 버튼
        const linkBtn = document.createElement('button');
        linkBtn.id = 'docLinkCopyBtn';
        linkBtn.textContent = '🔗 링크 복사';
        linkBtn.style.cssText = btnBase + 'background: #1a6fd4;';
        linkBtn.addEventListener('click', () => {
            GM_setClipboard(BASE_URL + docId);
            linkBtn.textContent = '✅ 복사됨!';
            setTimeout(() => linkBtn.textContent = '🔗 링크 복사', 2000);
        });

        // 📋 문서번호 복사 버튼
        const docBtn = document.createElement('button');
        docBtn.id = 'docRefCopyBtn';
        docBtn.textContent = '📋 문서번호 복사';
        docBtn.style.cssText = btnBase + 'background: #2e7d32;';
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

        // ✅ 추가: 📄 본문 복사 버튼
        const bodyBtn = document.createElement('button');
        bodyBtn.id = 'docBodyCopyBtn';
        bodyBtn.textContent = '📄 본문 복사';
        bodyBtn.style.cssText = btnBase + 'background: #6a1b9a;';
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
        wrapper.appendChild(bodyBtn); // ✅ 추가
        document.body.appendChild(wrapper);
    }

    function hasBlockedTitle() {
        return document.title.includes('울산도시공사 그룹웨어.');
    }

    function init() {
        if (hasBlockedTitle()) return;

        const docId = getDocId();
        if (docId) {
            createCopyButton(docId);
            return;
        }

        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            if (hasBlockedTitle()) { clearInterval(timer); return; }
            const id = getDocId();
            if (id) { createCopyButton(id); clearInterval(timer); }
            if (attempts >= 10) clearInterval(timer);
        }, 500);
    }

    window.addEventListener('load', init);

})();
