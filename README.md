# Confirmação de Presença — Insanos MC Barra RJ4

App de página única para substituir a lista de confirmação de presença no
WhatsApp. Membros abrem um link, tocam no próprio nome e marcam o status.
O organizador tem um modo protegido por PIN para criar eventos, cadastrar
membros e gerar relatórios.

## Stack

- HTML + CSS + JavaScript puro, em módulos ES nativos.
- Sem framework, sem build step, sem dependências (só Google Fonts).
- Hospedagem: GitHub Pages (estático).
- Backend: planilha do Google Sheets via Apps Script publicado como Web App.
  A URL fica na constante `API_URL`, em `js/nucleo/api.js`.

## Como rodar localmente

Sirva a pasta e acesse `http://localhost:8000`:

    python -m http.server 8000

> Não dá para abrir o `index.html` com duplo clique. O app usa módulos ES
> (`import`/`export`), e o navegador os bloqueia em `file://` por segurança.
> Pelo servidor local funciona, e no GitHub Pages também — módulos ES são
> nativos, não precisam de build.

> O app lê e grava na planilha de produção. Não existe ambiente de teste
> separado — cuidado ao mexer com eventos reais abertos.

## Estrutura

    .
    ├── index.html            só o esqueleto: <head>, #app e o <script>
    ├── css/estilo.css        todo o visual
    ├── img/                  as artes dos cards, a logo e o fundo
    ├── js/
    │   ├── app.js            roteador de telas + ouvintes de clique
    │   ├── nucleo/           config, estado, api, util, imagens, render
    │   ├── dados/            carrega da planilha para o estado
    │   ├── dominio/          as regras: status, parser, estatísticas, texto
    │   ├── fila/             gravação otimista de presença
    │   ├── ui/               pedaços de tela reaproveitados e gráficos
    │   ├── telas/            uma tela por arquivo
    │   └── fluxos/           as ações (confirmar, ajustar, exportar…)
    ├── apps-script/Code.gs   backend (cópia do que roda no Google)
    ├── CONTEXTO-PROJETO.md   contexto e decisões de arquitetura
    └── README.md

Os módulos seguem uma hierarquia: `nucleo` não depende de ninguém, e cada
camada acima só usa as de baixo (`dados` → `dominio` → `fila` → `ui` →
`telas`/`fluxos` → `app.js`). Nenhum import circular — mexer numa tela não
alcança o núcleo.

O `Code.gs` roda na planilha do Google; a cópia em `apps-script/` existe
para versionar e revisar, e precisa ser colada lá a cada alteração.

## Documentação

Detalhes de arquitetura, chaves de armazenamento, identidade visual e o que
já está pronto: [CONTEXTO-PROJETO.md](CONTEXTO-PROJETO.md).
