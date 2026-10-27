"""Check generated OOXML structure and headers against the application schema."""
import json
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

root = Path(__file__).resolve().parents[1]
schema = json.loads((root / 'frontend/src/data/schema.json').read_text())
rules = json.loads((root / 'frontend/src/data/id-rules.json').read_text())
demo = json.loads((root / 'frontend/src/data/demo.json').read_text())
import re
for rule in rules.values():
    index = schema[rule['table']].index(rule['column'])
    for row in demo[rule['table']][1:]:
        assert re.fullmatch(rule['prefix'] + r'[0-9]{3,4}', str(row[index])), rule
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
folder = root / 'frontend/public/templates'
for filename in ['旅程目錄範本.xlsx', '每趟旅程範本.xlsx', '範例旅程.xlsx']:
    with ZipFile(folder / filename) as book:
        for name in book.namelist():
            if name.endswith(('.xml', '.rels')):
                ET.fromstring(book.read(name))
        sheets = ET.fromstring(book.read('xl/workbook.xml')).findall('s:sheets/s:sheet', ns)
        expected = ['旅程清單'] if filename == '旅程目錄範本.xlsx' else [name for name in schema if name != '旅程清單']
        assert [sheet.attrib['name'] for sheet in sheets] == expected
        for index, name in enumerate(expected, 1):
            xml = ET.fromstring(book.read(f'xl/worksheets/sheet{index}.xml'))
            first_row = xml.find('s:sheetData/s:row', ns)
            headers = [cell.find('s:is/s:t', ns).text for cell in first_row]
            assert headers == schema[name], name
            validations = xml.findall('s:dataValidations/s:dataValidation', ns)
            id_columns = {column for rule in rules.values() for column in [rule['column'], *rule.get('referenceColumns', [])]}
            expected_validators = sum(header in id_columns for header in headers)
            assert len([rule for rule in validations if rule.attrib['type'] == 'custom']) == expected_validators
            if filename == '旅程目錄範本.xlsx':
                row = xml.findall('s:sheetData/s:row', ns)[1]
                values = [cell.find('s:is/s:t', ns).text for cell in row]
                assert values[0:2] == ['T001', '範例旅程']
            assert not xml.findall('.//s:f', ns), 'Data-only template must not have calculation formulas'
            for text in xml.findall('.//s:t', ns):
                assert text.text not in ['#REF!', '#DIV/0!', '#VALUE!', '#N/A', '#NAME?']
        print(f'{filename}: {len(sheets)} sheets, all headers match, no calculation errors.')
