import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const target = await mkdtemp(path.join(tmpdir(), "trip-mate-render-"));
try {
  await build({
    stdin: {
      resolveDir: path.resolve("frontend"),
      loader: "tsx",
      contents: `
        import assert from 'node:assert/strict'
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { Overview, Itinerary, Fund, Expenses, Tasks } from './src/pages/TripViews'
        import App from './src/App'
        import { TripFacts } from './src/components/TripFacts'
        import { TripEditing, TripForm } from './src/components/TripEditor'
        import { CatalogEditor } from './src/components/CatalogEditor'
        import { GuideTools } from './src/components/ui'
        import { TripReadFailure } from './src/components/TripReadFailure'
        import { parseCatalog, parseTrip, tripSheets } from './src/data/portal'
        import { DatePicker } from './src/components/DatePicker'
        import { pickerInputDisplay } from './src/data/date-picker'
        import { TimeWheel } from './src/components/TimeWheel'
        import { PdfExportDialog } from './src/components/PdfExportDialog'
        import { TripHeaderActions } from './src/components/TripHeaderActions'
        import { CloseButton } from './src/components/CloseButton'
        import { GuideSharing } from './src/components/GuideSharing'
        import { DRIVE_FILE_SCOPE } from './src/data/guide-auth'
        import bookingStyles from './src/components/BookingCards.module.css'
        import demo from './src/data/demo.json'
        const trip = parseCatalog(demo['旅程清單'])[0]
        const data = parseTrip(trip, demo)
        globalThis.window = { location: { pathname: '/' } }
        const home = renderToStaticMarkup(createElement(App))
        assert.ok(home.includes('選擇旅程'))
        for (const text of ['查看範例', '試算表範本與設定方式', '網站設定教學']) assert.ok(!home.includes(text), 'Guide tools must be hidden from visitors')
        assert.ok(!home.includes('大阪三日'), 'Real empty catalog must not display sample trips')
        assert.ok(home.includes('導遊登入') && !home.includes('新增旅程'), 'Viewing must not expose edit controls')
        const session = { email: 'guide@example.com', token: 'secret-not-in-html', expiresAt: Date.now() + 3600000 }
        assert.equal(renderToStaticMarkup(createElement(GuideTools, { session: null, sampleHref: '/demo/T001/overview' })), '')
        const tools = renderToStaticMarkup(createElement(GuideTools, { session, sampleHref: '/demo/T001/overview' }))
        for (const text of ['查看範例', '試算表範本與設定方式', '網站設定教學', '新增旅程']) assert.ok(tools.includes(text))
        assert.ok(tools.indexOf('網站設定教學') > tools.indexOf('試算表範本與設定方式'))
        for (const sessionOrNull of [null, session]) {
          const denied = renderToStaticMarkup(createElement(TripReadFailure, { trip, message: '403', accessDenied: true, session: sessionOrNull, retry() {} }))
          for (const text of ['旅程總覽', trip.name, '此旅程暫不開放觀看', '重新讀取']) assert.ok(denied.includes(text))
          assert.ok(!denied.includes('每位團員的餘額') && !denied.includes('旅程功能'), 'Restricted trips must not render cached content or functional navigation')
          assert.equal(denied.includes('一般存取權'), Boolean(sessionOrNull), 'Only guides see sharing instructions')
          assert.equal(denied.includes('試算表'), Boolean(sessionOrNull), 'Only signed-in guides see spreadsheet details')
          if (!sessionOrNull) assert.ok(denied.includes('請稍後再試，或聯絡導遊。'))
          assert.ok(!denied.includes(session.token), 'A guide token must never be rendered')
        }
        const unknownFailure = renderToStaticMarkup(createElement(TripReadFailure, { trip, message: 'API 設定有誤', accessDenied: false, session: null, retry() {} }))
        assert.ok(unknownFailure.includes('目前無法讀取資料') && unknownFailure.includes('請稍後再試，或聯絡導遊。'))
        assert.ok(!unknownFailure.includes('API 設定有誤'))
        const guideFailure = renderToStaticMarkup(createElement(TripReadFailure, { trip, message: 'API 設定有誤', accessDenied: false, session, retry() {} }))
        assert.ok(guideFailure.includes('API 設定有誤'))
        assert.ok(!unknownFailure.includes('此旅程暫不開放觀看'))
        window.location.pathname = '/demo/T001/overview'
        const restrictedDemo = renderToStaticMarkup(createElement(App))
        assert.ok(restrictedDemo.includes('請先以導遊帳號登入後查看範例'))
        assert.ok(!restrictedDemo.includes(trip.name), 'Direct sample links must also require login')
        window.location.pathname = '/'
        const handlers = { onLogin() {}, onExpired() {}, onClose() {}, onSaved() {}, onBusy() {} }
        for (const target of [{ trip: null }, { trip }, { trip, remove: true }]) {
          const form = renderToStaticMarkup(createElement(CatalogEditor, { target, catalogId: 'catalog', before: demo['旅程清單'], session, loginBusy: false, authError: '', ...handlers }))
          assert.ok(form.includes('role="') || form.includes('<dialog'))
          assert.ok(!form.includes(session.token), 'OAuth token must not be rendered')
          if (!target.trip) assert.ok(!/readonly(?:=|\s|>)/i.test(form), 'Automatically suggested ID must be editable when adding')
          if (!target.trip) assert.ok(form.includes('建立空白旅程試算表') && form.includes('建立並填入 ID'), 'New trips must offer file creation')
          else assert.ok(!form.includes('建立並填入 ID'), 'Existing-trip edits must not create extra files')
          if(target.trip && !target.remove) assert.ok(form.includes('value="2027/05/01"'), 'Editable date inputs must display slash-separated dates')
          if (!target.trip) assert.ok(form.includes('搜尋國家／地區') && form.includes('role="combobox"'), 'New file creation must offer country search')
        }
        const manager={...session,email:'manager@example.com'}
        for(const target of [{trip:null},{trip,remove:true}]) {
          const denied=renderToStaticMarkup(createElement(CatalogEditor,{target,catalogId:'catalog',before:demo['旅程清單'],session:manager,loginBusy:false,authError:'',...handlers}))
          assert.ok(denied.includes('非管理員') && denied.includes('只有超級使用者') && !denied.includes('name="tripName"'))
          assert.ok(!denied.includes('建立並填入 ID') && denied.includes('disabled=""'))
        }
        const allowedEdit=renderToStaticMarkup(createElement(CatalogEditor,{target:{trip},catalogId:'catalog',before:demo['旅程清單'],session:manager,loginBusy:false,authError:'',...handlers}))
        assert.ok(allowedEdit.includes('name="tripName"') && !allowedEdit.includes('非管理員') && !allowedEdit.includes('旅程 ID'))
        for(const text of ['旅程試算表 ID 或網址','檢查公開讀取','同步導遊編輯權','建立空白旅程試算表']) assert.ok(!allowedEdit.includes(text), 'Ordinary guides must not see the spreadsheet settings block')
        for (const [component, text] of [[Overview, '旅程總覽'], [Itinerary, '匯出 PDF'], [Fund, '公共餘款'], [Expenses, '行前收款狀況'], [Tasks, '開團進度']]) {
          const html = renderToStaticMarkup(createElement(component, { data, routeRoot: '/demo/T001' }))
          assert.ok(html.includes(text), text)
          assert.ok(!html.includes('NaN') && !html.includes('undefined'), 'Unexpected invalid value')
          assert.ok(!html.includes('—') && !html.includes('–'), 'Date/time ranges must use a half-width hyphen')
          assert.ok(!/2027-[0-9]{2}-[0-9]{2}/.test(html), 'Dates in reading views must use slashes')
        }
        const partial = {...data, sectionErrors:{accounting:'bad amount',tasks:'bad task'}}
        const partialOverview = renderToStaticMarkup(createElement(Overview, {data:partial,routeRoot:'/trip/T001'}))
        assert.ok(partialOverview.includes('帳務資料暫時無法顯示') && partialOverview.includes('開團進度暫時無法顯示'))
        assert.ok(!partialOverview.includes('公積金現金餘額') && !partialOverview.includes('行前尚待收款'), 'Invalid accounting must not appear as valid zero totals')
        const fundHtml = renderToStaticMarkup(createElement(Fund, {data}))
        assert.ok(fundHtml.includes('公積金對帳') && fundHtml.includes('個人餘額合計'))
        const expenseHtml = renderToStaticMarkup(createElement(Expenses, {data}))
        assert.ok(expenseHtml.includes('團員收款摘要') && expenseHtml.includes('只看未收齊'))
        const itineraryHtml = renderToStaticMarkup(createElement(Itinerary, {data}))
        assert.ok(itineraryHtml.includes('<small>T1</small>') && itineraryHtml.includes('<small>T2</small>'))
        assert.ok(!itineraryHtml.includes('出發航廈：') && !itineraryHtml.includes('抵達航廈：'))
        assert.equal(itineraryHtml.split(bookingStyles['detail-item']+' '+bookingStyles['booking-card']).length-1,data.tables['航班'].length+data.tables['飯店'].length)
        assert.ok(itineraryHtml.includes('class="'+bookingStyles['hotel-name']+'">範例飯店</strong>'))
        assert.ok(itineraryHtml.includes('class="'+bookingStyles['hotel-dates']+'"><p><small>入住</small> 2027/05/01 15:00</p><p><small>退房</small> 2027/05/03 12:00</p>'))
        const legacyStay={...data,tables:{...data.tables,飯店:data.tables['飯店'].map(row=>({...row,入住時間:'',退房時間:''}))}}
        const legacyStayHtml=renderToStaticMarkup(createElement(Itinerary,{data:legacyStay}))
        assert.ok(!legacyStayHtml.includes('undefined') && legacyStayHtml.includes('<small>入住</small> 2027/05/01</p>'))
        assert.ok(itineraryHtml.includes('class="'+bookingStyles['hotel-photo']+'"></div>'), 'Missing hotel photos should leave an empty reserved space')
        const withPhoto={...data,tables:{...data.tables,飯店:data.tables['飯店'].map(row=>({...row,飯店圖片網址:'https://example.com/hotel.jpg'}))}}
        const photoHtml=renderToStaticMarkup(createElement(Itinerary,{data:withPhoto}))
        assert.ok(photoHtml.includes('src="https://example.com/hotel.jpg"') && photoHtml.includes('alt="範例飯店照片"'))
        const invalidPhoto={...data,tables:{...data.tables,飯店:data.tables['飯店'].map(row=>({...row,飯店圖片網址:'javascript:alert(1)'}))}}
        assert.ok(!renderToStaticMarkup(createElement(Itinerary,{data:invalidPhoto})).includes('javascript:'))
        const overnight = {...data,tables:{...data.tables,航班:[{...data.tables['航班'][0],出發時間:'2027-12-31T23:00',抵達時間:'2028-01-02T16:34'}]}}
        const overnightHtml = renderToStaticMarkup(createElement(Itinerary,{data:overnight}))
        assert.ok(overnightHtml.includes('class="'+bookingStyles['flight-card-heading']+'"><span>2027/12/31</span><span>範例航空 範例航班</span>'))
        assert.ok(overnightHtml.includes('16:34<span class="'+bookingStyles['flight-day-offset']+'"> (+2)</span>'))
        assert.ok(!itineraryHtml.includes(bookingStyles['flight-day-offset']) && !overnightHtml.includes('2028/01/02'))
        const legacyFlights = {...data,tables:{...data.tables,航班:data.tables['航班'].map(row=>({...row,出發航廈:'',抵達航廈:'',航廈:'舊航廈 T3'}))}}
        assert.ok(renderToStaticMarkup(createElement(Itinerary,{data:legacyFlights})).includes('既有航廈資訊：舊航廈 T3'))
        assert.ok(itineraryHtml.includes('aria-label="匯出 PDF"') && itineraryHtml.includes('aria-pressed'))
        assert.ok(!itineraryHtml.includes('另存為 PDF') && !itineraryHtml.includes('匯出範圍'), 'Export options and hints belong in the dialog')
        const exportDialog=renderToStaticMarkup(createElement(PdfExportDialog,{dates:['2027-05-01','2027-05-02'],initialDates:['2027-05-02'],onClose(){},onConfirm(){}}))
        assert.ok(exportDialog.includes('2027/05/01') && exportDialog.includes('2027/05/02') && exportDialog.includes('另存為 PDF'))
        assert.equal((exportDialog.match(/checked=""/g)||[]).length,1)
        const noSelection=renderToStaticMarkup(createElement(PdfExportDialog,{dates:['2027-05-01'],initialDates:[],onClose(){},onConfirm(){}}))
        assert.ok(noSelection.includes('disabled=""') && noSelection.includes('請至少選擇一個日期'))
        const noDates=renderToStaticMarkup(createElement(PdfExportDialog,{dates:[],initialDates:[],onClose(){},onConfirm(){}}))
        assert.ok(noDates.includes('尚無每日行程') && !noDates.includes('disabled=""'))
        const sharingProps={spreadsheetId:'sheet-id',loginBusy:false,onBusy(){},onLogin(){},onExpired(){}}
        assert.equal(renderToStaticMarkup(createElement(GuideSharing,{...sharingProps,session:null})), '')
        assert.equal(renderToStaticMarkup(createElement(GuideSharing,{...sharingProps,session:manager})), '')
        const sharing=renderToStaticMarkup(createElement(GuideSharing,{...sharingProps,session:{...session,scopes:[DRIVE_FILE_SCOPE]}}))
        assert.ok(sharing.includes('同步導遊編輯權') && !sharing.includes(session.token))
        const needsScope=renderToStaticMarkup(createElement(GuideSharing,{...sharingProps,session}))
        assert.ok(needsScope.includes('授權同步導遊編輯權'))
        const closeButton=renderToStaticMarkup(createElement(CloseButton,{label:'關閉編輯',disabled:true,onClick(){}}))
        assert.ok(closeButton.includes('aria-label="關閉編輯"') && closeButton.includes('<svg') && closeButton.includes('disabled=""'))
        assert.ok(!closeButton.includes('>關閉'))
        const actions=renderToStaticMarkup(createElement(TripHeaderActions,{busy:false,onRefresh(){}}))
        assert.ok(actions.includes('所有旅程') && actions.includes('aria-label="重新讀取旅程"') && actions.includes('class="icon-button"'))
        assert.ok(!actions.includes('<time') && !actions.includes('更新資料'))
        const busyActions=renderToStaticMarkup(createElement(TripHeaderActions,{busy:true,onRefresh(){}}))
        assert.ok(busyActions.includes('disabled=""'))
        assert.ok(renderToStaticMarkup(createElement(Tasks, {data})).includes('7 天內到期'))
        let storageReads = 0
        window.sessionStorage = {getItem() { storageReads++; return JSON.stringify({draft:{旅程名稱:'舊的未儲存內容'}}) }}
        const freshForm = renderToStaticMarkup(createElement(CatalogEditor, {target:{trip:null},catalogId:'catalog',before:demo['旅程清單'],session,loginBusy:false,authError:'',...handlers}))
        assert.equal(storageReads,0,'Forms must not load any saved draft')
        assert.ok(!freshForm.includes('舊的未儲存內容') && !freshForm.includes('草稿'))
        assert.ok(freshForm.includes('建立並填入 ID'))
        delete window.sessionStorage
        const editingHandlers = {onLogin(){},onExpired(){},onBusy(){},onSaved(){},onCancel(){},onSave(){}}
        assert.equal(renderToStaticMarkup(createElement(TripEditing, {trip,tab:'overview',session:null,loginBusy:false,...editingHandlers})), '')
        const editingTools = renderToStaticMarkup(createElement(TripEditing, {trip,tab:'overview',session,loginBusy:false,...editingHandlers}))
        for(const label of ['編輯進度','編輯行程','編輯帳務']) assert.ok(editingTools.includes(label))
        for(const entity of ['團員','開團待辦','每日行程','航班','飯店','公積金','行前費用','收款']) {
          const form = renderToStaticMarkup(createElement(TripForm,{trip,book:demo,entity,row:null,busy:false,canEditIds:true,...editingHandlers}))
          assert.ok(form.includes('儲存') && form.includes('取消'))
          for (const label of form.matchAll(/<label[^>]*>(.*?)<[/]label>/g)) {
            if (/<(?:input|select|textarea)[^>]*required=/.test(label[1])) assert.ok(label[1].includes('class="required-mark"'), entity+' required fields must show an asterisk')
          }
          assert.ok(!/type="(?:date|datetime-local|time)"/.test(form), 'Editors must use custom pickers with editable text and 24-hour time')
          assert.ok(!form.includes(session.token) && !form.includes('草稿'))
          for(const input of form.matchAll(/<input[^>]*aria-haspopup="dialog"[^>]*>/g)) assert.ok(input[0].includes('value=""'), entity+' must not prefill date/time inputs')
          if(entity==='開團待辦') assert.ok(form.includes('負責人') && form.includes('<select'))
          if(entity==='飯店') assert.ok(form.includes('入住時間') && form.includes('退房時間') && form.includes('飯店圖片網址'))
          if(entity==='每日行程') { assert.ok(form.includes('關聯航班') && form.includes('關聯飯店')); assert.ok(!form.includes('時區（選填')); }
          if(entity==='航班') {assert.ok(form.includes('出發航廈') && form.includes('抵達航廈'));assert.ok(form.includes('出發當地時間') && form.includes('抵達當地時間'));assert.ok(!form.includes('時差'));}
          if(entity==='公積金') assert.ok(form.includes('個人金額') && form.includes('checkbox'))
          if(entity==='行前費用') assert.ok(form.includes('實際刷卡金額') && form.includes('TWD'))
          if(entity==='收款') assert.ok(form.includes('繳款團員') && form.includes('加入收款項目'))
        }
        for(const [entity,sheet] of [['團員','團員'],['開團待辦','開團待辦'],['每日行程','每日行程'],['航班','航班'],['飯店','飯店'],['公積金','公積金交易'],['行前費用','支出明細'],['收款','收款明細']]) {
          const headers = demo[sheet][0], row=Object.fromEntries(headers.map((key,index)=>[key,String(demo[sheet][1][index]??'')]))
          const form = renderToStaticMarkup(createElement(TripForm,{trip,book:demo,entity,row,busy:false,canEditIds:true,...editingHandlers}))
          assert.ok(form.includes('readOnly') || form.includes('readonly'))
          assert.ok(!form.includes('undefined') && !form.includes('NaN'))
          const dateKey = {開團待辦:'截止日期',每日行程:'日期',飯店:'入住日期',公積金:'日期',行前費用:'日期',收款:'收款日期',航班:'出發時間'}[entity]
          if(dateKey && row[dateKey]) assert.ok(form.includes('value="'+pickerInputDisplay(entity==='航班'?row[dateKey].slice(0,16):row[dateKey])+'"'), 'Editing must preserve the existing date')
          if(entity==='公積金'||entity==='行前費用'){ assert.ok(!/<label>金額<input/.test(form)); assert.ok(form.includes('pattern="-?[0-9]+"')); assert.ok(form.includes('aria-label=')); }
        }
        for(const entity of ['團員','開團待辦','每日行程','航班','飯店','公積金','行前費用','收款']) {
          const form=renderToStaticMarkup(createElement(TripForm,{trip,book:demo,entity,row:null,busy:false,canEditIds:false,...editingHandlers}))
          assert.ok(!form.includes(' ID') && !form.includes('（A001）') && !form.includes('（H001）') && !form.includes('（M001）'), entity+' should hide internal identifiers')
          assert.ok(form.includes('儲存') && form.includes('取消'))
        }
        assert.ok(!expenseHtml.includes('收款批次：'))
        const superExpenses=renderToStaticMarkup(createElement(Expenses,{data,showIds:true}))
        assert.ok(superExpenses.includes('收款批次：B001'))
        const managerTools=renderToStaticMarkup(createElement(GuideTools,{session:manager,sampleHref:'/demo/T001'}))
        assert.ok(managerTools.includes('查看範例') && !managerTools.includes('試算表範本與設定方式') && !managerTools.includes('網站設定教學'))
        const picker = renderToStaticMarkup(createElement(DatePicker,{label:'日期',value:'',start:trip.start,onChange(){throw new Error('Opening must never set a value')}}))
        assert.ok(picker.includes('value=""') && picker.includes('aria-label="'+trip.start.replaceAll('-','/')+'"'))
        assert.ok(picker.includes('popover="auto"') && picker.includes('取消'))
        for(const type of ['time','datetime-local']) {
          const form = renderToStaticMarkup(createElement(DatePicker,{label:'時間',type,value:type==='time'?'23:05':'2027-04-22T23:05',onChange(){}}))
          assert.ok(form.includes('23:05') && form.includes('HH:mm') && !form.includes('type="time"'))
        }
        assert.ok(picker.includes('選擇年份與月份'))
        const wheels = renderToStaticMarkup(createElement(TimeWheel,{value:'23:59',active:false,onChange(){throw new Error('Rendering wheels must not commit a value')}}))
        assert.equal((wheels.match(/role="listbox"/g)||[]).length,2)
        assert.equal((wheels.match(/role="option"/g)||[]).length,84)
        assert.ok(!wheels.includes('<input') && wheels.includes('>00<') && wheels.includes('>23<') && wheels.includes('>59<'))
        const facts=renderToStaticMarkup(createElement(TripFacts,{timezone:'UTC+8',rate:4.5,currency:'JPY'}))
        assert.ok(facts.includes('匯率：1 TWD = 4.5 JPY') && facts.includes('時差：+0 小時'))
        assert.equal((facts.match(/<svg/g)||[]).length,2)
        assert.ok(!facts.includes('<time') && !facts.includes('目的地現在'))
        assert.ok(!itineraryHtml.includes('旅程預設時區') && !itineraryHtml.includes('<small>UTC'), 'Timezones should appear through title differences rather than individual itinerary entries')
        const emptyBook = Object.fromEntries(Object.entries(demo).map(([key, rows]) => [key, key === '旅程設定' ? rows : rows.slice(0, 1)]))
        const empty = parseTrip(trip, emptyBook)
        for (const component of [Overview, Itinerary, Fund, Expenses, Tasks]) {
          assert.doesNotThrow(() => renderToStaticMarkup(createElement(component, { data: empty, routeRoot: '/' })))
        }
        for (const timezone of ['UTC+05:30', 'UTC-03:30', 'UTC']) {
          for (const component of [Overview, Itinerary, Fund, Expenses, Tasks])
            assert.doesNotThrow(() => renderToStaticMarkup(createElement(component, { data: { ...data, timezone }, routeRoot: '/' })))
        }
        assert.equal(tripSheets.length, 11)
        console.log('All five pages render with populated and empty data; no invalid monetary values.')
      `,
    },
    outfile: path.join(target, "check.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    define: { "import.meta.env": JSON.stringify({ BASE_URL: "/",VITE_GOOGLE_CLIENT_ID:"test-client",VITE_GUIDE_EMAILS:'["guide@example.com","manager@example.com"]' }) },
  });
  await import(pathToFileURL(path.join(target, "check.cjs")).href);
} finally {
  await rm(target, { recursive: true, force: true });
}
