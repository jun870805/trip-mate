"""Browser smoke tests using intercepted Sheets data, never real account data.
Start Vite with dummy API configuration (see README), then run this script.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5188')
parser.add_argument('--chrome', help='Optional path to a Chrome/Chromium executable')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
book = json.loads((root / 'frontend/src/data/demo.json').read_text())
artifacts = Path('/private/tmp/trip-mate-browser')
artifacts.mkdir(exist_ok=True)

with sync_playwright() as p:
    options = {'headless': True}
    if args.chrome:
        options['executable_path'] = args.chrome
    browser = p.chromium.launch(**options)
    try:
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        failure = {'once': False, 'denied': False}
        def sheets(route):
            if failure['denied']:
                route.fulfill(status=403, headers={'access-control-allow-origin': '*'}, json={'error': {'code': 403, 'status': 'PERMISSION_DENIED', 'message': 'The caller does not have permission'}})
                return
            if failure['once']:
                failure['once'] = False
                route.fulfill(status=403, headers={'access-control-allow-origin': '*'}, json={'error': {'message': 'test error'}})
                return
            ranges = parse_qs(urlparse(route.request.url).query).get('ranges', [])
            values = [{'values': book[r.split('!')[0].strip("'")]} for r in ranges]
            route.fulfill(headers={'access-control-allow-origin': '*'}, json={'valueRanges': values})
        page.route('https://sheets.googleapis.com/**', sheets)
        page.goto(args.url)
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('heading', name='選擇旅程')).to_be_visible()
        expect(page.locator('.trip-card')).to_have_count(1)
        page.locator('.trip-card').click()
        expect(page.get_by_role('heading', name='旅程總覽')).to_be_visible()
        assert '#/' not in page.url
        page.reload()
        expect(page.get_by_role('heading', name='旅程總覽')).to_be_visible()
        page.screenshot(path=str(artifacts / 'desktop-overview.png'), full_page=True)
        nav = page.get_by_role('navigation', name='旅程功能')
        nav.get_by_role('link', name='公積金', exact=True).click()
        page.go_back()
        expect(page.get_by_role('heading', name='旅程總覽')).to_be_visible()
        page.go_forward()
        expect(page.get_by_role('heading', name='每位團員的餘額')).to_be_visible()
        expect(page.locator('.member-card')).to_have_count(3)
        expect(page.get_by_text('JPY 2', exact=True).first).to_be_visible()
        page.get_by_label('團員', exact=True).select_option('M001')
        expect(page.locator('.ledger-row')).to_have_count(3)
        nav.get_by_role('link', name='支出', exact=True).click()
        expect(page.get_by_text('部分已收', exact=True)).to_be_visible()
        page.get_by_label('團員', exact=True).select_option('M001')
        expect(page.locator('.collection-card')).to_have_count(2)
        page.locator('.collection-card summary').first.click()
        expect(page.get_by_text('本批次合計', exact=False).first).to_be_visible()
        nav.get_by_role('link', name='進度', exact=True).click()
        page.get_by_role('button', name='已完成', exact=True).click()
        expect(page.locator('.task-card')).to_have_count(2)
        extra_flight = list(book['航班'][1])
        for key, value in {'航班ID':'A002','航空公司':'分頁測試航空','出發時間':'2027-05-01T13:00:00+08:00','抵達時間':'2027-05-01T17:00:00+09:00'}.items():
            extra_flight[book['航班'][0].index(key)] = value
        book['航班'].append(extra_flight)
        page.get_by_role('button', name='重新讀取旅程', exact=True).click()
        expect(page.get_by_role('heading', name='開團進度', exact=True)).to_be_visible()
        nav.get_by_role('link', name='行程', exact=True).click()
        page.get_by_label('行程日期', exact=True).select_option('2027-05-02')
        expect(page.get_by_role('heading', name='搭機出發')).not_to_be_visible()
        flight_pages=page.get_by_role('group', name='航班切換', exact=True)
        expect(flight_pages.get_by_role('button', name='上一班航班', exact=True)).to_be_disabled()
        expect(flight_pages.get_by_role('button', name='下一班航班', exact=True)).to_be_enabled()
        expect(flight_pages.get_by_label('航班頁碼', exact=True)).to_have_text('1/2')
        expect(page.get_by_text('分頁測試航空 範例航班', exact=True)).not_to_be_visible()
        flight_pages.get_by_role('button', name='下一班航班', exact=True).click()
        expect(flight_pages.get_by_role('button', name='下一班航班', exact=True)).to_be_disabled()
        expect(flight_pages.get_by_role('button', name='上一班航班', exact=True)).to_be_enabled()
        expect(flight_pages.get_by_label('航班頁碼', exact=True)).to_have_text('2/2')
        expect(page.get_by_text('分頁測試航空 範例航班', exact=True)).to_be_visible()
        page.evaluate('window.__printed = false; window.print = () => { window.__printed = true }')
        page.get_by_role('button', name='匯出 PDF', exact=True).click()
        export_dialog = page.get_by_role('dialog', name='匯出 PDF', exact=True)
        expect(export_dialog).to_be_visible()
        assert not page.evaluate('window.__printed')
        expect(export_dialog).to_contain_text('另存為 PDF')
        export_dialog.get_by_label('全部日期', exact=True).check()
        export_dialog.get_by_role('button', name='匯出 PDF', exact=True).click()
        expect(export_dialog).not_to_be_visible()
        assert page.evaluate('window.__printed')
        page.emulate_media(media='print')
        expect(page.get_by_text('分頁測試航空 範例航班', exact=True)).to_be_visible()
        expect(page.get_by_text('範例航空 範例航班', exact=True)).to_be_visible()
        expect(page.get_by_role('group', name='航班切換', exact=True)).not_to_be_visible()
        expect(page.locator('.print-heading').get_by_label('旅程匯率與時差', exact=True)).to_contain_text('匯率：1 TWD = 4.5 JPY')
        expect(page.locator('.print-heading').get_by_label('旅程匯率與時差', exact=True)).to_contain_text('時差：+1 小時')
        expect(page.get_by_role('heading', name='搭機出發')).to_be_visible()
        expect(page.get_by_role('heading', name='大阪城散步')).to_be_visible()
        page.pdf(path=str(artifacts / 'itinerary.pdf'), format='A4', print_background=True)
        page.emulate_media(media='screen')
        page.get_by_role('button', name='匯出 PDF', exact=True).click()
        export_dialog = page.get_by_role('dialog', name='匯出 PDF', exact=True)
        export_dialog.get_by_label('全部日期', exact=True).uncheck()
        expect(export_dialog.get_by_role('button', name='匯出 PDF', exact=True)).to_be_disabled()
        export_dialog.get_by_label('2027/05/02', exact=True).check()
        export_dialog.get_by_role('button', name='取消', exact=True).click()
        page.get_by_role('button', name='匯出 PDF', exact=True).click()
        export_dialog.get_by_role('button', name='匯出 PDF', exact=True).click()
        page.emulate_media(media='print')
        expect(page.get_by_role('heading', name='搭機出發')).not_to_be_visible()
        expect(page.get_by_role('heading', name='大阪城散步')).to_be_visible()
        page.pdf(path=str(artifacts / 'itinerary-current-day.pdf'), format='A4', print_background=True)
        page.emulate_media(media='screen')
        for width in [390, 320, 768, 1280]:
            page.set_viewport_size({'width': width, 'height': 844})
            for tab in ['總覽', '行程', '公積金', '支出', '進度']:
                nav.get_by_role('link', name=tab, exact=True).click()
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'Overflow at {width}: {tab}'
            if width == 390:
                page.screenshot(path=str(artifacts / 'mobile-tasks.png'), full_page=True)
        expect(page.locator('.trip-heading').get_by_label('旅程匯率與時差', exact=True)).to_contain_text('匯率：1 TWD')
        expect(page.locator('.trip-heading').get_by_label('旅程匯率與時差', exact=True)).to_contain_text('時差：+1 小時')
        expect(page.locator('.trip-heading').get_by_role('button', name='重新讀取旅程', exact=True)).to_be_visible()
        expect(page.locator('.content-toolbar')).to_have_count(0)
        failure['once'] = True
        page.get_by_role('button', name='重新讀取旅程', exact=True).click()
        expect(page.get_by_role('alert')).to_contain_text('請稍後再試，或聯絡導遊。')
        page.get_by_role('button', name='重新讀取', exact=True).click()
        expect(page.get_by_role('heading', name='開團進度', exact=True)).to_be_visible()
        nav.get_by_role('link', name='總覽', exact=True).click()
        failure['denied'] = True
        page.get_by_role('button', name='重新讀取旅程', exact=True).click()
        expect(page.get_by_role('heading', name='旅程總覽', exact=True)).to_be_visible()
        expect(page.get_by_role('alert')).to_contain_text('此旅程暫不開放觀看')
        expect(page.get_by_role('navigation', name='旅程功能')).to_have_count(0)
        expect(page.get_by_text('一般存取權', exact=False)).to_have_count(0)
        failure['denied'] = False
        page.get_by_role('button', name='重新讀取', exact=True).click()
        expect(page.get_by_role('navigation', name='旅程功能')).to_be_visible()
        expect(page.get_by_text('此旅程暫不開放觀看', exact=True)).to_have_count(0)
        page.get_by_role('link', name='所有旅程', exact=True).first.click()
        expect(page.get_by_role('link', name='查看範例', exact=False)).to_have_count(0)
        expect(page.get_by_text('試算表範本與設定方式', exact=True)).to_have_count(0)
        expect(page.get_by_text('網站設定教學', exact=True)).to_have_count(0)
        page.goto(args.url + '/demo/T001/overview')
        expect(page.get_by_text('請先以導遊帳號登入後查看範例。', exact=True)).to_be_visible()
        expect(page.get_by_role('navigation', name='旅程功能')).to_have_count(0)
        assert not errors, errors
        print('Browser smoke checks passed. Screenshots and PDF:', artifacts)
    finally:
        browser.close()
