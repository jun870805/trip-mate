"""Guide trip editing checks with mocked Google APIs; never writes to real Sheets.
Start the test Vite server using the guide configuration documented in README.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5188')
parser.add_argument('--chrome')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
book = json.loads((root / 'frontend/src/data/demo.json').read_text())
headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
grids = [{'sheetId': index + 1, 'title': title, 'gridProperties': {'rowCount': 1000, 'columnCount': 26}} for index, title in enumerate(name for name in book if name != '旅程清單')]
writes = []
sdk = """window.google={accounts:{oauth2:{initTokenClient(options){return {requestAccessToken(){options.callback({access_token:'mock-guide-token',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'});}};}}}};"""
with sync_playwright() as p:
    options = {'headless': True}
    if args.chrome:
        options['executable_path'] = args.chrome
    browser = p.chromium.launch(**options)
    try:
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept())
        page.route('https://accounts.google.com/gsi/client', lambda route: route.fulfill(content_type='application/javascript', body=sdk))
        page.route('https://openidconnect.googleapis.com/**', lambda route: route.fulfill(headers=headers, json={'email': 'guide@example.com', 'email_verified': True}))
        def sheets(route):
            request = route.request
            url = urlparse(request.url)
            if request.method == 'OPTIONS':
                route.fulfill(status=204, headers=headers)
            elif request.method == 'POST':
                assert url.path.endswith(':batchUpdate')
                assert request.headers.get('authorization') == 'Bearer mock-guide-token'
                body = json.loads(request.post_data)
                writes.append(body)
                for action in body['requests']:
                    if 'appendDimension' in action:
                        value = action['appendDimension']
                        grid = next(item for item in grids if item['sheetId'] == value['sheetId'])
                        key = 'rowCount' if value['dimension'] == 'ROWS' else 'columnCount'
                        grid['gridProperties'][key] += value['length']
                    else:
                        update = action['updateCells']
                        assert update['fields'] == 'userEnteredValue'
                        start = update['start']
                        grid = next(item for item in grids if item['sheetId'] == start['sheetId'])
                        rows = book[grid['title']]
                        while len(rows) <= start['rowIndex']:
                            rows.append([])
                        while len(rows[start['rowIndex']]) <= start['columnIndex']:
                            rows[start['rowIndex']].append('')
                        cell = update['rows'][0]['values'][0]['userEnteredValue']
                        assert list(cell) == ['stringValue']
                        rows[start['rowIndex']][start['columnIndex']] = cell['stringValue']
                route.fulfill(headers=headers, json={})
            elif url.path.endswith('values:batchGet'):
                ranges = parse_qs(url.query)['ranges']
                route.fulfill(headers=headers, json={'valueRanges': [{'values': book[value.split('!')[0].strip("'")]} for value in ranges]})
            else:
                assert request.headers.get('authorization') == 'Bearer mock-guide-token'
                route.fulfill(headers=headers, json={'sheets': [{'properties': value} for value in grids]})
        page.route('https://sheets.googleapis.com/**', sheets)
        page.goto(args.url)
        page.wait_for_load_state('networkidle')
        page.locator('.trip-card-link').click()
        expect(page.get_by_role('button', name='編輯進度', exact=True)).to_have_count(0)
        page.get_by_role('button', name='導遊登入', exact=True).click()
        expect(page.get_by_role('button', name='登出', exact=True)).to_be_visible()
        page.get_by_role('button', name='編輯進度', exact=True).click()
        dialog = page.get_by_role('dialog', name='編輯進度')
        dialog.get_by_role('button', name='新增進度事項', exact=True).click()
        # Opening / navigating / cancelling must not populate the date input.
        start = book['旅程清單'][1][book['旅程清單'][0].index('開始日期')]
        date_field = dialog.get_by_label('截止日期', exact=True)
        expect(date_field).to_have_value('')
        date_field.fill('2027/02/30')
        assert not date_field.evaluate('(input) => input.checkValidity()')
        expect(page.get_by_role('dialog', name='選擇截止日期', exact=True)).not_to_be_visible()
        date_field.fill('')
        dialog.get_by_role('button', name='選擇截止日期', exact=True).click()
        picker = page.get_by_role('dialog', name='選擇截止日期', exact=True)
        expect(picker).to_be_visible()
        picker.get_by_role('button', name='選擇年份與月份', exact=True).click()
        picker.get_by_role('button', name='選擇年份', exact=True).click()
        picker.get_by_role('button', name='2028 年', exact=True).click()
        picker.get_by_role('button', name='2 月', exact=True).click()
        expect(picker.get_by_role('button', name='2028/02/29', exact=True)).to_be_visible()
        expect(date_field).to_have_value('')
        picker.get_by_role('button', name='取消', exact=True).click()
        dialog.get_by_role('button', name='選擇截止日期', exact=True).click()
        expect(picker.get_by_label(start.replace('-', '/'), exact=True)).to_be_visible()
        expect(date_field).to_have_value('')
        picker.get_by_role('button', name='下個月', exact=True).click()
        picker.get_by_role('button', name='取消', exact=True).click()
        expect(date_field).to_have_value('')
        dialog.get_by_role('button', name='選擇截止日期', exact=True).click()
        picker.get_by_label(start.replace('-', '/'), exact=True).click()
        expect(date_field).to_have_value(start.replace('-', '/'))
        dialog.get_by_role('button', name='選擇截止日期', exact=True).click()
        picker.press('Escape')
        expect(picker).not_to_be_visible()
        expect(dialog).to_be_visible()
        expect(date_field).to_have_value(start.replace('-', '/'))
        dialog.get_by_label('事項', exact=True).fill('確認集合地點')
        dialog.get_by_label('截止日期', exact=True).fill('2027-04-30')
        dialog.get_by_label('負責人', exact=True).select_option('M001')
        dialog.get_by_label('狀態', exact=True).select_option('已完成')
        expect(dialog.get_by_label('完成日期', exact=True)).to_have_value('')
        dialog.get_by_label('完成日期', exact=True).fill('2027-04-30')
        dialog.get_by_role('button', name='儲存', exact=True).click()
        expect(dialog.locator('.editor-record').filter(has_text='確認集合地點')).to_be_visible()
        dialog.get_by_role('button', name='關閉', exact=True).click()
        page.get_by_role('button', name='編輯帳務', exact=True).click()
        dialog = page.get_by_role('dialog', name='編輯帳務')
        dialog.get_by_role('button', name='新增公積金交易', exact=True).click()
        dialog.get_by_label('日期', exact=True).fill(start)
        dialog.get_by_label('項目', exact=True).fill('共同午餐測試')
        dialog.get_by_label('類型', exact=True).select_option('支出')
        fund_id = dialog.get_by_label('公積金交易 ID', exact=True).input_value()
        expense_id = dialog.get_by_label('支出 ID', exact=True).input_value()
        dialog.get_by_label('實際支出金額（JPY）', exact=True).fill('1000')
        for member in ['範例團員 A', '範例團員 B', '範例團員 C']:
            dialog.get_by_label(member, exact=True).check()
        expect(dialog.get_by_role('status')).to_contain_text('334')
        dialog.get_by_role('button', name='儲存', exact=True).click()
        expect(dialog.locator('.editor-record').filter(has_text='共同午餐測試')).to_be_visible()
        assert sum(row[0] == fund_id for row in book['公積金交易'][1:] if row) == 1
        assert sum(row[0] == expense_id for row in book['支出明細'][1:] if row) == 1
        assert sum(row[0] == fund_id for row in book['公積金分攤'][1:] if row) == 3
        dialog.get_by_label('資料類型', exact=True).select_option('行前費用')
        dialog.get_by_role('button', name='新增行前費用', exact=True).click()
        dialog.get_by_label('日期', exact=True).fill('2027-04-01')
        dialog.get_by_label('項目', exact=True).fill('門票測試')
        new_expense = dialog.get_by_label('行前費用 ID', exact=True).input_value()
        dialog.get_by_label('分類', exact=True).fill('活動')
        dialog.get_by_label('實際刷卡金額（TWD）', exact=True).fill('300')
        for member in ['範例團員 A', '範例團員 B', '範例團員 C']:
            dialog.get_by_label(member, exact=True).check()
            amount = dialog.get_by_label(member + '金額', exact=True)
            amount.fill('100')
            amount.fill('1.5')
            expect(amount).to_have_value('100')
            amount.fill('abc')
            expect(amount).to_have_value('100')
        dialog.get_by_role('button', name='儲存', exact=True).click()
        expect(dialog.locator('.editor-record').filter(has_text='門票測試')).to_be_visible()
        dialog.get_by_label('資料類型', exact=True).select_option('收款')
        dialog.get_by_role('button', name='新增收款批次', exact=True).click()
        dialog.get_by_label('收款日期', exact=True).fill(start)
        dialog.get_by_label('繳款團員', exact=True).select_option('M003')
        dialog.get_by_role('button', name='加入收款項目', exact=True).click()
        dialog.get_by_label('行前費用', exact=True).select_option(new_expense)
        dialog.get_by_label('實收金額', exact=True).fill('100')
        dialog.get_by_role('button', name='儲存', exact=True).click()
        expect(dialog.locator('.editor-record').filter(has_text='範例團員 C')).to_be_visible()
        dialog.get_by_role('button', name='關閉', exact=True).click()
        page.get_by_role('button', name='編輯行程', exact=True).click()
        dialog = page.get_by_role('dialog', name='編輯行程')
        dialog.get_by_role('button', name='新增每日行程', exact=True).click()
        dialog.get_by_label('日期', exact=True).fill(start)
        start_time = dialog.get_by_label('開始時間', exact=True)
        start_time.fill('24:00')
        assert not start_time.evaluate('(input) => input.checkValidity()')
        start_time.fill('18:30')
        assert start_time.evaluate('(input) => input.checkValidity()')
        expect(dialog.get_by_label('結束時間', exact=True)).to_have_value('')
        dialog.get_by_role('button', name='選擇結束時間', exact=True).click()
        time_picker = page.get_by_role('dialog', name='選擇結束時間', exact=True)
        hours = time_picker.get_by_role('listbox', name='小時', exact=True)
        minutes = time_picker.get_by_role('listbox', name='分鐘', exact=True)
        expect(hours.get_by_role('option', name='18', exact=True)).to_have_attribute('aria-selected','true')
        hours.focus()
        hours.press('ArrowDown')
        expect(hours.get_by_role('option', name='19', exact=True)).to_have_attribute('aria-selected','true')
        minutes.focus()
        minutes.press('End')
        expect(minutes.get_by_role('option', name='59', exact=True)).to_have_attribute('aria-selected','true')
        minutes.get_by_role('option', name='30', exact=True).click()
        expect(dialog.get_by_label('結束時間', exact=True)).to_have_value('')
        time_picker.get_by_role('button', name='確定', exact=True).click()
        expect(dialog.get_by_label('結束時間', exact=True)).to_have_value('19:30')
        dialog.get_by_label('標題', exact=True).fill('新增景點測試')
        dialog.get_by_label('類型', exact=True).fill('景點')
        dialog.get_by_label('關聯飯店', exact=True).select_option('H001')
        dialog.get_by_role('button', name='儲存', exact=True).click()
        expect(dialog.locator('.editor-record').filter(has_text='新增景點測試')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        dialog.get_by_role('button', name='關閉', exact=True).click()
        page.get_by_role('button', name='登出', exact=True).click()
        expect(page.get_by_role('button', name='編輯行程', exact=True)).to_have_count(0)
        assert len(writes) == 5, len(writes)
        assert not errors, errors
        print('Trip editor browser smoke checks passed with mocked Google APIs.')
    finally:
        browser.close()
