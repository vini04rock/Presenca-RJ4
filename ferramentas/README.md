# Ferramentas de conferência

Dois testes que rodam **offline**, sem tocar na planilha de produção. Servem
para conferir, depois de mexer no código, que nada quebrou — antes de dar
`git push` e o site subir para o clube.

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

## 2. Todas as telas desenham

    node ferramentas/telas.mjs

Monta um navegador de mentira, enche o app com dados falsos (6 membros em 4
divisões, 4 eventos cobrindo os 4 tipos, presenças com os 6 status, 5 rodadas
de insight) e **desenha as 45 telas e abas**, uma por uma. Avisa se alguma
estoura ou sai vazia.

O resultado também fica em `ferramentas/ultimo-teste.txt`.

Com `--html arquivo` ele grava o HTML de todas as telas. Serve para comparar
antes e depois de uma mexida: captura, mexe, captura de novo e roda um diff.
Diferença que aparecer ali é mudança de verdade na tela.

    node ferramentas/telas.mjs --html antes.txt
    # ... mexe no código ...
    node ferramentas/telas.mjs --html depois.txt

### Se não tiver Node instalado

O VS Code traz um Node embutido. No PowerShell, dentro da pasta do projeto:

    $env:ELECTRON_RUN_AS_NODE = "1"
    & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" ferramentas/telas.mjs

Nesse modo o texto não aparece no terminal (o `Code.exe` é um programa de
janela, não de console) — abra `ferramentas/ultimo-teste.txt` para ler.

## O que estes testes NÃO cobrem

- Aparência. Se um card ficar torto ou uma cor sair errada, só olhando.
- O backend (`apps-script/Code.gs`) e a planilha.
- O caminho de rede de verdade — as chamadas são substituídas por promessas
  que nunca respondem, de propósito, para nada escrever na planilha.

Ou seja: eles dizem que o app **não quebrou**, não que está bonito. Depois de
passar nos dois, ainda vale abrir no navegador e dar uma olhada:

    py -m http.server 8000
