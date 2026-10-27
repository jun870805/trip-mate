# 國家搜尋資料

網站使用 `frontend/src/data/countries.json` 的 249 個國家／地區資料，不在使用者搜尋時呼叫外部 API。名稱由瀏覽器 Intl.DisplayNames 顯示，支援繁體、簡體、英文、兩碼代碼與常用別名。多時區或多幣別需自行選擇；無建議值時可手動填寫。匯率不包含在此資料中。

幣別快照取自 [Unicode CLDR currencyData](https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-core/supplemental/currencyData.json)，版本 49，以 2026-10-27 的有效流通幣別為準，原始對應保存在 `scripts/data/country-currencies.json`。時區對應由 pytz 2025.2 提供，來源為 [IANA Time Zone Database](https://www.iana.org/time-zones)。資料依各來源授權使用：[Unicode License](https://www.unicode.org/license.txt)、[pytz MIT license](https://github.com/stub42/pytz/blob/master/LICENSE.txt)。

國家搜尋帶入 IANA 時區名稱，亦可手動改填 `UTC+9`、`UTC-5`、`UTC+05:30` 等固定時差（不套用夏令時間）；日期時間的實際顯示依瀏覽器內建時區資料。選單會排除瀏覽器不支援的時區，仍提供手動輸入並在建立前驗證。

更新方式：

1. 在資料維護環境安裝／更新 Python `pytz`；前端執行與建置不依賴 Python。
2. 下載 CLDR `currencyData.json`，執行 `python3 scripts/generate_country_data.py --currency-data /path/to/currencyData.json --date YYYY-MM-DD`，同時更新幣別快照與國家資料。僅重建現有快照可執行 `python3 scripts/generate_country_data.py`。
3. 執行 `npm test`、`npm run build`，檢查資料與自動帶入規則。提交兩份 JSON 與來源版本資訊。
