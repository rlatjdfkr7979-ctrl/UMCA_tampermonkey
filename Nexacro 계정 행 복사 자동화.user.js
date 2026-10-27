// ==UserScript==
// @name         Nexacro 계정 행 복사 자동화
// @namespace    http://tampermonkey.net/
// @version      1.83
// @description  ds_acct 행 복사 + 초과근무 기안 자동화
// @match        http://10.10.1.20:8080/umca/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/main/Nexacro%20%EA%B3%84%EC%A0%95%20%ED%96%89%20%EB%B3%B5%EC%82%AC%20%EC%9E%90%EB%8F%99%ED%99%94.user.js
// @downloadURL  https://raw.githubusercontent.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/main/Nexacro%20%EA%B3%84%EC%A0%95%20%ED%96%89%20%EB%B3%B5%EC%82%AC%20%EC%9E%90%EB%8F%99%ED%99%94.user.js
// ==/UserScript==

(function () {
    'use strict';

    const FRAME_KEYWORD  = 'index.html';
    const WIN_ACCT       = 'WIN10120101';
    const WIN_OT         = 'WIN10110105';
    const WIN_TRIPS      = ['WIN10110107', 'WIN10010408']; // 출장복명서 관리, 관내근무상황부
    const ADD_DELAY      = 300;
    const DB_DELAY       = 800;
    const CLICK_DELAY_MS = 1500;
    const POLL_INTERVAL  = 1000;
    const S_MAX_COLS     = 10;
    const S_MAX_BYTES    = 4096; // VARCHAR2(4096) 한도

    // ── 공통 유틸 ─────────────────────────────────────────

    function getNexacro() {
        const frame = Array.from(document.querySelectorAll('iframe'))
            .find(f => f.src.includes(FRAME_KEYWORD));
        return frame ? frame.contentWindow.nexacro : window.nexacro;
    }

    function getActiveWinId() {
        try {
            const nx = getNexacro();
            if (!nx) return null;
            const workframe = nx.getApplication()
                .mainframe?.vframeset?.hframeset?.bodyframe?.workframe;
            if (!workframe) return null;
            const active = workframe._active_frame;
            if (active?.id)   return active.id;
            if (active?.name) return active.name;
        } catch (e) {}
        return null;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function toArray(listLike) {
        if (!listLike) return [];
        if (Array.isArray(listLike)) return listLike;
        if (typeof listLike.length === "number") {
            return Array.from({ length: listLike.length }, (_, i) => listLike[i]);
        }
        if (typeof listLike.getCount === "function") {
            return Array.from({ length: listLike.getCount() }, (_, i) => listLike.getItem(i));
        }
        return [];
    }

    function findComp(f, id, type) {
        if (!f) return null;
        if (f[id]?._type_name === type) return f[id];
        for (const o of toArray(f.objects)) {
            if (o?._type_name === type && (o.id === id || o.name === id)) return o;
        }
        for (const c of toArray(f.components)) {
            if (c?.form) {
                const r = findComp(c.form, id, type);
                if (r) return r;
            }
        }
        return null;
    }

    function dsToRows(ds) {
        const cols = Array.from({ length: ds.getColCount() }, (_, c) => ds.getColID(c));
        return Array.from({ length: ds.getRowCount() }, (_, r) => {
            const row = {};
            for (const col of cols) row[col] = ds.getColumn(r, col);
            return row;
        });
    }

    // ── 행 복사 (WIN10120101) ─────────────────────────────

    function getFormAcct() {
        const nx = getNexacro();
        if (!nx) throw new Error('nexacro 객체를 찾을 수 없습니다.');
        return nx.getApplication()
            .mainframe.vframeset.hframeset
            .bodyframe.workframe[WIN_ACCT]
            .form.div_base.form.div_work.form;
    }

    function readAllRows(ds) {
        const cols = [];
        for (let i = 0; i < ds.getColCount(); i++) cols.push(ds.getColID(i));
        const rows = [];
        for (let r = 0; r < ds.getRowCount(); r++) {
            const row = {};
            cols.forEach(col => { row[col] = ds.getColumn(r, col); });
            rows.push(row);
        }
        return JSON.parse(JSON.stringify(rows));
    }

    function clickAdd(form) {
        return new Promise(resolve => {
            form.btn_acct_add.click();
            setTimeout(resolve, ADD_DELAY);
        });
    }

    async function runAcct() {
        const form = getFormAcct();
        const ds   = form.ds_acct;

        const sourceRows = readAllRows(ds);
        const srcCount   = sourceRows.length;

        if (srcCount === 0) {
            alert('복사할 행이 없습니다.');
            return;
        }

        const input  = prompt(`현재 행 ${srcCount}개를 읽었습니다.\n몇 세트 복사할까요? (숫자 입력)`);
        const repeat = parseInt(input, 10);

        if (isNaN(repeat) || repeat <= 0) {
            alert('올바른 숫자를 입력해주세요.');
            return;
        }

        for (let i = 0; i < repeat; i++) {
            console.log(`=== ${i + 1}세트 시작 ===`);
            for (let s = 0; s < srcCount; s++) {
                const src = sourceRows[s];
                await clickAdd(form);
                const newRowIdx = ds.getRowCount() - 1;
                ds.setColumn(newRowIdx, 'ACCT_CD', src['ACCT_CD']);
                ds.oncolumnchanged.fireEvent(ds, newRowIdx, 'ACCT_CD', '', src['ACCT_CD']);
                await wait(DB_DELAY);
                ds.setColumn(newRowIdx, 'DR_CR_KCD', src['DR_CR_KCD']);
                console.log(`[${i + 1}세트 / row ${s + 1}] 완료`);
            }
        }

        alert(`완료! ${repeat}세트 × ${srcCount}행 = ${repeat * srcCount}행 추가됨`);
    }

    // ── 결의서 취소 (WIN10120101) ─────────────────────────

    function findBtnEtc1(root) {
        const stack = [root];
        const seen = new Set();
        while (stack.length) {
            const f = stack.pop();
            if (!f || seen.has(f)) continue;
            seen.add(f);
            const b = f.div_btnList?.form?.btn_etc1;
            if (b) return b;
            for (const c of toArray(f.components)) {
                if (c?.form) stack.push(c.form);
            }
        }
        return null;
    }

    function runDelete() {
        const nx = getNexacro();
        if (!nx) throw new Error('nexacro 객체를 찾을 수 없습니다.');
        const winForm = nx.getApplication()
            .mainframe.vframeset.hframeset
            .bodyframe.workframe[WIN_ACCT].form;
        const b = findBtnEtc1(winForm);
        if (!b) throw new Error('btn_etc1 버튼을 찾을 수 없습니다.');
        if (!confirm('결의서를 취소하시겠습니까?')) return;
        b.on_fire_onclick(b, new nx.ClickEventInfo(b, 'onclick'));
    }

    // ── 초과근무 기안 (WIN10110105) ───────────────────────

    async function runOT() {
        const RS  = '\x1E';
        const US  = '\x1F';
        const ETX = '\x03';

        const now = new Date();
        const pad = (n, l = 2) => String(n).padStart(l, '0');
        const T_NO =
            `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
            `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
            String(Date.now()).slice(-6);

        const nx     = getNexacro();
        const EMP_CD = nx.getApplication().gvs_emp_no;
        const app    = nx.getApplication();
        const work   = app.mainframe?.vframeset?.hframeset?.bodyframe?.workframe;

        const otFrame = work[WIN_OT];
        if (!otFrame?.form) return console.error("WIN_OT form not found");
        const form = otFrame.form;

        const masterDs = findComp(form, "ds_master", "Dataset");
        const detailDs = findComp(form, "ds_detail", "Dataset")
                      ?? (app["ds_detail"]?._type_name === "Dataset" ? app["ds_detail"] : null);

        if (!masterDs) return console.error("ds_master not found");
        if (!detailDs) return console.error("ds_detail not found");

        const rowCount = masterDs.getRowCount();
        if (rowCount <= 0) return console.error("masterDs rowCount = 0");

        console.log(`▶ 총 ${rowCount}명 처리 시작`);

        masterDs.set_rowposition(rowCount - 1);
        await wait(500);

        const allData = [];

        for (let r = 0; r < rowCount; r++) {
            const empNo   = masterDs.getColumn(r, "EMP_NO");
            const flnm    = masterDs.getColumn(r, "FLNM")      ?? "";
            const totTm   = masterDs.getColumn(r, "TOT_TM")    ?? "";
            const yyTotTm = masterDs.getColumn(r, "YY_TOT_TM") ?? "";

            console.log(`  [${r + 1}/${rowCount}] ${flnm}(${empNo}) 이동 중...`);

            masterDs.set_rowposition(r);
            await wait(CLICK_DELAY_MS);

            const rows = dsToRows(detailDs);
            console.log(`    → ${rows.length}건 수집`);

            rows.forEach(row => {
                row._EMP_NO      = empNo;
                row._MASTER_FLNM = flnm;
                row._TOT_TM      = totTm;
                row._YY_TOT_TM   = yyTotTm;
            });

            allData.push(...rows);
        }

        const seen = new Set();
        const deduped = allData.filter(row => {
            const key = `${row._EMP_NO}|${row.OV_YMD}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        console.log(`✅ 수집 완료: ${allData.length}건 → 중복제거 후 ${deduped.length}건`);

        function fmtTime(t) {
            if (!t || t === "0000") return "";
            const s = String(t).padStart(4, "0");
            return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
        }

        function fmtTm(t) {
            if (!t || t === "0000" || t === "") return "";
            const s = String(t).padStart(4, "0");
            return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
        }

        function buildPersonField(p) {
            const cols = [
                p.jbgd    || "",
                p.flnm    || "",
                p.totTm   || "",
                "",
                p.totTm   || "",
                p.yyTotTm || "",
            ];
            for (let d = 1; d <= 31; d++) cols.push(p.days[d] || "");
            return cols.join("|") + "|";
        }

        function buildEmptyPersonField() {
            return "|".repeat(37);
        }

        // M_DATA: 5명 고정 + 후미 패딩
        function buildBlockM(persons) {
            const rows = persons.map(buildPersonField);
            while (rows.length < 5) rows.push(buildEmptyPersonField());
            return rows.join("") + "|".repeat(104);
        }

        // ★ S_DATA: 1명씩 추가하면서 4096 초과 시 다음 VALUE로 넘김
        function buildChunksS(persons) {
            if (!persons.length) return [];
            const chunks = [];
            let current = "";
            for (const p of persons) {
                const field = buildPersonField(p);
                if (current.length + field.length > S_MAX_BYTES) {
                    // 현재 VALUE가 꽉 참 → 다음 VALUE로
                    chunks.push(current);
                    current = field;
                } else {
                    current += field;
                }
            }
            if (current) chunks.push(current);
            return chunks;
        }

        const personMap = new Map();
        for (const row of deduped) {
            const key = row._EMP_NO;
            if (!personMap.has(key)) {
                personMap.set(key, {
                    jbgd:    row.JBGD_CD      ?? "",
                    flnm:    row._MASTER_FLNM ?? "",
                    totTm:   fmtTm(row._TOT_TM),
                    yyTotTm: fmtTm(row._YY_TOT_TM),
                    days: {}
                });
            }
            const day = parseInt(String(row.OV_YMD).slice(-2), 10);
            if (!Number.isNaN(day) && day >= 1 && day <= 31) {
                personMap.get(key).days[day] = fmtTime(row.APLY_TM);
            }
        }

        const allPersons = Array.from(personMap.values());
        const mPersons   = allPersons.slice(0, 5);
        const sPersons   = allPersons.slice(5);

        console.log(`👥 총 대상 인원: ${allPersons.length}`);
        console.log("M 인원:", mPersons.map(v => `${v.flnm}(${v.totTm}/${v.yyTotTm})`));
        console.log("S 인원:", sPersons.map(v => `${v.flnm}(${v.totTm}/${v.yyTotTm})`));

        const M_DATA    = buildBlockM(mPersons);
        const rawChunks = buildChunksS(sPersons); // ★ 4096 기준 자동 분할
        const M_CNT     = "1";
        const S_CNT     = String(rawChunks.length); // ★ 실제 데이터 있는 VALUE 수

        console.log("M_CNT:", M_CNT, "S_CNT:", S_CNT);
        console.log("M_DATA 길이:", M_DATA.length);
        rawChunks.forEach((c, i) => {
            console.log(`S_DATA_VALUE${i + 1} 길이: ${c.length}`);
        });

        // ★ VALUE1~10 고정 헤더, 실데이터 이후는 ETX
        const sHeader = Array.from(
            { length: S_MAX_COLS },
            (_, i) => `S_DATA_VALUE${i + 1}:STRING(32)`
        ).join(US);

        const sValueArr = [...rawChunks];
        while (sValueArr.length < S_MAX_COLS) sValueArr.push(ETX);
        const sValues = sValueArr.join(US);

        const MISKEY = `ERP041${EMP_CD}${T_NO}`;

        const body =
            'SSV:utf-8' + RS +
            `nexacon=nexacroController.do&nbsp;method=execDml&nbsp;dbconn=10&nbsp;sqlId=faAccoRsltnAtrzE1_I&nbsp;forceSqlFlag=N` + RS +
            `FVS_USERID=${EMP_CD}&nbsp;FVS_CO_CD=01&nbsp;FVS_LANG=KR&nbsp;FVS_BPLC_CD=10&nbsp;` + RS +

            'Dataset:__DS_PARAM_INFO__' + RS +
            '_RowType_' + US +
            'nexacon:STRING(256)' + US + 'method:STRING(256)' + US + 'dbconn:STRING(256)' + US +
            'sqlId:STRING(256)' + US + 'forceSqlFlag:STRING(256)' + US +
            'FVS_USERID:STRING(256)' + US + 'FVS_CO_CD:STRING(256)' + US +
            'FVS_LANG:STRING(256)' + US + 'FVS_BPLC_CD:STRING(256)' + RS +
            'N' + US + 'nexacroController.do' + US + 'execDml' + US + '10' + US +
            'faAccoRsltnAtrzE1_I' + US + 'N N N N N N N N N N N' + US +
            EMP_CD + US + '01' + US + 'KR' + US + '10' + RS + RS +

            'Dataset:__DS_TRANS_INFO__' + RS +
            '_RowType_' + US + 'vs_svc_id:string(256)' + US + 'strURL:string(256)' + US +
            'strInDatasets:string(256)' + US + 'strOutDatasets:string(256)' + RS +
            'N' + US + 'gw_insert' + US + 'nexacroController.do?dbconn=10' + US +
            'input1' + US + ETX + RS + RS +

            'Dataset:input1' + RS +
            '_RowType_' + US +
            'T_NO:STRING(32)' + US + 'EMP_CD:STRING(32)' + US +
            'SYS_ID:STRING(32)' + US + 'DOC_ID:STRING(32)' + US + 'MISKEY:STRING(32)' + US +
            'M_CNT:BIGDECIMAL(16)' + US + 'S_CNT:BIGDECIMAL(16)' + US +
            'M_DATA_VALUE1:STRING(32)' + US +
            sHeader + US +
            'STATUS:STRING(32)' + US + 'IP:STRING(32)' + RS +

            'N' + US +
            T_NO + US + EMP_CD + US + 'ERP' + US + 'ERP041' + US + MISKEY + US +
            M_CNT + US + S_CNT + US +
            M_DATA + US +
            sValues + US +
            '0' + US + '127.0.0.1' + RS + RS;

        console.log("BODY 길이:", body.length);

        const res = await fetch(
            'http://10.10.1.20:8080/umca/nexacroController.do?dbconn=10',
            { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body, credentials: 'include' }
        );

        const text = await res.text();
        console.log("응답:", res.status);
        console.log(text.substring(0, 1000));

        if (res.status === 200) {
            const url = `http://10.10.11.20:80/jsp/call/UcheckSancData.jsp?T=${T_NO}&E=${EMP_CD}`;
            console.log("✅ 기안기 링크:", url);
            window.open(url);
        } else {
            alert("전송 실패: " + res.status);
        }
    }

    // ── 버튼 생성 ─────────────────────────────────────────

    const btnAcct = document.createElement('button');
    btnAcct.textContent = '행 복사 실행';
    btnAcct.style.cssText = `
        position: fixed; bottom: 30px; right: 30px; z-index: 99999;
        padding: 10px 18px; background: #1a6fd4; color: white;
        border: none; border-radius: 6px; font-size: 14px;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: none;
    `;
    btnAcct.addEventListener('click', () => {
        runAcct().catch(e => { console.error(e); alert('오류: ' + e.message); });
    });

    const btnOT = document.createElement('button');
    btnOT.textContent = '초과근무 기안';
    btnOT.style.cssText = `
        position: fixed; bottom: 30px; right: 160px; z-index: 99999;
        padding: 10px 18px; background: #d44a1a; color: white;
        border: none; border-radius: 6px; font-size: 14px;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: none;
    `;
    btnOT.addEventListener('click', () => {
        runOT().catch(e => { console.error(e); alert('오류: ' + e.message); });
    });

    const btnDel = document.createElement('button');
    btnDel.textContent = '결의서 취소';
    btnDel.style.cssText = `
        position: fixed; bottom: 30px; right: 160px; z-index: 99999;
        padding: 10px 18px; background: #c0392b; color: white;
        border: none; border-radius: 6px; font-size: 14px;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: none;
    `;
    btnDel.addEventListener('click', () => {
        try { runDelete(); } catch (e) { console.error(e); alert('오류: ' + e.message); }
    });

    const btnTrip = document.createElement('button');
    btnTrip.textContent = '초기화 대상';
    btnTrip.style.cssText = `
        position: fixed; bottom: 30px; right: 30px; z-index: 99999;
        padding: 10px 18px; background: #2e7d32; color: white;
        border: none; border-radius: 6px; font-size: 14px;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: none;
    `;
    btnTrip.addEventListener('click', () => {
        runTripReset().catch(e => { console.error(e); alert('오류: ' + e.message); });
    });

    document.body.appendChild(btnTrip);
    document.body.appendChild(btnAcct);
    document.body.appendChild(btnDel);
    document.body.appendChild(btnOT);

    // ── 출장복명서 초기화 대상 조회 (WIN10110107) ─────────

    const tripFiltered = new Set(); // 필터가 적용된 WIN ID
    let tripBusy = false;
    const TRIP_SEARCH_MIN_WAIT  = 800;
    const TRIP_SEARCH_POLL_MS   = 500;
    const TRIP_SEARCH_MAX_POLLS = 20;

    function getTripGrid(winId) {
        const nx = getNexacro();
        if (!nx) throw new Error('nexacro 객체를 찾을 수 없습니다.');
        const grid = nx.getApplication()
            .mainframe.vframeset.hframeset
            .bodyframe.workframe[winId]
            .form.div_base.form.div_work.form.grd_master;
        if (!grid) throw new Error('grd_master를 찾을 수 없습니다.');
        return grid;
    }

    function findGridColumn(grid, headText) {
        const n = grid.getCellCount('head');
        for (let i = 0; i < n; i++) {
            const t = String(grid.getCellProperty('head', i, 'text') ?? '').replace(/\s+/g, '');
            if (t === headText.replace(/\s+/g, '')) {
                const bind = String(grid.getCellProperty('body', i, 'text') ?? '');
                const m = bind.match(/^bind:(.+)$/);
                return { cell: i, col: m ? m[1] : null };
            }
        }
        return null;
    }

    function findSearchButton(root) {
        const stack = [root];
        const seen = new Set();
        while (stack.length) {
            const f = stack.pop();
            if (!f || seen.has(f)) continue;
            seen.add(f);
            for (const c of toArray(f.components)) {
                if (!c) continue;
                if (c._type_name === 'Button' &&
                    (/^btn_(query|search|sel|inq|srch)/i.test(c.id ?? '') || String(c.text ?? '').trim() === '조회')) {
                    return c;
                }
                if (c.form) stack.push(c.form);
            }
        }
        return null;
    }

    // 부서 조회 조건을 비우고 조회 후 데이터셋이 안정될 때까지 대기
    async function searchWithoutDept(winId, ds) {
        const workForm = getNexacro().getApplication()
            .mainframe.vframeset.hframeset
            .bodyframe.workframe[winId]
            .form.div_base.form.div_work.form;
        const edt = workForm.div_head?.form?.edt_dept_cd;
        if (!edt) return;

        if (String(edt.value ?? '') !== '') edt.set_value('');

        const winForm = getNexacro().getApplication()
            .mainframe.vframeset.hframeset
            .bodyframe.workframe[winId].form;
        const btn = winForm.div_btnList?.form?.btn_query ?? findSearchButton(winForm);
        if (!btn) throw new Error('조회 버튼을 찾을 수 없습니다.');
        btn.click();

        await wait(TRIP_SEARCH_MIN_WAIT);
        let last = -1;
        for (let i = 0; i < TRIP_SEARCH_MAX_POLLS; i++) {
            const cnt = ds.getRowCount();
            if (cnt === last) break;
            last = cnt;
            await wait(TRIP_SEARCH_POLL_MS);
        }
    }

    async function runTripReset() {
        const winId = getActiveWinId();
        if (!WIN_TRIPS.includes(winId)) throw new Error('지원하지 않는 화면입니다.');
        const grid = getTripGrid(winId);
        const ds   = grid.getBindDataset();
        if (!ds) throw new Error('조회 데이터셋을 찾을 수 없습니다.');

        if (tripFiltered.has(winId)) {
            ds.filter('');
            tripFiltered.delete(winId);
            btnTrip.textContent = '초기화 대상';
            return;
        }

        if (tripBusy) return;
        tripBusy = true;
        try {
            ds.filter('');
            await searchWithoutDept(winId, ds);
        } finally {
            tripBusy = false;
        }

        const send = findGridColumn(grid, '결재 전송여부');
        const step = findGridColumn(grid, '결재단계');
        if (!send?.col || !step?.col) throw new Error('결재 전송여부/결재단계 컬럼을 찾을 수 없습니다.');

        ds.filter('');
        const pairs = new Set();
        for (let r = 0; r < ds.getRowCount(); r++) {
            const sendRaw  = String(ds.getColumn(r, send.col) ?? '');
            const stepRaw  = String(ds.getColumn(r, step.col) ?? '');
            const sendText = String(grid.getCellText(r, send.cell) ?? '');
            const stepText = String(grid.getCellText(r, step.cell) ?? '');
            const sendOk = sendRaw === 'Y' || sendText === 'Y';
            const stepOk = stepRaw === '작성중' || stepText === '작성중';
            if (sendOk && stepOk) pairs.add(JSON.stringify([stepRaw, sendRaw]));
        }

        if (pairs.size === 0) {
            alert('초기화 대상이 없습니다. (결재단계 작성중 + 결재 전송여부 Y)');
            return;
        }

        const q = v => "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
        const expr = Array.from(pairs).map(p => {
            const [st, sd] = JSON.parse(p);
            return `(${step.col}==${q(st)} && ${send.col}==${q(sd)})`;
        }).join(' || ');
        ds.filter(expr);
        tripFiltered.add(winId);
        btnTrip.textContent = '전체 보기';
    }

    // ── 마이메뉴 첫 번째 폴더 자동 펼침 ───────────────────

    let myMenuExpanded = false;

    function expandFirstMyMenu() {
        if (myMenuExpanded) return;
        try {
            const nx = getNexacro();
            const grid = nx?.getApplication()
                .mainframe?.vframeset?.hframeset?.leftframe?.form
                ?.tab_menu?.tpg_mymenu?.form?.grd_myMenu;
            if (!grid || !(grid.getTreeRowCount?.() > 0 || grid.rowcount > 0)) return;
            if (grid.getTreeStatus(0) === 1 || grid.getTreeStatus(0) === true) {
                myMenuExpanded = true;
                return;
            }
            grid.setTreeStatus(0, true);
            myMenuExpanded = true;
        } catch (e) {}
    }

    // ── WIN ID 폴링 → 버튼 표시/숨김 ─────────────────────

    setInterval(() => {
        expandFirstMyMenu();
        const winId = getActiveWinId();
        btnAcct.style.display = winId === WIN_ACCT ? 'block' : 'none';
        btnDel.style.display  = winId === WIN_ACCT ? 'block' : 'none';
        btnOT.style.display   = winId === WIN_OT   ? 'block' : 'none';
        btnTrip.style.display = WIN_TRIPS.includes(winId) ? 'block' : 'none';
        if (WIN_TRIPS.includes(winId)) {
            btnTrip.textContent = tripFiltered.has(winId) ? '전체 보기' : '초기화 대상';
        }
    }, POLL_INTERVAL);

})();
