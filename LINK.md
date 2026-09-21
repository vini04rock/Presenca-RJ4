# Links do projeto

## App — link para mandar no grupo

    https://vini04rock.github.io/Presenca-RJ4/

Atenção às maiúsculas: `P` de Presenca, `RJ4` todo maiúsculo. O endereço
diferencia maiúscula de minúscula.

Não precisa de conta nem instalar nada — abre no navegador do celular.
Para virar ícone no aparelho:

- iPhone: botão de compartilhar → "Adicionar à Tela de Início"
- Android: menu ⋮ → "Adicionar à tela inicial"

PIN do modo organizador: cada uma das 7 divisões (Barra, Oeste, Recreio,
Curicica, Taquara, Gardênia, Regional) tem o próprio PIN, guardado nas
Propriedades do Script do Apps Script — não fica mais no código. O PIN do
Regional funciona como chave-mestra, abrindo qualquer divisão.

## Repositório

    https://github.com/vini04rock/Presenca-RJ4

O site é publicado pelo GitHub Pages a partir da branch `main`, pasta raiz.
Todo `git push` atualiza o site no ar em cerca de 1 minuto.

## Backend — Google Apps Script

URL do Web App (constante `API_URL` no `index.html`):

    https://script.google.com/macros/s/AKfycbyotQH6FypFdkC6D42WQHszNiuG29wqIBal2jBcwXdoCsT-Om_0gyDxFE02hxfwrZegxw/exec

Conferir qual versão está publicada:

    <URL acima>?action=versao

O código vive em [apps-script/Code.gs](apps-script/Code.gs) e precisa ser
colado no editor do Apps Script a cada alteração:

    Extensões > Apps Script > colar > Ctrl+S
    Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar

Usar "Gerenciar implantações", nunca "Nova implantação" — esta última cria
uma URL diferente e quebra o app.

### Encerramento automático (ligar uma vez só)

O `Code.gs` encerra sozinho, de madrugada, todo evento cuja data já passou —
e encerrar converte quem ficou "Aguardando" em "Não justificada". Isso depende de
um **gatilho de tempo**, que **não vai junto no código colado**: publicar o
`Code.gs` não liga o gatilho.

Depois de publicar a versão que trouxe isso, ligar uma vez:

    Planilha > menu "Confirmacao MC" > "Ligar o encerramento automatico"

Rodar de novo é inofensivo — ele substitui o gatilho anterior em vez de criar
um segundo. Para conferir que ficou de pé: `Extensões > Apps Script >
Acionadores` (o relógio, na barra da esquerda) deve listar
`encerrarEventosVencidos`, diário.

No mesmo menu há **"Encerrar eventos vencidos agora"**, que força uma passada
sem esperar a madrugada — útil para conferir na hora, e para o dia em que o
gatilho falhar. O que cada passada fez fica registrado em
`Extensões > Apps Script > Execuções`.

> O gatilho roda por volta de **1h da manhã**, no fuso da planilha. Um evento
> de hoje fica aberto o dia inteiro de propósito: quem está lá ainda confirma
> presença pelo celular.

## Planilha

Abas em uso:

- `Membros`, `Eventos`, `Presencas` — os dados. O app lê e grava aqui,
  filtrando por uma coluna de divisão/categoria (não há aba separada por
  divisão para os dados — ver `PLANO-MULTI-DIVISAO.md`).
- `Relatorio` — por evento, gerada sob demanda pelo botão "Gerar relatório
  na planilha" (só aparece dentro do organizador Regional). Mostra as
  mesmas 3 categorias do app (confirmado/justificada/não justificada), com um
  resumo por evento igual ao que aparece ao salvar uma convocação colada.
- `Regional RJ4` — resumo comparativo entre divisões, em 4 janelas de
  tempo (1/3/6/12 meses), gerada pelo mesmo botão.
- Uma aba por divisão (`Barra - RJ4`, `Oeste - RJ4`, etc.) — integrantes e
  % de cada um no topo, eventos e % coloridos por status no meio, e uma
  seção "FICHAS" embaixo com o histórico evento a evento de cada
  integrante (espelho da Ficha do membro do app). Também gerada pelo mesmo
  botão.
- `Insight RJ4` — espelho do Rank de Insights público do app: média de
  participação por divisão, ranking de membros e histórico das últimas 20
  rodadas, com gráfico de tendência. Gerada pelo mesmo botão.
- `Calendário` — grade visual, um mês por vez, com os eventos marcados em
  cada dia (cor por divisão). Gerada pelo mesmo botão.
- `KV` — formato antigo, mantido apenas como backup da migração inicial.

Todas as abas de resumo (`Calendário`, `Insight RJ4`, `Regional RJ4` e as
abas por divisão) são regeradas do zero a cada vez - editar direto nelas
não tem efeito, os dados de verdade vivem em `Membros`/`Eventos`/
`Presencas`/`InsightRodadas`/`InsightPresencas`.
