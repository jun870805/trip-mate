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
                    elif 'setDataValidation' in action:
                        assert 'rule' not in action['setDataValidation']
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
        dialog.get_by_label('日期', exact=True).select_option(start)
        start_time = dialog.get_by_label('時間', exact=True)
        expect(start_time).not_to_have_attribute('readonly', '')
        start_time.fill('24:00')
        assert not start_time.evaluate('(input) => input.checkValidity()')
        start_time.fill('18:30')
        assert start_time.evaluate('(input) => input.checkValidity()')
        start_time.fill('')
        expect(dialog.get_by_label('排序', exact=True)).to_have_count(0)
        dialog.get_by_role('button', name='選擇時間', exact=True).click()
        time_picker = page.get_by_role('dialog', name='選擇時間', exact=True)
        hours = time_picker.get_by_role('listbox', name='小時', exact=True)
        minutes = time_picker.get_by_role('listbox', name='分鐘', exact=True)
        hours.focus()
        hours.press('Home')
        for _ in range(18):
            hours.press('ArrowDown')
        minutes.get_by_role('option', name='30', exact=True).click()
        expect(start_time).to_have_value('')
        time_picker.get_by_role('button', name='確定', exact=True).click()
        expect(start_time).to_have_value('18:30')
        start_time.fill('19:45')
        expect(start_time).to_have_value('19:45')
        start_time.fill('18:30')
        dialog.get_by_label('標題', exact=True).fill('新增景點測試')
        dialog.get_by_label('標籤', exact=True).fill('自訂標籤')
        dialog.get_by_label('副標', exact=True).fill('[集合餐廳](https://maps.app.goo.gl/example)')
        dialog.get_by_label('內文', exact=True).fill('## 集合細節\n\n**請準時**\n\n[官網](https://example.com/info)')
        dialog.get_by_role('button', name='儲存', exact=True).click()
        card = dialog.locator('[data-itinerary-id]').filter(has_text='新增景點測試')
        expect(card).to_be_visible()
        expect(card.get_by_role('link', name='集合餐廳')).to_have_count(0)
        card.get_by_role('button', name='編輯', exact=True).click()
        expect(dialog.get_by_label('副標', exact=True)).to_have_value('[集合餐廳](https://maps.app.goo.gl/example)')
        expect(dialog.get_by_label('內文', exact=True)).to_contain_text('集合細節')
        dialog.get_by_role('button', name='取消', exact=True).click()
        previous_writes = len(writes)
        handle=card.get_by_role('button', name='調整「新增景點測試」順序', exact=True)
        expect(handle).to_be_visible()
        expect(card.get_by_role('button', name='上移「新增景點測試」', exact=True)).not_to_be_visible()
        assert handle.evaluate('(node)=>getComputedStyle(node).touchAction') == 'none'
        assert card.evaluate('(node)=>getComputedStyle(node).touchAction') == 'auto'
        source=handle.bounding_box()
        destination=dialog.locator('[data-itinerary-id]').first.bounding_box()
        before_top=card.bounding_box()['y']
        assert source and destination
        page.mouse.move(source['x']+source['width']/2,source['y']+source['height']/2)
        page.mouse.down()
        page.mouse.move(destination['x']+destination['width']/2,destination['y']+4,steps=15)
        expect(card).to_have_attribute('data-dragging','true')
        assert card.bounding_box()['y'] < before_top, 'The card should follow the pointer before release'
        assert len(writes) == previous_writes, 'Dragging must not write data before release'
        page.mouse.up()
        conflict = page.get_by_role('dialog', name='調整行程順序', exact=True)
        expect(conflict).to_be_visible()
        conflict.get_by_role('button', name='取消', exact=True).click()
        assert len(writes) == previous_writes
        expect(dialog).to_be_visible()
        page.set_viewport_size({'width': 1280, 'height': 900})
        expect(handle).to_be_visible()
        source=handle.bounding_box()
        destination=dialog.locator('[data-itinerary-id]').first.bounding_box()
        page.mouse.move(source['x']+source['width']/2,source['y']+source['height']/2)
        page.mouse.down()
        page.mouse.move(destination['x']+destination['width']/2,destination['y']+4,steps=15)
        assert len(writes) == previous_writes
        page.mouse.up()
        expect(conflict).to_be_visible()
        assert conflict.evaluate('(dialog) => Math.abs(dialog.firstElementChild.getBoundingClientRect().width - dialog.clientWidth) < 1'), 'Conflict content must fill the dialog without an empty right-hand strip'
        conflict.get_by_role('checkbox', name='不再提醒', exact=True).check()
        conflict.get_by_role('button', name='移除時間並排序', exact=True).click()
        expect(conflict).not_to_be_visible()
        expect(card.locator('time')).to_have_count(0)
        assert page.evaluate("Object.keys(localStorage).some(key => key.endsWith('reorder-no-reminder') && localStorage[key] === 'true')")
        # Desktop and mobile use the same handle; cross-day drops save only on release.
        dialog.get_by_label('編輯行程日期', exact=True).select_option('all')
        destination_day = book['旅程清單'][1][book['旅程清單'][0].index('結束日期')]
        destination_group = dialog.locator('[data-drop-date="'+destination_day+'"]')
        destination_group.scroll_into_view_if_needed()
        # Scroll the source back into view to capture the handle, then scroll the
        # dialog during pointer capture, as the edge auto-scroll does in use.
        handle.scroll_into_view_if_needed()
        source=handle.bounding_box()
        page.mouse.move(source['x']+source['width']/2,source['y']+source['height']/2)
        page.mouse.down()
        destination_group.scroll_into_view_if_needed()
        destination=destination_group.bounding_box()
        before_crossday=len(writes)
        page.mouse.move(destination['x']+destination['width']/2,destination['y']+destination['height']-5,steps=15)
        assert len(writes)==before_crossday
        page.mouse.up()
        expect(destination_group.locator('[data-itinerary-id]').filter(has_text='新增景點測試')).to_be_visible()
        assert len(writes)==before_crossday+1
        # Move it back so subsequent public detail checks still select start day.
        dialog.get_by_label('編輯行程日期', exact=True).select_option(destination_day)
        card.get_by_role('button', name='編輯', exact=True).click()
        dialog.get_by_label('日期', exact=True).select_option(start)
        dialog.get_by_role('button', name='儲存', exact=True).click()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        dialog.get_by_role('button', name='關閉', exact=True).click()
        page.get_by_role('navigation', name='旅程功能').get_by_role('link', name='行程', exact=True).click()
        page.get_by_label('行程日期', exact=True).select_option(start)
        view_more=page.get_by_role('button', name='查看更多：新增景點測試', exact=True)
        expect(view_more).to_be_visible()
        view_more.click()
        details=page.get_by_role('dialog', name='新增景點測試', exact=True)
        expect(details).to_be_visible()
        # Every native dialog shares one body lock; closing a nested dialog must
        # not unlock its parent. Actual wheel/touch behavior also needs device QA.
        assert page.locator('body').evaluate('(node)=>getComputedStyle(node).position') == 'fixed'
        scroll_before=page.evaluate('window.scrollY')
        page.mouse.move(2,2)
        page.mouse.wheel(0,500)
        page.wait_for_timeout(100)
        assert page.evaluate('window.scrollY')==scroll_before

        expect(details.get_by_role('heading', name='集合細節', exact=True)).to_be_visible()
        expect(details.get_by_role('link', name='集合餐廳', exact=True)).to_have_attribute('href','https://maps.app.goo.gl/example')
        expect(details.get_by_role('link', name='官網', exact=True)).to_have_attribute('href','https://example.com/info')
        details.get_by_role('button', name='關閉', exact=True).click()
        expect(details).not_to_be_visible()
        page.get_by_role('button', name='登出', exact=True).click()
        expect(page.get_by_role('button', name='編輯行程', exact=True)).to_have_count(0)
        assert len(writes) == previous_writes + 1, len(writes)
        assert not errors, errors
        print('Trip editor browser smoke checks passed with mocked Google APIs.')
    finally:
        browser.close()
