/* Таблица оценки сайта тестерами: листы «Тестер 1…5» (оценки /10 + 10 открытий каждого кейса) и «Итоги» (средние по всем).
   Запуск из корня проекта: node tools/rating-sheet.js  →  RUSH_CASE_оценка_сайта.xlsx (импорт в Google Таблицы: Файл → Импорт → Загрузка → «Заменить таблицу»)
   Кейсы — как на сайте (без бонусных за R-COIN); при новых кейсах поправить CASES ниже и пересобрать. */
const path = require('path');
const ExcelJS = require(path.join(__dirname, '..', 'promo-video', 'node_modules', 'exceljs'));
const OUT = path.join(__dirname, '..', 'RUSH_CASE_оценка_сайта.xlsx');
const TESTERS = 5, OPENS = 10, LIST = 10; // листов-тестеров, открытий на кейс, строк в списке тестеров на «Итогах»
const CRIT = [
  ['Дизайн', 'Внешний вид, стиль, единое оформление, картинки кейсов'],
  ['Удобство', 'Легко ли найти нужное, понятно ли меню и кнопки'],
  ['Доступность', 'Цены кейсов, минимальное пополнение, можно ли играть с маленьким бюджетом'],
  ['Разнообразие', 'Сколько разных кейсов, режимов и механик'],
  ['Наполнение кейсов', 'Интересные ли предметы, есть ли ради чего открывать'],
  ['Открытие кейса', 'Анимация рулетки, эмоции, звук'],
  ['Скорость сайта', 'Как быстро грузятся страницы и картинки'],
  ['Мобильная версия', 'Удобно ли пользоваться с телефона'],
  ['Регистрация и вход', 'Быстро ли и понятно, вход через Steam'],
  ['Пополнение и вывод', 'Понятно ли, как пополнить баланс и вывести скин'],
  ['Бонусы', 'Ежедневный бонус, промокоды, R-COIN'],
  ['Апгрейд', 'Понятность, интерес, ощущение честного шанса'],
  ['Контракты', 'Понятность, интерес, подпись контракта'],
  ['Турниры', 'Команды, регистрация, понятность правил'],
  ['Честность и доверие', 'Веришь ли, что всё честно; документы, поддержка'],
  ['Желание вернуться', 'Захочется ли зайти завтра'],
];
const CASES = [
  ['Популярные кейсы', [['Сифон и Борода', 29], ['Оранж', 379], ['Сладкая вата', 819], ['Альтушка', 169], ['DRIP', 59], ['RUSH CASE', 199]]],
  ['Про игроки', [['Zont1x ❤', 169], ['Жаб Жабыч', 245], ['S1MPLE PRIME', 322], ['DONK666', 666]]],
  ['Оружейные кейсы', [['USP-S', 249], ['M4A1-S', 299], ['DEAGLE', 299], ['AK-47', 349], ['M4A4', 349], ['AWP', 499]]],
  ['Фарм кейсы', [['ЛОВИ АПТЕЧКУ', 15], ['CO-CO', 60]]],
  ['Всё или ничего', [['Premium', 3549], ['KARAMBIT', 39999], ['БАБА ЧАЙ', 89999]]],
  ['Перчатки и агенты', [['AGENTS', 499], ['ELITE GLOVES', 3999]]],
  ['Bingo, bango, bongo', [['THIS IS REAL LIFE', 149], ['RUSH B', 249], ['CRY LIKE BABIES', 399]]],
  ['CLUTCH', [['1vs5', 249]]],
  ['Кейсы карт', [['MIRAGE', 149]]],
].flatMap(([b, l]) => l.map(([n, p]) => [b, n, p]));

const GOLD = 'FFF5C76B', DARK = 'FF1B1A17', INPUT = 'FFFFF7D6', HEAD = 'FF2B2722', WHITE = 'FFFFFFFF', GREEN = 'FFD9F7DF', RED = 'FFFCDCDC';
const RUB = '#,##0 "₽"', PCT = '0.0%';
const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
const thin = { style: 'thin', color: { argb: 'FFD8D2C4' } }, box = { top: thin, left: thin, bottom: thin, right: thin };
const col = n => { let s = ''; for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }; // 0 → A

// координаты на листе тестера (их же читает «Итоги»)
const C0 = 7, CN = C0 + CRIT.length - 1, SCORE = CN + 2;                // оценки D7:D22, итог D24
const K_HEAD = SCORE + 5, K0 = K_HEAD + 1, KN = K0 + CASES.length - 1, KT = KN + 1; // кейсы
const D0 = 3, DN = D0 + OPENS - 1;                                       // открытия: колонки D…M (индексы 3…12)
const cN = DN + 1, cSpent = DN + 2, cWon = DN + 3, cRtp = DN + 4, cRes = DN + 5, cCom = DN + 6;

function testerSheet(wb, idx) {
  const ws = wb.addWorksheet(`Тестер ${idx}`, { properties: { tabColor: { argb: GOLD } }, views: [{ state: 'frozen', ySplit: 0 }] });
  ws.columns = [{ width: 22 }, { width: 24 }, { width: 46 }, ...Array.from({ length: OPENS }, () => ({ width: 9 })), { width: 9 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 30 }];
  ws.mergeCells('A1:S1'); Object.assign(ws.getCell('A1'), { value: 'RUSH CASE — оценка сайта', font: { bold: true, size: 18, color: { argb: GOLD } }, fill: fill(DARK), alignment: { vertical: 'middle' } }); ws.getRow(1).height = 34;
  ws.getCell('A2').value = 'Жёлтые ячейки — заполняете вы. Остальное считается само.'; ws.getCell('A2').font = { italic: true, color: { argb: 'FF7A7466' } };
  [['A3', 'Имя / ник', 'B3'], ['C3', 'Дата теста', 'D3'], ['E3', 'Устройство', 'F3']].forEach(([l, t, v]) => {
    Object.assign(ws.getCell(l), { value: t, font: { bold: true } }); Object.assign(ws.getCell(v), { fill: fill(INPUT), border: box });
  });
  ws.mergeCells('F3:H3'); ws.getCell('F3').dataValidation = { type: 'list', allowBlank: true, formulae: ['"Компьютер,Телефон,Планшет"'] };
  ws.getCell('D3').numFmt = 'dd.mm.yyyy';
  // 1) оценки
  ws.mergeCells(`A5:F5`); Object.assign(ws.getCell('A5'), { value: '1. ОЦЕНКА САЙТА — каждая оценка от 0 до 10', font: { bold: true, size: 13, color: { argb: WHITE } }, fill: fill(HEAD) });
  ['№', 'Критерий', 'Что оценивать', 'Оценка /10', 'Комментарий'].forEach((t, j) => Object.assign(ws.getCell(6, j + 1), { value: t, font: { bold: true }, fill: fill('FFEDE6D3'), border: box }));
  ws.mergeCells('E6:I6');
  CRIT.forEach(([n, h], i) => {
    const r = C0 + i;
    ws.getCell(r, 1).value = i + 1; ws.getCell(r, 2).value = n; ws.getCell(r, 2).font = { bold: true }; ws.getCell(r, 3).value = h; ws.getCell(r, 3).font = { color: { argb: 'FF6B6558' } };
    const s = ws.getCell(r, 4); Object.assign(s, { fill: fill(INPUT), alignment: { horizontal: 'center' }, font: { bold: true, size: 12 } });
    s.dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, showErrorMessage: true, errorTitle: 'Оценка от 0 до 10', error: 'Введите число от 0 до 10', formulae: [0, 10] };
    ws.mergeCells(r, 5, r, 9); ws.getCell(r, 5).fill = fill(INPUT);
    for (let j = 1; j <= 9; j++) ws.getCell(r, j).border = box;
  });
  const sc = ws.getCell(SCORE, 4);
  ws.getCell(SCORE, 2).value = 'ОБЩАЯ ОЦЕНКА'; ws.getCell(SCORE, 2).font = { bold: true, size: 14 };
  sc.value = { formula: `IF(COUNT(D${C0}:D${CN})=0,"",ROUND(AVERAGE(D${C0}:D${CN}),1))` }; Object.assign(sc, { font: { bold: true, size: 16 }, alignment: { horizontal: 'center' }, border: box, fill: fill('FFFFE9A8') });
  ws.getCell(SCORE, 3).value = { formula: `IF(D${SCORE}="","",IF(D${SCORE}>=9,"Отлично",IF(D${SCORE}>=7,"Хорошо",IF(D${SCORE}>=5,"Средне","Плохо"))))` }; ws.getCell(SCORE, 3).font = { bold: true, size: 13 }; ws.getCell(SCORE, 3).alignment = { horizontal: 'right' };
  ws.getCell(SCORE + 1, 2).value = 'Заполнено оценок'; ws.getCell(SCORE + 1, 4).value = { formula: `COUNT(D${C0}:D${CN})&" из ${CRIT.length}"` }; ws.getCell(SCORE + 1, 4).alignment = { horizontal: 'center' };
  // 2) кейсы
  ws.mergeCells(K_HEAD - 1, 1, K_HEAD - 1, cCom + 1);
  Object.assign(ws.getCell(K_HEAD - 1, 1), { value: `2. ОТКРЫТИЕ КЕЙСОВ — в ячейки 1…${OPENS} впишите стоимость выпавшего предмета, ₽ (сколько открыли — столько и заполните)`, font: { bold: true, size: 13, color: { argb: WHITE } }, fill: fill(HEAD) });
  ['Раздел', 'Кейс', 'Цена открытия', ...Array.from({ length: OPENS }, (_, i) => String(i + 1)), 'Открыто', 'Потрачено', 'Выпало', 'Окупаемость', 'Итог для клиента', 'Комментарий']
    .forEach((t, j) => Object.assign(ws.getCell(K_HEAD, j + 1), { value: t, font: { bold: true }, fill: fill('FFEDE6D3'), border: box, alignment: { horizontal: 'center', wrapText: true } }));
  ws.getRow(K_HEAD).height = 30;
  CASES.forEach(([b, n, p], i) => {
    const r = K0 + i, L = col(D0), R = col(DN);
    ws.getCell(r, 1).value = b; ws.getCell(r, 1).font = { color: { argb: 'FF6B6558' } };
    ws.getCell(r, 2).value = n; ws.getCell(r, 2).font = { bold: true };
    Object.assign(ws.getCell(r, 3), { value: p, numFmt: RUB });
    for (let j = D0; j <= DN; j++) Object.assign(ws.getCell(r, j + 1), { fill: fill(INPUT), numFmt: '#,##0.##', dataValidation: { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, showErrorMessage: true, error: 'Стоимость дропа — число, ₽', formulae: [0] } });
    ws.getCell(r, cN + 1).value = { formula: `COUNT(${L}${r}:${R}${r})` };
    Object.assign(ws.getCell(r, cSpent + 1), { value: { formula: `C${r}*${col(cN)}${r}` }, numFmt: RUB });
    Object.assign(ws.getCell(r, cWon + 1), { value: { formula: `SUM(${L}${r}:${R}${r})` }, numFmt: RUB });
    Object.assign(ws.getCell(r, cRtp + 1), { value: { formula: `IF(${col(cSpent)}${r}>0,${col(cWon)}${r}/${col(cSpent)}${r},"")` }, numFmt: PCT });
    Object.assign(ws.getCell(r, cRes + 1), { value: { formula: `IF(${col(cN)}${r}>0,${col(cWon)}${r}-${col(cSpent)}${r},"")` }, numFmt: '+#,##0 "₽";-#,##0 "₽";0 "₽"' });
    ws.getCell(r, cCom + 1).fill = fill(INPUT);
    for (let j = 0; j <= cCom; j++) ws.getCell(r, j + 1).border = box;
  });
  // итого по кейсам
  const t = KT, sumC = c => ({ formula: `SUM(${col(c)}${K0}:${col(c)}${KN})` });
  ws.getCell(t, 2).value = 'ИТОГО';
  ws.getCell(t, cN + 1).value = sumC(cN);
  Object.assign(ws.getCell(t, cSpent + 1), { value: sumC(cSpent), numFmt: RUB });
  Object.assign(ws.getCell(t, cWon + 1), { value: sumC(cWon), numFmt: RUB });
  Object.assign(ws.getCell(t, cRtp + 1), { value: { formula: `IF(${col(cSpent)}${t}>0,${col(cWon)}${t}/${col(cSpent)}${t},"")` }, numFmt: PCT });
  Object.assign(ws.getCell(t, cRes + 1), { value: { formula: `${col(cWon)}${t}-${col(cSpent)}${t}` }, numFmt: '+#,##0 "₽";-#,##0 "₽";0 "₽"' });
  for (let j = 0; j <= cCom; j++) Object.assign(ws.getCell(t, j + 1), { font: { bold: true, size: 12 }, fill: fill('FFFFE9A8'), border: box });
  // выводы для клиента
  const s0 = t + 2, lab = (r, txt) => { ws.getCell(r, 2).value = txt; ws.getCell(r, 2).font = { bold: true, size: 12 }; ws.mergeCells(r, 2, r, 3); };
  lab(s0, 'Окупаемость для клиента'); Object.assign(ws.getCell(s0, 4), { value: { formula: `IF(${col(cSpent)}${t}>0,${col(cWon)}${t}/${col(cSpent)}${t},"")` }, numFmt: PCT });
  lab(s0 + 1, 'Клиент в минусе на, ₽'); Object.assign(ws.getCell(s0 + 1, 4), { value: { formula: `MAX(0,${col(cSpent)}${t}-${col(cWon)}${t})` }, numFmt: RUB });
  lab(s0 + 2, 'Клиент в минусе на, %'); Object.assign(ws.getCell(s0 + 2, 4), { value: { formula: `IF(${col(cSpent)}${t}>0,MAX(0,1-${col(cWon)}${t}/${col(cSpent)}${t}),"")` }, numFmt: PCT });
  lab(s0 + 3, 'Клиент в плюсе на, ₽'); Object.assign(ws.getCell(s0 + 3, 4), { value: { formula: `MAX(0,${col(cWon)}${t}-${col(cSpent)}${t})` }, numFmt: RUB });
  for (let r = s0; r <= s0 + 3; r++) { ws.mergeCells(r, 4, r, 5); Object.assign(ws.getCell(r, 4), { font: { bold: true, size: 12 }, border: box, alignment: { horizontal: 'center' } }); }
  // подсветка: окупаемость ниже 100% — красным, от 100% — зелёным
  const rtpRef = `${col(cRtp)}${K0}:${col(cRtp)}${KT}`, resRef = `${col(cRes)}${K0}:${col(cRes)}${KT}`;
  ws.addConditionalFormatting({ ref: rtpRef, rules: [
    { type: 'cellIs', operator: 'lessThan', formulae: [1], style: { fill: fill(RED), font: { color: { argb: 'FFB91C1C' }, bold: true } } },
    { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [1], style: { fill: fill(GREEN), font: { color: { argb: 'FF15803D' }, bold: true } } }] });
  ws.addConditionalFormatting({ ref: resRef, rules: [
    { type: 'cellIs', operator: 'lessThan', formulae: [0], style: { font: { color: { argb: 'FFB91C1C' }, bold: true } } },
    { type: 'cellIs', operator: 'greaterThan', formulae: [0], style: { font: { color: { argb: 'FF15803D' }, bold: true } } }] });
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 0 }];
  return ws;
}

const wb = new ExcelJS.Workbook(); wb.creator = 'RUSH CASE';
// «Итоги» — первым листом
const S = wb.addWorksheet('Итоги', { properties: { tabColor: { argb: 'FF22C55E' } } });
for (let i = 1; i <= TESTERS; i++) testerSheet(wb, i);
const ref = (row, sheetCell) => `IFERROR(IF(INDIRECT("'"&$A${row}&"'!${sheetCell}")="","",INDIRECT("'"&$A${row}&"'!${sheetCell}")),"")`;
S.mergeCells('A1:H1'); Object.assign(S.getCell('A1'), { value: 'RUSH CASE — итоги оценки', font: { bold: true, size: 18, color: { argb: GOLD } }, fill: fill(DARK) }); S.getRow(1).height = 34;
S.getCell('A2').value = `Каждый тестер заполняет свой лист. Новый тестер: скопируйте лист «Тестер 1», переименуйте и впишите название листа в колонку A ниже (до ${LIST} листов).`;
S.getCell('A2').font = { italic: true, color: { argb: 'FF7A7466' } };
// таблица тестеров: оценки, общий балл, деньги
const H = 4, R0 = H + 1, RN = R0 + LIST - 1, AV = RN + 1;
const heads = ['Лист', 'Имя', ...CRIT.map(c => c[0]), 'Общая оценка', 'Открыто кейсов', 'Потрачено', 'Выпало', 'Окупаемость', 'Итог для клиента'];
heads.forEach((t, j) => Object.assign(S.getCell(H, j + 1), { value: t, font: { bold: true }, fill: fill('FFEDE6D3'), border: box, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } }));
S.getRow(H).height = 46;
S.columns = [{ width: 12 }, { width: 18 }, ...CRIT.map(() => ({ width: 11 })), { width: 12 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 12 }, { width: 14 }];
const cScore = 2 + CRIT.length, cOpen = cScore + 1, cSp = cScore + 2, cWn = cScore + 3, cRt = cScore + 4, cRs = cScore + 5;
for (let r = R0; r <= RN; r++) {
  const i = r - R0 + 1;
  Object.assign(S.getCell(r, 1), { value: i <= TESTERS ? `Тестер ${i}` : null, fill: fill(INPUT) });
  S.getCell(r, 2).value = { formula: ref(r, 'B3') };
  CRIT.forEach((_, k) => { S.getCell(r, 3 + k).value = { formula: ref(r, `D${C0 + k}`) }; S.getCell(r, 3 + k).alignment = { horizontal: 'center' }; });
  Object.assign(S.getCell(r, cScore + 1), { value: { formula: ref(r, `D${SCORE}`) }, font: { bold: true }, alignment: { horizontal: 'center' } });
  S.getCell(r, cOpen + 1).value = { formula: ref(r, `${col(cN)}${KT}`) };
  Object.assign(S.getCell(r, cSp + 1), { value: { formula: ref(r, `${col(cSpent)}${KT}`) }, numFmt: RUB });
  Object.assign(S.getCell(r, cWn + 1), { value: { formula: ref(r, `${col(cWon)}${KT}`) }, numFmt: RUB });
  Object.assign(S.getCell(r, cRt + 1), { value: { formula: `IF(N(${col(cSp)}${r})>0,${col(cWn)}${r}/${col(cSp)}${r},"")` }, numFmt: PCT });
  Object.assign(S.getCell(r, cRs + 1), { value: { formula: `IF(N(${col(cSp)}${r})>0,${col(cWn)}${r}-${col(cSp)}${r},"")` }, numFmt: '+#,##0 "₽";-#,##0 "₽";0 "₽"' });
  for (let j = 0; j <= cRs; j++) S.getCell(r, j + 1).border = box;
}
S.getCell(AV, 2).value = 'СРЕДНЕЕ / ВСЕГО';
for (let j = 2; j <= cScore; j++) Object.assign(S.getCell(AV, j + 1), { value: { formula: `IF(COUNT(${col(j)}${R0}:${col(j)}${RN})=0,"",ROUND(AVERAGE(${col(j)}${R0}:${col(j)}${RN}),1))` }, alignment: { horizontal: 'center' } });
S.getCell(AV, cOpen + 1).value = { formula: `SUM(${col(cOpen)}${R0}:${col(cOpen)}${RN})` };
Object.assign(S.getCell(AV, cSp + 1), { value: { formula: `SUM(${col(cSp)}${R0}:${col(cSp)}${RN})` }, numFmt: RUB });
Object.assign(S.getCell(AV, cWn + 1), { value: { formula: `SUM(${col(cWn)}${R0}:${col(cWn)}${RN})` }, numFmt: RUB });
Object.assign(S.getCell(AV, cRt + 1), { value: { formula: `IF(${col(cSp)}${AV}>0,${col(cWn)}${AV}/${col(cSp)}${AV},"")` }, numFmt: PCT });
Object.assign(S.getCell(AV, cRs + 1), { value: { formula: `${col(cWn)}${AV}-${col(cSp)}${AV}` }, numFmt: '+#,##0 "₽";-#,##0 "₽";0 "₽"' });
for (let j = 0; j <= cRs; j++) Object.assign(S.getCell(AV, j + 1), { font: { bold: true, size: 12 }, fill: fill('FFFFE9A8'), border: box });
// главная цифра
const G = AV + 2;
[['Общая оценка сайта (среднее по тестерам)', { formula: `${col(cScore)}${AV}` }, '0.0'], ['Окупаемость кейсов для клиента', { formula: `${col(cRt)}${AV}` }, PCT],
 ['Клиенты в минусе на, ₽', { formula: `MAX(0,-${col(cRs)}${AV})` }, RUB], ['Клиенты в минусе на, %', { formula: `IF(N(${col(cRt)}${AV})>0,MAX(0,1-${col(cRt)}${AV}),"")` }, PCT]]
  .forEach(([l, f, z], i) => { S.mergeCells(G + i, 1, G + i, 4); Object.assign(S.getCell(G + i, 1), { value: l, font: { bold: true, size: 13 } }); Object.assign(S.getCell(G + i, 5), { value: f, numFmt: z, font: { bold: true, size: 14 }, border: box, alignment: { horizontal: 'center' } }); });
// по кейсам — сумма всех тестеров
const KH = G + 6, KR0 = KH + 1;
S.mergeCells(KH - 1, 1, KH - 1, 8); Object.assign(S.getCell(KH - 1, 1), { value: 'ОКУПАЕМОСТЬ ПО КЕЙСАМ — все тестеры вместе', font: { bold: true, size: 13, color: { argb: WHITE } }, fill: fill(HEAD) });
['Раздел', 'Кейс', 'Цена', 'Открыто', 'Потрачено', 'Выпало', 'Окупаемость', 'Итог для клиента'].forEach((t, j) => Object.assign(S.getCell(KH, j + 1), { value: t, font: { bold: true }, fill: fill('FFEDE6D3'), border: box, alignment: { horizontal: 'center' } }));
const across = (sheetCell) => Array.from({ length: LIST }, (_, i) => `IFERROR(N(INDIRECT("'"&$A$${R0 + i}&"'!${sheetCell}")),0)`).join('+');
CASES.forEach(([b, n, p], i) => {
  const r = KR0 + i, tr = K0 + i;
  S.getCell(r, 1).value = b; S.getCell(r, 2).value = n; S.getCell(r, 2).font = { bold: true };
  Object.assign(S.getCell(r, 3), { value: p, numFmt: RUB });
  S.getCell(r, 4).value = { formula: across(`${col(cN)}${tr}`) };
  Object.assign(S.getCell(r, 5), { value: { formula: across(`${col(cSpent)}${tr}`) }, numFmt: RUB });
  Object.assign(S.getCell(r, 6), { value: { formula: across(`${col(cWon)}${tr}`) }, numFmt: RUB });
  Object.assign(S.getCell(r, 7), { value: { formula: `IF(E${r}>0,F${r}/E${r},"")` }, numFmt: PCT });
  Object.assign(S.getCell(r, 8), { value: { formula: `IF(D${r}>0,F${r}-E${r},"")` }, numFmt: '+#,##0 "₽";-#,##0 "₽";0 "₽"' });
  for (let j = 1; j <= 8; j++) S.getCell(r, j).border = box;
});
const KRN = KR0 + CASES.length - 1;
S.addConditionalFormatting({ ref: `G${KR0}:G${KRN} ${col(cRt)}${R0}:${col(cRt)}${AV}`, rules: [
  { type: 'cellIs', operator: 'lessThan', formulae: [1], style: { fill: fill(RED), font: { color: { argb: 'FFB91C1C' }, bold: true } } },
  { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [1], style: { fill: fill(GREEN), font: { color: { argb: 'FF15803D' }, bold: true } } }] });
S.views = [{ state: 'frozen', xSplit: 2, ySplit: H }];
wb.xlsx.writeFile(OUT).then(() => console.log('готово:', OUT, `· критериев ${CRIT.length}, кейсов ${CASES.length}, листов-тестеров ${TESTERS}`));
