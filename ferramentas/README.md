# Ferramentas de conferência

Testes que rodam **offline**, sem tocar na planilha de produção. Servem
para conferir, depois de mexer no código, que nada quebrou — antes de dar
`git push` e o site subir para o clube.

## 0. Rodar o app para testar

    py ferramentas/servidor.py 8765

Abre em `http://localhost:8765` **com o cache desligado**.

Use este, e não o `python -m http.server` direto. Aquele não manda nenhum
cabeçalho de cache, e aí o navegador guarda os arquivos sem nem perguntar se
mudaram. Com módulos ES o sintoma engana: parte vem nova, parte vem velha —
a tela mostra um botão novo, mas o `app.js` em memória é o antigo e não
conhece a ação. O clique não faz nada e **não aparece erro nenhum**.

Ele também registra cada arquivo pedido, o que ajuda quando algo "não
acontece": dá para ver se o navegador está mesmo falando com este servidor
e se algum arquivo deu 404.

> Se uma mudança não aparecer: confira o endereço na barra (aba antiga
> apontando para outra porta é o erro mais comum) e teste numa aba anônima.

## 1. Estrutura dos módulos

    py ferramentas/estrutura.py

Lê os arquivos de `js/` e confere:

1. Nenhum **import circular** (A depende de B que depende de A).
2. Nenhuma dependência **subindo de camada** — o núcleo não pode depender de
   uma tela. É o que impede que mexer numa tela alcance o resto do app.
3. Chaves, parênteses, aspas e crases **fechando certo** em todo arquivo.
4. Todo nome usado num módulo está **declarado ou importado** nele — pega o
   erro mais comum ao mover código: esquecer o `import`.
5. Todo `import` aponta para arquivo que existe e para nome que é exportado.
6. Toda ação emitida no HTML (`data-action`) **tem tratador**, e nenhuma ação
   está registrada em dois módulos ao mesmo tempo.
7. Nenhum `import` **sobrando**, sem uso no arquivo — lixo que sobra quando
   se move código de um lugar para outro.

Termina em `TUDO OK` ou lista os problemas.

## 2. As regras do clube

    node ferramentas/regras.mjs

Confere as regras que, se quebrarem, saem erradas numa convocação ou num
relatório sem ninguém perceber. Hoje cobre a **ordem hierárquica**: grau
primeiro, depois cargo (nos graus VI e V), depois nome. Usa a diretoria da
Barra como caso real.

O resultado também fica em `ferramentas/ultimo-regras.txt`.

## 3. Todas as telas desenham

    node ferramentas/telas.mjs

Monta um navegador de mentira, enche o app com dados falsos (6 membros em 4
divisões, 4 eventos cobrindo os 4 tipos, presenças com os 6 status, 5 rodadas
de insight) e **desenha as 68 telas e abas**, uma por uma. Avisa se alguma
estoura ou sai vazia.

O resultado também fica em `ferramentas/ultimo-teste.txt`.

Com `--html arquivo` ele grava o HTML de todas as telas. Serve para comparar
antes e depois de uma mexida: captura, mexe, captura de novo e roda um diff.
Diferença que aparecer ali é mudança de verdade na tela.

    node ferramentas/telas.mjs --html antes.txt
    # ... mexe no código ...
    node ferramentas/telas.mjs --html depois.txt

A saída é estável: rodar duas vezes seguidas dá exatamente o mesmo HTML.
Por isso o calendário do teste aponta para um mês fixo do passado — no mês
atual ele marcaria o dia de hoje, e a comparação acusaria diferença toda vez
que o dia virasse.

### Se não tiver Node instalado

O VS Code traz um Node embutido. No PowerShell, dentro da pasta do projeto:

    $env:ELECTRON_RUN_AS_NODE = "1"
    & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" ferramentas/telas.mjs

Nesse modo o texto não aparece no terminal (o `Code.exe` é um programa de
janela, não de console) — abra `ferramentas/ultimo-teste.txt` para ler.

## 4. As regras que moram no Code.gs

    node ferramentas/planilha.mjs

Monta uma **planilha de mentira em memória**, carrega o `apps-script/Code.gs`
de verdade por cima dela e confere o que ficou gravado. Não fala com o Google
em momento nenhum.

Existe por causa do **encerramento automático**: é a única parte do projeto
que roda sozinha, de madrugada, sem ninguém olhando, e que escreve direto na
planilha de produção. Um erro ali converte gente em falta infracional
calada — o tipo de estrago que só aparece quando alguém reclama do próprio
percentual.

Cobre quem encerra e quem fica (ontem sim, hoje não, **sem data nunca**), a
conversão de "Aguardando" em "Infracional" ao encerrar, a data chegando como
texto ou como `Date`, rodar duas vezes seguidas sem estragar nada, e o
gatilho ser trocado em vez de duplicado.

O resultado também fica em `ferramentas/ultimo-planilha.txt`.

> Vale lembrar o limite: ele prova que a **lógica** está certa, não que a
> publicação deu certo. O `Code.gs` só vale na planilha depois de
> republicado à mão no Apps Script — ver o `LINK.md`.

## O que estes testes NÃO cobrem

- Aparência. Se um card ficar torto ou uma cor sair errada, só olhando.
- A planilha de verdade, a publicação do `Code.gs` e o resto dele: o
  `planilha.mjs` cobre só o encerramento automático, que é a parte que roda
  sozinha.
- O caminho de rede de verdade — as chamadas são substituídas por promessas
  que nunca respondem, de propósito, para nada escrever na planilha.

Ou seja: eles dizem que o app **não quebrou**, não que está bonito. Depois de
passar em todos, ainda vale abrir no navegador e dar uma olhada:

    py -m http.server 8000
