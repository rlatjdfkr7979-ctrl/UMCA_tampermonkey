// ==UserScript==
// @name         전자문서 링크 복사 + 붙임 번호 자동 부여
// @namespace    http://tampermonkey.net/
// @version      4.15
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

    const FLOW_STATUS = { partapprstatus_cancel: '회수/취소', partapprstatus_now: '진행중', partapprstatus_done: '완료' };
    const FLOW_VALID = { valid: '유효', revoked: '무효(회수됨)' };
    const FLOW_COMMENT_TYPE = { comment_type_recall: '회수의견' };

    function readFlow(hox) {
        if (!hox?.querySelectorAll) return [];
        const text = (node, selector) => node?.querySelector(selector)?.textContent.trim() ?? '';
        return Array.from(hox.querySelectorAll('approvalFlow > participant'), (p, index) => {
            const opinions = Array.from(p.querySelectorAll('*'))
                .filter(node => /comment|opinion/i.test(node.tagName) && node.querySelector('text'))
                .map(node => {
                    const type = node.getAttribute('type');
                    return {
                        type: FLOW_COMMENT_TYPE[type] ?? type ?? '',
                        text: text(node, 'text'),
                        date: text(node, 'date').replace('T', ' ')
                    };
                });
            const delegator = p.querySelector('delegator');
            const status = text(p, 'approvalStatus');
            const valid = text(p, 'validStatus');
            return {
                order: index + 1,
                type: text(p, 'displayApprovalType'),
                name: text(p, ':scope > name'),
                position: text(p, ':scope > position'),
                department: text(p, ':scope > department > name'),
                statusKey: status,
                status: FLOW_STATUS[status] ?? status,
                valid: FLOW_VALID[valid] ?? valid,
                revoked: valid === 'revoked',
                date: text(p, ':scope > date').replace('T', ' ').replace(/^1970.*/, ''),
                delegate: p.getAttribute('absent') === 'true'
                    ? (delegator?.textContent.trim().replace(/\s+/g, ' ') || '대결') : '',
                opinions
            };
        });
    }

    function flowToTsv(rows) {
        const header = ['순번', '구분', '이름', '직위', '부서', '상태', '유효', '일시', '대결', '의견'];
        const lines = rows.map(row => [row.order, row.type, row.name, row.position, row.department,
            row.status, row.valid, row.date, row.delegate,
            row.opinions.map(o => `[${o.type}] ${o.text} (${o.date})`).join(' / ')]
            .map(value => String(value).replace(/[\t\r\n]+/g, ' ')).join('\t'));
        return [header.join('\t'), ...lines].join('\n');
    }

    function renderFlow(container, rows) {
        if (!rows.length) {
            appendInfoMessage(container, '등록된 결재경로가 없습니다.');
            return;
        }

        const list = document.createElement('ol');
        list.className = 'flow';
        for (const row of rows) {
            const item = document.createElement('li');
            item.className = 'flow-item';
            const tone = row.statusKey === 'partapprstatus_done' ? 'done'
                : row.statusKey === 'partapprstatus_now' ? 'now'
                : row.statusKey === 'partapprstatus_cancel' ? 'cancel' : 'wait';
            item.classList.add(`flow-${tone}`);
            if (row.revoked) item.classList.add('flow-revoked');

            const step = document.createElement('span');
            step.className = 'flow-step';
            step.textContent = row.order;

            const body = document.createElement('div');
            body.className = 'flow-body';

            const head = document.createElement('div');
            head.className = 'flow-head';
            const type = document.createElement('span');
            type.className = 'flow-type';
            type.textContent = row.type || '—';
            const name = document.createElement('strong');
            name.textContent = row.name || '—';
            const sub = document.createElement('span');
            sub.className = 'flow-sub';
            sub.textContent = [row.position, row.department].filter(Boolean).join(' · ');
            head.append(type, name, sub);
            if (row.delegate) {
                const tag = document.createElement('span');
                tag.className = 'flow-tag';
                tag.textContent = `대결 ${row.delegate === '대결' ? '' : row.delegate}`.trim();
                head.appendChild(tag);
            }

            const meta = document.createElement('div');
            meta.className = 'flow-meta';
            const badge = document.createElement('span');
            badge.className = `flow-badge flow-badge-${tone}`;
            badge.textContent = row.status || '대기';
            meta.appendChild(badge);
            if (row.valid && row.revoked) {
                const valid = document.createElement('span');
                valid.className = 'flow-tag';
                valid.textContent = row.valid;
                meta.appendChild(valid);
            }
            const date = document.createElement('time');
            date.textContent = row.date || '—';
            meta.appendChild(date);

            body.append(head, meta);
            for (const opinion of row.opinions) {
                const quote = document.createElement('blockquote');
                quote.className = 'flow-opinion';
                if (opinion.type) {
                    const label = document.createElement('b');
                    label.textContent = opinion.type;
                    quote.appendChild(label);
                }
                quote.appendChild(document.createTextNode(opinion.text));
                if (opinion.date) {
                    const when = document.createElement('small');
                    when.textContent = opinion.date;
                    quote.appendChild(when);
                }
                body.appendChild(quote);
            }
            item.append(step, body);
            list.appendChild(item);
        }
        container.appendChild(list);
    }

    function renderReceiptInfo(container, node) {
        // 구조가 문서마다 달라 말단 항목의 태그명과 값을 그대로 나열한다.
        const leaves = Array.from(node.querySelectorAll('*'))
            .filter(el => !el.children.length && el.textContent.trim());
        if (!leaves.length) return false;
        const dl = document.createElement('dl');
        dl.className = 'receipt';
        for (const leaf of leaves) {
            const dt = document.createElement('dt');
            dt.textContent = leaf.tagName;
            const dd = document.createElement('dd');
            dd.textContent = leaf.textContent.trim();
            dl.append(dt, dd);
        }
        container.appendChild(dl);
        return true;
    }

    function showDocumentInfo() {
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
            #umca-document-info { box-sizing:border-box; width:min(820px,94vw); max-height:85vh;
                padding:0; border:0; border-radius:12px; color:#243247; background:#fff;
                box-shadow:0 12px 48px #0004; font:14px/1.6 sans-serif; overflow:auto; }
            #umca-document-info::backdrop { background:#0006; }
            #umca-document-info header { position:sticky; top:0; z-index:1; display:flex; align-items:center;
                justify-content:space-between; gap:16px; padding:16px 24px; background:#fff; border-bottom:1px solid #e2e8f0; }
            #umca-document-info h2 { margin:0; font-size:20px; }
            #umca-document-info .actions { display:flex; gap:8px; }
            #umca-document-info button { padding:6px 14px; border:1px solid #cbd5e1;
                border-radius:6px; background:#f8fafc; color:#243247; cursor:pointer; font:inherit; }
            #umca-document-info button:hover { background:#edf3fa; }
            #umca-document-info .body { padding:8px 24px 24px; }
            #umca-document-info h3 { display:flex; align-items:center; gap:8px; margin:20px 0 10px; font-size:15px; }
            #umca-document-info h3 small { font-weight:400; color:#64748b; }
            #umca-document-info .flow { list-style:none; margin:0; padding:0; }
            #umca-document-info .flow-item { position:relative; display:flex; gap:14px; padding:0 0 14px; }
            #umca-document-info .flow-item:not(:last-child)::before { content:''; position:absolute; left:13px;
                top:28px; bottom:0; width:2px; background:#dbe2ea; }
            #umca-document-info .flow-step { flex:none; width:28px; height:28px; border-radius:50%; background:#94a3b8;
                color:#fff; font-size:13px; font-weight:600; text-align:center; line-height:28px; z-index:1; }
            #umca-document-info .flow-done .flow-step { background:#2e8b57; }
            #umca-document-info .flow-now .flow-step { background:#1a6fd4; box-shadow:0 0 0 4px #1a6fd433; }
            #umca-document-info .flow-cancel .flow-step { background:#d9792b; }
            #umca-document-info .flow-body { flex:1; min-width:0; padding:8px 12px; border:1px solid #dbe2ea;
                border-radius:8px; background:#fff; }
            #umca-document-info .flow-now .flow-body { border-color:#1a6fd4; background:#f3f8ff; }
            #umca-document-info .flow-revoked .flow-body { background:#f8fafc; }
            #umca-document-info .flow-revoked .flow-head strong { text-decoration:line-through; color:#94a3b8; }
            #umca-document-info .flow-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 8px; }
            #umca-document-info .flow-type { padding:0 8px; border-radius:4px; background:#edf3fa; color:#3b5170; font-size:12px; }
            #umca-document-info .flow-sub { color:#64748b; font-size:13px; }
            #umca-document-info .flow-meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:4px;
                color:#64748b; font-size:12px; }
            #umca-document-info .flow-badge { padding:1px 9px; border-radius:12px; background:#edf1f5; color:#475569; font-size:12px; }
            #umca-document-info .flow-badge-done { background:#e5f5eb; color:#22663e; }
            #umca-document-info .flow-badge-now { background:#dbeafe; color:#1d4ed8; }
            #umca-document-info .flow-badge-cancel { background:#fff0e5; color:#9a4515; }
            #umca-document-info .flow-tag { padding:0 8px; border-radius:4px; background:#fef3c7; color:#92400e; font-size:12px; }
            #umca-document-info .flow-opinion { margin:8px 0 0; padding:6px 10px; border-left:3px solid #94a3b8;
                background:#f1f5f9; border-radius:0 6px 6px 0; white-space:pre-wrap; overflow-wrap:anywhere; }
            #umca-document-info .flow-opinion b { margin-right:8px; color:#9a4515; }
            #umca-document-info .flow-opinion small { display:block; margin-top:2px; color:#64748b; }
            #umca-document-info details { margin-top:16px; padding:8px 12px; border:1px solid #dbe2ea; border-radius:6px; }
            #umca-document-info summary { cursor:pointer; color:#52657c; }
            #umca-document-info .receipt { display:grid; grid-template-columns:max-content 1fr; gap:2px 14px; margin:8px 0 0; }
            #umca-document-info .receipt dt { color:#64748b; font-size:12px; }
            #umca-document-info .receipt dd { margin:0; overflow-wrap:anywhere; }
        `;
        dialog.appendChild(style);

        const header = document.createElement('header');
        const title = document.createElement('h2');
        title.id = 'umca-document-info-title';
        title.textContent = '문서정보';
        const actions = document.createElement('div');
        actions.className = 'actions';
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = '표 복사';
        copy.title = '엑셀에 붙여넣을 수 있는 형식으로 복사';
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '닫기';
        close.addEventListener('click', () => dialog.close());
        actions.append(copy, close);
        header.append(title, actions);
        const body = document.createElement('div');
        body.className = 'body';
        dialog.append(header, body);

        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right ||
                event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
        });

        const feMain = win.feMain;
        const orgRows = readFlow(feMain?.orgHox);
        const rows = readFlow(feMain?.hox);
        const hasOrg = !!feMain?.orgHox;

        function addSection(label, count) {
            const heading = document.createElement('h3');
            heading.textContent = label;
            if (count !== undefined) {
                const small = document.createElement('small');
                small.textContent = `${count}명`;
                heading.appendChild(small);
            }
            const content = document.createElement('div');
            body.append(heading, content);
            return content;
        }

        if (!feMain?.hox && !feMain?.orgHox) {
            appendInfoMessage(addSection('결재경로'), '문서정보를 아직 불러오지 못했습니다. 문서 로딩 후 다시 열어 주세요.');
        } else {
            if (hasOrg) renderFlow(addSection('원결재경로', orgRows.length), orgRows);
            renderFlow(addSection(hasOrg ? '수신부서 결재경로' : '결재경로', rows.length), rows);

            const receipt = feMain.orgHox?.querySelector('docInfo > content > receiptInfo');
            if (receipt) {
                const details = document.createElement('details');
                const summary = document.createElement('summary');
                summary.textContent = '수신처 정보';
                details.appendChild(summary);
                if (renderReceiptInfo(details, receipt)) body.appendChild(details);
            }
        }

        copy.addEventListener('click', () => {
            const parts = [];
            if (orgRows.length) parts.push(`[원결재경로]\n${flowToTsv(orgRows)}`);
            if (rows.length) parts.push(`[${hasOrg ? '수신부서 결재경로' : '결재경로'}]\n${flowToTsv(rows)}`);
            if (!parts.length) {
                copy.textContent = '복사할 내용 없음';
            } else {
                GM_setClipboard(parts.join('\n\n'));
                copy.textContent = '✅ 복사됨';
            }
            setTimeout(() => copy.textContent = '표 복사', 2000);
        });

        document.body.appendChild(dialog);
        dialog.showModal();
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

    // 문서 목록 표: 각 행에 "문서번호(등록일)호" 복사 버튼 추가
    function initListCopyButtons() {
        function headerIndex(table, label) {
            const ths = table.querySelectorAll('thead th');
            for (let i = 0; i < ths.length; i++) {
                if (ths[i].textContent.trim() === label) return i;
            }
            return -1;
        }

        // 기안/결재완료 목록(문서번호 열 없음): 목록 조회 응답(JSON)에서 apprID별 문서번호를 보관
        const draftDocs = new Map();
        function captureDraftList(text) {
            try {
                const rows = JSON.parse(text).paginationInfo.rows;
                rows.forEach(r => {
                    const m = String(r.approvalDate || '').match(/(\d{4})-(\d{2})-(\d{2})/);
                    if (!r.apprID) return;
                    draftDocs.set(r.apprID, {
                        ref: r.docRegNo && m ? `${r.docRegNo}(${m[1]}. ${+m[2]}. ${+m[3]}.)호` : '',
                        draftSrc: String(r.draftSrc ?? ''),
                        preview: String(r.previewData ?? '')
                    });
                });
            } catch (e) { /* 다른 형식의 응답은 무시 */ }
        }
        // 목록 화면마다 주소가 달라도 paginationInfo.rows 형식의 응답이면 모두 수집
        const xhrProto = win.XMLHttpRequest.prototype;
        const origOpen = xhrProto.open;
        xhrProto.open = function () {
            this.addEventListener('load', () => {
                if (this.responseType && this.responseType !== 'text') return;
                const text = this.responseText;
                if (typeof text !== 'string' || !text.includes('"paginationInfo"')) return;
                captureDraftList(text);
                addButtons();
            });
            return origOpen.apply(this, arguments);
        };

        function createCopyButton(text, icon = '📋', className = 'umca-ref-copy') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = className;
            btn.textContent = icon;
            btn.title = `${text} 복사`;
            btn.style.cssText = 'margin-left:4px;padding:0 4px;border:1px solid #2e7d32;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;';
            btn.addEventListener('click', e => {
                e.stopPropagation();
                e.preventDefault();
                GM_setClipboard(text);
                btn.textContent = '✅';
                setTimeout(() => btn.textContent = icon, 1500);
            });
            return btn;
        }

        // 목록 응답의 previewData(본문 앞부분)를 말풍선으로 보여준다. 서식 문서 등은 값이 비어 있어 버튼을 붙이지 않는다.
        let openFor = null;
        function closePreview() {
            document.getElementById('umca-preview-pop')?.remove();
        }
        document.addEventListener('click', closePreview);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closePreview(); });

        function createPreviewButton(title, previewHtml) {
            const text = new DOMParser()
                .parseFromString(previewHtml.replace(/<br\s*\/?>/gi, '\n'), 'text/html')
                .body.textContent.replace(/[ \t]+\n/g, '\n').trim();
            if (!text) return null;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'umca-preview';
            btn.textContent = '👁';
            btn.title = '내용 미리보기';
            btn.style.cssText = 'margin-left:4px;padding:0 4px;border:1px solid #6a1b9a;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;';
            btn.addEventListener('click', e => {
                e.stopPropagation();
                e.preventDefault();
                const wasOpen = openFor === btn && !!document.getElementById('umca-preview-pop');
                closePreview();
                if (wasOpen) return;
                openFor = btn;

                const pop = document.createElement('div');
                pop.id = 'umca-preview-pop';
                pop.style.cssText = 'position:fixed;z-index:99999;box-sizing:border-box;max-width:480px;max-height:60vh;overflow:auto;padding:12px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#243247;box-shadow:0 6px 24px #0003;font:13px/1.6 sans-serif;white-space:pre-wrap;';
                pop.addEventListener('click', ev => ev.stopPropagation());
                const heading = document.createElement('strong');
                heading.textContent = title;
                pop.append(heading, document.createTextNode(`\n\n${text}`));
                document.body.appendChild(pop);

                const rect = btn.getBoundingClientRect();
                pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8))}px`;
                const below = rect.bottom + 6;
                pop.style.top = `${below + pop.offsetHeight > window.innerHeight ? Math.max(8, rect.top - pop.offsetHeight - 6) : below}px`;
            });
            return btn;
        }

        // 외부 접수문서(draftSrc 2)는 문서 화면의 getExternalReceiveShareURL과 같은 형식의 링크를 사용
        function createLinkButton(apprId) {
            const id = encodeURIComponent(apprId);
            const url = draftDocs.get(apprId)?.draftSrc === '2'
                ? `${BASE}/bms/fe/retrieveDoccrdInqire.act?APPRIDLIST=${id}&APPRIDXID=${id}&DRAFTSRCLIST=2`
                : `${BASE}/jsp/call/docu_view.jsp?docid=${id}`;
            return createCopyButton(url, '🔗', 'umca-link-copy');
        }

        // 버튼은 제목 칸 오른쪽에 줄어들지 않는 묶음으로 두고, 제목은 칸 너비에 맞춰 말줄임 처리해서
        // 칼럼이 좁아도 버튼이 잘리지 않게 한다.
        function getButtonHost(container) {
            let host = container.querySelector(':scope > .umca-actions');
            if (host) return host;
            container.style.cssText += ';display:flex;align-items:center;min-width:0;';
            const subject = container.querySelector('a.subject');
            if (subject) subject.style.cssText += ';flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            host = document.createElement('span');
            host.className = 'umca-actions';
            host.style.cssText = 'display:inline-flex;flex:none;align-items:center;white-space:nowrap;';
            container.appendChild(host);
            return host;
        }

        // 행별 PDF 다운로드: 해당 행만 체크한 상태로 페이지의 파일 저장 모듈을 호출한 뒤 체크 상태를 복원
        function downloadRowPdf(tr) {
            const boxes = Array.from(document.querySelectorAll('tbody#tbody input[name="docinfo"]'));
            const target = tr.querySelector('input[name="docinfo"]');
            if (!target) return;
            if (typeof win.randomPassword !== 'function') {
                win.randomPassword = function (len) {
                    len = len || 16;
                    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
                    const buf = new Uint32Array(len);
                    win.crypto.getRandomValues(buf);
                    let out = '';
                    for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
                    return out;
                };
            }
            const saved = boxes.map(b => b.checked);
            boxes.forEach(b => { b.checked = (b === target); });
            try {
                win.apprCommon_bms.doCallFileManager(
                    'lstArea_bms', win.HCLTAPP_FILESAVE,
                    false, false, false, false, true, // PDF
                    'doc'
                );
            } catch (err) {
                console.error('PDF 다운로드 실패', err);
                alert('PDF 다운로드 호출에 실패했습니다. 콘솔을 확인하세요.');
            }
            setTimeout(() => boxes.forEach((b, i) => { b.checked = saved[i]; }), 1500);
        }

        function addPdfButtons() {
            if (!win.apprCommon_bms || typeof win.apprCommon_bms.doCallFileManager !== 'function') return;
            document.querySelectorAll('tbody#tbody tr').forEach(tr => {
                if (tr.querySelector('.umca-pdf-download') || !tr.querySelector('input[name="docinfo"]')) return;
                const container = tr.querySelector('td .title');
                if (!container) return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'umca-pdf-download';
                btn.textContent = 'PDF';
                btn.title = 'PDF 다운로드';
                btn.style.cssText = 'margin-left:4px;padding:0 5px;border:1px solid #c62828;border-radius:3px;background:#c62828;color:#fff;cursor:pointer;font:bold 10px/16px Arial,sans-serif;letter-spacing:.3px;';
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    e.preventDefault();
                    downloadRowPdf(tr);
                });
                getButtonHost(container).appendChild(btn);
            });
        }

        function addButtons() {
            addPdfButtons();
            document.querySelectorAll('table').forEach(table => {
                const docIdx = headerIndex(table, '문서번호');
                const dateIdx = headerIndex(table, '등록일');
                if (docIdx < 0 || dateIdx < 0) return;

                table.querySelectorAll('tbody tr').forEach(tr => {
                    const docCell = tr.children[docIdx];
                    const dateCell = tr.children[dateIdx];
                    if (!docCell || !dateCell) return;

                    const docNo = docCell.textContent.trim();
                    const m = dateCell.textContent.trim().match(/(\d{4})-(\d{2})-(\d{2})/);
                    if (!docNo || !m) return;
                    const text = `${docNo}(${m[1]}. ${+m[2]}. ${+m[3]}.)호`;

                    if (!tr.querySelector('.umca-ref-copy')) {
                        const titleDiv = tr.querySelector('td .title');
                        (titleDiv ? getButtonHost(titleDiv) : docCell).appendChild(createCopyButton(text));
                    }
                });
            });

            // 표 종류와 상관없이 제목 링크(a.subject)마다 링크 버튼을 붙인다.
            // 문서 ID는 제목 링크, 없으면 같은 행의 체크박스 id(chkBms_<apprID>)나 문서정보 링크 onclick에서 얻고,
            // 문서 종류는 목록 응답에서 얻는다.
            if (!draftDocs.size) return;
            document.querySelectorAll('a.subject').forEach(subject => {
                const row = subject.closest('tr');
                const apprId = (subject.id.match(/^titleBms_(\w+)/) ||
                    (subject.getAttribute('onclick') || '').match(/'(JHOMS\w+)'/) ||
                    (row?.querySelector('input.chkBms')?.id || '').match(/^chkBms_(\w+)/) ||
                    (row?.querySelector('a.ico_preview')?.getAttribute('onclick') || '').match(/'(JHOMS\w+)'/) || [])[1];
                const info = apprId && draftDocs.get(apprId);
                const container = subject.closest('.title') || subject.parentElement;
                if (!info || !container || container.querySelector('.umca-link-copy')) return;

                // 문서번호 열이 있는 표는 위에서 처리하므로, 없는 표에서만 응답의 문서번호를 사용
                const tr = subject.closest('tr');
                const table = tr && tr.closest('table');
                const hasRefColumns = table && headerIndex(table, '문서번호') >= 0 && headerIndex(table, '등록일') >= 0;
                if (info.ref && !hasRefColumns && !container.querySelector('.umca-ref-copy')) {
                    getButtonHost(container).appendChild(createCopyButton(info.ref));
                }
                getButtonHost(container).appendChild(createLinkButton(apprId));
                const previewBtn = createPreviewButton(subject.title || subject.textContent.trim(), info.preview);
                if (previewBtn) getButtonHost(container).appendChild(previewBtn);
            });
        }

        let timer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(addButtons, 200);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        addButtons();
    }

    function main() {
        const startList = () => initListCopyButtons();
        if (document.body) startList();
        else document.addEventListener('DOMContentLoaded', startList, { once: true });

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
