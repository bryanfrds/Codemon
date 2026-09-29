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

ROOTS = {
 'bug':    ['Grub','Skit','Chit','Mand','Lar','Hex','Mite','Nym','Thor','Wev','Cic','Aph',
            'Scar','Moth','Ant','Tick','Flea','Wasp','Pup','Silk'],
 'code':   ['Byt','Syn','Lint','Seg','Op','Hash','Tok','Pars','Comp','Macr','Flag','Regi',
            'Stak','Lex','Cast','Sym','Link','Trac','Emit','Bin'],
 'memory': ['Heap','Cach','Ram','Buf','Pag','Swap','Alloc','Ptr','Slab','Arena','Frag',
            'Block','Sect','Page','Leak','Dump','Stor','Mem','Vol','Reg'],
 'logic':  ['Bool','Xor','Nand','Axi','Lem','Pred','Quant','Nor','Implic','Sylo','Mod',
            'Prov','Tru','Fals','Gate','Lamb','Infer','Theo','Deduc','Clause'],
 'flow':   ['Strea','Flux','Pip','Tide','Eddy','Rive','Casca','Curr','Wav','Surg',
            'Drift','Spill','Chan','Fount','Delt','Brook','Rapi','Mist','Pour','Gyre'],
}
ENDINGS = ['ling','ix','on','ra','eel','kit','mite','wyrm','pup','oth','azor','ette',
           'ox','ly','rex','mon','ari','ion','zo','ander','ite','usk','ore','ven']

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
    TYPES = ('bug', 'code', 'memory', 'logic', 'flow')
    TOTAL = 1000
    used = {n for names in NAMES.values() for n in names}
    out = []

    def make_name(t):
        for _ in range(500):
            root, end = rnd.choice(ROOTS[t]), rnd.choice(ENDINGS)
            # Vowel meeting vowel reads badly ("Gyreeel", "Pageette"): drop one.
            if root[-1] in 'aeiou' and end[0] in 'aeiou':
                root = root[:-1]
            # Same letter on both sides of the join ("Currrex", "Spillly"): drop one.
            if root[-1] == end[0]:
                root = root[:-1]
            n = root + end
            if any(n[i] == n[i + 1] == n[i + 2] for i in range(len(n) - 2)):
                continue
            if n not in used and len(n) <= 11:
                used.add(n)
                return n
        raise RuntimeError(f"ran out of names for {t}")

    for sid in range(1, TOTAL + 1):
        t = TYPES[(sid - 1) % 5]
        row = (sid - 1) // 5                 # 0-based row of five, one per type
        if row < 20:
            name = NAMES[t][row]             # the hand-written first 100
            tier = 0 if row < 7 else (1 if row < 14 else 2)
        else:
            name = make_name(t)
            tier = min(4, sid // 250 + 1)    # later species are tougher
        # The first 100 keep the exact formulas they shipped with, so adding the
        # rest doesn't quietly rebalance creatures you already know.
        base = 18 + tier * (14 if row < 20 else 12)
        spread = lambda lo, hi: rnd.randint(base + lo, base + hi)
        # Guarantee one damaging move of the species' own type: sampling freely
        # produced creatures armed with nothing but Harden and Recover.
        pool = [m for m in MOVES_BY_TYPE[t] if m in VALID and m not in DEFENSIVE]
        primary = pool[row % len(pool)]
        others = [m for m in pool if m != primary]
        moves = [primary] + ([rnd.choice(others)] if others else []) + [rnd.choice(GENERIC)]
        out.append({
            'id': sid, 'name': name, 'type': t,
            'baseHp': spread(4, 18), 'baseAtk': spread(0, 14), 'baseDef': spread(-4, 10),
            'baseSp': spread(-2, 12), 'baseSpd': spread(-6, 10),
            'exp': 0, 'expToLevel': 60 + tier * 40 + (row % 20) * 3,
            'catchRate': (max(20, 210 - tier * 70 - row * 4) if row < 20
                          else max(15, 210 - tier * 45 - (row % 20) * 3)),
            'moves': moves,
        })

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
