// Modo organizador, secao Membros: as abas "Cadastro" e "Presencas".
//
// Cadastro e quem escreve o membro; Presencas e o retrato do que ele fez.
// Mesma gente vista dos dois lados, entao moram no mesmo arquivo.

import { membrosDoEscopo } from '../dominio/estatisticas.js';
import { TIPOS_MOVIMENTO, estaAfastado, semDataDeIngresso } from '../dominio/movimentos.js';
import { confirmarGrauDoMembro, confirmarMovimento, fecharPainelMovimento, salvarDatasDeIngresso } from '../fluxos/movimentos.js';
import { FUNCOES, GRAUS, cargosDoGrau, escopoPorChave, escoposNaOrdemOficial, funcaoPorChave } from '../nucleo/config.js';
import { genId, state } from '../nucleo/estado.js';
import { dataISOdeBR, escapeHtml, formatDataBR, hojeISO, ordenarPorHierarquia } from '../nucleo/util.js';
import { selinhoIniciais } from '../ui/comuns.js';
import { loadEstatisticas, salvarOuAvisar } from '../dados/carregar.js';
import { render } from '../nucleo/render.js';

export function renderAdminPresencas() {
  if (state.estatisticasError) {
    return `
      <div class="alert">
        <div class="alert-title">Não consegui carregar</div>
        <div class="alert-msg">${escapeHtml(state.estatisticasError)}.</div>
        <button class="btn secondary block" data-action="retry-estatisticas" style="margin-top:10px;">Tentar de novo</button>
      </div>
    `;
  }
  if (state.estatisticasLoading || !state.estatisticas) {
    return '<div class="alert info"><div class="alert-msg">Calculando presença de cada membro…</div></div>';
  }
  if (!state.estatisticas.length) {
    return '<div class="empty">Nenhum membro cadastrado ainda.</div>';
  }

  // Quem nunca teve evento encerrado (percentual null) fica no fim, sem
  // competir com quem ja tem historico de verdade.
  const lista = [...state.estatisticas].sort((a, b) => {
    if (a.percentual === null && b.percentual === null) return a.nome.localeCompare(b.nome);
    if (a.percentual === null) return 1;
    if (b.percentual === null) return -1;
    return b.percentual - a.percentual || a.nome.localeCompare(b.nome);
  });

  return `
    <div class="alert info" style="margin-bottom:16px;">
      <div class="alert-msg">Percentual de presença nos eventos já encerrados de ${escapeHtml(escopoPorChave(state.adminEscopo).nome)}. Quem entrou depois de um evento não é contado nele.</div>
    </div>
    ${lista.map(m => {
      if (m.percentual === null) {
        return `
          <div class="card presenca-row">
            <div class="presenca-nome">${escapeHtml(m.nome)}</div>
            <div class="presenca-sem-dados">Sem eventos encerrados ainda</div>
          </div>
        `;
      }
      return `
        <div class="card presenca-row">
          <div class="presenca-info">
            <div class="presenca-nome">${escapeHtml(m.nome)}</div>
            <div class="presenca-contagem">${m.confirmacoes} de ${m.convites} eventos</div>
          </div>
          <div class="presenca-pct-wrap">
            <div class="presenca-barra"><div class="presenca-barra-fill" style="width:${m.percentual}%" data-anima="barra:${m.percentual}"></div></div>
            <div class="presenca-pct">${m.percentual}%</div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// Os chips de cargo so existem nos graus que tem cargo (VI e V). Devolve
// string vazia nos outros - sem deixar linha em branco no meio do
// formulario, por isso a montagem aqui fora em vez de um ternario solto no
// meio do template.
function blocoCargo() {
  const lista = cargosDoGrau(state.newMemberGrau);
  if (lista.length) {
    return `<label>Cargo (grau ${escapeHtml(state.newMemberGrau)})</label>
      <div class="chip-grid wide">
        ${lista.map(c => `<button class="chip-option ${state.newMemberCargo === c ? 'active' : ''}" data-action="pick-cargo" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
      </div>
      `;
  }
  // Grau sem cargo (ou nenhum grau escolhido ainda): mostra o rotulo assim
  // mesmo, explicando. Antes essa parte simplesmente sumia, e nao havia como
  // descobrir que existe cargo sem antes acertar o grau por acaso.
  return `<label>Cargo</label>
      <div class="info-line" style="color:var(--text-muted); margin-bottom:14px;">
        Só os graus <strong>VI</strong> e <strong>V</strong> têm cargo. Escolha um deles acima para marcar.
      </div>
      `;
}

// "⚠️ 8 integrantes sem data de ingresso" no topo do cadastro, e o modo de
// preencher todas de uma vez: uma lista so com eles, cada um com o campo de
// data, e um Salvar no fim. A lista e a de quando o modo abriu - quem vai
// sendo preenchido nao some do meio da tela.
function blocoDatasDeIngresso(membros) {
  const msg = state.entradasMsg
    ? `<div class="alert ${state.entradasMsg.ok ? 'ok' : ''}" style="margin-bottom:12px;"><div class="alert-msg">${escapeHtml(state.entradasMsg.texto)}</div></div>`
    : '';
  if (state.preencherEntradasIds) {
    const lista = state.preencherEntradasIds.map(id => membros.find(m => m.id === id)).filter(Boolean);
    return `
      <div class="card">
        <div class="painel-titulo">🗓️ Datas de ingresso</div>
        <div class="fin-explica">Escreva o dia em que cada um entrou no clube (dd/mm/aaaa). Quem você não souber, deixe em branco. Isso não conta como "entrou" no Entrada/Saída: eles já eram do clube.</div>
        ${lista.map(m => `
          <div class="member-row">
            <div class="member-head" style="cursor:default;">
              <div class="member-info">
                ${selinhoIniciais(m)}
                <span class="member-name">${escapeHtml(m.nome)}</span>
                ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
              </div>
              <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="entrada-${m.id}" data-entrada-id="${m.id}"
                     value="${escapeHtml(state.entradasRascunho[m.id] || '')}" placeholder="dd/mm/aaaa" autocomplete="off" style="width:118px; flex-shrink:0;">
            </div>
          </div>
        `).join('')}
        ${msg}
        <div class="row-gap" style="margin-top:12px;">
          <button class="btn block" data-action="salvar-datas-ingresso" ${state.entradasSalvando ? 'disabled' : ''}>${state.entradasSalvando ? 'Salvando…' : '💾 Salvar datas'}</button>
          <button class="btn secondary block" data-action="fechar-datas-ingresso" ${state.entradasSalvando ? 'disabled' : ''}>Cancelar</button>
        </div>
      </div>
    `;
  }
  const faltam = semDataDeIngresso(membros);
  if (!faltam.length) return msg;
  return `
    ${msg}
    <div class="alert info" style="margin-bottom:12px;">
      <div class="alert-msg">⚠️ ${faltam.length} ${faltam.length === 1 ? 'integrante sem data' : 'integrantes sem data'} de ingresso no clube.</div>
      <button class="btn secondary block" style="margin-top:10px;" data-action="abrir-datas-ingresso">🗓️ Preencher datas</button>
    </div>
  `;
}

export function renderAdminMembros() {
  const membros = membrosDoEscopo();
  const editando = !!state.editingMemberId;
  if (state.preencherEntradasIds) return blocoDatasDeIngresso(membros);
  return `
    ${editando ? '' : blocoDatasDeIngresso(membros)}
    <div class="card">
      ${editando ? '<label style="display:block; margin-bottom:8px; color:var(--text-muted); font-size:12px;">Editando membro</label>' : ''}
      <div class="field">
        <label>Nome</label>
        <input type="text" id="new-member-nome" placeholder="Ex: Costa" value="${escapeHtml(state.newMemberNome)}">
      </div>
      <label>Grau (opcional)</label>
      <div class="chip-grid">
        ${GRAUS.map(g => `<button class="chip-option ${state.newMemberGrau === g ? 'active' : ''}" data-action="pick-grau" data-value="${g}">${g}</button>`).join('')}
      </div>
      ${blocoCargo()}<label>Função (opcional, pode marcar mais de uma)</label>
      <div class="row-gap" style="margin-bottom: 14px;">
        ${FUNCOES.map(f => `<button class="toggle-chip ${state.newMemberFuncoes.has(f.chave) ? 'active' : ''}" data-action="toggle-funcao" data-value="${f.chave}" style="flex: none; padding: 8px 12px;">${f.selo} ${escapeHtml(f.label)}</button>`).join('')}
      </div>
      ${editando ? `
        <div class="field">
          <label>Data de ingresso no clube</label>
          <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="new-member-entrada"
                 value="${escapeHtml(state.newMemberEntrada)}" placeholder="dd/mm/aaaa" autocomplete="off">
        </div>
        <div class="row-gap">
          <button class="btn" data-action="save-member-edit">Salvar alterações</button>
          <button class="btn secondary" data-action="cancel-member-edit">Cancelar</button>
        </div>
      ` : `
        <div class="field">
          <label>Data de ingresso no clube</label>
          <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="new-member-entrada"
                 value="${escapeHtml(state.newMemberEntrada || formatDataBR(hojeISO()))}" placeholder="dd/mm/aaaa" autocomplete="off">
        </div>
        <button class="btn block" data-action="add-member">+ Adicionar membro</button>
      `}
    </div>
    ${membros.length === 0 ? '<div class="empty">Nenhum membro cadastrado ainda.</div>' : blocosPorGrau(membros)}
  `;
}

// A lista do cadastro, um card por grau, na ordem hierarquica (a mesma da
// convocacao). A divisao nao aparece na linha: e a propria tela.
function blocosPorGrau(membros) {
  const grupos = [];
  ordenarPorHierarquia(membros).forEach(m => {
    const grau = m.grau || '';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grau === grau) ultimo.membros.push(m);
    else grupos.push({ grau, membros: [m] });
  });
  return grupos.map(g => `
    <div class="card lista-cadastro">
      <div class="division-subheader">
        <span>${g.grau ? `GRAU ${escapeHtml(g.grau)}` : 'SEM GRAU'}</span>
        <span class="division-counts">${g.membros.length} ${g.membros.length === 1 ? 'membro' : 'membros'}</span>
      </div>
      ${g.membros.map(linhaCadastro).join('')}
    </div>
  `).join('');
}

// Os botoes de movimentacao, logo depois do grau: Afastamento (ou Retorno,
// pra quem ja esta afastado) e Desligamento.
function botoesMovimento(m) {
  const afastado = estaAfastado(m);
  return `
    <span class="acoes-movimento">
      ${afastado
        ? `<button class="btn-mov" data-action="abrir-movimento" data-id="${m.id}" data-value="retorno">▶️ Retorno</button>`
        : `<button class="btn-mov" data-action="abrir-movimento" data-id="${m.id}" data-value="afastamento">⏸️ Afastamento</button>`}
      <button class="btn-mov" data-action="abrir-movimento" data-id="${m.id}" data-value="transferencia">🔁 Transferência</button>
      <button class="btn-mov perigo" data-action="abrir-movimento" data-id="${m.id}" data-value="desligamento">🚪 Desligamento</button>
    </span>
  `;
}

// O destino da transferencia: RJ4 (as divisoes daqui em botoes, na ordem
// oficial, sem a dele) ou outra regional (regional e divisao escritas).
// Botoes na RJ4 porque o app precisa do nome exato - um "Barr" escrito a
// mao deixaria o irmao sem divisao.
function camposTransferencia(m) {
  const fora = state.movForaDaRJ4;
  const destinos = escoposNaOrdemOficial().filter(e => e.nome !== m.divisao);
  return `
    <label>Regional</label>
    <div class="row-gap" style="margin-bottom:10px;">
      <button class="toggle-chip ${fora ? '' : 'active'}" style="flex:1;" data-action="mov-regional" data-value="rj4">RJ4</button>
      <button class="toggle-chip ${fora ? 'active' : ''}" style="flex:1;" data-action="mov-regional" data-value="fora">Outra regional</button>
    </div>
    ${fora ? `
      <div class="field" style="margin-bottom:10px;">
        <label>Qual regional</label>
        <input type="text" id="mov-regional-destino" maxlength="60" value="${escapeHtml(state.movRegionalDestino)}" placeholder="Ex: RJ2" autocomplete="off">
      </div>
      <div class="field" style="margin-bottom:10px;">
        <label>Divisão</label>
        <input type="text" id="mov-divisao-destino" maxlength="60" value="${escapeHtml(state.movDivisaoDestino)}" placeholder="Ex: Centro" autocomplete="off">
      </div>
    ` : `
      <label>Divisão</label>
      <div class="chip-grid wide" style="margin-bottom:10px;">
        ${destinos.map(e => `<button class="chip-option ${state.movDestino === e.chave ? 'active' : ''}" data-action="mov-destino" data-value="${e.chave}">${escapeHtml(e.nome)}</button>`).join('')}
      </div>
    `}
  `;
}

// O painel que abre embaixo da linha: data (hoje, se nada for escrito),
// motivo opcional e o que vai acontecer, dito antes de confirmar.
const EXPLICA_MOVIMENTO = {
  afastamento: 'Enquanto afastado, não entra em evento novo, na caixinha de mês novo nem no Insight. Sai dos eventos ainda abertos, pra não levar falta. O histórico fica como está.',
  retorno: 'Volta a entrar nos eventos novos, na caixinha e no Insight. Os eventos já abertos não recebem ele de volta sozinhos — inclua pelo Editar do evento, se for o caso.',
  desligamento: 'Sai do cadastro e dos eventos ainda abertos. As presenças dos eventos encerrados continuam valendo, então os percentuais antigos não mudam. Fica registrado no Entrada/Saída.',
  transferencia: 'Muda de divisão com todo o histórico. O cargo sai e o grau fica "a confirmar" pela divisão nova. Sai dos eventos ainda abertos daqui e entra como ⚠️ Aguardando nos abertos da divisão nova, do dia da transferência em diante. Fica no Entrada/Saída das duas.',
  transferenciaFora: 'Sai do cadastro e dos eventos ainda abertos, como no desligamento. O histórico fica: as presenças dos eventos encerrados e os percentuais antigos não mudam. Fica registrado no Entrada/Saída.',
};
function painelMovimento(m) {
  const transferencia = state.movTipo === 'transferencia';
  const t = transferencia ? { emoji: '🔁', label: 'Transferência' } : TIPOS_MOVIMENTO[state.movTipo];
  const verbo = { afastamento: 'Afastar', retorno: 'Registrar o retorno de', desligamento: 'Desligar', transferencia: 'Transferir' }[state.movTipo];
  const explica = EXPLICA_MOVIMENTO[transferencia && state.movForaDaRJ4 ? 'transferenciaFora' : state.movTipo];
  return `
    <div class="mov-painel mov-${state.movTipo}">
      <div class="mov-titulo">${t.emoji} ${escapeHtml(verbo)} ${escapeHtml(m.nome)}</div>
      <div class="mov-explica">${escapeHtml(explica)}</div>
      ${transferencia ? camposTransferencia(m) : ''}
      <div class="field" style="margin-bottom:10px;">
        <label>Data</label>
        <input type="text" inputmode="numeric" maxlength="10" class="campo-data" id="mov-data"
               value="${escapeHtml(state.movData || formatDataBR(hojeISO()))}" placeholder="dd/mm/aaaa" autocomplete="off">
      </div>
      <div class="field" style="margin-bottom:10px;">
        <label>Motivo (opcional — só aparece aqui no app)</label>
        <input type="text" id="mov-motivo" maxlength="300" value="${escapeHtml(state.movMotivo)}" placeholder="Ex: trabalho fora do estado" autocomplete="off">
      </div>
      ${state.movErro ? `<div class="alert" style="margin-bottom:10px;"><div class="alert-msg">${escapeHtml(state.movErro)}</div></div>` : ''}
      <div class="row-gap">
        <button class="btn ${state.movTipo === 'desligamento' ? 'danger' : ''}" style="flex:1;" data-action="confirmar-movimento" ${state.movSalvando ? 'disabled' : ''}>
          ${state.movSalvando ? 'Registrando…' : `Confirmar ${t.label.toLowerCase()}`}
        </button>
        <button class="btn secondary" style="flex:1;" data-action="cancelar-movimento" ${state.movSalvando ? 'disabled' : ''}>Cancelar</button>
      </div>
    </div>
  `;
}

// O "Confirmar grau" de quem chegou transferido: o grau que veio ja
// marcado, e o cargo nos graus VI e V (o da divisao antiga saiu na
// transferencia). Confirmar tira o lembrete.
function painelConfirmarGrau(m) {
  const cargos = cargosDoGrau(state.grauEscolhido);
  return `
    <div class="mov-painel mov-transferencia">
      <div class="mov-titulo">✅ Confirmar o grau de ${escapeHtml(m.nome)}</div>
      <div class="mov-explica">Chegou por transferência, e o cargo da divisão antiga saiu. Confira o grau${cargos.length ? ', marque o cargo dele aqui, se tiver,' : ''} e confirme.</div>
      <label>Grau</label>
      <div class="chip-grid" style="margin-bottom:10px;">
        ${GRAUS.map(g => `<button class="chip-option ${state.grauEscolhido === g ? 'active' : ''}" data-action="confirmar-grau-pick" data-value="${g}">${g}</button>`).join('')}
      </div>
      ${cargos.length ? `
        <label>Cargo (opcional)</label>
        <div class="chip-grid wide" style="margin-bottom:10px;">
          ${cargos.map(c => `<button class="chip-option ${state.cargoEscolhido === c ? 'active' : ''}" data-action="confirmar-cargo-pick" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
        </div>
      ` : ''}
      ${state.grauErro ? `<div class="alert" style="margin-bottom:10px;"><div class="alert-msg">${escapeHtml(state.grauErro)}</div></div>` : ''}
      <div class="row-gap">
        <button class="btn" style="flex:1;" data-action="confirmar-grau" ${state.grauSalvando ? 'disabled' : ''}>${state.grauSalvando ? 'Confirmando…' : 'Confirmar grau'}</button>
        <button class="btn secondary" style="flex:1;" data-action="cancelar-confirmar-grau" ${state.grauSalvando ? 'disabled' : ''}>Cancelar</button>
      </div>
    </div>
  `;
}

// A confirmacao do Remover, na linha, no mesmo formato dos paineis de
// movimentacao. Remover apaga TUDO do integrante (cadastro feito errado);
// quem saiu do clube e Desligamento, que guarda o historico.
function painelRemover(m) {
  return `
    <div class="mov-painel mov-desligamento">
      <div class="mov-titulo">🗑️ Remover ${escapeHtml(m.nome)}?</div>
      <div class="mov-explica">É pra cadastro feito errado: apaga o cadastro e todo o histórico dele — presenças, Entrada/Saída, doações, caixinha e Insight —, como se nunca tivesse existido. Não dá pra desfazer. Se ele saiu do clube, use 🚪 Desligamento, que guarda o histórico.</div>
      <div class="row-gap">
        <button class="btn danger" style="flex:1;" data-action="confirmar-remover-membro" data-id="${m.id}">Remover</button>
        <button class="btn secondary" style="flex:1;" data-action="cancelar-remover-membro">Cancelar</button>
      </div>
    </div>
  `;
}

// Os selos das funcoes na mesma linha do nome, sem o bloco proprio que a
// linhaFuncoes (das outras listas) desenha embaixo.
function funcoesNaLinha(funcoes) {
  const selos = (funcoes || []).map(funcaoPorChave).filter(Boolean)
    .map(f => `<span class="funcao-item" title="${escapeHtml(f.label)}">${f.selo}</span>`).join('');
  return selos ? `<span class="cadastro-funcoes">${selos}</span>` : '';
}

// O card do integrante, em tres andares (19/10/2026, pra ficar mais
// baixo): nome, grau, cargo e funcoes, com a data de admissao (D.A) no
// canto direito; os botoes de movimentacao; e Editar / Remover.
function linhaCadastro(m) {
  const afastado = estaAfastado(m);
  return `
    <div class="member-row linha-cadastro${state.editingMemberId === m.id ? ' editando' : ''}${afastado ? ' afastado' : ''}">
      <div class="member-head">
        <div class="member-info-wrap">
          <div class="cadastro-topo">
            <div class="member-info">
              ${selinhoIniciais(m)}
              <span class="member-name">${escapeHtml(m.nome)}</span>
              ${m.grau ? `<span class="grade-box">${escapeHtml(m.grau)}</span>` : ''}
              ${m.cargo ? `<span class="member-cargo-inline">${escapeHtml(m.cargo)}</span>` : ''}
              ${funcoesNaLinha(m.funcoes)}
            </div>
            ${m.entrada ? `<span class="cadastro-da" title="Data de admissão">D.A: ${escapeHtml(formatDataBR(m.entrada))}</span>` : ''}
          </div>
          ${afastado ? `<div class="selo-afastado">⏸️ Afastado${m.situacaoDesde ? ` desde ${escapeHtml(formatDataBR(m.situacaoDesde))}` : ''}</div>` : ''}
          ${m.grauPendente ? `
            <div class="selo-grau-pendente">⏳ Grau a confirmar
              <button class="btn-mov" data-action="abrir-confirmar-grau" data-id="${m.id}">✅ Confirmar grau</button>
            </div>` : ''}
          <div class="cadastro-controles">${botoesMovimento(m)}</div>
          <div class="acoes-cadastro">
            <button class="btn-mini" data-action="edit-member" data-id="${m.id}">✏️ Editar</button>
            <button class="btn-mini perigo" data-action="remove-member" data-id="${m.id}" title="Para cadastro feito errado: apaga também o histórico. Quem saiu do clube é Desligamento.">Remover</button>
          </div>
        </div>
      </div>
      ${state.movMembroId === m.id ? painelMovimento(m) : ''}
      ${state.grauMembroId === m.id ? painelConfirmarGrau(m) : ''}
      ${state.removerMembroId === m.id ? painelRemover(m) : ''}
    </div>
  `;
}

// Acoes das abas Cadastro e Presencas: o formulario do membro (grau, cargo,
// funcoes) e o retry da carga de estatisticas.
export const acoes = {
  'retry-estatisticas': async (id, target, action, e) => {
    return loadEstatisticas();
  },

  'pick-grau': async (id, target, action, e) => {
    state.newMemberGrau = state.newMemberGrau === target.dataset.value ? null : target.dataset.value;
    // Cargo pertence a um grau - trocar de grau derruba o que estava marcado,
    // senao sobraria um "Diretor" (grau VI) preso num membro grau X.
    state.newMemberCargo = null;
    return render();
  },

  'pick-cargo': async (id, target, action, e) => {
    state.newMemberCargo = state.newMemberCargo === target.dataset.value ? null : target.dataset.value;
    return render();
  },

  'toggle-funcao': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.newMemberFuncoes.has(chave)) state.newMemberFuncoes.delete(chave);
    else state.newMemberFuncoes.add(chave);
    return render();
  },

  'add-member': async (id, target, action, e) => {
    const nome = (document.getElementById('new-member-nome').value || '').trim();
    if (!nome) return;
    // A data de entrada: vazia = hoje; escrita, tem que ser uma data de
    // verdade e nao pode ser no futuro. E ela que conta no Entrada/Saida.
    const brutoEntrada = (state.newMemberEntrada || '').trim();
    const entrada = brutoEntrada ? dataISOdeBR(brutoEntrada) : hojeISO();
    if (!entrada || entrada > hojeISO()) {
      alert(entrada ? 'A data de entrada não pode ser no futuro.' : `"${brutoEntrada}" não é uma data válida - escreva como 18/10/2026.`);
      return;
    }
    // O membro herda a divisao de onde o organizador entrou - inclusive
    // Regional, que tem os proprios membros (mesa regional).
    const member = {
      id: genId(), nome, grau: state.newMemberGrau || '', divisao: escopoPorChave(state.adminEscopo).nome,
      funcoes: Array.from(state.newMemberFuncoes), cargo: state.newMemberCargo || '',
      situacao: '', situacaoDesde: '', entrada,
    };
    state.roster = [...state.roster, member];
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    state.newMemberNome = '';
    state.newMemberEntrada = '';
    state.movimentosDados = null;
    render();
    await salvarOuAvisar('membroSalvar', { ...member, funcoes: member.funcoes.join(',') });
  },

  // O painel de afastamento/retorno/desligamento, na linha do integrante.
  // Tocar de novo no mesmo botao fecha.
  'abrir-movimento': async (id, target, action, e) => {
    const tipo = target.dataset.value;
    const mesmo = state.movMembroId === id && state.movTipo === tipo;
    fecharPainelMovimento();
    if (!mesmo) {
      state.movMembroId = id;
      state.movTipo = tipo;
    }
    return render();
  },
  'cancelar-movimento': async (id, target, action, e) => {
    fecharPainelMovimento();
    return render();
  },
  // A transferencia: RJ4 ou outra regional, e a divisao da RJ4.
  'mov-regional': async (id, target, action, e) => {
    state.movForaDaRJ4 = target.dataset.value === 'fora';
    state.movErro = null;
    return render();
  },
  'mov-destino': async (id, target, action, e) => {
    state.movDestino = target.dataset.value;
    state.movErro = null;
    return render();
  },

  // O "Confirmar grau", na linha de quem chegou transferido. Tocar de novo
  // fecha.
  'abrir-confirmar-grau': async (id, target, action, e) => {
    const mesmo = state.grauMembroId === id;
    fecharPainelMovimento();
    if (!mesmo) {
      const m = state.roster.find(x => x.id === id);
      state.grauMembroId = id;
      state.grauEscolhido = (m && m.grau) || null;
      state.cargoEscolhido = (m && m.cargo) || null;
      state.grauErro = null;
    }
    return render();
  },
  'confirmar-grau-pick': async (id, target, action, e) => {
    state.grauEscolhido = target.dataset.value;
    // Cargo pertence a um grau - o mesmo cuidado do pick-grau.
    state.cargoEscolhido = null;
    return render();
  },
  'confirmar-cargo-pick': async (id, target, action, e) => {
    state.cargoEscolhido = state.cargoEscolhido === target.dataset.value ? null : target.dataset.value;
    return render();
  },
  'cancelar-confirmar-grau': async (id, target, action, e) => {
    state.grauMembroId = null;
    return render();
  },
  'confirmar-grau': async (id, target, action, e) => {
    return confirmarGrauDoMembro();
  },
  'confirmar-movimento': async (id, target, action, e) => {
    return confirmarMovimento();
  },

  'edit-member': async (id, target, action, e) => {
    const m = state.roster.find(x => x.id === id);
    if (!m) return;
    state.editingMemberId = id;
    state.newMemberNome = m.nome;
    state.newMemberGrau = m.grau || null;
    state.newMemberCargo = m.cargo || null;
    state.newMemberFuncoes = new Set(m.funcoes || []);
    state.newMemberEntrada = m.entrada ? formatDataBR(m.entrada) : '';
    return render();
  },

  'cancel-member-edit': async (id, target, action, e) => {
    state.editingMemberId = null;
    state.newMemberEntrada = '';
    state.newMemberNome = '';
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    return render();
  },

  'save-member-edit': async (id, target, action, e) => {
    const nome = (document.getElementById('new-member-nome').value || '').trim();
    if (!nome) return;
    const original = state.roster.find(x => x.id === state.editingMemberId);
    if (!original) return;
    // A data de ingresso: em branco = sem data; escrita, tem que ser uma
    // data de verdade e nao pode ser no futuro.
    const brutoEntrada = (state.newMemberEntrada || '').trim();
    const entrada = brutoEntrada ? dataISOdeBR(brutoEntrada) : '';
    if ((brutoEntrada && !entrada) || entrada > hojeISO()) {
      alert(entrada ? 'A data de ingresso não pode ser no futuro.' : `"${brutoEntrada}" não é uma data válida - escreva como 12/03/2019.`);
      return;
    }
    // Divisao nao muda por aqui - so nome, grau, funcoes e a data de ingresso.
    const member = {
      ...original, nome, grau: state.newMemberGrau || '',
      funcoes: Array.from(state.newMemberFuncoes), cargo: state.newMemberCargo || '', entrada
    };
    state.roster = state.roster.map(x => x.id === member.id ? member : x);
    state.editingMemberId = null;
    state.newMemberGrau = null;
    state.newMemberCargo = null;
    state.newMemberFuncoes = new Set();
    state.newMemberNome = '';
    state.newMemberEntrada = '';
    render();
    await salvarOuAvisar('membroSalvar', { ...member, funcoes: member.funcoes.join(',') });
  },

  // "Preencher datas": abre a lista de quem esta sem data de ingresso.
  'abrir-datas-ingresso': async (id, target, action, e) => {
    state.preencherEntradasIds = semDataDeIngresso(membrosDoEscopo()).map(m => m.id);
    state.entradasRascunho = {};
    state.entradasMsg = null;
    window.scrollTo(0, 0);
    return render();
  },
  'fechar-datas-ingresso': async (id, target, action, e) => {
    state.preencherEntradasIds = null;
    state.entradasRascunho = {};
    state.entradasMsg = null;
    return render();
  },
  'salvar-datas-ingresso': async (id, target, action, e) => {
    return salvarDatasDeIngresso();
  },

  // O "Remover" so abre a confirmacao na linha; tocar de novo fecha.
  'remove-member': async (id, target, action, e) => {
    const mesmo = state.removerMembroId === id;
    fecharPainelMovimento();
    if (!mesmo) state.removerMembroId = id;
    return render();
  },
  'cancelar-remover-membro': async (id, target, action, e) => {
    state.removerMembroId = null;
    return render();
  },
  'confirmar-remover-membro': async (id, target, action, e) => {
    state.removerMembroId = null;
    state.roster = state.roster.filter(m => m.id !== id);
    // O livro de Entrada/Saida em memoria ainda tem a entrada dele: busca de
    // novo na proxima vez que a aba abrir.
    state.movimentosDados = null;
    render();
    await salvarOuAvisar('membroRemover', { id });
  },
};
