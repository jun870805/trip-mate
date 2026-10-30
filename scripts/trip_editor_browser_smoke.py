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
        close_policy={'accept':True,'messages':[]}
        def respond_to_dialog(dialog):
            close_policy['messages'].append(dialog.message)
            if dialog.type=='confirm' and not close_policy['accept']:
                dialog.dismiss()
            else:
                dialog.accept()
        page.on('dialog', respond_to_dialog)
        def assert_form_close_cancelled(dialog, field, expected):
            before=len(writes)
            before_prompts=len(close_policy['messages'])
            close_policy['accept']=False
            dialog.get_by_role('button', name='關閉', exact=True).click()
            expect(field).to_have_value(expected)
            page.keyboard.press('Escape')
            expect(field).to_have_value(expected)
            close_policy['accept']=True
            assert len(close_policy['messages'])==before_prompts+2
            assert '不會保存' in close_policy['messages'][-1]
            assert len(writes)==before

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
        assert_form_close_cancelled(dialog, dialog.get_by_label('事項', exact=True), '確認集合地點')
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
        assert_form_close_cancelled(dialog, dialog.get_by_label('項目', exact=True), '共同午餐測試')
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
        dialog.get_by_label('標題', exact=True).fill('關閉確認測試')
        before_close_writes=len(writes)
        close_policy['accept']=False
        dialog.get_by_role('button', name='關閉', exact=True).click()
        expect(dialog.get_by_label('標題', exact=True)).to_have_value('關閉確認測試')
        assert '不會保存' in close_policy['messages'][-1]
        before_escape=len(close_policy['messages'])
        page.keyboard.press('Escape')
        assert len(close_policy['messages'])==before_escape+1
        expect(dialog.get_by_label('標題', exact=True)).to_have_value('關閉確認測試')
        close_policy['accept']=True
        dialog.get_by_role('button', name='關閉', exact=True).click()
        expect(dialog).not_to_be_visible()
        assert len(writes)==before_close_writes
        page.get_by_role('button', name='編輯行程', exact=True).click()
        dialog=page.get_by_role('dialog', name='編輯行程')
        dialog.get_by_role('button', name='新增每日行程', exact=True).click()
        expect(dialog.get_by_label('標題', exact=True)).to_have_value('')
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
        tag_writes=len(writes)
        dialog.get_by_role('button', name='選擇既有標籤', exact=True).click()
        tag_picker=page.get_by_role('dialog', name='選擇既有標籤', exact=True)
        expect(tag_picker).to_be_visible()
        tag_header=tag_picker.locator('.dialog-heading').bounding_box()
        for tag_button in tag_picker.locator('button[aria-pressed]').all():
            tag_button.scroll_into_view_if_needed()
            bounds=tag_button.bounding_box()
            panel_bounds=tag_picker.bounding_box()
            assert bounds['y'] >= tag_header['y']+tag_header['height']-1, 'Tag labels must not be covered by the picker heading'
            assert bounds['x'] >= panel_bounds['x'] and bounds['x']+bounds['width'] <= panel_bounds['x']+panel_bounds['width'], 'Tag labels must wrap within the picker'

        for tag in ['交通','住宿','景點','自由活動']:
            expect(tag_picker.get_by_role('button', name=tag, exact=True)).to_be_visible()
        tag_picker.get_by_role('button', name='景點', exact=True).click()
        expect(tag_picker).not_to_be_visible()
        expect(dialog.get_by_label('標籤', exact=True)).to_have_value('自訂標籤,景點')
        assert len(writes)==tag_writes
        dialog.get_by_role('button', name='選擇既有標籤', exact=True).click()
        expect(tag_picker.get_by_role('button', name='景點', exact=True)).to_be_disabled()
        tag_close_prompts=len(close_policy['messages'])
        tag_picker.press('Escape')
        expect(tag_picker).not_to_be_visible()
        expect(dialog).to_be_visible()
        assert len(close_policy['messages'])==tag_close_prompts
        expect(dialog.get_by_label('標籤', exact=True)).to_have_value('自訂標籤,景點')

        dialog.get_by_label('副標', exact=True).fill('[集合餐廳](https://maps.app.goo.gl/example)')
        dialog.get_by_label('內文', exact=True).fill('## 集合細節\n\n[跳到交通方式](#交通方式)\n\n**請準時**\n\n[官網](https://example.com/info)\n\n' + ('補充說明\n\n' * 30) + '## 交通方式\n\n搭乘地鐵\n\n' + ('後續說明\n\n' * 30))
        dialog.get_by_role('button', name='儲存', exact=True).click()
        card = dialog.locator('[data-itinerary-id]').filter(has_text='新增景點測試')
        expect(card).to_be_visible()
        expect(card.get_by_role('link', name='集合餐廳')).to_have_count(0)
        original_id=card.get_attribute('data-itinerary-id')
        before_copy=len(writes)
        card.get_by_role('button', name='複製', exact=True).click()
        expect(dialog.locator('[data-itinerary-id]').filter(has_text='新增景點測試')).to_have_count(2)
        assert len(writes)==before_copy+1
        columns=book['每日行程'][0]
        key_column=columns.index('行程ID')
        source_row=next(row for row in book['每日行程'][1:] if row and row[key_column]==original_id)
        copy_row=book['每日行程'][-1]
        copy_id=copy_row[key_column]
        assert copy_id!=original_id
        assert [value for index,value in enumerate(copy_row) if index!=key_column]==[value for index,value in enumerate(source_row) if index!=key_column]
        dialog.locator('[data-itinerary-id="'+copy_id+'"]').get_by_role('button', name='刪除', exact=True).click()
        expect(dialog.locator('[data-itinerary-id]').filter(has_text='新增景點測試')).to_have_count(1)
        assert len(writes)==before_copy+2

        card.get_by_role('button', name='編輯', exact=True).click()
        expect(dialog.get_by_label('副標', exact=True)).to_have_value('[集合餐廳](https://maps.app.goo.gl/example)')
        expect(dialog.get_by_label('內文', exact=True)).to_contain_text('集合細節')
        close_policy['accept']=False
        dialog.get_by_role('button', name='關閉', exact=True).click()
        expect(dialog.get_by_label('內文', exact=True)).to_contain_text('集合細節')
        close_policy['accept']=True
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
        public_card=page.locator('.timeline-card').filter(has_text='新增景點測試')
        card_link=public_card.get_by_role('link', name='集合餐廳', exact=True)
        card_link.evaluate('(node)=>node.addEventListener("click",event=>event.preventDefault(),{once:true})')
        card_link.click()
        expect(page.get_by_role('dialog', name='新增景點測試', exact=True)).to_have_count(0)
        public_card.click(position={'x':12,'y':12})
        details=page.get_by_role('dialog', name='新增景點測試', exact=True)
        expect(details).to_be_visible()
        expect(details.get_by_role('button', name='回到最上面', exact=True)).to_have_count(0)
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
        assert details.locator('.dialog-heading').first.evaluate('(node)=>parseFloat(getComputedStyle(node).paddingBottom)') == 12
        route_before=page.url
        background_before=page.evaluate('window.scrollY')
        details.get_by_role('link', name='跳到交通方式', exact=True).click()
        section=details.get_by_role('heading', name='交通方式', exact=True)
        page.wait_for_function('(dialog)=>dialog.scrollTop > 0', arg=details.element_handle())
        # Wait for the accessible smooth scroll before checking its final offset.
        page.wait_for_timeout(800)
        assert page.url==route_before
        assert page.evaluate('window.scrollY')==background_before
        for viewport in [{'width':390,'height':844},{'width':1280,'height':900}]:
            page.set_viewport_size(viewport)
            details.evaluate('(dialog)=>{dialog.scrollTop=dialog.scrollHeight}')
            header=details.locator('.dialog-heading').first.bounding_box()
            bounds=details.bounding_box()
            close=details.get_by_role('button', name='關閉', exact=True).bounding_box()
            assert header and bounds and close
            assert abs(header['y']-bounds['y'])<3, 'Dialog heading must remain at its top edge while scrolling'
            assert bounds['y'] <= close['y'] < bounds['y']+bounds['height']
        details.evaluate('(dialog)=>{dialog.scrollTop=0}')
        details.get_by_role('link', name='跳到交通方式', exact=True).click()
        page.wait_for_timeout(800)
        header=details.locator('.dialog-heading').first.bounding_box()
        section_box=section.bounding_box()
        assert section_box['y'] >= header['y']+header['height'], 'Anchor targets must clear the sticky header'
        top_button=details.get_by_role('button', name='回到最上面', exact=True)
        expect(top_button).to_be_visible()
        page.wait_for_timeout(3200)
        expect(top_button).to_have_count(0)
        details.evaluate('(dialog)=>{dialog.scrollTop+=20}')
        expect(top_button).to_be_visible()

        top_bounds=top_button.bounding_box()
        dialog_bounds=details.bounding_box()
        assert dialog_bounds['x'] < top_bounds['x'] < dialog_bounds['x']+dialog_bounds['width']
        assert dialog_bounds['y'] < top_bounds['y'] < dialog_bounds['y']+dialog_bounds['height']
        background_before_top=page.evaluate('window.scrollY')
        top_button.click()
        page.wait_for_function('(dialog)=>dialog.scrollTop===0', arg=details.element_handle())
        expect(top_button).to_have_count(0)
        assert page.evaluate('window.scrollY')==background_before_top

        details.get_by_role('button', name='關閉', exact=True).click()
        expect(details).not_to_be_visible()
        page.get_by_role('button', name='登出', exact=True).click()
        expect(page.get_by_role('button', name='編輯行程', exact=True)).to_have_count(0)
        assert len(writes) == previous_writes + 1, len(writes)
        assert not errors, errors
        print('Trip editor browser smoke checks passed with mocked Google APIs.')
    finally:
        browser.close()
