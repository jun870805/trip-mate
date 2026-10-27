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
        import { CatalogEditor } from './src/components/CatalogEditor'
        import { GuideTools } from './src/components/ui'
        import { TripReadFailure } from './src/components/TripReadFailure'
        import { parseCatalog, parseTrip, tripSheets } from './src/data/portal'
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
          if (!target.trip) assert.ok(form.includes('搜尋國家／地區') && form.includes('role="combobox"'), 'New file creation must offer country search')
        }
        for (const [component, text] of [[Overview, '旅程總覽'], [Itinerary, '匯出 PDF'], [Fund, '公共餘款'], [Expenses, '行前收款狀況'], [Tasks, '開團進度']]) {
          const html = renderToStaticMarkup(createElement(component, { data, routeRoot: '/demo/T001' }))
          assert.ok(html.includes(text), text)
          assert.ok(!html.includes('NaN') && !html.includes('undefined'), 'Unexpected invalid value')
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
        assert.ok(itineraryHtml.includes('匯出範圍') && itineraryHtml.includes('目前日期') && itineraryHtml.includes('aria-pressed'))
        assert.ok(renderToStaticMarkup(createElement(Tasks, {data})).includes('7 天內到期'))
        let storageReads = 0
        window.sessionStorage = {getItem() { storageReads++; return JSON.stringify({draft:{旅程名稱:'舊的未儲存內容'}}) }}
        const freshForm = renderToStaticMarkup(createElement(CatalogEditor, {target:{trip:null},catalogId:'catalog',before:demo['旅程清單'],session,loginBusy:false,authError:'',...handlers}))
        assert.equal(storageReads,0,'Forms must not load any saved draft')
        assert.ok(!freshForm.includes('舊的未儲存內容') && !freshForm.includes('草稿'))
        assert.ok(freshForm.includes('建立並填入 ID'))
        delete window.sessionStorage
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
    define: { "import.meta.env": JSON.stringify({ BASE_URL: "/" }) },
  });
  await import(pathToFileURL(path.join(target, "check.cjs")).href);
} finally {
  await rm(target, { recursive: true, force: true });
}
