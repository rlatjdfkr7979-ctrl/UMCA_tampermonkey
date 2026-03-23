// ==UserScript==
// @name         Nexacro 계정 행 복사 자동화
// @namespace    http://tampermonkey.net/
// @version      1.73
// @description  ds_acct 행 복사 + 초과근무 기안 자동화
// @match        http://10.10.1.20:8080/umca/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/main/Nexacro%20%EA%B3%84%EC%A0%95%20%ED%96%89%20%EB%B3%B5%EC%82%AC%20%EC%9E%90%EB%8F%99%ED%99%94.user.js
// ==/UserScript==

(function () {
    'use strict';

    const FRAME_KEYWORD  = 'index.html';
    const WIN_ACCT       = 'WIN10120101'; // 행 복사
    const WIN_OT         = 'WIN10110105'; // 초과근무 기안
    const ADD_DELAY      = 300;
    const DB_DELAY       = 800;
    const CLICK_DELAY_MS = 1500;
    const POLL_INTERVAL  = 1000; // WIN ID 감지 주기 (ms)

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
            for (const k in workframe) {
                if (workframe[k]?.form) return k;
            }
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

        console.log(`원본 행 수: ${srcCount}`, sourceRows);

        const input = prompt(`현재 행 ${srcCount}개를 읽었습니다.\n몇 세트 복사할까요? (숫자 입력)`);
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
                console.log(`[${i + 1}세트 / row ${s + 1}] 완료`, {
                    newRowIdx,
                    ACCT_CD:   src['ACCT_CD'],
                    DR_CR_KCD: src['DR_CR_KCD'],
                });
            }
        }

        alert(`완료! ${repeat}세트 × ${srcCount}행 = ${repeat * srcCount}행 추가됨`);
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

        let form = null;
        for (const k in work) {
            if (work[k]?.form) { form = work[k].form; break; }
        }
        if (!form) return console.error("form not found");

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

            console.log(`  [${r + 1}/${rowCount}] ${flnm}(${empNo}) TOT_TM:${totTm} YY_TOT_TM:${yyTotTm} 이동 중...`);

            masterDs.set_rowposition(r);
            await wait(CLICK_DELAY_MS);

            const rows = dsToRows(detailDs);
            const detailFlnm = rows[0]?.FLNM ?? "(없음)";
            console.log(`    → ${rows.length}건 수집 / ds_detail 첫행 FLNM: ${detailFlnm} (기대: ${flnm})`);

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
            if (!t || t === "0000") return " ";
            const s = String(t).padStart(4, "0");
            return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
        }

        function fmtTm(t) {
            if (!t || t === "0000" || t === "") return " ";
            const s = String(t).padStart(4, "0");
            return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
        }

        function buildPersonField(p) {
            const cols = [
                p.jbgd    || " ",
                p.flnm    || " ",
                p.totTm   || " ",
                " ",
                p.totTm   || " ",
                p.yyTotTm || " ",
            ];
            for (let d = 1; d <= 31; d++) cols.push(p.days[d] || " ");
            return cols.join("|") + "|";
        }

        function buildEmptyPersonField() {
            return (" |").repeat(37);
        }

        function buildBlockM(persons) {
            const rows = persons.map(buildPersonField);
            while (rows.length < 5) rows.push(buildEmptyPersonField());
            return rows.join("") + "|".repeat(104);
        }

        function buildBlockS(persons) {
            if (!persons.length) return "";
            return persons.map(buildPersonField).join("");
        }

        const personMap = new Map();
        for (const row of deduped) {
            const key = row._EMP_NO;
            if (!personMap.has(key)) {
                personMap.set(key, {
                    jbgd:    row.JBGD_CD        ?? "",
                    flnm:    row._MASTER_FLNM   ?? "",
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

        const M_DATA = buildBlockM(mPersons);
        const S_DATA = buildBlockS(sPersons);
        const M_CNT  = "1";
        const S_CNT  = sPersons.length > 0 ? "1" : "0";

        console.log("M_CNT:", M_CNT, "S_CNT:", S_CNT);
        console.log("M_DATA 길이:", M_DATA.length);
        console.log("S_DATA 길이:", S_DATA.length, "파이프수:", (S_DATA.match(/\|/g) || []).length);

        const body =
            'SSV:utf-8' + RS +
            'nexacon=nexacroController.do&nbsp;method=execDml&nbsp;sqlId=hraddworkaplygw_I&nbsp;arg_tag=1&nbsp;dbconn=10&nbsp;forceSqlFlag=N' + RS +
            `FVS_USERID=${EMP_CD}&nbsp;FVS_CO_CD=01&nbsp;FVS_LANG=KR&nbsp;FVS_BPLC_CD=10&nbsp;` + RS +
            'Dataset:__DS_PARAM_INFO__' + RS +
            '_RowType_' + US +
            'nexacon:STRING(256)' + US + 'method:STRING(256)' + US + 'sqlId:STRING(256)' + US +
            'arg_tag:STRING(256)' + US + 'dbconn:STRING(256)' + US + 'forceSqlFlag:STRING(256)' + US +
            'FVS_USERID:STRING(256)' + US + 'FVS_CO_CD:STRING(256)' + US +
            'FVS_LANG:STRING(256)' + US + 'FVS_BPLC_CD:STRING(256)' + RS +
            'N' + US + 'nexacroController.do' + US + 'execDml' + US + 'hraddworkaplygw_I' + US +
            '1' + US + '10' + US + 'N' + US + EMP_CD + US + '01' + US + 'KR' + US + '10' + RS + RS +
            'Dataset:__DS_TRANS_INFO__' + RS +
            '_RowType_' + US + 'vs_svc_id:string(256)' + US + 'strURL:string(256)' + US +
            'strInDatasets:string(256)' + US + 'strOutDatasets:string(256)' + RS +
            'N' + US + 'GW_INSERT' + US + 'nexacroController.do?dbconn=10' + US + 'input1' + US + ETX + RS + RS +
            'Dataset:input1' + RS +
            '_RowType_' + US + 'T_NO:STRING(32)' + US + 'EMP_CD:STRING(32)' + US +
            'SYS_ID:STRING(32)' + US + 'DOC_ID:STRING(32)' + US + 'MISKEY:STRING(32)' + US +
            'M_CNT:BIGDECIMAL(16)' + US + 'S_CNT:BIGDECIMAL(16)' + US +
            'M_DATA_VALUE1:STRING(32)' + US + 'S_DATA_VALUE1:STRING(32)' + US +
            'STATUS:STRING(32)' + US + 'IP:STRING(32)' + RS +
            'N' + US + T_NO + US + EMP_CD + US + 'ERP' + US + 'ERP041' + US +
            `ERP0110110,${T_NO}` + US + M_CNT + US + S_CNT + US +
            M_DATA + US + S_DATA + US + '0' + US + '127.0.0.1' + RS + RS;

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

    document.body.appendChild(btnAcct);
    document.body.appendChild(btnOT);

    // ── WIN ID 폴링 → 버튼 표시/숨김 ─────────────────────

    setInterval(() => {
        const winId = getActiveWinId();
        btnAcct.style.display = winId === WIN_ACCT ? 'block' : 'none';
        btnOT.style.display   = winId === WIN_OT   ? 'block' : 'none';
    }, POLL_INTERVAL);

})();
