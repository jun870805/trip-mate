import { Unzip, UnzipInflate, strFromU8, strToU8, zipSync } from 'fflate';
import type { FilePart } from '../contracts.ts';

export const FILE_LIMITS = Object.freeze({ count: 3, bytes: 4 * 1024 * 1024, expandedBytes: 16 * 1024 * 1024, textChars: 200000, cells: 10000 });
const mimeTypes: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
function signature(bytes: Uint8Array, extension: string) {
  if (extension === 'pdf') return strFromU8(bytes.slice(0, 5)) === '%PDF-';
  if (extension === 'png') return [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
  if (extension === 'jpg' || extension === 'jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (extension === 'webp') return strFromU8(bytes.slice(0, 4)) === 'RIFF' && strFromU8(bytes.slice(8, 12)) === 'WEBP';
  return false;
}
/** Stream decompression with a hard actual-output cap before the XLSX parser sees XML. */
async function xlsxText(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  const files: Record<string, Uint8Array> = {};
  let expanded = 0, entries = 0, formulas = false;
  const unzip = new Unzip(file => {
    if (++entries > 1000) throw new Error('試算表壓縮項目過多。');
    if (!/^(?:\[Content_Types\]\.xml|_rels\/.*\.rels|xl\/(?:[^/]+\.xml|_rels\/.*\.rels|worksheets\/[^/]+\.xml))$/.test(file.name)) return;
    if (file.originalSize && file.originalSize > FILE_LIMITS.expandedBytes) throw new Error('試算表展開資料過大。');
    const chunks: Uint8Array[] = [];
    let length = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      expanded += chunk.length; length += chunk.length;
      if (expanded > FILE_LIMITS.expandedBytes) { file.terminate(); throw new Error('試算表展開資料過大。'); }
      chunks.push(chunk);
      if (final) {
        const content = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
        let xml = strFromU8(content);
        if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('不支援 XML 外部定義。');
        if (/^xl\/worksheets\//.test(file.name)) {
          // Bound sparse coordinates before the spreadsheet parser allocates its row arrays.
          for (const match of xml.matchAll(/\br=["']([A-Z]+)?(\d+)["']/g)) {
            const column = [...(match[1] || '')].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
            if (Number(match[2]) > 10000 || column > 128) throw new Error('試算表資料範圍過大。');
          }
        }
        if (/^xl\/worksheets\//.test(file.name)) xml = xml.replace(/<c\b[^>]*>[\s\S]*?<\/c>/g, cell => {
          if (/<f(?:\s|>|\/)/.test(cell)) { formulas = true; return ''; }
          return cell;
        });
        files[file.name] = strToU8(xml);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 65536) {
    signal?.throwIfAborted();
    unzip.push(bytes.subarray(offset, offset + 65536), offset + 65536 >= bytes.length);
  }
  signal?.throwIfAborted();
  const { default: readXlsx } = await import('read-excel-file/universal');
  const packed = zipSync(files, { level: 0 });
  const sheets = await readXlsx(packed.buffer as ArrayBuffer, { trim: false });
  let cells = 0;
  const output: string[] = formulas ? ['部分儲存格含公式：公式未匯入，請人工核對。'] : [];
  let length = 0;
  for (const sheet of sheets) {
    output.push(`分頁：${sheet.sheet}`);
    for (const row of sheet.data) {
      cells += row.length;
      if (cells > FILE_LIMITS.cells) throw new Error('試算表儲存格數過多。');
      const line = JSON.stringify(row.map(value => value instanceof Date ? (value.getUTCFullYear() < 1901 ? value.toISOString().slice(11, 16) : value.toISOString().replace(/T00:00:00\.000Z$/, '')) : value));
      length += line.length;
      if (length > FILE_LIMITS.textChars) throw new Error('試算表文字過多。');
      output.push(line);
    }
  }
  return output.join('\n');
}

/** No network/file URL access; all returned content remains untrusted user data. */
export async function prepareFiles(files: readonly File[], signal?: AbortSignal): Promise<FilePart[]> {
  if (files.length > FILE_LIMITS.count) throw new Error('每次最多 3 個檔案。');
  const result: FilePart[] = [];
  for (const file of files) {
    signal?.throwIfAborted();
    if (!file.size || file.size > FILE_LIMITS.bytes) throw new Error('檔案須為 1 byte～4 MiB。');
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['txt', 'csv', 'xlsx', ...Object.keys(mimeTypes)].includes(extension)) throw new Error('不支援此檔案類型。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal?.throwIfAborted();
    if (extension === 'txt' || extension === 'csv' || extension === 'xlsx') {
      const text = extension === 'xlsx' ? await xlsxText(bytes, signal) : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.length > FILE_LIMITS.textChars) throw new Error('檔案文字超過上限。');
      result.push({ text: JSON.stringify({ sourceFile: file.name, untrustedContent: text }) });
    } else {
      if (!signature(bytes, extension)) throw new Error('檔案內容與副檔名不符。');
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
      result.push({ attachment: { name: file.name, mimeType: mimeTypes[extension], data: btoa(binary) } });
    }
  }
  return result;
}
