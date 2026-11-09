#!/usr/bin/env python3
"""Compare a harness run with the noise band of several "before" runs (read-only).
A6 part 4, step A4. Usage (Terminal, on the Mac):
  python3 tools/compare_band.py BEFORE1.csv BEFORE2.csv BEFORE3.csv BEFORE4.csv
  python3 tools/compare_band.py BEFORE1.csv BEFORE2.csv BEFORE3.csv BEFORE4.csv --after AFTER.csv
The before runs are the same code with different seeds, so their spread is the noise band
(what dice alone can do). Each run's value is the mean of its blocks, like the harness report.
An after value outside the band (lowest to highest before value) is marked ABOVE or BELOW.
The second table shows, for one run (the after run if given), the side readings per pitcher:
average A and E, the old rules' strong-contact multipliers and the part-4 ones from E.
Nothing is written; the script only reads the CSV files.
"""
import csv
import sys
from collections import defaultdict
ENDINGS = {'STRIKEOUT', 'WALK', 'SINGLE', 'DOUBLE', 'TRIPLE', 'HOME RUN', 'GROUND OUT', 'POP FLY'}
HITS = {'SINGLE', 'DOUBLE', 'TRIPLE', 'HOME RUN'}
FOULS = {'FOUL (LATE)': 'L', 'FOUL (PULLED)': 'P', 'FOUL (STRAIGHT BACK)': 'S'}
# (key, label, decimals, function of one block's counts)
METRICS = [
    ('K', 'Strikeouts per inning', 2, lambda b: b['K'] / b['inn']),
    ('H', 'Hits per inning', 2, lambda b: b['H'] / b['inn']),
    ('R', 'Runs per inning', 2, lambda b: b['R'] / b['inn']),
    ('BB', 'Walks per inning', 2, lambda b: b['BB'] / b['inn']),
    ('PI', 'Pitches per inning', 1, lambda b: b['n'] / b['inn']),
    ('PAB', 'Pitches per at-bat', 2, lambda b: b['n'] / b['ab'] if b['ab'] else 0),
    ('ST', 'Strong contact % of pitches', 1, lambda b: 100 * b['ST'] / b['n']),
    ('L6', 'At-bats of 6+ pitches %', 1, lambda b: 100 * b['L6'] / b['ab'] if b['ab'] else 0),
    ('L8', 'At-bats of 8+ pitches %', 1, lambda b: 100 * b['L8'] / b['ab'] if b['ab'] else 0),
    ('FL', 'FOUL (LATE) % of fouls', 1, lambda b: 100 * b['L'] / b['F'] if b['F'] else 0),
    ('FP', 'FOUL (PULLED) % of fouls', 1, lambda b: 100 * b['P'] / b['F'] if b['F'] else 0),
    ('FS', 'FOUL (STRAIGHT BACK) % of fouls', 1, lambda b: 100 * b['S'] / b['F'] if b['F'] else 0),
    ('AA', 'Average anticipation A', 3, lambda b: b['A'] / b['nA'] if b['nA'] else 0),
    ('AE', 'Average strength E', 3, lambda b: b['E'] / b['nA'] if b['nA'] else 0),
]
def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None
def read_run(path):
    """Return ({pitcher: {metric: run value}}, {pitcher: side-reading averages}, seed note)."""
    blocks = defaultdict(lambda: defaultdict(float))
    innings = defaultdict(set)
    final_score = {}
    side = defaultdict(lambda: defaultdict(float))
    seeds = set()
    with open(path, newline='') as f:
        rows = csv.DictReader(f)
        if 'A' not in (rows.fieldnames or []):
            sys.exit(path + ': no anticipation columns; this script needs a run'
                     ' of the step A harness (f47eb18 or later).')
        for r in rows:
            p, blk = r['pitcher'], r['block']
            key = (p, blk)
            b = blocks[key]
            # seed = base + pitcher*100 + block (P1 is pitcher 0)
            seeds.add(int(r['seed']) - int(blk) - 100 * (int(p[1:]) - 1))
            innings[key].add((r['game'], r['inning']))
            g = (p, blk, r['game'])
            final_score[g] = max(final_score.get(g, 0), int(r['scoreAfter'] or 0))
            out = r['outcome']
            b['n'] += 1
            if out == 'STRIKEOUT':
                b['K'] += 1
            if out == 'WALK':
                b['BB'] += 1
            if out in HITS:
                b['H'] += 1
            if r['contact'] == 'STRONG CONTACT':
                b['ST'] += 1
            if out in FOULS:
                b[FOULS[out]] += 1
                b['F'] += 1
            if out in ENDINGS:
                b['ab'] += 1
                k = int(r['pitchInAB'])
                b['L6'] += k >= 6
                b['L8'] += k >= 8
            a, e = num(r['A']), num(r['E'])
            if a is not None:
                b['A'] += a
                b['E'] += e
                b['nA'] += 1
            s = side[p]
            for col in ('A', 'E', 'shRepStrong', 'shTunStrong', 'newStrong', 'newMiss'):
                v = num(r[col])
                if v is not None:
                    s[col] += v
                    s['n_' + col] += 1
            if r['building'] == '1':
                s['bLoc'] += num(r['antLoc']) or 0
                s['nb'] += 1
            elif num(r['antLoc']) is not None:
                s['oLoc'] += num(r['antLoc'])
                s['no'] += 1
    for (p, blk, _g), sc in final_score.items():
        blocks[(p, blk)]['R'] += sc
    run = defaultdict(dict)
    per_pitcher = defaultdict(list)
    for (p, blk), b in blocks.items():
        b['inn'] = len(innings[(p, blk)])
        per_pitcher[p].append(b)
    for p, bl in per_pitcher.items():
        for key, _label, _d, fn in METRICS:
            run[p][key] = sum(fn(b) for b in bl) / len(bl)
        run[p]['_blocks'] = len(bl)
    return run, side, sorted(seeds)
def main(argv):
    if '--after' in argv:
        i = argv.index('--after')
        before, after = argv[:i], argv[i + 1:]
        if len(after) != 1:
            sys.exit('Give exactly one file after --after.')
        after = after[0]
    else:
        before, after = argv, None
    if len(before) < 2:
        sys.exit(__doc__)
    runs = []
    for path in before:
        run, side, seeds = read_run(path)
        runs.append(run)
        print('before: %s  (base seed %s, pitchers %s)' % (path, ','.join(map(str, seeds)),
              ' '.join('%s:%d blocks' % (p, run[p]['_blocks']) for p in sorted(run))))
    if len(set(tuple(sorted(r)) for r in runs)) != 1:
        sys.exit('The before runs do not have the same pitchers.')
    arun = aside = None
    if after:
        arun, aside, seeds = read_run(after)
        print('after:  %s  (base seed %s)' % (after, ','.join(map(str, seeds))))
    pitchers = sorted(runs[0])
    print()
    print('Noise band = lowest to highest of the %d before runs. ABOVE / BELOW = outside the band.'
          % len(runs))
    for key, label, d, _fn in METRICS:
        print()
        print(label)
        for p in pitchers:
            vals = [r[p][key] for r in runs]
            lo, hi = min(vals), max(vals)
            fmt = lambda x: ('%.*f' % (d, x)).rjust(7)
            line = '  %-3s band %s to %s' % (p, fmt(lo), fmt(hi))
            if arun is not None and p in arun:
                v = arun[p][key]
                rnd = lambda x: round(x, d)  # compare at the decimals shown
                mark = 'ABOVE' if rnd(v) > rnd(hi) else ('BELOW' if rnd(v) < rnd(lo) else 'inside')
                line += '   after %s  %s' % (fmt(v), mark)
            print(line)
    side = aside if aside is not None else read_run(before[0])[1]
    print()
    print('Side readings per pitcher (%s): averages over every pitch' % (after or before[0]))
    print('  pitcher  avg A   avg E   old rep strong  old tunnel strong  new strong  new miss'
          '  location reading: building a line / other pitches')
    for p in pitchers:
        if p not in side:
            continue
        s = side[p]
        avg = lambda c: s[c] / s['n_' + c] if s['n_' + c] else float('nan')
        build = '-'
        if s['nb'] and s['no']:
            build = '%.3f / %.3f' % (s['bLoc'] / s['nb'], s['oLoc'] / s['no'])
        print('  %-7s  %.3f  %+.3f   %.3f           %.3f              %.3f       %.3f     %s'
              % (p, avg('A'), avg('E'), avg('shRepStrong'), avg('shTunStrong'),
                 avg('newStrong'), avg('newMiss'), build))
if __name__ == '__main__':
    main(sys.argv[1:])
