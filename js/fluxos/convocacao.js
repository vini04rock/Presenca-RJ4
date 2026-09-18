// Acoes de colar convocacao: analisar o texto e confirmar o evento.

import { loadInitial } from '../dados/carregar.js';
import { eventosPossivelmenteDuplicados } from '../dominio/estatisticas.js';
import { parseConvocacaoTexto, resolverParsedComRoster } from '../dominio/parser.js';
import { apiPost } from '../nucleo/api.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { dataISOdeBR, scrollParaElemento, valorDoCampo } from '../nucleo/util.js';

// Reabre o fluxo de colar convocacao apontado pra um evento ja existente
// (ver o botao "Corrigir" em renderCardEvento) - ao confirmar, salva por
// cima do mesmo evento (mesmo id) em vez de criar outro. So funciona pra
// eventos encerrados porque so esses nascem do fluxo de colar convocacao
// (criarEventoDeTexto sempre cria o evento ja encerrado).
export function iniciarCorrecaoConvocacao(id) {
  const ev = state.events.find(e => e.id === id);
  if (!ev) return;
  state.relatorioEditandoEventoId = id;
  state.relatorioCategoriaAlvo = ev.categoria;
  state.relatorioTipoEscolhido = ev.tipo || null;
  state.relatorioTextoBruto = '';
  state.relatorioParsed = null;
  state.relatorioSalvarErro = null;
  state.relatorioDuplicidadeAviso = null;
  state.relatorioDuplicidadeConfirmada = false;
  state.relatorioTab = 'enviar';
  state.relatorioColarStep = 'texto';
  // O botao que chama isto mora na aba "Encerrados" do organizador, ou
  // seja, noutra tela. Sem trocar a view, o render redesenharia o
  // organizador e o clique nao faria nada visivel.
  state.view = 'relatorio';
  render();
}

export function analisarConvocacao() {
  // Le direto do campo (nao so de state.relatorioTextoBruto) - o campo nao
  // dispara um re-render a cada letra digitada, entao o valor no state pode
  // ficar defasado se o navegador preencher o campo sem passar pelo evento
  // "input" (autofill, colar via menu de contexto em alguns navegadores).
  const campo = document.getElementById('relatorio-texto-field');
  if (campo) state.relatorioTextoBruto = campo.value;
  if (!state.relatorioTextoBruto.trim()) return;

  const parsed = parseConvocacaoTexto(state.relatorioTextoBruto);
  // Ao corrigir uma convocacao ja enviada, o texto colado de novo pode ser
  // so a lista corrigida, sem repetir data/horario/endereco/outros - sem
  // isso, um campo que o parser nao achou no texto novo apagaria o valor
  // que ja estava salvo em vez de manter.
  if (state.relatorioEditandoEventoId) {
    const original = state.events.find(e => e.id === state.relatorioEditandoEventoId);
    if (original) {
      ['nome', 'data', 'horario', 'endereco', 'outros'].forEach(campo => {
        if (!parsed.evento[campo]) parsed.evento[campo] = original[campo];
      });
    }
  }
  // O tipo escolhido nos botoes acima da caixa de texto vence o palpite do
  // parser (que so tenta adivinhar pelo titulo do texto colado) - mais
  // confiavel que depender do texto ter uma palavra reconhecivel.
  if (state.relatorioTipoEscolhido) parsed.evento.tipo = state.relatorioTipoEscolhido;
  // Casa os nomes contra a divisao escolhida (relatorioCategoriaAlvo), nao
  // contra o escopo de acesso (adminEscopo) - um organizador Regional
  // colando so a convocacao da Curicica precisa que os nomes batam com o
  // elenco da Curicica, nao com a planilha toda.
  parsed.membrosParsed = resolverParsedComRoster(parsed.membrosParsed, state.relatorioCategoriaAlvo || state.adminEscopo);
  // Foto do momento em que o parser terminou de rodar, antes de qualquer
  // correção manual - é o que mede "quão bem o parser se saiu", diferente
  // de naoResolvidos (que muda a cada correção feita na tela de revisão).
  parsed.autoResolvidos = parsed.membrosParsed.filter(r => r.membroId).length;
  state.relatorioParsed = parsed;
  state.relatorioColarStep = 'revisao';
  state.relatorioDuplicidadeAviso = null;
  state.relatorioDuplicidadeConfirmada = false;
  render();
}

export async function confirmarEventoParseado() {
  if (state.relatorioSalvando) return;
  const parsed = state.relatorioParsed;
  // Fora do objeto "ev" de proposito: ele e copiado inteiro pro evento que
  // vai pra planilha, e o texto cru do campo nao tem nada que fazer la.
  const dataBruta = valorDoCampo('rev-evento-data').trim();
  const ev = {
    nome: document.getElementById('rev-evento-nome').value.trim(),
    data: dataBruta ? dataISOdeBR(dataBruta) : '',
    horario: document.getElementById('rev-evento-horario').value,
    endereco: document.getElementById('rev-evento-endereco').value.trim(),
    outros: document.getElementById('rev-evento-outros').value.trim()
  };
  // Grava direto em parsed.evento antes de qualquer validacao - se render()
  // for chamado de novo daqui pra frente (campo faltando, duplicidade
  // encontrada), os inputs sao reconstruidos a partir de parsed.evento, e
  // sem isso a edicao que a pessoa acabou de fazer no campo se perderia.
  Object.assign(parsed.evento, ev);
  // O botao fica sempre clicavel (nao "disabled" por validacao) porque um
  // botao desabilitado nao avisa nada - a pessoa clica, nada acontece, e o
  // aviso de verdade (ex.: "escolha o tipo") fica la em cima, fora da tela,
  // perto de onde o campo esta. Por isso cada checagem aqui rola a pagina
  // ate o ponto do problema, em vez de so acender um texto que ninguem ve.
  if (!ev.nome) {
    state.relatorioSalvarErro = 'Preencha o nome do evento.';
    render();
    scrollParaElemento('rev-evento-nome');
    return;
  }
  // Escreveu algo no campo de data, mas nao e data (31/02, mes 13, pela
  // metade). Sem esta checagem viraria '' e o evento seria salvo sem data.
  if (dataBruta && !ev.data) {
    state.relatorioSalvarErro = `"${dataBruta}" não é uma data válida - escreva como 21/09/2026.`;
    render();
    scrollParaElemento('rev-evento-data');
    return;
  }
  // Data/tipo/integrantes sao os pontos que o evento sempre precisa gravar -
  // o texto colado pode nao trazer a data (como nesse exemplo sem nenhuma
  // data), entao o app exige preencher na mao em vez de salvar em branco.
  if (!ev.data) {
    state.relatorioSalvarErro = 'Preencha a data do evento.';
    render();
    scrollParaElemento('rev-evento-data');
    return;
  }
  if (!parsed.evento.tipo) {
    state.relatorioSalvarErro = 'Escolha o tipo de evento.';
    render();
    scrollParaElemento('rev-secao-tipo');
    return;
  }
  const naoResolvidos = parsed.membrosParsed.filter(r => !r.ignorado && !r.membroId);
  if (naoResolvidos.length) {
    state.relatorioSalvarErro = naoResolvidos.length + ' nome(s) sem correspondência - escolha o membro certo (ou "Ignorar") na lista abaixo.';
    render();
    scrollParaElemento('rev-membros-lista');
    return;
  }
  if (!parsed.membrosParsed.some(r => r.membroId)) {
    state.relatorioSalvarErro = 'Nenhum membro pra salvar - resolva pelo menos um nome antes de confirmar.';
    render();
    scrollParaElemento('rev-membros-lista');
    return;
  }

  const categoria = state.relatorioCategoriaAlvo || state.adminEscopo;
  if (!state.relatorioDuplicidadeConfirmada) {
    const duplicatas = eventosPossivelmenteDuplicados(ev.data, categoria, state.relatorioEditandoEventoId);
    if (duplicatas.length) { state.relatorioDuplicidadeAviso = duplicatas; return render(); }
  }
  state.relatorioDuplicidadeAviso = null;

  const membros = parsed.membrosParsed
    .filter(r => !r.ignorado && r.membroId)
    .map(r => ({ id: r.membroId, status: r.status, direto: r.direto, destacado: r.destacado, acompanhado: r.acompanhado }));

  state.relatorioSalvando = true;
  state.relatorioSalvarErro = null;
  render();
  try {
    const r = await apiPost('criarEventoDeTexto', {
      // Vazio quando e uma convocacao nova - o Code.gs cria um id novo
      // sozinho (ver salvarEvento). Quando e uma correcao (ver
      // iniciarCorrecaoConvocacao), manda o id do evento original: o mesmo
      // salvarEvento faz upsert em vez de criar outro, e
      // ajustarParticipantesComStatus substitui a lista de presencas
      // inteira pela nova (adiciona quem entrou, remove quem saiu).
      id: state.relatorioEditandoEventoId || undefined,
      nome: ev.nome, data: ev.data, horario: ev.horario, endereco: ev.endereco, outros: ev.outros,
      // A categoria do evento e a divisao escolhida na tela de colar
      // (relatorioCategoriaAlvo), nao o escopo de acesso (adminEscopo) -
      // um organizador Regional pode estar colando a convocacao so da
      // Curicica, e o evento tem que nascer como categoria "curicica".
      categoria: categoria, tipo: parsed.evento.tipo || '',
      // A lista colada ja e o resultado final (quem foi, quem faltou) - o
      // evento nasce encerrado, sem precisar que o organizador va la depois
      // so pra clicar em "Encerrar". Isso tambem faz a % de presenca do
      // membro contar esse evento na hora (so eventos encerrados entram na
      // conta, ver lerEstatisticasMembros no Code.gs).
      status: 'encerrado',
      membros: membros,
      // Guardado pra dar pra conferir depois exatamente o que foi colado,
      // sem depender do WhatsApp - ver "Ver texto original" em renderCardEvento.
      textoOriginal: state.relatorioTextoBruto
    });
    state.relatorioSalvoEventoId = r.id;
    // Se for uma correcao, o evento ja tinha presencas cacheadas em
    // state.reportData de antes - loadReportData() so busca o que "falta"
    // (id ainda nao presente no cache), entao sem apagar a entrada antiga
    // aqui o Resumo continuaria mostrando os numeros de antes da correcao
    // ate a pagina ser recarregada inteira.
    delete state.reportData[r.id];
    await loadInitial();
    state.relatorioColarStep = 'resultado';
  } catch (e) {
    state.relatorioSalvarErro = e.message;
  }
  state.relatorioSalvando = false;
  render();
}
