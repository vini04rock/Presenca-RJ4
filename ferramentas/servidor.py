# -*- coding: utf-8 -*-
"""
Servidor local para testar o app, com o cache desligado.

    py ferramentas/servidor.py          (abre em http://localhost:8000)
    py ferramentas/servidor.py 8765     (em outra porta)

Por que não usar o `python -m http.server` direto: ele não manda nenhum
cabeçalho de cache. Sem `Cache-Control`, o navegador aplica "cache
heurístico" - guarda o arquivo e nem pergunta ao servidor se mudou, por um
tempo que ele mesmo decide.

Com módulos ES isso dá um sintoma traiçoeiro: parte dos arquivos vem nova e
parte vem velha. A tela mostra um botão novo, mas o `app.js` em memória é o
antigo e não conhece a ação - o clique não faz nada, e nenhum erro aparece.

Aqui todo arquivo sai com "no-store", então cada F5 busca tudo de novo.
Isto é só para desenvolvimento; no GitHub Pages o cache é normal e
desejável.
"""
import http.server
import sys
import os

PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class SemCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    # O .webp não está na tabela de tipos do Python antigo; sem isto ele sai
    # como "application/octet-stream". O navegador exibe assim mesmo, mas o
    # tipo certo evita confusão ao depurar.
    def guess_type(self, path):
        if str(path).endswith('.webp'):
            return 'image/webp'
        return super().guess_type(path)

    def log_message(self, formato, *args):
        # Registra tudo: numa tela que "não faz nada", saber exatamente quais
        # arquivos o navegador pediu (e quais deram 404) costuma ser o que
        # resolve. Erros saem marcados, pra achar no meio da lista.
        marca = '  <<< ERRO' if args and str(args[1]).startswith(('4', '5')) else ''
        super().log_message(formato + marca, *args)


# Uma thread por conexao. Com TCPServer (uma requisicao por vez) o servidor
# travava: o app tem mais de 30 modulos ES, o navegador abre varias conexoes
# em paralelo pra buscar tudo, e basta uma ficar pendurada pra fila inteira
# parar - a pagina fica carregando pra sempre sem erro nenhum aparecer.
class Servidor(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Servidor(('127.0.0.1', PORTA), SemCache) as s:
        print('App em http://localhost:%d  (cache desligado)' % PORTA)
        print('Servindo %s' % RAIZ)
        print('Ctrl+C para parar.')
        try:
            s.serve_forever()
        except KeyboardInterrupt:
            print('\nParado.')
