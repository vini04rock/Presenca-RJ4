// Rank de Presenca (publico, sem PIN).

import { escoposEmOrdemDeExibicao } from '../nucleo/config.js';
import { state } from '../nucleo/estado.js';
import { escapeHtml } from '../nucleo/util.js';
import { medalha, posicoesDoPodio } from '../ui/comuns.js';
import { carregarRank } from '../dados/carregar.js';
import { render } from '../nucleo/render.js';
import { imagemRank, mostrarPreviaImagem } from '../ui/imagem.js';

export function renderRank(app) {
  const d = state.rankData;
  app.innerHTML = `
    <div class="back-link on-photo" data-action="go-home-escolha">‹ Voltar</div>
    <div class="crest-wrap" style="margin-bottom: 8px;">
      <h1 style="font-size: 21px;">🏆 Rank de Presença</h1>
      <div class="sub">Comparação entre divisões</div>
    </div>
    <div class="row-gap" style="margin-bottom: 12px;">
      <button class="chip-option ${state.rankJanela === 'sempre' ? 'active' : ''}" data-action="set-rank-janela" data-value="sempre" style="flex:1;">Desde sempre</button>
      <button class="chip-option ${state.rankJanela === '6meses' ? 'active' : ''}" data-action="set-rank-janela" data-value="6meses" style="flex:1;">Últimos 6 meses</button>
    </div>
    ${state.rankError ? `
      <div class="alert">
        <div class="alert-title">Não consegui calcular</div>
        <div class="alert-msg">${escapeHtml(state.rankError)}.</div>
      </div>
    ` : ''}
    <button class="btn block" data-action="calcular-rank" style="margin-bottom:16px;" ${state.rankLoading ? 'disabled' : ''}>
      ${state.rankLoading ? 'Calculando…' : (d ? '🔄 Atualizar' : '📊 Calcular rank')}
    </button>
    ${d ? renderRankConteudo(d) : (state.rankLoading ? esqueletoRank() : '')}
  `;
}

// O formato do rank em vidro, enquanto a planilha calcula: o card do total
// e as 7 divisoes. Mesmo esqueleto da primeira carga do app (.esqueleto).
function esqueletoRank() {
  return `
    <div class="esqueleto-rank" aria-busy="true">
      <div class="esqueleto esqueleto-card"></div>
      ${Array.from({ length: 7 }, () => '<div class="esqueleto esqueleto-rank-linha"></div>').join('')}
    </div>
  `;
}

function renderRankConteudo(d) {
  const porChave = chave => d.divisoes.find(x => x.chave === chave);
  const linhaPct = v => v === null || v === undefined ? '—' : v + '%';

  // Soma de tudo (todas as divisoes + Regional juntas) - a base de presenca
  // da RJ4 inteira, calculada em cima do que ja veio do servidor, sem
  // precisar de outra chamada.
  const totalConvites = d.divisoes.reduce((soma, x) => soma + x.convites, 0);
  const totalConfirmacoes = d.divisoes.reduce((soma, x) => soma + x.confirmacoes, 0);
  const totalPct = totalConvites ? Math.round((totalConfirmacoes / totalConvites) * 100) : null;

  const cardTotal = `
    <div class="card" style="padding: 14px 16px; margin-bottom:12px; border-color: var(--line-strong);">
      <div class="member-row" style="border-bottom:none; padding:0;">
        <div class="member-head" style="cursor:default;">
          <span class="member-name" style="font-family:'Rye',serif; font-size:17px;">🏆 Rank Total Regional</span>
          <span class="status-badge status-confirmado" style="font-size:15px; padding:7px 14px;" data-anima="rank-total:${totalPct}"><span${totalPct === null ? '' : ` data-conta="${totalPct}" data-sufixo="%"`}>${linhaPct(totalPct)}</span></span>
        </div>
      </div>
    </div>
  `;

  // Do maior % pro menor, com o pódio nos tres primeiros. Quem nao tem %
  // (nenhum evento encerrado ainda) vai pro fim, na ordem de sempre.
  const divisoesNoRank = escoposEmOrdemDeExibicao()
    .map(e => {
      const item = porChave(e.chave);
      return { e, item, pct: item && item.percentual !== undefined ? item.percentual : null };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const lugaresDivisoes = posicoesDoPodio(divisoesNoRank.map(x => x.pct));
  const blocoDivisoes = `
    <div class="card rank-divisoes" style="padding: 4px 16px; margin-bottom:16px;" data-anima="rank-divisoes:${state.rankJanela}">
      ${divisoesNoRank.map(({ e, pct }, i) => {
        return `
          <div class="member-row${lugaresDivisoes[i] ? ' podio podio-' + lugaresDivisoes[i] : ''}">
            <div class="member-head">
              <span class="member-name">${medalha(lugaresDivisoes[i])}${escapeHtml(e.nome)}</span>
              <span class="status-badge status-confirmado"><span${pct === null ? '' : ` data-conta="${pct}" data-sufixo="%"`}>${linhaPct(pct)}</span></span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  const blocoMembros = escoposEmOrdemDeExibicao().map(e => {
    const membros = d.membros
      .filter(m => m.divisao === e.nome)
      .sort((a, b) => (b.percentual ?? -1) - (a.percentual ?? -1) || a.nome.localeCompare(b.nome));
    const lugares = posicoesDoPodio(membros.map(m => m.percentual));
    const aberto = state.rankExpandedDivisoes.has(e.chave);
    return `
      <div class="card" style="padding: 4px 16px;">
        <div class="division-subheader clicavel" data-action="toggle-rank-divisao" data-value="${e.chave}">
          <span>${aberto ? '▾' : '▸'} ${escapeHtml(e.nome.toUpperCase())}</span>
          <span class="division-counts">${membros.length} ${membros.length === 1 ? 'membro' : 'membros'}</span>
        </div>
        ${aberto ? (membros.length === 0 ? '<div class="empty">Nenhum membro cadastrado.</div>' : membros.map((m, i) => `
          <div class="member-row${lugares[i] ? ' podio podio-' + lugares[i] : ''}">
            <div class="member-head">
              <span class="member-name">${medalha(lugares[i])}${escapeHtml(m.nome)}</span>
              <span class="status-badge status-confirmado">${linhaPct(m.percentual)}</span>
            </div>
          </div>
        `).join('')) : ''}
      </div>
    `;
  }).join('');

  const botaoImagem = `<button class="btn secondary block" style="margin:-4px 0 16px;" data-action="imagem-rank">🖼️ Imagem do rank pro grupo</button>`;
  return cardTotal + blocoDivisoes + botaoImagem + blocoMembros;
}

// Acoes do Rank de Presenca.
// Cada entrada e o corpo do antigo "if (action === ...)" do app.js, tal
// e qual. O app.js so olha o nome da acao neste mapa e chama.
export const acoes = {
  'imagem-rank': async (id, target, action, e) => {
    if (!state.rankData) return;
    const janela = state.rankJanela;
    return mostrarPreviaImagem(() => imagemRank(state.rankData, janela), `rank-presenca-${janela === '6meses' ? '6-meses' : 'geral'}.png`);
  },
  // Calcula sozinho na PRIMEIRA vez que a tela abre. Depois o resultado
  // fica no state enquanto o app estiver aberto: sair e voltar nao chama a
  // planilha de novo - pra numero fresco, o "Atualizar". Assim cada
  // visita ao app custa no maximo uma conta, a mesma que o antigo botao
  // "Calcular rank" ja custava.
  'go-rank': async (id, target, action, e) => {
    state.view = 'rank';
    if (!state.rankData && !state.rankLoading) return carregarRank();
    return render();
  },
  'calcular-rank': async (id, target, action, e) => {
    return carregarRank();
  },
  'set-rank-janela': async (id, target, action, e) => {
    state.rankJanela = target.dataset.value;
    // Se ja tinha calculado antes, recalcula na hora pra nova janela -
    // senao (a primeira conta falhou ou ainda nao voltou) so troca a selecao.
    return state.rankData ? carregarRank() : render();
  },
  'toggle-rank-divisao': async (id, target, action, e) => {
    const chave = target.dataset.value;
    if (state.rankExpandedDivisoes.has(chave)) state.rankExpandedDivisoes.delete(chave);
    else state.rankExpandedDivisoes.add(chave);
    return render();
  },
};
