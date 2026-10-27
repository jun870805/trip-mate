import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createSheetsRepository, readSheetsConfig } from './sheets.ts'

const config = { apiKey: 'public-key', spreadsheetId: 'sheet-id', range: "'Trip plan'!A1:C10" }
const respond = (body: unknown, status = 200): typeof fetch => async () => Response.json(body, { status })

describe('Sheets configuration', () => {
  it('requires all settings and trims whitespace', () => {
    assert.equal(readSheetsConfig({}), null)
    assert.equal(readSheetsConfig({ VITE_GOOGLE_SHEETS_API_KEY: ' ' }), null)
    assert.deepEqual(readSheetsConfig({ VITE_GOOGLE_SHEETS_API_KEY: ' key ', VITE_GOOGLE_SHEETS_SPREADSHEET_ID: ' id ', VITE_GOOGLE_SHEETS_RANGE: ' A1:B2 ' }), { apiKey: 'key', spreadsheetId: 'id', range: 'A1:B2' })
  })
})

describe('Sheets repository', () => {
  it('encodes the range, forwards cancellation, and returns formatted cells', async () => {
    const signal = new AbortController().signal
    const cells = [['名稱', '日期'], ['行程', '2026/10/22']]
    const fetcher: typeof fetch = async (input, options) => {
      const url = new URL(String(input))
      assert.ok(decodeURIComponent(url.pathname).endsWith(config.range))
      assert.equal(url.searchParams.get('key'), 'public-key')
      assert.equal(url.searchParams.get('majorDimension'), 'ROWS')
      assert.equal(options?.signal, signal)
      return Response.json({ values: cells })
    }
    assert.deepEqual(await createSheetsRepository(config, fetcher).read(signal), cells)
  })

  it('supports the default browser fetch', async () => {
    const original = globalThis.fetch
    globalThis.fetch = respond({ values: [['value']] })
    try {
      assert.deepEqual(await createSheetsRepository(config).read(), [['value']])
    } finally {
      globalThis.fetch = original
    }
  })

  it('returns an empty array for an empty sheet', async () => {
    assert.deepEqual(await createSheetsRepository(config, respond({ range: 'A1' })).read(), [])
    assert.deepEqual(await createSheetsRepository(config, respond({ values: [] })).read(), [])
  })

  for (const status of [400, 403, 404, 429, 500]) {
    it(`reports HTTP ${status} without exposing credentials`, async () => {
      await assert.rejects(createSheetsRepository(config, respond({ error: 'sensitive details' }, status)).read(), { message: `Google Sheets 讀取失敗（${status}）。請檢查 API 設定、共用權限或稍後重試。` })
    })
  }

  for (const body of [{ values: 'invalid' }, { values: [null] }, { values: [[{}]] }, null, { values: [[null]] }]) {
    it(`rejects malformed responses: ${JSON.stringify(body)}`, async () => {
      await assert.rejects(createSheetsRepository(config, respond(body)).read(), { message: 'Google Sheets 回傳格式不正確。' })
    })
  }

  it('accepts numbers and booleans', async () => {
    assert.deepEqual(await createSheetsRepository(config, respond({ values: [[0, false, '']] })).read(), [[0, false, '']])
  })

  it('propagates network failures', async () => {
    const fetcher: typeof fetch = async () => { throw new TypeError('Failed to fetch') }
    await assert.rejects(createSheetsRepository(config, fetcher).read(), { message: 'Failed to fetch' })
  })
})
