export type SheetCell = string | number | boolean
export type SheetRows = SheetCell[][]

export interface SheetsConfig {
  apiKey: string
  spreadsheetId: string
  range: string
}

// UI depends on this interface; a future backend adapter can implement it.
export interface SheetsRepository {
  read(signal?: AbortSignal): Promise<SheetRows>
}

export function readSheetsConfig(env: Record<string, string | undefined>): SheetsConfig | null {
  const apiKey = env.VITE_GOOGLE_SHEETS_API_KEY?.trim()
  const spreadsheetId = env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID?.trim()
  const range = env.VITE_GOOGLE_SHEETS_RANGE?.trim()
  return apiKey && spreadsheetId && range ? { apiKey, spreadsheetId, range } : null
}

function isSheetRows(value: unknown): value is SheetRows {
  return Array.isArray(value) && value.every((row: unknown) =>
    Array.isArray(row) && row.every((cell: unknown) =>
      typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean',
    ),
  )
}

export function createSheetsRepository(config: SheetsConfig, fetcher: typeof fetch = fetch): SheetsRepository {
  return {
    async read(signal) {
      const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(config.range)}`)
      url.searchParams.set('key', config.apiKey)
      url.searchParams.set('majorDimension', 'ROWS')
      url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE')
      const response = await fetcher(url, { signal })
      if (!response.ok) {
        throw new Error(`Google Sheets 讀取失敗（${response.status}）。請檢查 API 設定、共用權限或稍後重試。`)
      }
      const body: unknown = await response.json()
      if (typeof body !== 'object' || body === null) {
        throw new Error('Google Sheets 回傳格式不正確。')
      }
      const values: unknown = 'values' in body ? body.values : []
      if (!isSheetRows(values)) {
        throw new Error('Google Sheets 回傳格式不正確。')
      }
      return values
    },
  }
}
