# Compare two harness CSV files pitch by pitch and show, for each pitcher, the first pitch where they differ.
# Usage: python3 compare_runs.py OLD.csv NEW.csv      (read-only: it only reads the two files and prints)
import csv, sys
KEYS = ['zone', 'pitch', 'speed', 'outcome', 'contact', 'countBefore', 'outsBefore', 'tunnel', 'tunnelPartner', 'tunnelOverlap']
def load(path):
    with open(path, newline='') as f:
        reader = csv.DictReader(f)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    by = {}
    for row in rows:
        by.setdefault(row.get('pitcher', '?'), []).append(row)
    print(path + ': ' + str(len(rows)) + ' pitches; ' + ', '.join(p + ' ' + str(len(v)) for p, v in sorted(by.items())))
    return fields, by
print('Python ' + sys.version.split()[0])
fa, a = load(sys.argv[1])
fb, b = load(sys.argv[2])
keys = [k for k in KEYS if k in fa and k in fb]
print('Compared columns: ' + ', '.join(keys))
for pid in sorted(set(a) | set(b)):
    ra, rb = a.get(pid, []), b.get(pid, [])
    n = min(len(ra), len(rb))
    first = None
    for i in range(n):
        if any(ra[i][k] != rb[i][k] for k in keys):
            first = i
            break
    if first is None:
        print('\n' + pid + ': identical for all ' + str(n) + ' common pitches')
        continue
    r0 = ra[first]
    print('\n' + pid + ': first difference at pitch ' + str(first + 1) + ' of ' + str(n) + ' (block ' + r0['block'] + ', game ' + r0['game']
          + ', inning ' + r0['inning'] + ', batter ' + r0['batter'] + ', pitch ' + r0['pitchInAB'] + ' of the at-bat)')
    for i in range(max(0, first - 3), min(n, first + 2)):
        mark = '>>' if i == first else '  '
        print('  ' + mark + ' OLD: ' + ' | '.join(k + '=' + ra[i][k] for k in keys))
        print('  ' + mark + ' NEW: ' + ' | '.join(k + '=' + rb[i][k] for k in keys))
