# -*- coding: utf-8 -*-
"""
Confere a saude estrutural dos modulos em js/. Nao precisa de internet nem
da planilha - le os arquivos e responde em segundos.

    py ferramentas/estrutura.py

O que ele verifica:
  1. Nenhum import circular (modulo A que depende de B que depende de A).
  2. Nenhuma dependencia "subindo" de camada (uma tela nao pode ser usada
     pelo nucleo, por exemplo).
  3. Chaves, parenteses, aspas e crases fechando certo em todo arquivo.
  4. Todo nome usado num modulo esta declarado ou importado nele.
  5. Todo import aponta pra arquivo que existe e pra nome que e exportado.
  6. Toda acao emitida no HTML (data-action) tem tratador, e nenhuma acao
     esta registrada em dois modulos ao mesmo tempo.

Saida: lista de problemas. Sem problemas, termina com "TUDO OK".
"""
import io, os, re, sys, collections

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(RAIZ, 'js')
problemas = []

def erro(msg):
    problemas.append(msg)
    print('  !! ' + msg)

fontes = {}
for raiz, _, arqs in os.walk(JS):
    for a in sorted(arqs):
        if not a.endswith('.js'):
            continue
        p = os.path.join(raiz, a)
        rel = os.path.relpath(p, JS).replace(os.sep, '/')
        fontes[rel] = io.open(p, encoding='utf-8', newline='').read()

IMP = re.compile(r"^import \{ ([^}]+) \} from '([^']+)';", re.M)
EXP = re.compile(r'^export\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)', re.M)
DECL = re.compile(r'^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)'
                  r'|^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)', re.M)

def destino(de, alvo):
    return os.path.normpath(os.path.join(os.path.dirname(de), alvo)).replace(os.sep, '/')

def nomes_do_import(itens):
    """['a', 'b as c'] -> [('a','a'), ('b','c')] (nome na origem, nome local)."""
    fora = []
    for parte in itens.split(','):
        parte = parte.strip()
        if ' as ' in parte:
            origem, local = parte.split(' as ', 1)
            fora.append((origem.strip(), local.strip()))
        else:
            fora.append((parte, parte))
    return fora

# ---------- 1 e 2: grafo de dependencia ---------------------------------
print('1/7  imports circulares e hierarquia de camadas')
g = dict((rel, set(destino(rel, a) for _, a in IMP.findall(txt))) for rel, txt in fontes.items())

cor, ciclos = {}, []
def dfs(n, cam):
    cor[n] = 1
    cam.append(n)
    for v in sorted(g.get(n, ())):
        if cor.get(v) == 1:
            ciclos.append(cam[cam.index(v):] + [v])
        elif not cor.get(v):
            dfs(v, cam)
    cam.pop()
    cor[n] = 2
for n in sorted(g):
    if not cor.get(n):
        dfs(n, [])
for c in ciclos:
    erro('import circular: ' + ' -> '.join(c))

CAMADA = {'nucleo': 0, 'dados': 1, 'dominio': 2, 'fila': 3, 'ui': 4, 'telas': 5, 'fluxos': 5, 'app.js': 6}
def camada(m):
    return CAMADA.get(m.split('/')[0] if '/' in m else m, 9)
for o in sorted(g):
    for d in sorted(g[o]):
        if camada(d) > camada(o):
            erro('dependencia subindo de camada: %s -> %s' % (o, d))

# ---------- 3: balanceamento --------------------------------------------
print('2/7  chaves, aspas, crases e regex fechando')
def varrer(txt):
    erros, pilha = [], []
    i, n, linha, anterior = 0, len(txt), 1, ''
    def pode_regex(a):
        return a == '' or a in '(,=:[!&|?{};+-*%~^<>'
    while i < n:
        c = txt[i]
        if c == '\n':
            linha += 1; i += 1; continue
        if c == '/' and i+1 < n and txt[i+1] == '/':
            j = txt.find('\n', i); i = n if j < 0 else j; continue
        if c == '/' and i+1 < n and txt[i+1] == '*':
            j = txt.find('*/', i+2)
            if j < 0: erros.append('comentario /* aberto na linha %d' % linha); break
            linha += txt.count('\n', i, j); i = j+2; continue
        if c == '/' and pode_regex(anterior):
            j, classe, ok = i+1, False, False
            while j < n:
                if txt[j] == '\\': j += 2; continue
                if txt[j] == '\n': break
                if txt[j] == '[': classe = True
                elif txt[j] == ']': classe = False
                elif txt[j] == '/' and not classe: ok = True; break
                j += 1
            if ok:
                i = j+1
                while i < n and txt[i] in 'gimsuyvd': i += 1
                anterior = 'x'; continue
        if c in '"\'':
            j = i+1
            while j < n:
                if txt[j] == '\\': j += 2; continue
                if txt[j] == '\n' or txt[j] == c: break
                j += 1
            if j >= n or txt[j] == '\n':
                erros.append('aspa %s aberta na linha %d' % (c, linha)); return erros, pilha
            i = j+1; anterior = 'x'; continue
        if c == '`':
            j = i+1
            while j < n:
                if txt[j] == '\\': j += 2; continue
                if txt[j] == '`': break
                if txt[j] == '$' and j+1 < n and txt[j+1] == '{':
                    prof, k = 1, j+2
                    while k < n and prof:
                        if txt[k] == '\\': k += 2; continue
                        if txt[k] in '"\'':
                            q = txt[k]; k += 1
                            while k < n and txt[k] != q: k += 2 if txt[k] == '\\' else 1
                            k += 1; continue
                        if txt[k] == '`':
                            d, k = 0, k+1
                            while k < n:
                                if txt[k] == '\\': k += 2; continue
                                if txt[k] == '$' and k+1 < n and txt[k+1] == '{': d += 1; k += 2; continue
                                if txt[k] == '}' and d: d -= 1; k += 1; continue
                                if txt[k] == '`' and not d: break
                                k += 1
                            k += 1; continue
                        if txt[k] == '{': prof += 1
                        elif txt[k] == '}': prof -= 1
                        k += 1
                    j = k; continue
                j += 1
            if j >= n:
                erros.append('crase aberta na linha %d' % linha); return erros, pilha
            linha += txt.count('\n', i, j); i = j+1; anterior = 'x'; continue
        if c in '([{':
            pilha.append((c, linha)); anterior = c; i += 1; continue
        if c in ')]}':
            par = {')': '(', ']': '[', '}': '{'}[c]
            if not pilha:
                erros.append('fechou "%s" sem abrir, linha %d' % (c, linha)); i += 1; continue
            ab, ln = pilha.pop()
            if ab != par:
                erros.append('fechou "%s" na linha %d, mas o aberto era "%s" da linha %d' % (c, linha, ab, ln))
            anterior = c; i += 1; continue
        if not c.isspace(): anterior = c
        i += 1
    return erros, pilha

for rel, txt in sorted(fontes.items()):
    errs, pilha = varrer(txt)
    for ab, ln in pilha:
        errs.append('"%s" aberto na linha %d e nunca fechado' % (ab, ln))
    for e in errs:
        erro('%s: %s' % (rel, e))

# ---------- 4 e 5: nomes e imports --------------------------------------
print('3/7  nomes soltos (usados sem declarar nem importar)')
dono = {}
for rel, txt in fontes.items():
    for n in EXP.findall(txt):
        if n != 'acoes':
            dono[n] = rel
GLOBAIS = set('''window document console Math JSON Object Array String Number Boolean Date Set Map
Promise RegExp Error alert confirm setTimeout clearTimeout navigator fetch Blob encodeURIComponent
decodeURIComponent isNaN parseInt parseFloat undefined URL localStorage requestAnimationFrame
location history AbortController Intl Symbol globalThis Infinity NaN'''.split())
KW = set('''const let var function return if else for while do break continue new typeof instanceof
in of delete void throw try catch finally switch case default class extends super yield await
async export import from as true false null undefined this static get set target action id e
acoes area mapa nome tratar'''.split())
IDENT = re.compile(r'\b([A-Za-z_$][\w$]*)\b')
for rel, txt in sorted(fontes.items()):
    corpo = re.sub(r"^import \{[^}]+\} from '[^']+';", '', txt, flags=re.M)
    corpo = re.sub(r'//[^\n]*', '', corpo)
    corpo = re.sub(r'/\*.*?\*/', '', corpo, flags=re.S)
    locais = set(m.group(1) or m.group(2) for m in DECL.finditer(txt))
    importados = set()
    for itens, _ in IMP.findall(txt):
        importados |= set(local for _, local in nomes_do_import(itens))
    for n in sorted(set(IDENT.findall(corpo))):
        if n in dono and dono[n] != rel and n not in locais and n not in importados \
           and n not in GLOBAIS and n not in KW:
            erro('%s usa "%s" sem importar' % (rel, n))

print('4/7  imports apontando pra arquivo e nome que existem')
exportados = dict((rel, set(EXP.findall(txt))) for rel, txt in fontes.items())
for rel, txt in sorted(fontes.items()):
    for itens, alvo in IMP.findall(txt):
        d = destino(rel, alvo)
        if d not in fontes:
            erro('%s importa de "%s", que nao existe' % (rel, alvo))
            continue
        for origem, _local in nomes_do_import(itens):
            if origem not in exportados[d]:
                erro('%s importa "%s" de %s, que nao exporta esse nome' % (rel, origem, d))

# ---------- 6: acoes ----------------------------------------------------
print('5/7  acoes: toda data-action emitida tem tratador')
CHAVE = re.compile(r"^  '([a-z0-9-]+)': async \(id, target, action, e\)", re.M)
tratadas = collections.Counter()
for rel, txt in fontes.items():
    for k in CHAVE.findall(txt):
        tratadas[k] += 1
    for k in re.findall(r"^ACOES\['([a-z0-9-]+)'\]", txt, re.M):
        tratadas[k] += 1
    for k in re.findall(r"^acoes\['([a-z0-9-]+)'\] =", txt, re.M):
        tratadas[k] += 1
    # o ouvinte de digitacao (input) tambem trata acao - ex.: o <select> que
    # resolve um nome na revisao da convocacao.
    for k in re.findall(r"dataset\.action === '([a-z0-9-]+)'", txt):
        tratadas[k] += 1
todo = '\n'.join(fontes.values())
emitidas = set(re.findall(r'data-action="([a-z0-9-]+)"', todo))
for a in sorted(emitidas - set(tratadas)):
    erro('acao "%s" e emitida no HTML mas ninguem trata' % a)

print('6/7  acoes registradas em mais de um modulo')
for a, n in sorted(tratadas.items()):
    if n > 1:
        erro('acao "%s" esta registrada %d vezes' % (a, n))

# ---------- 7: imports sem uso ------------------------------------------
print('7/7  imports sobrando (sem uso no arquivo)')
for rel, txt in sorted(fontes.items()):
    corpo = re.sub(r"^import \{[^}]+\} from '[^']+';", '', txt, flags=re.M)
    corpo = re.sub(r'//[^\n]*', '', corpo)
    usados = set(IDENT.findall(corpo))
    for itens, _ in IMP.findall(txt):
        for _origem, local in nomes_do_import(itens):
            if local not in usados:
                erro('%s importa "%s" e nao usa' % (rel, local))

# ---------- resumo -------------------------------------------------------
print()
print('%d modulos | %d imports | %d acoes tratadas | %d emitidas no HTML'
      % (len(fontes), sum(len(v) for v in g.values()), len(tratadas), len(emitidas)))
if problemas:
    print('%d PROBLEMA(S) - veja acima.' % len(problemas))
    sys.exit(1)
print('TUDO OK')
