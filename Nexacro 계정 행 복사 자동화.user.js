// ==UserScript==
// @name         Nexacro 계정 행 복사 자동화
// @namespace    http://tampermonkey.net/
// @version      1.72
// @description  ds_acct 행을 사용자 입력 횟수만큼 복사
// @match        http://10.10.1.20:8080/umca/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/main/Nexacro%20%EA%B3%84%EC%A0%95%20%ED%96%89%20%EB%B3%B5%EC%82%AC%20%EC%9E%90%EB%8F%99%ED%99%94.user.js
// @downloadURL  https://raw.githubusercontent.com/rlatjdfkr7979-ctrl/UMCA_tampermonkey/main/Nexacro%20%EA%B3%84%EC%A0%95%20%ED%96%89%20%EB%B3%B5%EC%82%AC%20%EC%9E%90%EB%8F%99%ED%99%94.user.js
// ==/UserScript==

(function () {
    'use strict';

    const FRAME_KEYWORD = 'index.html';
    const WIN_ID        = 'WIN10120101';
    const ADD_DELAY     = 300;  // 추가 버튼 클릭 후 대기 (ms)
    const DB_DELAY      = 800;  // DB 조회 대기 (ms)

    function getNexacro() {
        const frame = Array.from(document.querySelectorAll('iframe'))
            .find(f => f.src.includes(FRAME_KEYWORD));
        return frame ? frame.contentWindow.nexacro : window.nexacro;
    }

    function getForm() {
        const nx = getNexacro();
        if (!nx) throw new Error('nexacro 객체를 찾을 수 없습니다.');
        return nx.getApplication()
            .mainframe.vframeset.hframeset
            .bodyframe.workframe[WIN_ID]
            .form.div_base.form.div_work.form;
    }

    function readAllRows(ds) {
        const cols = [];
        for (let i = 0; i < ds.getColCount(); i++) {
            cols.push(ds.getColID(i));
        }
        const rows = [];
        for (let r = 0; r < ds.getRowCount(); r++) {
            const row = {};
            cols.forEach(col => { row[col] = ds.getColumn(r, col); });
            rows.push(row);
        }
        // 딥카피로 고정 - 이후 ds 변경에 영향받지 않음
        return JSON.parse(JSON.stringify(rows));
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function clickAdd(form) {
        return new Promise(resolve => {
            form.btn_acct_add.click();
            setTimeout(resolve, ADD_DELAY);
        });
    }

    async function run() {
        const form = getForm();
        const ds   = form.ds_acct;

        // 1. 현재 표 데이터 딥카피로 고정
        const sourceRows = readAllRows(ds);
        const srcCount   = sourceRows.length;

        if (srcCount === 0) {
            alert('복사할 행이 없습니다.');
            return;
        }

        console.log(`원본 행 수: ${srcCount}`, sourceRows);

        // 2. 사용자 입력
        const input = prompt(
            `현재 행 ${srcCount}개를 읽었습니다.\n몇 세트 복사할까요? (숫자 입력)`
        );
        const repeat = parseInt(input, 10);

        if (isNaN(repeat) || repeat <= 0) {
            alert('올바른 숫자를 입력해주세요.');
            return;
        }

        // 3. 반복 복사
        for (let i = 0; i < repeat; i++) {
            console.log(`=== ${i + 1}세트 시작 ===`);

            for (let s = 0; s < srcCount; s++) {
                const src = sourceRows[s]; // 딥카피된 원본에서 읽음

                // 추가 버튼 클릭 → 새 행 생성 대기
                await clickAdd(form);

                const newRowIdx = ds.getRowCount() - 1;

                // ACCT_CD 넣고 oncolumnchanged로 DB 조회 트리거
                ds.setColumn(newRowIdx, 'ACCT_CD', src['ACCT_CD']);
                ds.oncolumnchanged.fireEvent(ds, newRowIdx, 'ACCT_CD', '', src['ACCT_CD']);

                // DB 조회 완료 대기
                await wait(DB_DELAY);

                // DR_CR_KCD 넣기 (DB 조회 후 덮어쓰기)
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

    // ── UI 버튼 삽입 ──────────────────────────────────────
    const btn = document.createElement('button');
    btn.textContent = '행 복사 실행';
    btn.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        z-index: 99999;
        padding: 10px 18px;
        background: #1a6fd4;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    btn.addEventListener('click', () => {
        run().catch(e => {
            console.error(e);
            alert('오류: ' + e.message);
        });
    });
    document.body.appendChild(btn);

})();
