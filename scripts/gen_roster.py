"""Generate the 100-species roster block for creatures.js.

Names are hand-curated per type rather than randomly assembled, so the Pokedex
reads like a roster instead of like mangled identifiers. Stats come from a tier
so later species are meaningfully stronger, and moves are drawn from MOVE_POOL
with the species' own type weighted.
"""
import json, random

NAMES = {
 'bug': ['Byteling','Grubyte','Nibbler','Weevil','Mothrun','Larvex','Crawlit','Antsy',
         'Hexapod','Chitin','Swarmlet','Mandible','Pupate','Skitter','Beetlow','Vermin',
         'Grubbin','Molting','Cocoona','Stingle'],
 'code': ['BitRiot','Compilr','Syntaxa','Kernelix','Bytecode','Lintbeast','Refactor','Assembly',
          'Runtimer','Stacktrace','Segfault','Nullpoint','Opcode','Bitshift','Forkling','Daemon',
          'Regexor','Patchwork','Threadle','Binaro'],
 'memory': ['Memorex','Cachette','Heapster','Ramoth','Bufferly','Paginar','Swapling','Leakage',
            'Allocat','Garbagen','Pointer','Stackpup','Registra','Volatyl','Bitmapp','Indexia',
            'Cachoo','Dumpling','Residue','Retaino'],
 'logic': ['Logix','Booleen','Truthor','Ifelsa','Gatewyrm','Predika','Conditio','Xorvus',
           'Nandra','Inferro','Axiomon','Theorem','Deducto','Syllogi','Paradox','Tautolo',
           'Invaria','Provable','Quantifi','Lambdra'],
 'flow': ['Flowy','Asyncro','Streamix','Promisa','Awaitor','Yieldle','Pipelyn','Chanelle',
          'Bufferra','Backpres','Throttle','Debounce','Cascada','Currenta','Rivulet','Eddyon',
          'Torrenta','Confluen','Deltoid','Estuary'],
}

MOVES_BY_TYPE = {
 'bug':    ['Bite','Scratch','Harden'],
 'code':   ['StringConcat','Crash','DebugAttack','Bitshift' ],
 'memory': ['CacheStore','DataShift','LeakDetect'],
 'logic':  ['IfStatement','BooleanFlip','LogicalAnd','StackOverflow'],
 'flow':   ['AsyncWave','CallbackStrike','PromiseChain'],
}
GENERIC = ['Tackle','Scratch','Harden','Recover']
DEFENSIVE = {'Harden', 'Recover'}          # no damage; never the only option
VALID = {'Scratch','StringConcat','Bite','Crash','StackOverflow','DebugAttack','CacheStore',
         'DataShift','LeakDetect','IfStatement','BooleanFlip','LogicalAnd','AsyncWave',
         'CallbackStrike','PromiseChain','Tackle','Recover','Harden'}

def main():
    rnd = random.Random(20260929)          # fixed seed: the roster is reproducible
    out, sid = [], 1
    for tier_start, tier in ((0, 'common'), (7, 'uncommon'), (14, 'rare')):
        pass
    for idx in range(20):                   # 20 rows, one species per type each row
        for t in ('bug','code','memory','logic','flow'):
            name = NAMES[t][idx]
            # Tier by position: the first of each type is a starter, the last are rare.
            tier = 0 if idx < 7 else (1 if idx < 14 else 2)
            base = 18 + tier * 14
            spread = lambda lo, hi: rnd.randint(base + lo, base + hi)
            # Guarantee one damaging move of the species' own type: sampling
            # freely produced creatures armed with nothing but Harden and Recover.
            pool = [m for m in MOVES_BY_TYPE[t] if m in VALID and m not in DEFENSIVE]
            primary = pool[idx % len(pool)]
            others = [m for m in pool if m != primary]
            moves = [primary]
            if others:
                moves.append(rnd.choice(others))
            moves.append(rnd.choice(GENERIC))
            out.append({
                'id': sid, 'name': name, 'type': t,
                'baseHp': spread(4, 18), 'baseAtk': spread(0, 14), 'baseDef': spread(-4, 10),
                'baseSp': spread(-2, 12), 'baseSpd': spread(-6, 10),
                'exp': 0, 'expToLevel': 60 + tier * 40 + idx * 3,
                'catchRate': max(20, 210 - tier * 70 - idx * 4),
                'moves': moves,
            })
            sid += 1

    lines = ['const CODEMON_SPECIES = [']
    for s in out:
        lines.append('  {')
        lines.append(f"    id: {s['id']},")
        lines.append(f"    name: {json.dumps(s['name'])},")
        lines.append(f"    type: CODEMON_TYPES.{s['type'].upper()},")
        for k in ('baseHp','baseAtk','baseDef','baseSp','baseSpd','exp','expToLevel','catchRate'):
            lines.append(f"    {k}: {s[k]},")
        lines.append(f"    moves: {json.dumps(s['moves'])}")
        lines.append('  },')
    lines.append('];')
    print('\n'.join(lines))

if __name__ == '__main__':
    main()
