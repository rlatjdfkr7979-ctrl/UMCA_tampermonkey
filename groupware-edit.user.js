// ==UserScript==
// @name         전자문서 링크 복사 + 붙임 번호 자동 부여
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  전자문서 링크/문서번호/본문 복사 + 결재경로 문서정보 + 접수 확인 바로가기 + 외부 수신문서 최소 링크 + 첨부파일 붙임 번호 자동 부여
// @match        http://10.10.11.20/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/main/groupware-edit.user.js
// @downloadURL  https://raw.githubusercontent.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/main/groupware-edit.user.js
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

    function appendInfoMessage(container, message) {
        const p = document.createElement('p');
        p.textContent = message;
        container.appendChild(p);
    }

    function renderApprovalRoute(container, hox) {
        const participants = hox.querySelectorAll('participant');
        if (!participants.length) {
            appendInfoMessage(container, '등록된 결재경로가 없습니다.');
            return;
        }

        const table = document.createElement('table');
        const header = table.createTHead().insertRow();
        for (const label of ['순서', '구분', '이름', '직위', '일시', '상태']) {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = label;
            header.appendChild(th);
        }
        const body = table.createTBody();
        participants.forEach((participant, index) => {
            const get = name => participant.querySelector(`:scope > ${name}`)?.textContent.trim() ?? '';
            const row = body.insertRow();
            const values = [index + 1, get('displayApprovalType'), get('name'),
                get('dutyName') || get('position'), get('date').replace('T', ' '),
                get('approvalStatus').replace('partapprstatus_', '')];
            values.forEach(value => row.insertCell().textContent = value || '—');
        });
        container.appendChild(table);
    }

    function parseOriginalRoute(parsed) {
        // 원결재경로는 표가 아닌 목록으로 내려오므로 블록 경계를 유지해 읽는다.
        const blocks = new Set(['DIV', 'P', 'LI', 'TR', 'TD', 'TH', 'DT', 'DD',
            'SECTION', 'HEADER', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL']);
        function readText(node) {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\s+/g, ' ');
            if (node.nodeType !== Node.ELEMENT_NODE) return '';
            if (node.tagName === 'BR') return '\n';
            const text = Array.from(node.childNodes, readText).join(' ');
            return blocks.has(node.tagName) ? `\n${text}\n` : text;
        }
        const text = readText(parsed.body).split('\n')
            .map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
        const heading = /(?:^|\n)(완료|진행|대기|미결|예정|회수|반려|보류|취소|승인|반송|후결|-)\s+(?:(의견\s*있음)\s+)?(기안|전결|대결|결재|검토|협조|합의|병렬합의|순차합의|병렬협조|순차협조|확인|공람|통보|보고|접수|시행)(?=\s|$)/g;
        const matches = Array.from(text.matchAll(heading));
        if (!matches.length) return [];

        const rows = [];
        for (let index = 0; index < matches.length; index++) {
            const match = matches[index];
            const content = text.slice(match.index + match[0].length,
                matches[index + 1]?.index ?? text.length).trim();
            const date = /\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}\.?\s+\d{1,2}:\d{2}(?::\d{2})?|(?:^|\n)-(?:\n|$)/.exec(content);
            // 형식이 다르면 일부 경로만 표시하지 않고 기존 원문 표시로 돌아간다.
            if (!date) return [];
            const identity = content.slice(0, date.index).replace(/의견\s*펼치기/g, '').trim()
                .split(/\s+/).filter(Boolean);
            if (!identity.length) return [];
            const remainder = content.slice(date.index + date[0].length).trim();
            const status = /^(완료|진행|대기|미결|예정|회수|반려|보류|취소|승인|반송|후결|-)(?=\s|$)/.exec(remainder);
            const opinion = (status ? remainder.slice(status[0].length) : remainder)
                .replace(/의견\s*펼치기/g, '').trim();
            rows.push({
                type: match[3], name: identity[0], position: identity.slice(1).join(' '),
                date: date[0].trim(), status: status?.[1] || match[1],
                opinion: opinion || (match[2] ? '의견 있음' : '')
            });
        }
        return rows;
    }

    function renderOriginalRouteTable(container, rows) {
        const table = document.createElement('table');
        const header = table.createTHead().insertRow();
        const showOpinion = rows.some(row => row.opinion);
        const labels = ['순서', '구분', '이름', '직위', '일시', '상태'];
        if (showOpinion) labels.push('의견');
        labels.forEach(label => {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = label;
            header.appendChild(th);
        });
        const body = table.createTBody();
        rows.forEach((entry, index) => {
            const row = body.insertRow();
            const values = [index + 1, entry.type, entry.name, entry.position, entry.date, entry.status];
            if (showOpinion) values.push(entry.opinion);
            values.forEach((value, column) => {
                const cell = row.insertCell();
                cell.textContent = value || '—';
                if (column === 4) cell.className = 'route-date';
                if (column === 5) {
                    const badge = document.createElement('span');
                    badge.className = 'route-status';
                    if (['완료', '승인'].includes(value)) badge.classList.add('route-status-done');
                    if (['회수', '반려', '취소', '반송'].includes(value)) badge.classList.add('route-status-returned');
                    badge.textContent = value || '—';
                    cell.replaceChildren(badge);
                }
            });
        });
        container.appendChild(table);
    }

    function renderOriginalRoute(container, html) {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        parsed.querySelectorAll('script, style, noscript, iframe, object, embed, template, input, button, select, textarea')
            .forEach(element => element.remove());

        const rows = parseOriginalRoute(parsed);
        let originalContainer = container;
        if (rows.length) {
            renderOriginalRouteTable(container, rows);
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = '원문 보기';
            originalContainer = document.createElement('div');
            details.append(summary, originalContainer);
            container.appendChild(details);
        }

        // 서버의 표시 내용과 표 구조만 복사하고 이벤트, 링크, 외부 리소스는 가져오지 않는다.
        const allowed = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH',
            'P', 'DIV', 'SPAN', 'BR', 'STRONG', 'B', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'CAPTION']);
        function copyContent(source, target) {
            for (const node of source.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) {
                    target.appendChild(document.createTextNode(node.textContent));
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = allowed.has(node.tagName) ? document.createElement(node.tagName) : null;
                    if (element && ['TD', 'TH'].includes(node.tagName)) {
                        for (const attr of ['colspan', 'rowspan']) {
                            const value = Number(node.getAttribute(attr));
                            if (Number.isInteger(value) && value > 0 && value <= 100) {
                                element.setAttribute(attr, String(value));
                            }
                        }
                    }
                    copyContent(node, element || target);
                    if (element) target.appendChild(element);
                }
            }
        }
        copyContent(parsed.body, originalContainer);
        if (!container.textContent.trim()) {
            appendInfoMessage(container, '표시할 원결재경로가 없습니다.');
        }
    }

    async function showDocumentInfo() {
        const existing = document.getElementById('umca-document-info');
        if (existing) {
            existing.focus();
            return;
        }

        const dialog = document.createElement('dialog');
        dialog.id = 'umca-document-info';
        dialog.setAttribute('aria-labelledby', 'umca-document-info-title');
        const style = document.createElement('style');
        style.textContent = `
            #umca-document-info { box-sizing:border-box; width:min(960px,94vw); max-height:85vh;
                padding:24px; border:0; border-radius:12px; color:#243247; background:#fff;
                box-shadow:0 12px 48px #0004; font:14px/1.6 sans-serif; overflow:auto; }
            #umca-document-info::backdrop { background:#0006; }
            #umca-document-info header { display:flex; align-items:center; justify-content:space-between; gap:16px; }
            #umca-document-info h2 { margin:0; font-size:21px; }
            #umca-document-info h3 { margin:24px 0 10px; font-size:16px; }
            #umca-document-info button { padding:6px 14px; border:1px solid #cbd5e1;
                border-radius:6px; background:#f8fafc; color:#243247; cursor:pointer; font:inherit; }
            #umca-document-info .route-content { overflow-x:auto; }
            #umca-document-info table { width:100%; border-collapse:collapse; font:inherit; margin:8px 0; }
            #umca-document-info th, #umca-document-info td { padding:10px 12px; border:1px solid #dbe2ea;
                text-align:left; vertical-align:top; min-width:55px; overflow-wrap:anywhere; }
            #umca-document-info th { background:#edf3fa; font-weight:600; }
            #umca-document-info tbody tr:nth-child(even) { background:#f8fafc; }
            #umca-document-info .route-date { white-space:nowrap; }
            #umca-document-info .route-status { display:inline-block; padding:2px 8px; border-radius:12px;
                background:#edf1f5; color:#475569; white-space:nowrap; font-size:12px; }
            #umca-document-info .route-status-done { background:#e5f5eb; color:#22663e; }
            #umca-document-info .route-status-returned { background:#fff0e5; color:#9a4515; }
            #umca-document-info details { margin-top:12px; padding:10px 12px; border:1px solid #dbe2ea; border-radius:6px; }
            #umca-document-info summary { cursor:pointer; color:#52657c; }
        `;
        dialog.appendChild(style);
        const header = document.createElement('header');
        const title = document.createElement('h2');
        title.id = 'umca-document-info-title';
        title.textContent = '문서정보';
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '닫기';
        close.addEventListener('click', () => dialog.close());
        header.append(title, close);
        dialog.appendChild(header);

        function addSection(label) {
            const heading = document.createElement('h3');
            heading.textContent = label;
            const content = document.createElement('div');
            content.className = 'route-content';
            content.setAttribute('aria-live', 'polite');
            dialog.append(heading, content);
            return content;
        }
        const route = addSection('결재경로');
        const original = addSection('원결재경로');
        const controller = new AbortController();
        let timeout;
        dialog.addEventListener('close', () => {
            controller.abort();
            clearTimeout(timeout);
            dialog.remove();
        }, { once: true });
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right ||
                event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
        });
        document.body.appendChild(dialog);
        dialog.showModal();

        try {
            const hox = win.feMain?.hox;
            if (!hox?.querySelectorAll) {
                appendInfoMessage(route, '문서정보를 아직 불러오지 못했습니다. 문서 로딩 후 다시 열어 주세요.');
                appendInfoMessage(original, '결재경로 정보가 준비되지 않았습니다.');
                return;
            }
            renderApprovalRoute(route, hox);
            const orgId = hox.querySelector('orgApprID')?.textContent.trim();
            if (!orgId) {
                appendInfoMessage(original, '원결재경로가 없습니다.');
                return;
            }

            const info = win.rInfo;
            if (!info?.apprId || !info.applID || !info.user?.ID) {
                appendInfoMessage(original, '조회에 필요한 문서정보가 없습니다. 문서 로딩 후 다시 열어 주세요.');
                return;
            }
            appendInfoMessage(original, '원결재경로를 불러오는 중입니다…');
            const params = new URLSearchParams({
                DOCID: info.apprId, APPRID: info.apprId,
                ORGAPPRID: orgId, ORGDOCID: orgId,
                APPLID: info.applID, USERID: info.user.ID, DEPTID: '000010000',
                APPRTYPE: '3', APPLTYPE: '3', FORMTYPE: '5', WORDTYPE: '5', APPRSTATUS: '256',
                GWTIMEZONE: '540', _: Date.now()
            });
            timeout = setTimeout(() => controller.abort(), 20000);
            const response = await fetch(`/bms/com/hs/gwweb/appr/retrieveOrgReportCours.act?${params}`, {
                credentials: 'same-origin', signal: controller.signal
            });
            if (!response.ok) throw new Error(`서버 응답 오류 (${response.status})`);
            const html = await response.text();
            original.replaceChildren();
            renderOriginalRoute(original, html);
        } catch (error) {
            if (!dialog.open) return;
            original.replaceChildren();
            appendInfoMessage(original, error.name === 'AbortError'
                ? '조회 시간이 초과되었습니다. 닫은 후 다시 시도해 주세요.'
                : `원결재경로를 불러오지 못했습니다. ${error.message}`);
        } finally {
            clearTimeout(timeout);
        }
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

        const infoBtn = document.createElement('button');
        infoBtn.type = 'button';
        infoBtn.textContent = 'ℹ️ 문서정보';
        infoBtn.style.cssText = btnBase + 'background:#37474f;';
        infoBtn.addEventListener('click', showDocumentInfo);

        wrapper.appendChild(infoBtn);
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

    function initApprovalBoxConfirm() {
        const confirmSelector = '.popup_window > .footer #btnVerify';
        const routeSelector = '.popup_window > .tab_area .tab_bundle > button[target="#flowInfo"]';

        function syncConfirmButton() {
            const routeButton = document.querySelector(routeSelector);
            const original = document.querySelector(confirmSelector);
            if (!routeButton || !original) return;

            let shortcut = document.getElementById('umca-approval-confirm');
            if (!shortcut) {
                shortcut = document.createElement('button');
                shortcut.id = 'umca-approval-confirm';
                shortcut.type = 'button';
                shortcut.className = 'btn btn-primary';
                shortcut.textContent = '확인';
                shortcut.title = '선택한 결재정보 확인 (하단 확인 버튼과 동일)';
                shortcut.style.cssText = 'margin-left:12px;vertical-align:middle;';
                shortcut.addEventListener('click', () => {
                    const current = document.querySelector(confirmSelector);
                    if (current && !current.matches(':disabled') && current.getAttribute('aria-disabled') !== 'true') {
                        current.click();
                    }
                });
            }
            if (routeButton.nextElementSibling !== shortcut) routeButton.after(shortcut);
            const disabled = original.matches(':disabled') || original.getAttribute('aria-disabled') === 'true';
            if (shortcut.disabled !== disabled) shortcut.disabled = disabled;
        }

        // 화면 로딩과 탭 전환 중 DOM이 바뀌어도 위치 및 활성 상태를 맞춘다.
        const observer = new MutationObserver(syncConfirmButton);
        observer.observe(document.body, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['disabled', 'aria-disabled']
        });
        syncConfirmButton();
        window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    }

    function main() {
        if (location.pathname === '/bms/fe/approvalBox.html') {
            if (document.body) {
                initApprovalBoxConfirm();
            } else {
                document.addEventListener('DOMContentLoaded', initApprovalBoxConfirm, { once: true });
            }
        } else if (isWritingPage()) {
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
