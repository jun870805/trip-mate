import { it } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { prepareFiles } from '../files/intake.ts';

it('reads TXT and CSV as untrusted text without losing newlines', async () => {
  const parts = await prepareFiles([new File(['日期,標題\n2026-11-02,旅行\n'], '行程.csv')]);
  assert.ok('text' in parts[0]);
  assert.equal(JSON.parse(parts[0].text).untrustedContent, '日期,標題\n2026-11-02,旅行\n');
});
it('extracts XLSX cells, keeps text and refuses formula evaluation', async () => {
  const bytes = zipSync(Object.fromEntries(Object.entries({
    'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="行程" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>景點</t></is></c></row><row r="2"><c r="A2" t="str"><f>CONCAT("a","b")</f><v>cached</v></c></row></sheetData></worksheet>',
  }).map(([key, value]) => [key, strToU8(value)])));
  const parts = await prepareFiles([new File([new Uint8Array(bytes)], '行程.xlsx')]);
  assert.ok('text' in parts[0] && parts[0].text.includes('景點'));
  assert.ok('text' in parts[0] && parts[0].text.includes('公式未匯入'));
  assert.ok('text' in parts[0] && !parts[0].text.includes('cached'));
});
it('encodes supported PDF and images with canonical MIME types', async () => {
  const parts = await prepareFiles([new File(['%PDF-1.7\n'], 'plan.pdf'), new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'photo.png')]);
  assert.ok('attachment' in parts[0]);
  assert.equal(parts[0].attachment.mimeType, 'application/pdf');
  assert.ok(parts[0].attachment.data.startsWith('JVBER'));
});
it('rejects wrong signatures, unsupported types, empty and oversized files, too many files and cancellation', async () => {
  for (const file of [new File(['x'], 'bad.exe'), new File(['x'], 'fake.pdf'), new File([], 'empty.txt'), new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.txt')])
    await assert.rejects(prepareFiles([file]));
  await assert.rejects(prepareFiles(Array.from({ length: 4 }, () => new File(['x'], 'a.txt'))));
  await assert.rejects(prepareFiles([new File(['x'], 'a.txt')], AbortSignal.abort()));
});

it('recognizes JPEG/WebP and rejects corrupted or oversized XLSX coordinates',async()=>{
  const parts=await prepareFiles([new File([new Uint8Array([255,216,255])],'a.jpg'),new File(['RIFF1234WEBP'],'a.webp')]);
  assert.equal(parts.length,2);
  await assert.rejects(prepareFiles([new File(['not zip'],'bad.xlsx')]));
  const bytes=zipSync({'xl/worksheets/sheet1.xml':strToU8('<worksheet><sheetData><row r="999999"><c r="A999999" t="inlineStr"><is><t>too far</t></is></c></row></sheetData></worksheet>')});
  await assert.rejects(prepareFiles([new File([bytes],'sparse.xlsx')]),/資料範圍/);
});
