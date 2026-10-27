"""Generate offline country presets from a pinned CLDR currency snapshot and pytz.
Install pytz only when updating this dataset; the website has no Python dependency.
To refresh currencies, pass --currency-data pointing at CLDR currencyData.json.
"""
import argparse
import datetime
import json
from pathlib import Path
import pytz

root = Path(__file__).resolve().parents[1]
pinned = root / 'scripts/data/country-currencies.json'
parser = argparse.ArgumentParser()
parser.add_argument('--date', help='ISO date for a new CLDR currency snapshot')
parser.add_argument('--currency-data', type=Path, help='Local Unicode CLDR currencyData.json')
args = parser.parse_args()
if args.currency_data:
    source = json.loads(args.currency_data.read_text())['supplemental']
    as_of = args.date or datetime.date.today().isoformat()
    datetime.date.fromisoformat(as_of)
    currencies = {}
    for region, history in source['currencyData']['region'].items():
        active = []
        for entry in history:
            for code, period in entry.items():
                if period.get('_tender') == 'false' or code == 'XXX':
                    continue
                if period.get('_from', '') > as_of or period.get('_to', '9999-12-31') < as_of:
                    continue
                if code not in active:
                    active.append(code)
        currencies[region] = active
    snapshot = {'metadata': {'asOf': as_of, 'cldrVersion': source['version']['_cldrVersion'], 'source': 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/supplemental/currencyData.json'}, 'currencies': currencies}
    pinned.parent.mkdir(parents=True, exist_ok=True)
    pinned.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')
else:
    snapshot = json.loads(pinned.read_text())
    if args.date and args.date != snapshot['metadata']['asOf']:
        raise SystemExit('A new date requires --currency-data; do not relabel an old snapshot.')

countries = [{'code': code, 'english': english, 'currencies': snapshot['currencies'].get(code, []), 'timezones': pytz.country_timezones.get(code, [])} for code, english in sorted(pytz.country_names.items())]
output = {'metadata': {**snapshot['metadata'], 'pytzVersion': pytz.VERSION, 'timezoneSource': 'https://www.iana.org/time-zones'}, 'countries': countries}
(root / 'frontend/src/data/countries.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(f"Generated {len(countries)} countries; currencies as of {snapshot['metadata']['asOf']}, pytz {pytz.VERSION}.")
