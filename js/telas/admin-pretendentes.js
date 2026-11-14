// O card 📝 Pretendentes (14/11/2026), na area ADM das 7 divisoes: as fichas
// de admissao que chegaram pelo link de cada divisao (ficha.html). Cada
// divisao ve as do link dela; o Regional ve todas, em blocos por divisao.
//
// Aqui ficam o link pra mandar, a lista e a ficha de cada um, com o
// 🔎 Em analise (esperando entrar no sistema do clube) e o WhatsApp/PDF,
// que levam a ficha inteira pra passar pro sistema. O ✅ Aprovado e o
// ❌ Desistiu sao a Etapa 3. As regras e o texto moram em dominio/admissao.js.

import { api } from '../nucleo/api.js';
import { escoposNaOrdemOficial } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, escapeHtml, imprimirTexto, mostrarAviso } from '../nucleo/util.js';
import { SITUACAO_ANALISE, SITUACAO_NOVO, SITUACOES_PRETENDENTE, linkDaFicha, nomeDivisaoAdmissao,
  ordenarPretendentes, partesDoPretendente, textoFichaAdmissao } from '../dominio/admissao.js';
import { botaoGerarRelatorio } from '../ui/comuns.js';

const lista = () => state.pretendentesDados || [];
const doId = (id) => lista().find(p => p.id === id) || null;
const link = (chave) => linkDaFicha(window.location.href, chave);

function seloSituacao(p) {
  const s = SITUACOES_PRETENDENTE[p.situacao] || SITUACOES_PRETENDENTE[SITUACAO_NOVO];
  return `<span class="pret-situacao ${p.situacao === SITUACAO_ANALISE ? 'analise' : 'novo'}">${s.emoji} ${escapeHtml(s.rotulo)}</span>`;
}

// ---------- o link pra mandar ----------

function cardLink() {
  const regional = state.adminEscopo === 'regional';
  const linhaLink = (chave, rotulo) => `
    <div class="pret-link-linha">
      <div class="pret-link-texto">
        ${rotulo ? `<div class="pret-link-nome">${escapeHtml(rotulo)}</div>` : ''}
        <div class="pret-link-url">${escapeHtml(link(chave))}</div>
      </div>
      <button class="btn secondary pret-link-copiar" data-action="pretendente-copiar-link" data-value="${chave}">📋 Copiar</button>
    </div>`;
  return `
    <div class="card pret-links">
      <div class="painel-titulo">🔗 Link da ficha</div>
      <div class="pret-explica">${regional
        ? 'Cada divisão tem o seu link: a ficha preenchida cai direto na lista dela, e aparece aqui pro Regional.'
        : 'Mande este link pra quem quer entrar. A ficha preenchida aparece aqui embaixo.'}</div>
      ${regional
        ? escoposNaOrdemOficial().map(e => linhaLink(e.chave, nomeDivisaoAdmissao(e.chave))).join('')
        : linhaLink(state.adminEscopo, '')}
    </div>`;
}

// ---------- a lista ----------

function linhaPretendente(p) {
  return `
    <div class="card event-card pret-linha" data-action="abrir-pretendente" data-id="${escapeHtml(p.id)}">
      <div class="pret-linha-texto">
        <div class="name">${escapeHtml(p.nomeColete || '(sem nome)')}</div>
        <div class="meta">${escapeHtml(p.nomeCompleto || '')}${p.enviadoEm ? ` · ${escapeHtml(p.enviadoEm.slice(0, 10))}` : ''}</div>
      </div>
      ${seloSituacao(p)}
    </div>`;
}

function resumo(l) {
  const novos = l.filter(p => p.situacao === SITUACAO_NOVO).length;
  const analise = l.filter(p => p.situacao === SITUACAO_ANALISE).length;
  return `${l.length} ${l.length === 1 ? 'ficha' : 'fichas'} · 🆕 ${novos} ${novos === 1 ? 'nova' : 'novas'} · 🔎 ${analise} em análise`;
}

function renderLista() {
  const todas = ordenarPretendentes(lista());
  if (state.adminEscopo !== 'regional') {
    return `
      <div class="painel-titulo" style="margin-top:6px;">Fichas recebidas</div>
      ${todas.length ? `<div class="pret-resumo">${resumo(todas)}</div>${todas.map(linhaPretendente).join('')}`
        : '<div class="empty">Nenhuma ficha ainda. Mande o link acima pra quem quer entrar.</div>'}`;
  }
  return `
    <div class="painel-titulo" style="margin-top:6px;">Fichas recebidas</div>
    <div class="pret-resumo">${resumo(todas)}</div>
    ${escoposNaOrdemOficial().map(e => {
      const daqui = todas.filter(p => p.divisao === e.chave);
      return `
        <div class="pret-bloco">
          <div class="pret-bloco-titulo">${escapeHtml(nomeDivisaoAdmissao(e.chave))}${daqui.length ? ` <span>(${daqui.length})</span>` : ''}</div>
          ${daqui.length ? daqui.map(linhaPretendente).join('') : '<div class="pret-vazio">— nenhuma ficha</div>'}
        </div>`;
    }).join('')}`;
}

// ---------- a ficha de um ----------

function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }

function renderFicha(p) {
  const celular = soDigitos(p.celular);
  const novo = p.situacao !== SITUACAO_ANALISE;
  return `
    <div class="back-link on-photo no-print" data-action="fechar-pretendente">‹ Voltar à lista</div>
    <div class="card pret-cabeca">
      <div class="pret-cabeca-topo">
        <div>
          <div class="pret-nome">${escapeHtml(p.nomeColete || '(sem nome)')}</div>
          <div class="pret-nome-completo">${escapeHtml(p.nomeCompleto || '')}</div>
        </div>
        ${seloSituacao(p)}
      </div>
      <div class="pret-meta">${escapeHtml(nomeDivisaoAdmissao(p.divisao))}${p.enviadoEm ? ` · enviada em ${escapeHtml(p.enviadoEm)}` : ''}</div>
      ${celular ? `
        <div class="row-gap no-print" style="margin-top:12px;">
          <a class="btn secondary" style="flex:1;" href="tel:${celular}">📞 Ligar</a>
          <a class="btn secondary" style="flex:1;" href="https://wa.me/55${celular}" target="_blank" rel="noopener">💬 WhatsApp</a>
        </div>` : ''}
      <div class="pret-situacao-acao no-print">
        ${novo ? `
          <button class="btn block" data-action="pretendente-situacao" data-id="${escapeHtml(p.id)}" data-value="${SITUACAO_ANALISE}" ${state.pretendenteSalvando ? 'disabled' : ''}>🔎 Marcar Em análise</button>
          <div class="pret-explica">Quando você começar a lançar os dados no sistema do clube.</div>`
        : `
          <div class="pret-explica">🔎 Em análise${p.atualizadoEm ? ` desde ${escapeHtml(p.atualizadoEm)}` : ''}: esperando entrar no sistema do clube.</div>
          <button class="btn ghost" data-action="pretendente-situacao" data-id="${escapeHtml(p.id)}" data-value="${SITUACAO_NOVO}" ${state.pretendenteSalvando ? 'disabled' : ''}>↩ Voltar pra Novo</button>`}
      </div>
      ${botaoGerarRelatorio(`pretendente-${p.id}`, [
        { acao: 'pretendente-whatsapp', rotulo: '📋 WhatsApp', id: p.id },
        { acao: 'pretendente-pdf', rotulo: '📄 PDF', id: p.id },
      ])}
    </div>
    ${partesDoPretendente(p).map(parte => `
      <div class="card pret-parte">
        <div class="ficha-parte-titulo">${escapeHtml(parte.titulo)}</div>
        ${parte.linhas.map(l => `
          <div class="pret-dado">
            <div class="pret-dado-rotulo">${escapeHtml(l.rotulo)}</div>
            <div class="pret-dado-valor">${escapeHtml(l.valor || '-')}</div>
          </div>`).join('')}
      </div>`).join('')}`;
}

// ---------- a aba ----------

export function renderAdminPretendentes() {
  if (state.pretendentesCarregando && !state.pretendentesDados) return '<div class="loading">Buscando as fichas…</div>';
  if (state.pretendentesErro) return `${cardLink()}<div class="alert"><div class="alert-msg">Não deu pra buscar as fichas: ${escapeHtml(state.pretendentesErro)}.</div></div>`;
  const aberto = state.pretendenteAberto && doId(state.pretendenteAberto);
  if (aberto) return renderFicha(aberto);
  return cardLink() + renderLista();
}

export const acoes = {
  'pretendente-copiar-link': async (id, target, action, e) => {
    await copiarTexto(link(target.dataset.value));
  },
  'abrir-pretendente': async (id, target, action, e) => {
    state.pretendenteAberto = id;
    state.gerarRelatorioAberto = null;
    render();
    window.scrollTo(0, 0);
  },
  'fechar-pretendente': async (id, target, action, e) => {
    state.pretendenteAberto = null;
    return render();
  },
  'pretendente-situacao': async (id, target, action, e) => {
    const p = doId(id);
    if (!p || state.pretendenteSalvando) return;
    const situacao = target.dataset.value;
    state.pretendenteSalvando = true;
    render();
    try {
      await api('pretendenteSituacao', { id, situacao });
      p.situacao = situacao;
      p.atualizadoEm = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
      mostrarAviso(situacao === SITUACAO_ANALISE ? '🔎 Marcado Em análise' : '🆕 Voltou pra Novo');
    } catch (err) {
      alert(`Não deu pra salvar: ${err.message}`);
    }
    state.pretendenteSalvando = false;
    render();
  },
  'pretendente-whatsapp': async (id, target, action, e) => {
    const p = doId(id);
    if (p) await copiarTexto(textoFichaAdmissao(p));
  },
  'pretendente-pdf': async (id, target, action, e) => {
    const p = doId(id);
    if (p) imprimirTexto(textoFichaAdmissao(p));
  },
};
