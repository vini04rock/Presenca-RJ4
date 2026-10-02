// Tela "Criar chamada": a chamada dividida em quadros, na mesma ordem em que
// sai no texto, com a prévia e o botão de copiar no fim.
//
// Dois quadros gravam na planilha:
//   - o 8 (responsável), salvo por divisão;
//   - o 6 e o 7 (regras do clube, atenção), um texto só para a RJ4 inteira,
//     que só quem entrou pelo Regional personaliza. As divisões usam o
//     mesmo texto, sem o botão.
// A legenda (5) continua fixa, só para conferência.

import { LEGENDA, TEXTOS_PADRAO, camposIniciais, dataDaChamada, linhaDoBonde, montarConvocacao, peVazio, quadroMembros, responsavelDoCadastro, textoEfetivo } from '../dominio/convocacao.js';
import { api, apiPost } from '../nucleo/api.js';
import { TIPOS_EVENTO, emojiTipoEvento, escopoPorChave } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { copiarTexto, escapeHtml } from '../nucleo/util.js';
import { render } from '../nucleo/render.js';

function eventoAtual() {
  return state.events.find(e => e.id === state.convocacaoEventoId);
}

// Os convocados, resolvidos do cadastro. A ordem hierárquica e o filtro
// pela divisão do evento são aplicados dentro de montarConvocacao.
function convocados(ev) {
  return (ev.memberIds || []).map(id => state.roster.find(m => m.id === id)).filter(Boolean);
}

// O texto como está agora, com o que já foi digitado nos quadros.
export function textoDaConvocacao() {
  const ev = eventoAtual();
  if (!ev) return '';
  return montarConvocacao(ev, convocados(ev), state.convocacaoCampos, state.convocacaoResponsavel, textosAtuais());
}

// Os textos salvos, com o rascunho de quem está editando por cima - assim a
// prévia mostra a mudança antes de salvar.
function textosAtuais() {
  const t = { ...(state.convocacaoTextos || {}) };
  if (state.convocacaoTextoEditando) t[state.convocacaoTextoEditando] = state.convocacaoTextoRascunho;
  return t;
}

// ---------- campos -----------------------------------------------------------
// Três famílias de campo, cada uma com o próprio atributo, para o ouvinte
// saber onde guardar o que foi digitado: data-campo (o resto dos quadros),
// data-pe + data-campo (um P.E.) e data-resp (o responsável).

function caixa({ rotulo, valor, dica, linhas, atributos, desligado }) {
  const v = escapeHtml(valor || '');
  const d = escapeHtml(dica || '');
  const off = desligado ? 'disabled' : '';
  const entrada = linhas > 1
    ? `<textarea ${atributos} rows="${linhas}" placeholder="${d}" ${off}>${v}</textarea>`
    : `<input type="text" ${atributos} placeholder="${d}" value="${v}" ${off}>`;
  return `<div class="field">${rotulo ? `<label>${escapeHtml(rotulo)}</label>` : ''}${entrada}</div>`;
}

function campo(chave, rotulo, dica, linhas) {
  return caixa({ rotulo, dica, linhas, valor: state.convocacaoCampos[chave], atributos: `data-campo="${chave}"` });
}

// Os três horários lado a lado, pra não ocupar três linhas com três números.
function horariosDoPe(pe, i) {
  return `<div class="row-gap">${[
    ['concentracao', 'Concentração', '06:00'],
    ['briefing', 'Briefing', '06:30'],
    ['saida', 'Saída', '07:00'],
  ].map(([chave, rotulo, dica]) => `
    <div class="field" style="flex:1; margin-bottom:0;">
      <label>${rotulo}</label>
      <input type="text" data-pe="${i}" data-campo="${chave}" placeholder="${dica}" value="${escapeHtml(pe[chave] || '')}">
    </div>`).join('')}</div>`;
}

// ---------- os quadros -------------------------------------------------------

function quadro(numero, titulo, corpo, nota) {
  return `
    <div class="card chamada-quadro">
      <div class="chamada-quadro-titulo"><span>${numero}</span>${escapeHtml(titulo)}</div>
      ${nota ? `<div class="chamada-quadro-nota">${nota}</div>` : ''}
      ${corpo}
    </div>
  `;
}

// Os quadros de texto fixo mostram o texto como vai sair, sem campo.
function textoFixo(linhas) {
  return `<pre class="chamada-fixo">${escapeHtml(linhas.join('\n'))}</pre>`;
}

function quadroTipo(ev) {
  const c = state.convocacaoCampos;
  return quadro(1, 'Tipo de chamada', `
    <div class="chip-grid wide" style="margin-bottom:12px;">
      ${TIPOS_EVENTO.map(t => `
        <button class="chip-option ${c.tipo === t ? 'active' : ''}" data-action="set-convocacao-tipo" data-value="${escapeHtml(t)}">${emojiTipoEvento(t)} ${escapeHtml(t)}</button>
      `).join('')}
    </div>
    <div class="info-line chamada-auto">${escapeHtml(linhaDoBonde(ev.categoria))}</div>
    ${campo('subtitulo', 'Subtítulo', 'Ex: Inauguração Divisão Paraíba do Sul')}
  `, 'O tipo vai no topo e a linha do bonde logo abaixo.');
}

function quadroInformacoes(ev) {
  const data = dataDaChamada(ev.data);
  return quadro(2, 'Informações', `
    ${campo('destino', 'Destino', 'Ex: Bandas Bar - Paraíba do Sul')}
    <div class="row-gap">
      <div class="field" style="flex:1; margin-bottom:0;">
        <label>Data</label>
        <input type="text" value="${escapeHtml(data)}" placeholder="sem data" disabled>
      </div>
      <div class="field" style="flex:1; margin-bottom:0;">
        <label>Horário</label>
        <input type="text" data-campo="horario" placeholder="07:00" value="${escapeHtml(state.convocacaoCampos.horario || '')}">
      </div>
    </div>
    ${data ? '' : '<div class="chamada-quadro-nota" style="margin-top:8px;">O evento está sem data. Edite o evento para ela aparecer na chamada.</div>'}
  `, 'A data vem do evento.');
}

function quadroRoteiro() {
  const c = state.convocacaoCampos;
  const pes = c.pes || [];
  return quadro(3, 'Roteiro', `
    ${pes.map((pe, i) => `
      <div class="chamada-pe">
        <div class="chamada-pe-topo">
          <b>📍 PE ${i + 1}</b>
          <button class="btn ghost" style="padding:2px 0; font-size:12px;" data-action="remover-convocacao-pe" data-value="${i}">Remover</button>
        </div>
        ${caixa({ rotulo: 'Nome do ponto', linhas: 2, valor: pe.nome, atributos: `data-pe="${i}" data-campo="nome"`,
          dica: 'Ex: Posto Ipiranga - Cebolão' })}
        ${caixa({ rotulo: 'Endereço (opcional)', valor: pe.endereco, atributos: `data-pe="${i}" data-campo="endereco"` })}
        ${caixa({ rotulo: 'Link do Maps', valor: pe.maps, atributos: `data-pe="${i}" data-campo="maps"`,
          dica: 'https://maps.app.goo.gl/…' })}
        ${horariosDoPe(pe, i)}
      </div>
    `).join('')}
    <button class="btn secondary block" data-action="adicionar-convocacao-pe" style="margin-bottom:16px;">+ Adicionar P.E.</button>
    <div style="font-weight:600; margin-bottom:8px;">🏁 Destino final</div>
    ${campo('destinoEndereco', 'Endereço', 'Rua, número - bairro, cidade')}
    ${campo('destinoMaps', 'Link do Maps', 'https://maps.app.goo.gl/…')}
    ${roteiroDoBondeTela(pes)}
  `, 'O nome do destino é o do quadro 2.');
}

// O roteiro é montado dos P.E.: o app escreve a sequência, os 📍 e o 🏁, e
// cada trecho ganha uma caixa só para as vias. Entra na chamada quando
// alguma via (ou observação) for preenchida.
function roteiroDoBondeTela(pes) {
  const destino = String(state.convocacaoCampos.destino || '').trim().toUpperCase() || 'DESTINO';
  const trechos = pes.map((pe, i) => {
    const fim = i + 1 < pes.length ? `PE ${i + 2}` : destino;
    return caixa({ rotulo: `🛣️ Trecho ${i + 1} — PE ${i + 1} → ${fim}`, linhas: 4, valor: pe.vias,
      atributos: `data-pe="${i}" data-campo="vias"`,
      dica: 'Uma via por linha\nAv. Ayrton Senna\nLinha Amarela — sentido Fundão' });
  }).join('');
  return `
    <div style="font-weight:600; margin:8px 0;">🎯 Roteiro do bonde</div>
    <div class="chamada-quadro-nota">${pes.length
      ? 'A sequência dos pontos o app monta sozinho. Preencha só as vias de cada trecho.'
      : 'Adicione um P.E. acima para montar os trechos.'}</div>
    ${trechos}
    ${campo('roteiro', 'Observações do roteiro (opcional)', 'Ex: A partir da Casa do Alemão, o bonde segue pela BR-040.', 3)}
  `;
}

function quadroMembrosTela(ev) {
  const regional = escopoPorChave(ev.categoria).chave === 'regional';
  const nota = regional
    ? 'No Bonde Regional a lista sai em branco: cada integrante se coloca no grupo.'
    : 'Os convocados da divisão, em Nome (Grau), na ordem hierárquica.';
  return quadro(4, 'Membros', textoFixo(quadroMembros(ev, convocados(ev))), nota);
}

// Regras do clube e Atenção. Mostra o texto em uso; no Regional, com o botão
// de personalizar. Editando, a caixa troca o texto e a prévia acompanha.
function quadroTextoEditavel(numero, titulo, chave) {
  const textos = state.convocacaoTextos || {};
  const personalizado = !!String(textos[chave] || '').trim();
  const podeEditar = state.adminEscopo === 'regional';
  const carregando = state.convocacaoRespEstado === 'carregando';
  const msg = state.convocacaoTextoMsg && state.convocacaoTextoMsg.chave === chave ? state.convocacaoTextoMsg.texto : '';
  const aviso = msg ? `<div class="chamada-quadro-nota" style="margin:8px 0;">${escapeHtml(msg)}</div>` : '';
  const nota = (personalizado ? 'Texto personalizado pelo Regional.' : 'Texto padrão do clube.')
    + (podeEditar ? ' Vale para as chamadas de todas as divisões.' : ' Só o Regional altera.');

  if (state.convocacaoTextoEditando === chave) {
    const salvando = state.convocacaoTextoSalvando;
    return quadro(numero, titulo, `
      <div class="field"><textarea data-texto="${chave}" rows="12">${escapeHtml(state.convocacaoTextoRascunho)}</textarea></div>
      ${aviso}
      <div class="row-gap">
        <button class="btn" data-action="salvar-convocacao-texto" ${salvando ? 'disabled' : ''}>${salvando ? 'Salvando…' : '💾 Salvar'}</button>
        <button class="btn secondary" data-action="cancelar-convocacao-texto" ${salvando ? 'disabled' : ''}>Cancelar</button>
      </div>
      <button class="btn ghost block" style="margin-top:8px; font-size:12px;" data-action="restaurar-convocacao-texto" ${salvando ? 'disabled' : ''}>Voltar ao texto padrão</button>
    `, 'Vale para as chamadas de todas as divisões.');
  }
  return quadro(numero, titulo, `
    ${textoFixo(textoEfetivo(textos, chave))}
    ${aviso}
    ${podeEditar ? `<button class="btn secondary block" style="margin-top:12px;" data-action="editar-convocacao-texto" data-value="${chave}" ${carregando ? 'disabled' : ''}>✏️ Personalizar</button>` : ''}
  `, escapeHtml(nota));
}

function quadroResponsavel() {
  const r = state.convocacaoResponsavel || {};
  const carregando = state.convocacaoRespEstado === 'carregando';
  const salvando = state.convocacaoRespSalvando;
  const campoR = (chave, rotulo, dica) => caixa({ rotulo, dica, valor: r[chave], desligado: carregando,
    atributos: `data-resp="${chave}"` });
  const aviso = carregando ? 'Buscando o responsável salvo…'
    : state.convocacaoRespEstado === 'erro' ? 'Não consegui buscar o responsável salvo. Dá para preencher e salvar de novo.'
    : 'Fica salvo para todas as chamadas desta divisão.';
  return quadro(8, 'Responsável', `
    ${campoR('nome', 'Nome', 'Ex: Bull')}
    ${campoR('cargo', 'Cargo', 'Ex: Operacional RJ4')}
    ${campoR('telefone', 'Telefone', 'Ex: 21 96450-6672')}
    ${state.convocacaoRespMsg ? `<div class="chamada-quadro-nota" style="margin-bottom:8px;">${escapeHtml(state.convocacaoRespMsg)}</div>` : ''}
    <button class="btn secondary block" data-action="salvar-convocacao-responsavel" ${carregando || salvando ? 'disabled' : ''}>
      ${salvando ? 'Salvando…' : '💾 Salvar responsável'}
    </button>
  `, escapeHtml(aviso));
}

export function renderConvocacao(app) {
  const ev = eventoAtual();
  // Evento apagado enquanto a tela estava aberta: volta pro organizador em
  // vez de mostrar tela vazia.
  if (!ev) {
    state.view = 'admin';
    state.adminTab = 'eventos';
    return render();
  }

  app.innerHTML = `
    <div class="back-link on-photo no-print" data-action="fechar-convocacao">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 19px;">Criar chamada</h1>
      <div class="sub">${escapeHtml(ev.nome)}</div>
    </div>

    ${quadroTipo(ev)}
    ${quadroInformacoes(ev)}
    ${quadroRoteiro()}
    ${quadroMembrosTela(ev)}
    ${quadro(5, 'Legenda', textoFixo(LEGENDA), 'Texto fixo do clube.')}
    ${quadroTextoEditavel(6, 'Regras do clube', 'regras')}
    ${quadroTextoEditavel(7, 'Atenção', 'atencao')}
    ${quadroResponsavel()}

    <div class="card">
      <div style="font-weight:600; margin-bottom:8px;">Prévia</div>
      <pre id="convocacao-previa" class="convocacao-previa">${escapeHtml(textoDaConvocacao())}</pre>
    </div>

    <button class="btn block" data-action="copiar-convocacao">
      ${state.convocacaoCopiado ? '✓ Copiado!' : '📋 Copiar chamada'}
    </button>
  `;

  // A prévia é atualizada na mão, sem redesenhar a tela: um render() a cada
  // tecla faria o cursor pular pro fim do campo e perder o foco.
  const atualizarPrevia = () => {
    const previa = document.getElementById('convocacao-previa');
    if (previa) previa.textContent = textoDaConvocacao();
  };
  app.querySelectorAll('[data-campo]').forEach(el => {
    el.addEventListener('input', () => {
      if (el.dataset.pe !== undefined) {
        const pe = state.convocacaoCampos.pes[Number(el.dataset.pe)];
        if (pe) pe[el.dataset.campo] = el.value;
      } else {
        state.convocacaoCampos[el.dataset.campo] = el.value;
      }
      atualizarPrevia();
    });
  });
  app.querySelectorAll('[data-texto]').forEach(el => {
    el.addEventListener('input', () => {
      state.convocacaoTextoRascunho = el.value;
      atualizarPrevia();
    });
  });
  app.querySelectorAll('[data-resp]').forEach(el => {
    el.addEventListener('input', () => {
      state.convocacaoResponsavel = { ...state.convocacaoResponsavel, [el.dataset.resp]: el.value };
      atualizarPrevia();
    });
  });
}

// Busca o responsável salvo daquela divisão, e junto os textos de regras e
// atenção. Enquanto não chega, os campos ficam travados com a sugestão do
// cadastro - senão o que a pessoa digitasse seria atropelado pela resposta
// da planilha.
async function carregarResponsavel(ev) {
  const categoria = ev.categoria;
  state.convocacaoRespEstado = 'carregando';
  try {
    const r = await api('responsavel', { categoria });
    // A pessoa pode ter saído ou trocado de evento enquanto a busca corria.
    if (state.convocacaoEventoId !== ev.id) return;
    if (r.responsavel) state.convocacaoResponsavel = r.responsavel;
    state.convocacaoTextos = r.textos || {};
    state.convocacaoRespEstado = 'pronto';
  } catch (e) {
    if (state.convocacaoEventoId !== ev.id) return;
    state.convocacaoRespEstado = 'erro';
  }
  if (state.view === 'convocacao') render();
}

// Ações da tela "Criar chamada".
export const acoes = {
  'abrir-convocacao': async (id, target, action, e) => {
    const ev = state.events.find(x => x.id === id);
    if (!ev) return;
    state.convocacaoEventoId = id;
    state.convocacaoCampos = camposIniciais(ev);
    state.convocacaoResponsavel = responsavelDoCadastro(ev.categoria, state.roster);
    state.convocacaoRespMsg = null;
    state.convocacaoRespSalvando = false;
    state.convocacaoTextos = {};
    state.convocacaoTextoEditando = null;
    state.convocacaoTextoMsg = null;
    state.convocacaoCopiado = false;
    state.view = 'convocacao';
    carregarResponsavel(ev);
    return render();
  },
  'set-convocacao-tipo': async (id, target, action, e) => {
    state.convocacaoCampos.tipo = target.dataset.value;
    return render();
  },
  'adicionar-convocacao-pe': async (id, target, action, e) => {
    state.convocacaoCampos.pes = [...(state.convocacaoCampos.pes || []), peVazio()];
    return render();
  },
  'remover-convocacao-pe': async (id, target, action, e) => {
    const i = Number(target.dataset.value);
    state.convocacaoCampos.pes = (state.convocacaoCampos.pes || []).filter((_, j) => j !== i);
    return render();
  },
  'salvar-convocacao-responsavel': async (id, target, action, e) => {
    const ev = eventoAtual();
    if (!ev || state.convocacaoRespSalvando) return;
    const r = state.convocacaoResponsavel || {};
    state.convocacaoRespSalvando = true;
    state.convocacaoRespMsg = null;
    render();
    try {
      await api('responsavelSalvar', {
        categoria: ev.categoria,
        nome: String(r.nome || '').trim(),
        cargo: String(r.cargo || '').trim(),
        telefone: String(r.telefone || '').trim(),
      });
      state.convocacaoRespMsg = '✅ Salvo para ' + escopoPorChave(ev.categoria).nome + '.';
    } catch (err) {
      state.convocacaoRespMsg = 'Não consegui salvar: ' + err.message + '.';
    }
    state.convocacaoRespSalvando = false;
    if (state.view === 'convocacao') render();
  },
  'editar-convocacao-texto': async (id, target, action, e) => {
    const chave = target.dataset.value;
    state.convocacaoTextoEditando = chave;
    state.convocacaoTextoRascunho = textoEfetivo(state.convocacaoTextos, chave).join('\n');
    state.convocacaoTextoMsg = null;
    return render();
  },
  'cancelar-convocacao-texto': async (id, target, action, e) => {
    state.convocacaoTextoEditando = null;
    state.convocacaoTextoMsg = null;
    return render();
  },
  // Só põe o padrão na caixa - ele vale de verdade quando a pessoa salvar.
  'restaurar-convocacao-texto': async (id, target, action, e) => {
    state.convocacaoTextoRascunho = TEXTOS_PADRAO[state.convocacaoTextoEditando] || '';
    return render();
  },
  'salvar-convocacao-texto': async (id, target, action, e) => {
    const chave = state.convocacaoTextoEditando;
    if (!chave || state.convocacaoTextoSalvando) return;
    const rascunho = String(state.convocacaoTextoRascunho || '').trim();
    // Igual ao padrão (ou vazio) grava vazio: assim, se um dia o padrão do
    // app mudar, quem nunca personalizou de verdade acompanha a mudança.
    const texto = rascunho === TEXTOS_PADRAO[chave].trim() ? '' : rascunho;
    state.convocacaoTextoSalvando = true;
    render();
    try {
      // POST, e não o api() de sempre: o texto inteiro, com os emojis
      // codificados, não cabe com folga numa URL.
      await apiPost('textoChamadaSalvar', { chave, texto });
      state.convocacaoTextos = { ...state.convocacaoTextos, [chave]: texto };
      state.convocacaoTextoEditando = null;
      state.convocacaoTextoMsg = { chave, texto: texto ? '✅ Salvo para a RJ4 inteira.' : '✅ Voltou ao texto padrão.' };
    } catch (err) {
      state.convocacaoTextoMsg = { chave, texto: 'Não consegui salvar: ' + err.message + '.' };
    }
    state.convocacaoTextoSalvando = false;
    if (state.view === 'convocacao') render();
  },
  'fechar-convocacao': async (id, target, action, e) => {
    state.view = 'admin';
    state.adminTab = 'eventos';
    state.convocacaoEventoId = null;
    return render();
  },
  'copiar-convocacao': async (id, target, action, e) => {
    const ok = await copiarTexto(textoDaConvocacao());
    if (!ok) return;
    state.convocacaoCopiado = true;
    render();
    setTimeout(() => {
      state.convocacaoCopiado = false;
      render();
    }, 1600);
  },
};

