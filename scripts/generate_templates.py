"""Generate blank Google Sheets import workbooks, demo data, and Apps Script.
Uses only Python standard library; all calculations remain in the application.
"""
import json
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / 'frontend/src/data/schema.json').read_text())
ID_RULES = json.loads((ROOT / 'frontend/src/data/id-rules.json').read_text())
ID_COLUMNS = {column: rule['prefix'] for rule in ID_RULES.values() for column in [rule['column'], *rule.get('referenceColumns', [])]}
OUT = ROOT / 'frontend/public/templates'
OUT.mkdir(parents=True, exist_ok=True)

def column(index):
    result = ''
    while index:
        index, n = divmod(index - 1, 26)
        result = chr(65 + n) + result
    return result

def workbook(path, sheets):
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    with ZipFile(path, 'w', ZIP_DEFLATED) as z:
        types = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        sheets_xml, rels = [], []
        for i, (name, rows) in enumerate(sheets.items(), 1):
            types += f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            sheets_xml.append(f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>')
            rels.append(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>')
            data = []
            for rownum, row in enumerate(rows, 1):
                cells = []
                for n, value in enumerate(row, 1):
                    ref = f'{column(n)}{rownum}'
                    style = 1 if rownum == 1 else 0
                    cells.append(f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>')
                data.append(f'<row r="{rownum}">{"".join(cells)}</row>')
            width = len(rows[0])
            choices = {
                '旅程狀態': ['規劃中', '即將出發', '旅途中', '已結束'],
                '狀態': ['待辦', '進行中', '已完成', '已取消'],
                '支付方式': ['行前收款', '公積金'],
                '類型': ['儲值', '支出', '退款', '調整'] if name == '公積金交易' else ['景點', '餐飲', '交通', '住宿', '自由活動', '其他'],
            }
            rules = []
            for n, header in enumerate(rows[0], 1):
                if header in choices:
                    items = ','.join(choices[header])
                    rules.append(f'<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="請選擇固定選項" error="請使用下拉選單" sqref="{column(n)}2:{column(n)}1001"><formula1>"{items}"</formula1></dataValidation>')
                if header in ID_COLUMNS:
                    cell = f'{column(n)}2'
                    prefix = ID_COLUMNS[header]
                    number = f'VALUE(MID({cell},2,4))'
                    formula = f'OR({cell}="",IFERROR(AND(EXACT({cell},"{prefix}"&TEXT({number},"000")),{number}>=1,{number}<=9999),FALSE))'
                    rules.append(f'<dataValidation type="custom" allowBlank="1" showErrorMessage="1" errorTitle="ID 格式錯誤" error="請使用 {prefix}001 至 {prefix}9999 格式" sqref="{column(n)}2:{column(n)}1001"><formula1>{escape(formula)}</formula1></dataValidation>')
            validation = f'<dataValidations count="{len(rules)}">{"".join(rules)}</dataValidations>' if rules else ''
            sheet = f'<worksheet xmlns="{ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="{width}" width="24" customWidth="1" style="0"/></cols><sheetData>{"".join(data)}</sheetData><autoFilter ref="A1:{column(width)}1001"/>{validation}</worksheet>'
            z.writestr(f'xl/worksheets/sheet{i}.xml', sheet)
        z.writestr('[Content_Types].xml', types + '</Types>')
        z.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr('xl/workbook.xml', f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>{"".join(sheets_xml)}</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(rels) + '<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        z.writestr('xl/styles.xml', f'<styleSheet xmlns="{ns}"><fonts count="2"><font><sz val="11"/><color rgb="FF0000FF"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft JhengHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF795D48"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>')

blank = {name: [headers] for name, headers in SCHEMA.items()}
blank['旅程設定'].append(['1', '', 'Asia/Tokyo', 'JPY', 'TWD', '', '請填入此趟旅程設定，匯率為 1 台幣 = 多少當地幣。'])
workbook(OUT / '旅程目錄範本.xlsx', {'旅程清單': [SCHEMA['旅程清單'], ['T001', '範例旅程', '日本・大阪', '2027-05-01', '2027-05-03', '請替換為你的旅程試算表ID', '規劃中', '', 1]]})
workbook(OUT / '每趟旅程範本.xlsx', {name: rows for name, rows in blank.items() if name != '旅程清單'})

# Explicit sample content, never treated as a real trip.
demo = {name: [list(headers)] for name, headers in SCHEMA.items()}
demo['旅程清單'].append(['demo_trip', '大阪三日｜範例旅程', '日本・大阪', '2027-05-01', '2027-05-03', 'demo_sheet', '規劃中', '', 1])
demo['旅程設定'].append(['1', 'demo_trip', 'Asia/Tokyo', 'JPY', 'TWD', 4.5, '這是範例資料，用來預覽功能，並非真實旅程或帳務。'])
demo['團員'] += [['member_a', '範例團員 A', 1], ['member_b', '範例團員 B', 2], ['member_c', '範例團員 C', 3]]
demo['公積金交易'] += [['topup', '2027-05-01', '儲值', '當地貨幣儲值', 60000, ''], ['dinner', '2027-05-01', '支出', '共同晚餐', -1000, '均分向上取整'], ['hotel', '2027-05-01', '支出', '到店支付住宿', -30000, '']]
for name in ['a', 'b', 'c']:
    demo['公積金分攤'] += [['topup', f'member_{name}', 20000], ['dinner', f'member_{name}', ''], ['hotel', f'member_{name}', '']]
demo['支出明細'] += [['flight_cost', '2027-04-01', '來回機票', '航班', 30000, 'TWD', '行前收款', '', '實際刷卡台幣金額'], ['prehotel', '2027-04-01', '行前住宿訂金', '住宿', 9000, 'TWD', '行前收款', '', ''], ['dinner_cost', '2027-05-01', '共同晚餐', '餐飲', 1000, 'JPY', '公積金', 'dinner', ''], ['hotel_cost', '2027-05-01', '到店支付住宿', '住宿', 30000, 'JPY', '公積金', 'hotel', '']]
for name in ['a', 'b', 'c']:
    demo['行前費用分攤'] += [['flight_cost', f'member_{name}', 10000], ['prehotel', f'member_{name}', 3000]]
demo['收款明細'] += [['r1', 'batch_a', '2027-04-03', 'member_a', 'flight_cost', 10000, '機票與住宿合併收款'], ['r2', 'batch_a', '2027-04-03', 'member_a', 'prehotel', 3000, ''], ['r3', 'batch_b', '2027-04-04', 'member_b', 'flight_cost', 6000, '部分已收範例']]
demo['航班'] += [['flight_1', '範例航空', '範例航班', '桃園 TPE', '關西 KIX', '2027-05-01T09:00:00+08:00', '2027-05-01T12:30:00+09:00', '', '請依實際訂票資訊填寫', '此航班僅供功能示範']]
demo['飯店'] += [['hotel_1', '範例飯店', '2027-05-01', '2027-05-03', '日本大阪（範例地址）', 'https://www.google.com/maps/search/?api=1&query=Osaka', '', '到店費用由公積金支付']]
demo['每日行程'] += [['i1', '2027-05-01', '09:00', '', 'Asia/Taipei', '搭機出發', '交通', '桃園機場', '', '時間為出發地當地時間', 'flight_1', '', 10], ['i2', '2027-05-01', '15:00', '', '', '飯店入住', '住宿', '範例飯店', '', '集合後一同辦理入住', '', 'hotel_1', 20], ['i3', '2027-05-02', '10:00', '12:00', '', '大阪城散步', '景點', '大阪城公園', 'https://www.google.com/maps/search/?api=1&query=Osaka+Castle', '範例行程，時間可自行調整', '', '', 10], ['i4', '2027-05-03', '', '', '', '自由活動與返程', '自由活動', '', '', '範例行程', '', '', 10]]
demo['開團待辦'] += [['task1', '確認旅遊日期', '其他', '已完成', '2027-03-01', '2027-02-28', 'member_a', '', 10], ['task2', '訂購機票', '航班', '已完成', '2027-04-01', '2027-03-20', 'member_a', '', 20], ['task3', '確認行前收款', '其他', '進行中', '2027-04-20', '', 'member_b', '', 30], ['task4', '確認機場接送', '交通', '待辦', '2027-04-25', '', 'member_c', '', 40]]
aliases = {
    'trip': ['demo_trip'], 'member': ['member_a', 'member_b', 'member_c'],
    'fund': ['topup', 'dinner', 'hotel'],
    'expense': ['flight_cost', 'prehotel', 'dinner_cost', 'hotel_cost'],
    'receipt': ['r1', 'r2', 'r3'], 'batch': ['batch_a', 'batch_b'],
    'flight': ['flight_1'], 'hotel': ['hotel_1'],
    'itinerary': ['i1', 'i2', 'i3', 'i4'], 'task': ['task1', 'task2', 'task3', 'task4'],
}
ids = {old: f"{ID_RULES[kind]['prefix']}{index:03d}" for kind, values in aliases.items() for index, old in enumerate(values, 1)}
for name, rows in demo.items():
    for row in rows[1:]:
        for index, header in enumerate(SCHEMA[name]):
            if header.endswith('ID') and header != '試算表ID':
                row[index] = ids.get(row[index], row[index])
(ROOT / 'frontend/src/data/demo.json').write_text(json.dumps(demo, ensure_ascii=False, indent=2) + '\n')
workbook(OUT / '範例旅程.xlsx', {name: rows for name, rows in demo.items() if name != '旅程清單'})

script = '''/** Creates NEW private spreadsheets only; does not overwrite or share existing files.
 * Run createTripMateTemplates once, then read URLs in the execution log.
 * Re-running creates another pair of files.
 */
function createTripMateTemplates() {
  const schema = SCHEMA;
  const idPrefixes = ID_COLUMNS;
  const catalog = SpreadsheetApp.create('蕃薯旅遊團｜旅程目錄');
  const template = SpreadsheetApp.create('蕃薯旅遊團｜每趟旅程範本');
  function fill(book, names) {
    names.forEach(function(name, index) {
      const sheet = index === 0 ? book.getSheets()[0].setName(name) : book.insertSheet(name);
      const headers = schema[name];
      sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).setNumberFormat('@');
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground('#795d48').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidths(1, headers.length, 180);
      sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).createFilter();
      const choices = {旅程狀態:['規劃中','即將出發','旅途中','已結束'],類型:name === '公積金交易' ? ['儲值','支出','退款','調整'] : ['景點','餐飲','交通','住宿','自由活動','其他'],狀態:['待辦','進行中','已完成','已取消'],支付方式:['行前收款','公積金']};
      headers.forEach(function(header, i) {
        if (choices[header]) sheet.getRange(2, i + 1, sheet.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(choices[header], true).setAllowInvalid(false).build());
        if (idPrefixes[header]) {
          const cell = String.fromCharCode(65 + i) + '2';
          const number = 'VALUE(MID(' + cell + ',2,4))';
          const formula = '=OR(' + cell + '="",IFERROR(AND(EXACT(' + cell + ',"' + idPrefixes[header] + '"&TEXT(' + number + ',"000")),' + number + '>=1,' + number + '<=9999),FALSE))';
          sheet.getRange(2, i + 1, sheet.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireFormulaSatisfied(formula).setAllowInvalid(false).setHelpText('ID 格式：' + idPrefixes[header] + '001 至 ' + idPrefixes[header] + '9999').build());
        }
      });
      if (name === '旅程設定') sheet.getRange(2, 1, 1, headers.length).setValues([['1','','Asia/Tokyo','JPY','TWD','','請填入旅程 ID、當地幣別與匯率（1 台幣 = 多少當地幣）。']]);
      if (name === '旅程清單') sheet.getRange(2, 1, 1, headers.length).setValues([['T001','範例旅程','日本・大阪','2027-05-01','2027-05-03','請替換為你的旅程試算表ID','規劃中','',1]]);
    });
  }
  fill(catalog, ['旅程清單']);
  fill(template, Object.keys(schema).filter(function(name) { return name !== '旅程清單'; }));
  console.log('旅程目錄：' + catalog.getUrl());
  console.log('每趟旅程範本：' + template.getUrl());
  console.log('先填寫資料，之後按需要設定公開檢視；此程式不會變更共用權限。');
}
'''.replace('SCHEMA', json.dumps(SCHEMA, ensure_ascii=False)).replace('ID_COLUMNS', json.dumps(ID_COLUMNS, ensure_ascii=False))
(OUT / '建立Google試算表範本.gs').write_text(script)
print('Generated catalog with sample row, blank trip workbook, labeled demo, and Apps Script.')
