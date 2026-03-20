// ==UserScript==
// @name         보상계약 리포트 생성
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  ds_master 선택 행 기준으로 리포트 payload 생성 및 전송
// @author       김성락
// @match        http://10.10.1.20:8080/umca/*
// @grant        none
// @updateURL    https://github.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/raw/refs/heads/main/%EB%B3%B4%EC%83%81%EA%B3%84%EC%95%BD%20%EB%A6%AC%ED%8F%AC%ED%8A%B8%20%EC%83%9D%EC%84%B1.user.js
// @downloadURL  https://github.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/raw/refs/heads/main/%EB%B3%B4%EC%83%81%EA%B3%84%EC%95%BD%20%EB%A6%AC%ED%8F%AC%ED%8A%B8%20%EC%83%9D%EC%84%B1.user.js
// ==/UserScript==

(function () {
  'use strict';

  const FRAME_KEYWORD = 'index.html';

  function getNexacro() {
    const frame = Array.from(document.querySelectorAll('iframe'))
      .find(f => f.src.includes(FRAME_KEYWORD));
    return frame ? frame.contentWindow.nexacro : window.nexacro;
  }

  // ── 버튼 생성 ──────────────────────────────────────────
  const btn = document.createElement('button');
  btn.textContent = '리포트 생성';
  btn.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    z-index: 99999;
    padding: 10px 18px;
    background: #1a6fc4;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(btn);

  btn.addEventListener('click', () => {
    run().catch(e => {
      console.error(e);
      alert('오류: ' + e.message);
    });
  });

  // ── 숫자 유틸 ──────────────────────────────────────────
  function formatNumber(n) {
    return Number(n).toLocaleString('ko-KR');
  }

  function toKoreanNumber(n) {
    const units = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const bigUnits = ['', '만', '억', '조'];
    let num = Number(n);
    if (num === 0) return '영';
    let result = '';
    let bigIdx = 0;
    while (num > 0) {
      const chunk = num % 10000;
      if (chunk > 0) {
        let chunkStr = '';
        const thousands = Math.floor(chunk / 1000);
        const hundreds  = Math.floor((chunk % 1000) / 100);
        const tens      = Math.floor((chunk % 100) / 10);
        const ones      = chunk % 10;
        if (thousands) chunkStr += (thousands === 1 ? '천' : units[thousands] + '천');
        if (hundreds)  chunkStr += (hundreds  === 1 ? '백' : units[hundreds]  + '백');
        if (tens)      chunkStr += (tens      === 1 ? '십' : units[tens]      + '십');
        if (ones)      chunkStr += units[ones];
        result = chunkStr + bigUnits[bigIdx] + result;
      }
      num = Math.floor(num / 10000);
      bigIdx++;
    }
    return result;
  }

  // ── 공통 유틸 ──────────────────────────────────────────
  function toArray(listLike) {
    if (!listLike) return [];
    if (Array.isArray(listLike)) return listLike;
    if (typeof listLike.length === "number") {
      const a = []; for (let i = 0; i < listLike.length; i++) a.push(listLike[i]); return a;
    }
    if (typeof listLike.getCount === "function" && typeof listLike.getItem === "function") {
      const a = []; for (let i = 0; i < listLike.getCount(); i++) a.push(listLike.getItem(i)); return a;
    }
    return [];
  }

  function findDataset(f, id) {
    if (!f) return null;
    if (f[id]?._type_name === "Dataset") return f[id];
    const objs = toArray(f.objects);
    for (const o of objs)
      if (o?._type_name === "Dataset" && (o.id === id || o.name === id)) return o;
    const comps = toArray(f.components);
    for (const c of comps) {
      if (c?.form) { const found = findDataset(c.form, id); if (found) return found; }
    }
    return null;
  }

  function findGrid(f, id) {
    if (!f) return null;
    if (f[id]) return f[id];
    const comps = toArray(f.components);
    for (const c of comps) {
      if (c?.id === id) return c;
      if (c?.form) { const found = findGrid(c.form, id); if (found) return found; }
    }
    return null;
  }

  // ── 메인 ──────────────────────────────────────────────
  async function run() {
    const RS = '\x1E';
    const US = '\x1F';
    const ETX = '\x03';
    const now = new Date();
    const pad = (n, l=2) => String(n).padStart(l, '0');
    const T_NO =
      `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
      String(Date.now()).slice(-6);

    const nexacro = getNexacro();
    if (!nexacro) throw new Error('nexacro 객체를 찾을 수 없습니다.');

    const EMP_CD = nexacro.getApplication().gvs_emp_no;
    const app = nexacro.getApplication();
    const work = app.mainframe?.vframeset?.hframeset?.bodyframe?.workframe;
    let form = null;
    for (const k in work) {
      if (work[k]?.form) { form = work[k].form; break; }
    }
    if (!form) throw new Error("form not found");

    // ── ds_master ───────────────────────────────────────
    const dsMaster = findDataset(form, "ds_master") ?? (app["ds_master"]?._type_name === "Dataset" ? app["ds_master"] : null);
    if (!dsMaster) throw new Error("ds_master not found");

    const grid = findGrid(form, "grd_master");
    if (!grid) throw new Error("grd_master not found");

    const focusedRow = grid.currentrow ?? -1;
    if (focusedRow < 0) { alert("선택된 행이 없습니다."); return; }

    const smmtRaw = dsMaster.getColumn(focusedRow, "SMMT")?.hi ?? 0;
    const smmtKo  = toKoreanNumber(smmtRaw);
    const smmtNum = formatNumber(smmtRaw);

    // ── ds_item ─────────────────────────────────────────
    const dsItem = findDataset(form, "ds_item") ?? (app["ds_item"]?._type_name === "Dataset" ? app["ds_item"] : null);
    if (!dsItem) throw new Error("ds_item not found");

    const itemRows = [];
    for (let r = 0; r < Math.min(dsItem.getRowCount(), 5); r++) {
      const tsfArea = dsItem.getColumn(r, "TNSF_AREA")?.hi ?? "";
      const dcsnAmt = dsItem.getColumn(r, "DCSN_AMT")?.hi  ?? "";
      const cols = [
        dsItem.getColumn(r, "CE_THING_SE_NM") ?? "",
        dsItem.getColumn(r, "SG_NM")          ?? "",
        dsItem.getColumn(r, "D_NM")           ?? "",
        dsItem.getColumn(r, "TNSF_LOTNO")     ?? "",
        "",
        dsItem.getColumn(r, "LDCG_NM")        ?? "",
        tsfArea !== "" ? formatNumber(tsfArea) : "",
        "",
        dcsnAmt !== "" ? formatNumber(dcsnAmt) : "",
        "",
        "",
        "",
      ];
      itemRows.push(cols.join("|"));
    }

    while (itemRows.length < 5) {
      itemRows.push("|||||||||||");
    }

    // ── ds_report ───────────────────────────────────────
    const dsReport = findDataset(form, "ds_report") ?? (app["ds_report"]?._type_name === "Dataset" ? app["ds_report"] : null);
    if (!dsReport) throw new Error("ds_report not found");

    const bAddr  = dsReport.getColumn(0, "B_ADDR")     ?? "";
    const bCnpt  = dsReport.getColumn(0, "B_CNPT_NM")  ?? "";
    const bRprsv = dsReport.getColumn(0, "B_RPRSV_NM") ?? "";

    // ── M_DATA 조립 ─────────────────────────────────────
    const M_DATA =
      smmtKo +
      "|" + smmtNum +
      "|" + itemRows.join("|") +
      "|" + bAddr + "|" + bCnpt + "|" + bRprsv +
      "|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||" +
      US +
      "|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||";

    // ── body 조립 ───────────────────────────────────────
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
      'N' + US +
      'nexacroController.do' + US + 'execDml' + US + 'hraddworkaplygw_I' + US +
      '1' + US + '10' + US + 'N N N N N N N N N N N' + US +
      EMP_CD + US + '01' + US + 'KR' + US + '10' + RS + RS +
      'Dataset:__DS_TRANS_INFO__' + RS +
      '_RowType_' + US + 'vs_svc_id:string(256)' + US + 'strURL:string(256)' + US +
      'strInDatasets:string(256)' + US + 'strOutDatasets:string(256)' + RS +
      'N' + US + 'GW_INSERT' + US + 'nexacroController.do?dbconn=10' + US + 'input1' + US +
      ETX + RS + RS +
      'Dataset:input1' + RS +
      '_RowType_' + US +
      'CO_CD:STRING(32)' + US + 'BPLC_CD:STRING(32)' + US +
      'OV_SEQ1:STRING(32)' + US + 'OV_SEQ2:STRING(32)' + US +
      'T_NO:STRING(32)' + US + 'EMP_CD:STRING(32)' + US +
      'SYS_ID:STRING(32)' + US + 'DOC_ID:STRING(32)' + US +
      'MISKEY:STRING(32)' + US + 'M_CNT:BIGDECIMAL(16)' + US +
      'S_CNT:BIGDECIMAL(16)' + US + 'M_DATA_VALUE1:STRING(32)' + US +
      'S_DATA_VALUE1:STRING(32)' + US + 'STATUS:STRING(32)' + US +
      'IP:STRING(32)' + RS +
      'N' + US +
      '01' + US + '10' + US +
      `,${T_NO}` + US +
      ETX + US +
      T_NO + US +
      EMP_CD + US +
      'ERP' + US + 'ERP040' + US +
      `ERP0110110,${T_NO}` + US +
      '1' + US + '0' + US +
      M_DATA + US +
      '0' + US +
      '127.0.0.1' + RS + RS;

    console.log('BODY 길이:', body.length);
    console.log('M_DATA 미리보기:', M_DATA.slice(0, 400));

    const res = await fetch(
      'http://10.10.1.20:8080/umca/nexacroController.do?dbconn=10',
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body,
        credentials: 'include'
      }
    );
    const text = await res.text();
    console.log('응답:', res.status);
    console.log(text.substring(0, 500));

    if (res.status === 200) {
      window.open(`http://10.10.11.20:80/jsp/call/UcheckSancData.jsp?T=${T_NO}&E=${EMP_CD}`);
    } else {
      alert('전송 실패: ' + res.status);
    }
  }

})();
