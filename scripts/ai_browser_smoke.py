"""AI UI integration with mocked Provider/OAuth/Sheets. Never sends real model or Google writes."""
import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5193')
parser.add_argument('--chrome')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
book = json.loads((root / 'frontend/src/data/demo.json').read_text())
trip_id = book['旅程清單'][1][0]
first = dict(zip(book['每日行程'][0], book['每日行程'][1]))
book['每日行程'][1][book['每日行程'][0].index('內文')] = '## 交通方式\n\n測試用行程內文，可與右側助手同時閱讀。'
headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
grids = [{'sheetId': index + 1, 'title': title, 'gridProperties': {'rowCount': 1000, 'columnCount': 30}}
         for index, title in enumerate(name for name in book if name != '旅程清單')]
writes = []
emails = []
mail_status = 200
sdk = """window.google={accounts:{oauth2:{initTokenClient(options){return {requestAccessToken(){options.callback({access_token:'mock-guide-token',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'});}};}}}};"""
provider = """
import {ProviderRateLimitError,ProviderModelUnavailableError} from '/src/ai/core/errors.ts';
export async function initializeFirebaseProvider(config) {
  const selectedModel=config.model;
  window.__activeModel=selectedModel;
  return { async generate(request) {
    window.__mockLastMessages=request.messages;
    window.__modelRequests ||= [];
    window.__modelRequests.push({model:selectedModel,messages:request.messages});
    const last=request.messages.at(-1), result=last.parts.find(p=>p.result)?.result;
    if(result) return {parts:[{text:result.response.status==='success'?'已收到實際操作結果。':'已取消，未執行修改。'}]};
    const text=last.parts[0].text;
    if(text.includes('測試用量429')) throw new ProviderRateLimitError();
    if(text.includes('測試模型404')) throw new ProviderModelUnavailableError();
    if(text.includes('慢')) {await new Promise(done=>setTimeout(done,600));return {parts:[{text:'較慢的回覆'}]};}
    if(text.includes('匯入') || text.includes('上傳檔案')) return {parts:[{call:{name:'itinerary_import',args:{activities:[{date:DATE,title:'檔案匯入景點',body:'  保留空白\\n\\n第二段'}],warnings:[]}}}]};
    if(text.includes('轉交') && request.tools.some(tool=>tool.name==='itinerary_request_email')) return {parts:[{call:{name:'itinerary_request_email',args:{request:'第二天午餐希望改成素食餐廳。',contactName:'測試訪客',replyTo:'visitor@example.com'}}}]};
    if(text.includes('修改')) return {parts:[{call:{name:'itinerary_update',args:{id:ID,patch:{title:'AI 修改後景點'}}}}]};
    return {parts:[{call:{name:'itinerary_get_summary',args:{}}}]};
  }};
}
""".replace('DATE', json.dumps(first['日期'])).replace('ID', json.dumps(first['行程ID']))

with sync_playwright() as p:
    options = {'headless': True}
    if args.chrome:
        options['executable_path'] = args.chrome
    browser = p.chromium.launch(**options)
    try:
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        page.add_init_script('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async(text)=>{if(window.__denyClipboard)throw new DOMException("denied","NotAllowedError");window.__copiedReply=text;}}});')
        errors = []
        page.route('https://firebasevertexai.googleapis.com/**',lambda route:route.abort())
        page.route('https://generativelanguage.googleapis.com/**',lambda route:route.abort())
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/src/ai/providers/firebase-runtime.ts*', lambda route: route.fulfill(content_type='application/javascript', body=provider))
        page.route('https://accounts.google.com/gsi/client', lambda route: route.fulfill(content_type='application/javascript', body=sdk))
        page.route('https://openidconnect.googleapis.com/**', lambda route: route.fulfill(headers=headers, json={'email': 'guide@example.com', 'email_verified': True}))
        def sheets(route):
            request = route.request
            url = urlparse(request.url)
            if request.method == 'OPTIONS':
                route.fulfill(status=204, headers=headers)
            elif request.method == 'POST':
                assert request.headers.get('authorization') == 'Bearer mock-guide-token'
                body = json.loads(request.post_data)
                writes.append(body)
                for action in body['requests']:
                    if 'updateCells' not in action:
                        continue
                    update = action['updateCells']
                    start = update['start']
                    grid = next(item for item in grids if item['sheetId'] == start['sheetId'])
                    rows = book[grid['title']]
                    while len(rows) <= start['rowIndex']:
                        rows.append([])
                    while len(rows[start['rowIndex']]) <= start['columnIndex']:
                        rows[start['rowIndex']].append('')
                    rows[start['rowIndex']][start['columnIndex']] = update['rows'][0]['values'][0]['userEnteredValue']['stringValue']
                route.fulfill(headers=headers, json={})
            elif url.path.endswith('values:batchGet'):
                route.fulfill(headers=headers, json={'valueRanges': [{'values': book[value.split('!')[0].strip("'")]} for value in parse_qs(url.query)['ranges']]})
            else:
                route.fulfill(headers=headers, json={'sheets': [{'properties': value} for value in grids]})
        page.route('https://sheets.googleapis.com/**', sheets)
        def emailjs(route):
            request=route.request
            if request.method=='OPTIONS':
                route.fulfill(status=204,headers=headers)
                return
            assert request.method=='POST'
            assert 'authorization' not in request.headers
            body=json.loads(request.post_data)
            assert body['service_id']=='service_test' and body['template_id']=='template_test'
            assert body['user_id']=='public_test'
            assert 'to_email' not in body['template_params']
            emails.append(body)
            route.fulfill(status=mail_status,headers=headers,content_type='text/plain',body='OK' if mail_status==200 else 'rejected')
        page.route('https://api.emailjs.com/api/v1.0/email/send',emailjs)
        page.goto(args.url)
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('button', name='開啟 AI 助手', exact=True)).to_have_count(0)
        page.locator('.trip-card-link').first.click()
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('button', name='開啟 AI 助手', exact=True)).to_have_count(0)
        page.get_by_role('navigation', name='旅程功能').get_by_text('行程', exact=True).click()
        launcher = page.get_by_role('button', name='開啟 AI 助手', exact=True)
        expect(launcher).to_be_visible()
        page.evaluate('window.scrollTo(0,200)')
        original_y = page.evaluate('window.scrollY')
        launcher.click()
        dialog = page.locator('aside[aria-labelledby]')
        expect(dialog).to_have_attribute('role','complementary')
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role('status')).to_have_count(0)
        expect(dialog.get_by_role('heading',name='您好！ 我是您的 AI 助手',exact=True)).to_be_visible()
        expect(dialog.get_by_text('輸入提示詞即可開始使用，或是可以先試試以下功能～',exact=True)).to_be_visible()
        assert page.evaluate('document.body.style.position') != 'fixed'
        assert dialog.bounding_box()['y'] == 0
        expect(dialog.get_by_role('heading',name='AI 助手',exact=True)).to_be_visible()
        expect(dialog.get_by_text('本分頁暫存',exact=True)).to_have_count(0)
        expect(dialog.get_by_text('唯讀查詢',exact=True)).to_have_count(0)
        assert 'TXT、CSV、XLSX' not in dialog.inner_text()
        close = dialog.get_by_role('button',name='關閉 AI 助手')
        reset = dialog.locator('button[aria-label="新對話"]')
        assert close.evaluate('(el)=>getComputedStyle(el).borderTopWidth') == '0px'
        expect(reset).to_be_visible()
        assert reset.bounding_box()['x'] < close.bounding_box()['x']
        assert reset.evaluate('(el)=>getComputedStyle(el).borderTopWidth') == '1px'
        assert dialog.bounding_box()['x'] >= page.locator('.trip-content').bounding_box()['x'] + page.locator('.trip-content').bounding_box()['width']
        date = page.get_by_label('行程日期',exact=True)
        if date.count(): date.select_option('all')
        detail = page.get_by_role('button',name='查看更多：').first
        if detail.count():
            detail.click()
            expect(page.get_by_role('button',name='收合內文：').first).to_be_visible()
            expect(page.locator('dialog[open]')).to_have_count(0)
        models=dialog.get_by_role('combobox',name='語言模型',exact=True)
        expect(models).to_have_value('test-model')
        expect(models.locator('option[value="test-model"]')).to_have_text('test-model (推薦)')
        assert models.bounding_box()['x'] < dialog.get_by_role('button',name='送出',exact=True).bounding_box()['x']
        message = dialog.get_by_label('訊息', exact=False)
        expect(message).to_have_attribute('placeholder','問問 AI助手')
        assert dialog.locator('label').filter(has_text='訊息').evaluate('(el)=>getComputedStyle(el).clipPath') == 'inset(50%)'
        message.fill('尚未送出的訊息')
        dialog.get_by_role('button', name='關閉 AI 助手').click()
        expect(dialog).not_to_be_visible()
        launcher.click()
        expect(message).to_have_value('尚未送出的訊息')
        message.fill('總結')
        message.press('Shift+Enter')
        message.type('行程')
        expect(message).to_have_value('總結\n行程')
        message.evaluate('(el)=>el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,isComposing:true}))')
        expect(dialog.get_by_role('log')).to_be_empty()
        message.evaluate('(el)=>el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,keyCode:229}))')
        expect(dialog.get_by_role('log')).to_be_empty()
        message.fill('總結行程')
        message.press('Enter')
        expect(dialog.get_by_role('log')).to_contain_text('已收到實際操作結果')
        assert len(writes) == 0
        copy = dialog.get_by_role('button',name='複製回覆',exact=True)
        expect(copy).to_have_count(1)
        assert copy.evaluate('(el)=>getComputedStyle(el).borderTopWidth') == '0px'
        assert copy.evaluate('(el)=>el.parentElement.previousElementSibling.getBoundingClientRect().bottom <= el.getBoundingClientRect().top')
        copy.click()
        expect(copy).to_have_attribute('title','已複製')
        assert page.evaluate('window.__copiedReply') == '已收到實際操作結果。'
        page.evaluate('window.__denyClipboard=true')
        copy.click()
        expect(dialog.get_by_text('無法複製，請手動選取文字。',exact=True)).to_be_visible()
        page.evaluate('window.__denyClipboard=false')
        copy.click()
        expect(dialog.get_by_text('無法複製，請手動選取文字。',exact=True)).to_have_count(0)
        for author in ['你','AI 助手']:
            for label in dialog.get_by_role('log').get_by_text(author,exact=True).all():
                assert label.evaluate('(el)=>getComputedStyle(el).clipPath') == 'inset(50%)'
        page.screenshot(path='/tmp/trip-ai-desktop.png')
        message.fill('模型切換保留輸入')
        models.select_option('test-model-alternative-with-long-name')
        expect(message).to_be_enabled()
        expect(message).to_have_value('模型切換保留輸入')
        expect(dialog.get_by_role('log')).to_be_empty()
        message.fill('替代模型問題');message.press('Enter')
        expect(dialog.get_by_role('log')).to_contain_text('已收到實際操作結果')
        assert page.evaluate('window.__modelRequests.at(-1).model')=='test-model-alternative-with-long-name'
        assert not page.evaluate('window.__mockLastMessages.some(m=>m.parts.some(p=>p.text==="總結行程"))')
        models.select_option('test-model')
        expect(message).to_be_enabled()
        expect(dialog.get_by_role('log')).to_contain_text('總結行程')
        expect(dialog.get_by_role('log')).not_to_contain_text('替代模型問題')
        message.fill('縮小保留的輸入')
        page.keyboard.press('Escape')
        expect(dialog).not_to_be_visible()
        expect(launcher).to_be_focused()
        launcher.click()
        expect(message).to_have_value('縮小保留的輸入')
        page.reload(); page.wait_for_load_state('networkidle')
        launcher.click()
        expect(dialog.get_by_role('log')).to_contain_text('總結行程')
        expect(message).to_have_value('')
        message.fill('繼續記憶')
        dialog.get_by_role('button',name='送出',exact=True).click()
        expect(message).to_be_enabled()
        assert page.evaluate('window.__mockLastMessages.some(m=>m.parts.some(p=>p.text==="總結行程"))')
        dialog.get_by_role('button',name='新對話',exact=True).click()
        expect(dialog.get_by_role('log')).to_be_empty()
        expect(message).to_have_value('')
        expect(message).to_be_enabled()
        before=page.evaluate('window.__modelRequests.length')
        message.fill('測試用量429');message.press('Enter')
        quota=dialog.get_by_role('alert')
        expect(quota).to_have_text('超過用量，請更換語言模型，或稍後再試。')
        assert quota.evaluate('(el)=>getComputedStyle(el).color')=='rgb(255, 0, 0)'
        page.screenshot(path='/tmp/trip-ai-model-quota.png')
        expect(models).to_be_enabled()
        assert page.evaluate('window.__modelRequests.length')==before+1
        expect(models).to_have_value('test-model')
        models.select_option('test-model-alternative-with-long-name')
        expect(message).to_be_enabled()
        expect(dialog.get_by_role('alert')).to_have_count(0)
        expect(dialog.get_by_role('log')).to_contain_text('替代模型問題')
        assert page.evaluate('window.__modelRequests.length')==before+1
        models.select_option('test-model')
        expect(message).to_be_enabled()
        expect(dialog.get_by_role('log')).to_be_empty()
        before=page.evaluate('window.__modelRequests.length')
        message.fill('測試模型404');message.press('Enter')
        missing=dialog.get_by_role('alert')
        expect(missing).to_have_text('此模型目前無法使用，請更換語言模型或聯絡導遊。')
        assert missing.evaluate('(el)=>getComputedStyle(el).color')=='rgb(255, 0, 0)'
        expect(models).to_be_enabled()
        expect(models).to_have_value('test-model')
        assert page.evaluate('window.__modelRequests.length')==before+1
        models.select_option('test-model-alternative-with-long-name')
        expect(message).to_be_enabled()
        expect(dialog.get_by_role('alert')).to_have_count(0)
        assert page.evaluate('window.__modelRequests.length')==before+1
        models.select_option('test-model')
        expect(message).to_be_enabled()
        template=dialog.get_by_role('button',name='總結這趟行程',exact=True)
        template.evaluate('(button)=>{button.click();button.click();}')
        expect(dialog.get_by_role('log')).to_contain_text('已收到實際操作結果')
        expect(dialog.get_by_role('log').get_by_text('總結這趟行程',exact=True)).to_have_count(1)
        expect(message).to_have_value('')
        dialog.get_by_role('button',name='新對話',exact=True).click()
        expect(dialog.get_by_role('log')).to_be_empty()
        page.reload(); page.wait_for_load_state('networkidle'); launcher.click()
        expect(dialog.get_by_role('log')).to_be_empty()
        message.fill('想修改第二天午餐，請轉交導遊')
        message.press('Enter')
        mail_preview=dialog.get_by_role('region',name='待確認的需求郵件')
        expect(mail_preview).to_be_visible()
        expect(models).to_be_disabled()
        expect(mail_preview).to_contain_text('admin@example.com')
        expect(mail_preview).to_contain_text('第二天午餐希望改成素食餐廳。')
        expect(mail_preview).to_contain_text('visitor@example.com')
        assert not emails and not writes
        mail_preview.get_by_role('button',name='取消寄送',exact=True).click()
        expect(dialog.get_by_role('log')).to_contain_text('已取消寄送，未寄出郵件。')
        assert not emails
        message.fill('請轉交導遊');message.press('Enter')
        expect(mail_preview).to_be_visible()
        page.reload();page.wait_for_load_state('networkidle');launcher.click()
        expect(message).to_be_enabled()
        expect(mail_preview).to_have_count(0)
        assert not emails
        message.fill('請轉交導遊');message.press('Enter')
        expect(mail_preview).to_be_visible()
        page.screenshot(path='/tmp/trip-ai-mail-preview.png')
        page.set_viewport_size({'width':390,'height':844})
        expect(dialog).to_have_attribute('role','dialog')
        expect(mail_preview).to_be_visible()
        mail_preview.get_by_role('button',name='確認寄送',exact=True).scroll_into_view_if_needed()
        assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        assert mail_preview.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        page.screenshot(path='/tmp/trip-ai-mail-mobile.png')
        page.set_viewport_size({'width':1280,'height':900})
        expect(dialog).to_have_attribute('role','complementary')
        mail_preview.get_by_role('button',name='確認寄送',exact=True).evaluate('(button)=>{button.click();button.click();}')
        expect(dialog.get_by_role('log')).to_contain_text('郵件服務已接受寄送申請，等待導遊回覆；行程尚未修改。')
        assert len(emails)==1 and not writes
        assert emails[0]['template_params']['message'].endswith(emails[0]['template_params']['request_id'])
        expect(message).to_be_enabled()
        page.reload();page.wait_for_load_state('networkidle');launcher.click()
        expect(dialog.get_by_role('log')).to_contain_text('郵件服務已接受寄送申請')
        assert len(emails)==1
        dialog.get_by_role('button',name='新對話',exact=True).click()
        expect(message).to_be_enabled()
        mail_status=429
        message.fill('請轉交導遊');message.press('Enter')
        expect(mail_preview).to_be_visible()
        mail_preview.get_by_role('button',name='確認寄送',exact=True).click()
        expect(dialog.get_by_role('log')).to_contain_text('郵件未確認寄送成功。')
        assert len(emails)==2 and not writes
        expect(message).to_be_enabled()
        dialog.get_by_role('button',name='新對話',exact=True).click()
        expect(message).to_be_enabled()
        mail_status=200
        message.fill('請轉交導遊');message.press('Enter')
        expect(mail_preview).to_be_visible()
        dialog.get_by_role('button', name='關閉 AI 助手').click()
        page.get_by_role('button', name='導遊登入', exact=True).click()
        expect(page.get_by_role('button', name='登出', exact=True)).to_be_visible()
        launcher.click()
        expect(dialog.get_by_role('status')).to_have_count(0)
        expect(mail_preview).to_have_count(0)
        assert len(emails)==2
        assert page.evaluate('Object.keys(sessionStorage).filter(k=>k.startsWith("trip-mate:ai-conversation:") && k.includes("visitor")).length')==0
        message.fill('修改第一筆行程')
        dialog.get_by_role('button', name='送出', exact=True).click()
        preview = dialog.get_by_role('region', name='待確認的行程變更')
        expect(preview).to_be_visible()
        expect(preview).not_to_contain_text(first['行程ID'])
        expect(models).to_be_disabled()
        assert len(writes) == 0
        dialog.get_by_role('button', name='關閉 AI 助手').click()
        page.get_by_role('button', name='開啟 AI 助手，尚有待確認變更').click()
        expect(preview).to_be_visible()
        page.reload(); page.wait_for_load_state('networkidle'); launcher.click()
        expect(message).to_be_enabled()
        expect(preview).to_have_count(0)
        assert len(writes) == 0
        message.fill('修改第一筆行程')
        dialog.get_by_role('button', name='送出', exact=True).click()
        expect(preview).to_be_visible()
        preview.get_by_role('button', name='取消變更').click()
        expect(preview).not_to_be_visible()
        expect(dialog.get_by_role('log')).to_contain_text('未執行修改')
        assert len(writes) == 0
        message.fill('修改第一筆行程')
        dialog.get_by_role('button', name='送出', exact=True).click()
        expect(preview).to_be_visible()
        dialog.evaluate('''panel=>{
          window.__sawWriteLock=false;
          new MutationObserver(()=>{
            if(panel.querySelector('[aria-label="關閉 AI 助手"]').disabled && panel.querySelector('[aria-label="新對話"]').disabled) window.__sawWriteLock=true;
          }).observe(panel,{subtree:true,attributes:true,attributeFilter:['disabled']});
        }''')
        preview.get_by_role('button', name='確認儲存', exact=True).click()
        expect(dialog.get_by_role('log')).to_contain_text('已儲存 1 項操作')
        assert len(writes) == 1
        assert page.evaluate('window.__sawWriteLock')
        expect(page.locator('.trip-content h4').filter(has_text='AI 修改後景點')).to_have_count(1)
        expect(message).to_be_enabled()
        page.reload();page.wait_for_load_state('networkidle');launcher.click()
        expect(dialog.get_by_role('log')).to_contain_text('已儲存 1 項操作')
        assert len(writes) == 1
        with page.expect_file_chooser() as chooser:
            dialog.get_by_role('button', name='上傳檔案').click()
        chooser.value.set_files({'name':'行程.csv','mimeType':'text/csv','buffer':'日期,標題\n'.encode()})
        expect(dialog.get_by_role('list',name='待上傳附件')).to_contain_text('行程.csv')
        dialog.get_by_role('button', name='送出', exact=True).click()
        expect(preview).to_contain_text('檔案匯入景點')
        assert 'untrustedContent' not in dialog.get_by_role('log').inner_text()
        assert len(writes) == 1
        preview.get_by_role('button', name='確認儲存', exact=True).click()
        expect(dialog.get_by_role('log').get_by_text('已儲存 1 項操作。',exact=True)).to_have_count(2)
        assert len(writes) == 2
        expect(message).to_be_enabled()
        assert page.evaluate('Object.keys(sessionStorage).filter(k=>k.startsWith("trip-mate:ai-conversation:")).length') == 0
        page.reload();page.wait_for_load_state('networkidle');launcher.click()
        expect(dialog.get_by_role('log')).to_be_empty()
        expect(message).to_be_enabled()
        message.fill('跨尺寸保留輸入')
        page.set_viewport_size({'width':390,'height':844})
        expect(dialog).to_have_attribute('role','dialog')
        expect(message).to_have_value('跨尺寸保留輸入')
        assert page.evaluate('document.body.style.position') == 'fixed'
        assert page.evaluate('document.querySelector("#root").inert')
        dialog.get_by_role('button', name='關閉 AI 助手').click()
        expect(launcher).to_be_visible()
        assert not page.evaluate('document.querySelector("#root").inert')
        assert page.evaluate('document.body.style.position') != 'fixed'
        nav_box=page.get_by_role('navigation',name='旅程功能').bounding_box()
        launch_box=launcher.bounding_box()
        assert launch_box['y']+launch_box['height'] <= nav_box['y']
        launcher.click()
        expect(message).to_have_value('跨尺寸保留輸入')
        message.fill('手機換行')
        message.press('Shift+Enter')
        expect(message).to_have_value('手機換行\n')
        expect(dialog.get_by_role('log')).to_be_empty()
        message.fill('手機送出')
        message.press('Enter')
        expect(dialog.get_by_role('log')).to_contain_text('已收到實際操作結果')
        expect(message).to_have_value('')
        dialog.get_by_role('button',name='新對話',exact=True).click()
        expect(message).to_be_enabled()
        message.fill('慢回覆')
        dialog.get_by_role('button',name='送出',exact=True).click()
        expect(dialog.get_by_role('status')).to_have_text('思考中...')
        expect(models).to_be_disabled()
        spinner=dialog.get_by_role('status').locator('[aria-hidden="true"]')
        expect(spinner).to_be_visible()
        assert spinner.evaluate('(el)=>getComputedStyle(el).animationName') != 'none'
        dialog.get_by_role('button',name='新對話',exact=True).click()
        expect(message).to_be_enabled()
        page.wait_for_timeout(750)
        expect(dialog.get_by_role('log')).not_to_contain_text('較慢的回覆')
        for _ in range(15):
            page.keyboard.press('Tab')
            assert dialog.evaluate('(panel)=>panel.contains(document.activeElement)')
        assert dialog.bounding_box()['width'] <= 390
        assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        page.screenshot(path='/tmp/trip-ai-mobile.png')
        message.fill('匯入行程')
        dialog.get_by_role('button',name='送出',exact=True).click()
        expect(preview).to_be_visible()
        page.screenshot(path='/tmp/trip-ai-mobile-preview.png')
        page.keyboard.press('Escape')
        expect(dialog).not_to_be_visible()
        assert len(writes) == 2
        page.get_by_role('button', name='開啟 AI 助手，尚有待確認變更').click()
        expect(preview).to_be_visible()
        dialog.get_by_role('button',name='新對話',exact=True).click()
        expect(preview).to_have_count(0)
        expect(message).to_be_enabled()
        for width,role in [(700,'dialog'),(701,'complementary'),(1000,'complementary')]:
            page.set_viewport_size({'width':width,'height':844})
            expect(dialog).to_have_attribute('role',role)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            if width > 700:
                assert dialog.bounding_box()['y'] == 0
                assert page.evaluate('document.body.style.position') != 'fixed'
                header_button=page.get_by_role('button',name='登出',exact=True).bounding_box()
                assert header_button['x']+header_button['width'] <= dialog.bounding_box()['x']
        page.set_viewport_size({'width':844,'height':390})
        dialog.get_by_role('button',name='上傳檔案').scroll_into_view_if_needed()
        box=dialog.bounding_box()
        upload=dialog.get_by_role('button',name='上傳檔案').bounding_box()
        assert upload['y']+upload['height'] <= box['y']+box['height']
        page.set_viewport_size({'width':390,'height':844})
        dialog.get_by_role('button',name='關閉 AI 助手').click()
        page.get_by_role('navigation',name='旅程功能').get_by_text('總覽',exact=True).click()
        expect(page.get_by_role('button',name='開啟 AI 助手',exact=True)).to_have_count(0)
        disabled_page=browser.new_page(viewport={'width':390,'height':844})
        disabled_page.route('https://sheets.googleapis.com/**',sheets)
        disabled_page.route('**/src/features/trip-ai/config.ts*',lambda route:route.fulfill(content_type='application/javascript',body='export function readFirebaseConfig(){return null;}'))
        disabled_page.goto(args.url+'/trip/'+trip_id+'/itinerary')
        disabled_page.wait_for_load_state('networkidle')
        disabled_page.get_by_role('button',name='開啟 AI 助手',exact=True).click()
        off=disabled_page.get_by_role('dialog',name='AI 助手',exact=True)
        expect(off.get_by_text('AI 助手尚未啟用，請聯絡導遊。',exact=True)).to_be_visible()
        expect(off.get_by_label('訊息',exact=False)).to_be_disabled()
        expect(off.get_by_role('button',name='送出',exact=True)).to_be_disabled()
        disabled_page.close()
        quota = browser.new_page(viewport={'width':1280,'height':900})
        quota.route('https://sheets.googleapis.com/**',sheets)
        quota.route('https://accounts.google.com/gsi/client',lambda route:route.fulfill(content_type='application/javascript',body=sdk))
        quota.route('**/src/ai/providers/firebase-runtime.ts*',lambda route:route.fulfill(content_type='application/javascript',body=provider))
        quota.add_init_script('const original=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){if(k.startsWith("trip-mate:ai-conversation:"))throw new DOMException("quota","QuotaExceededError");return original.call(this,k,v);};')
        quota.goto(args.url+'/trip/'+trip_id+'/itinerary');quota.wait_for_load_state('networkidle')
        quota.get_by_role('button',name='開啟 AI 助手',exact=True).click()
        q=quota.get_by_role('complementary',name='AI 助手',exact=True)
        expect(q.get_by_label('訊息',exact=False)).to_be_enabled()
        q.get_by_label('訊息',exact=False).fill('總結行程')
        q.get_by_role('button',name='送出',exact=True).click()
        expect(q.get_by_role('log')).to_contain_text('已收到實際操作結果')
        expect(q.get_by_text('僅保留本次對話：瀏覽器無法暫存',exact=True)).to_be_visible()
        q.get_by_role('button',name='新對話',exact=True).click()
        expect(q.get_by_role('log')).to_be_empty()
        quota.close()
        assert not errors, errors
        print('AI UI passed: model selection/draft/history isolation, recommended default, red 404/429 and no automatic retry;  guest email preview/cancel/approve, no replay, login invalidation, HTTP rejection;  refresh memory, clear, pending not replayed, responsive composer,  desktop/mobile, scroll/focus, minimize/restore, cancel/confirm, uploads, refresh results, ID privacy, stale replies and scope cleanup. Mock Sheets writes: 2.')
    finally:
        browser.close()
