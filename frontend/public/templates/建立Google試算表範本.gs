/** Creates NEW private spreadsheets only; does not overwrite or share existing files.
 * Run createTripMateTemplates once, then read URLs in the execution log.
 * Re-running creates another pair of files.
 */
function createTripMateTemplates() {
  const schema = {"旅程清單": ["旅程ID", "旅程名稱", "目的地", "開始日期", "結束日期", "試算表ID", "旅程狀態", "封面圖片網址", "排序"], "旅程設定": ["結構版本", "旅程ID", "預設時區", "記帳幣別", "匯率基準幣別", "旅程匯率", "旅程說明"], "團員": ["團員ID", "顯示名稱", "排序"], "公積金交易": ["交易ID", "日期", "類型", "項目", "記帳金額", "備註"], "公積金分攤": ["交易ID", "團員ID", "個人金額"], "支出明細": ["支出ID", "日期", "項目", "分類", "金額", "幣別", "支付方式", "公積金交易ID", "備註"], "行前費用分攤": ["支出ID", "團員ID", "應繳金額"], "收款明細": ["收款明細ID", "收款批次ID", "收款日期", "團員ID", "支出ID", "實收金額", "備註"], "航班": ["航班ID", "航空公司", "航班編號", "出發機場", "抵達機場", "出發時間", "抵達時間", "出發航廈", "抵達航廈", "行李說明", "備註"], "飯店": ["住宿ID", "飯店名稱", "飯店圖片網址", "入住日期", "入住時間", "退房日期", "退房時間", "地址", "地圖網址", "電話", "備註"], "每日行程": ["行程ID", "日期", "開始時間", "結束時間", "時區", "標題", "類型", "地點", "地圖網址", "說明", "航班ID", "住宿ID", "排序"], "開團待辦": ["任務ID", "事項", "分類", "狀態", "截止日期", "完成日期", "負責團員ID", "備註", "排序"]};
  const idPrefixes = {"旅程ID": "T", "團員ID": "M", "負責團員ID": "M", "交易ID": "F", "公積金交易ID": "F", "支出ID": "E", "收款明細ID": "R", "收款批次ID": "B", "航班ID": "A", "住宿ID": "H", "行程ID": "I", "任務ID": "P"};
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
