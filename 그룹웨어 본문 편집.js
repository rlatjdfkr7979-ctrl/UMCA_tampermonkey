// ==UserScript==
// @name         전자문서 링크 복사 버튼
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  전자문서 열람 시 링크 복사 + 문서번호 복사 + 본문 복사 버튼 자동 생성 + 게시판 공유링크 복사
// @match        http://10.10.11.20/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const BASE_URL = 'http://10.10.11.20/jsp/call/docu_view.jsp?docid=';

    // ✅ 추가: 게시판 URL 여부 감지
    function isBBSPage() {
        return location.href.includes('SLET=bbs.BBSMtrlRead.java');
    }

    // ✅ 추가: 게시판 공유 URL 생성 (_x, K 제거)
    function getBBSShareURL() {
        const url = new URL(location.href);
        url.searchParams.delete('_x');
        url.searchParams.delete('K');
        url.searchParams.delete('popup');   // 팝업 파라미터도 제거 (선택)
        return url.toString();
    }

    // ✅ 추가: 게시판 페이지 전용 버튼 생성
    function createBBSButton() {
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

        const shareBtn = document.createElement('button');
        shareBtn.id = 'bbsShareBtn';
        shareBtn.textContent = '🔗 게시글 링크 복사';
        shareBtn.style.cssText = btnBase + 'background: #e65100;';
        shareBtn.addEventListener('click', () => {
            const shareURL = getBBSShareURL();
            GM_setClipboard(shareURL);
            shareBtn.textContent = '✅ 복사됨!';
            setTimeout(() => shareBtn.textContent = '🔗 게시글 링크 복사', 2000);
        });

        wrapper.appendChild(shareBtn);
        document.body.appendChild(wrapper);
    }

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

        const linkBtn = document.createElement('button');
        linkBtn.id = 'docLinkCopyBtn';
        linkBtn.textContent = '🔗 링크 복사';
        linkBtn.style.cssText = btnBase + 'background: #1a6fd4;';
        linkBtn.addEventListener('click', () => {
            GM_setClipboard(BASE_URL + docId);
            linkBtn.textContent = '✅ 복사됨!';
            setTimeout(() => linkBtn.textContent = '🔗 링크 복사', 2000);
        });

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
        wrapper.appendChild(bodyBtn);
        document.body.appendChild(wrapper);
    }

    function hasBlockedTitle() {
        return document.title.includes('울산도시공사 그룹웨어.');
    }

    function init() {
        if (hasBlockedTitle()) return;

        // ✅ 추가: 게시판 페이지면 게시판 버튼만 생성하고 종료
        if (isBBSPage()) {
            createBBSButton();
            return;
        }

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
