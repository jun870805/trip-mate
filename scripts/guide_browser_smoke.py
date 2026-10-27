"""Catalog editing browser checks with mocked GIS, Google identity, and Sheets.
Use dummy VITE_GOOGLE_CLIENT_ID, VITE_GUIDE_EMAILS='["guide@example.com"]',
and the dummy catalog/API configuration in README. Never writes to real Google.
"""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5188')
parser.add_argument('--chrome')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
book = json.loads((root / 'frontend/src/data/demo.json').read_text())
current = json.loads(json.dumps(book['旅程清單']))
state = {'email': 'guide@example.com', 'deny_next_write': False, 'created_count': 0, 'share_count': 0}
writes = []
headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
sdk = """
window.google = {accounts: {oauth2: {initTokenClient(options) {return {requestAccessToken() {
 options.callback({access_token:'mock-guide-token',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'});
}}}}};
"""
with sync_playwright() as p:
    options = {'headless': True}
    if args.chrome:
        options['executable_path'] = args.chrome
    browser = p.chromium.launch(**options)
    try:
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://accounts.google.com/gsi/client', lambda route: route.fulfill(content_type='application/javascript', body=sdk))
        page.route('https://openidconnect.googleapis.com/**', lambda route: route.fulfill(headers=headers, json={'email': state['email'], 'email_verified': True}))
        def sheets(route):
            request = route.request
            url = urlparse(request.url)
            if request.method == 'OPTIONS':
                route.fulfill(status=204, headers=headers)
            elif request.method == 'POST' and url.path == '/v4/spreadsheets':
                resource = json.loads(request.post_data)
                assert len(resource['sheets']) == 11
                assert resource['sheets'][0]['data'][0]['rowData'][1]['values'][1]['userEnteredValue']['stringValue'] == 'T002'
                state['created_count'] += 1
                route.fulfill(headers=headers, json={'spreadsheetId': 'generated-trip-file'})
            elif request.method == 'POST' and url.path.endswith('/generated-trip-file:batchUpdate'):
                assert len(json.loads(request.post_data)['requests']) == 11
                route.fulfill(headers=headers, json={})
            elif request.method == 'POST':
                assert url.path.endswith('/spreadsheets/test-catalog/values:batchUpdate')
                assert request.headers.get('authorization') == 'Bearer mock-guide-token'
                if state['deny_next_write']:
                    state['deny_next_write'] = False
                    route.fulfill(status=403, headers=headers, json={})
                    return
                data = json.loads(request.post_data)
                assert data['valueInputOption'] == 'RAW'
                for item in data['data']:
                    match = re.search(r'!([A-Z]+)(\d+)', item['range'])
                    row = int(match[2]) - 1
                    col = 0
                    for char in match[1]:
                        col = col * 26 + ord(char) - 64
                    col -= 1
                    while len(current) <= row:
                        current.append([])
                    values = item['values'][0]
                    while len(current[row]) < col + len(values):
                        current[row].append('')
                    current[row][col:col + len(values)] = values
                writes.append(data)
                route.fulfill(headers=headers, json={'updatedRows': 1})
            elif url.path.endswith('values:batchGet'):
                ranges = parse_qs(url.query).get('ranges', [])
                route.fulfill(headers=headers, json={'valueRanges': [{'values': current if value.startswith("'旅程清單'") else book[value.split('!')[0].strip("'")]} for value in ranges]})
            else:
                assert "'旅程清單'!A:Z" in unquote(url.path)
                route.fulfill(headers=headers, json={'values': current})
        page.route('https://sheets.googleapis.com/**', sheets)
        def sharing(route):
            if route.request.method == 'OPTIONS':
                route.fulfill(status=204, headers=headers)
                return
            url = urlparse(route.request.url)
            assert route.request.headers.get('authorization') == 'Bearer mock-guide-token'
            if '/permissions' not in url.path:
                route.fulfill(headers=headers,json={'mimeType':'application/vnd.google-apps.spreadsheet','capabilities':{'canShare':True}})
            elif route.request.method == 'GET':
                route.fulfill(headers=headers,json={'permissions':[{'id':'owner','type':'user','role':'owner','emailAddress':'guide@example.com'}]})
            else:
                assert json.loads(route.request.post_data) == {'type': 'anyone', 'role': 'reader', 'allowFileDiscovery': False}
                state['share_count'] += 1
                route.fulfill(status=403 if state['share_count'] == 1 else 200, headers=headers, json={})
        page.route('https://www.googleapis.com/drive/v3/files/**', sharing)
        page.goto(args.url)
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('button', name='新增旅程', exact=True)).to_have_count(0)
        page.get_by_role('button', name='導遊登入', exact=True).click()
        expect(page.get_by_role('button', name='登出', exact=True)).to_be_visible()
        assert page.evaluate("Object.keys(localStorage).some(key => key.startsWith('trip-mate:guide-session:'))")
        page.reload()
        expect(page.get_by_role('button', name='登出', exact=True)).to_be_visible()
        expect(page.get_by_role('link', name='查看範例', exact=False)).to_be_visible()
        expect(page.get_by_text('試算表範本與設定方式', exact=True)).to_be_visible()
        expect(page.get_by_text('網站設定教學', exact=True)).to_be_visible()
        page.get_by_text('網站設定教學', exact=True).click()
        expect(page.locator('.setup-steps')).to_contain_text('新增旅程')
        page.get_by_role('button', name='編輯', exact=True).first.click()
        dialog = page.get_by_role('dialog', name='編輯旅程')
        expect(dialog.get_by_label('旅程 ID', exact=False)).to_have_attribute('readonly', '')
        dialog.get_by_role('button', name='同步導遊編輯權', exact=True).click()
        expect(dialog.get_by_role('status')).to_contain_text('指定導遊的編輯權已同步')
        dialog.get_by_label('旅程名稱', exact=True).fill('測試更名')
        dialog.get_by_role('button', name='儲存', exact=True).click()
        expect(page.get_by_role('heading', name='測試更名', exact=True)).to_be_visible()
        page.get_by_role('button', name='新增旅程', exact=True).click()
        dialog = page.get_by_role('dialog', name='新增旅程')
        dialog.get_by_label('旅程名稱', exact=True).fill('新增測試團')
        dialog.get_by_label('目的地', exact=True).fill('日本')
        dialog.get_by_label('開始日期', exact=True).fill('2027-06-01')
        dialog.get_by_label('結束日期', exact=True).fill('2027-06-03')
        dialog.get_by_label('旅程試算表 ID 或網址', exact=False).fill('https://docs.google.com/spreadsheets/d/new_sheet/edit')
        expect(dialog.get_by_label('旅程 ID', exact=False)).to_have_value('T002')
        expect(dialog.get_by_label('旅程 ID', exact=False)).to_be_editable()
        dialog.get_by_label('旅程 ID', exact=False).fill('T042')
        dialog.get_by_role('button', name='儲存', exact=True).click()
        expect(page.locator('.trip-card')).to_have_count(2)
        new_card = page.locator('.trip-card').filter(has=page.get_by_role('heading', name='新增測試團', exact=True))
        new_card.get_by_role('button', name='編輯', exact=True).click()
        dialog = page.get_by_role('dialog', name='編輯旅程')
        dialog.get_by_label('旅程名稱', exact=True).fill('重試後更名')
        state['deny_next_write'] = True
        dialog.get_by_role('button', name='儲存', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('403')
        expect(dialog.get_by_label('旅程名稱', exact=True)).to_have_value('重試後更名')
        dialog.get_by_role('button', name='儲存', exact=True).click()
        expect(page.get_by_role('heading', name='重試後更名', exact=True)).to_be_visible()
        new_card = page.locator('.trip-card').filter(has=page.get_by_role('heading', name='重試後更名', exact=True))
        new_card.get_by_role('button', name='編輯', exact=True).click()
        current[1][1] = '其他地方已更改'
        page.get_by_role('dialog').get_by_role('button', name='儲存', exact=True).click()
        expect(page.get_by_role('dialog').get_by_role('alert')).to_contain_text('旅程清單已更新')
        page.get_by_role('dialog').get_by_role('button', name='取消', exact=True).click()
        page.get_by_role('button', name='重新讀取旅程', exact=True).click()
        expect(page.get_by_role('heading', name='其他地方已更改', exact=True)).to_be_visible()
        page.locator('.trip-card').filter(has=page.get_by_role('heading', name='重試後更名', exact=True)).get_by_role('button', name='刪除', exact=True).click()
        dialog = page.get_by_role('dialog', name='刪除旅程')
        expect(dialog).to_contain_text('不會刪除對應的 Google 試算表')
        dialog.get_by_role('button', name='確認刪除', exact=True).click()
        expect(page.locator('.trip-card')).to_have_count(1)
        page.get_by_role('button', name='新增旅程', exact=True).click()
        dialog = page.get_by_role('dialog', name='新增旅程')
        dialog.get_by_label('旅程名稱', exact=True).fill('自動建檔測試')
        dialog.get_by_label('目的地', exact=True).fill('日本')
        dialog.get_by_label('開始日期', exact=True).fill('2027-07-01')
        dialog.get_by_label('結束日期', exact=True).fill('2027-07-03')
        dialog.get_by_text('建立空白旅程試算表', exact=True).click()
        country = dialog.get_by_role('combobox', name='搜尋國家／地區')
        country.fill('Japan')
        dialog.get_by_role('option').filter(has_text='JP').click()
        expect(dialog.get_by_label('當地幣別', exact=True)).to_have_value('JPY')
        expect(dialog.get_by_label('旅程時區', exact=True)).to_have_value('Asia/Tokyo')
        dialog.get_by_label('旅程匯率（1 TWD＝多少當地幣）', exact=True).fill('4.5')
        country.fill('USA')
        dialog.get_by_role('option').filter(has_text='US').click()
        expect(dialog.get_by_label('當地幣別', exact=True)).to_have_value('USD')
        expect(dialog.get_by_label('旅程時區', exact=True)).to_have_value('')
        expect(dialog.get_by_label('旅程匯率（1 TWD＝多少當地幣）', exact=True)).to_have_value('')
        dialog.get_by_label('旅程時區', exact=True).select_option('America/New_York')
        country.fill('日本')
        country.press('Enter')
        dialog.get_by_label('旅程匯率（1 TWD＝多少當地幣）', exact=True).fill('4.5')
        dialog.get_by_role('button', name='建立並填入 ID', exact=True).click()
        expect(dialog.get_by_label('旅程試算表 ID 或網址', exact=False)).to_have_value('generated-trip-file')
        expect(dialog.get_by_role('alert')).to_contain_text('檔案已建立')
        assert state['created_count'] == 1
        dialog.get_by_role('button', name='重新設定共用', exact=True).click()
        expect(dialog.get_by_role('status')).to_contain_text('已開放連結檢視')
        assert state['created_count'] == 1 and state['share_count'] == 2
        dialog.get_by_role('button', name='關閉編輯', exact=True).click()
        page.get_by_role('button', name='新增旅程', exact=True).click()
        dialog = page.get_by_role('dialog', name='新增旅程')
        expect(dialog.get_by_label('旅程名稱', exact=True)).to_have_value('')
        expect(dialog.get_by_label('旅程試算表 ID 或網址', exact=False)).to_have_value('')
        dialog.get_by_label('旅程名稱', exact=True).fill('自動建檔測試')
        dialog.get_by_label('目的地', exact=True).fill('日本')
        dialog.get_by_label('開始日期', exact=True).fill('2027-07-01')
        dialog.get_by_label('結束日期', exact=True).fill('2027-07-03')
        dialog.get_by_label('旅程試算表 ID 或網址', exact=False).fill('generated-trip-file')
        assert state['created_count'] == 1
        dialog.get_by_role('button', name='儲存', exact=True).click()
        expect(page.get_by_role('heading', name='自動建檔測試', exact=True)).to_be_visible()
        page.get_by_role('button', name='登出', exact=True).click()
        expect(page.get_by_role('button', name='編輯', exact=True)).to_have_count(0)
        expect(page.get_by_role('link', name='查看範例', exact=False)).to_have_count(0)
        expect(page.get_by_text('試算表範本與設定方式', exact=True)).to_have_count(0)
        expect(page.get_by_text('網站設定教學', exact=True)).to_have_count(0)
        assert page.evaluate("!Object.keys(localStorage).some(key => key.startsWith('trip-mate:guide-session:'))")
        page.reload()
        expect(page.get_by_role('button', name='導遊登入', exact=True)).to_be_visible()
        state['email'] = 'not-allowed@example.com'
        page.get_by_role('button', name='導遊登入', exact=True).click()
        expect(page.get_by_role('alert')).to_contain_text('沒有導遊編輯權限')
        expect(page.get_by_role('button', name='新增旅程', exact=True)).to_have_count(0)
        assert not errors, errors
        assert len(writes) == 5
        print('Guide catalog browser checks passed; all Google services mocked.')
    finally:
        browser.close()
