// ==UserScript==
// @name         전자문서 링크 복사 버튼
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  전자문서 열람 시 링크 복사 + 문서번호 복사 + 본문 복사 버튼 자동 생성 + 게시판 공유링크 복사
// @match        http://10.10.11.20/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const win = unsafeWindow;

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
                return { docId: win.rInfo.apprMsgID, deptId: win.rInfo.apprDeptID || '000010000' };
            }
        } catch(e) {}
        const checkbox = document.querySelector('input[id^="flag_JHOMS"]');
        if (checkbox) return { docId: checkbox.id.replace('flag_', ''), deptId: '000010000' };
        return null;
    }

    // ✅ 수정: 새 웹한글 에디터 API 방식
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

    function hasBlockedTitle() {
        return document.title.includes('울산도시공사 그룹웨어.');
    }

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

})();
