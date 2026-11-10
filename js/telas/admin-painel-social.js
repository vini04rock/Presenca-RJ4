// Painel Social (Regional -> Social, 10/11/2026): o acompanhamento do
// Social Regional. Tres pedacos, todos do mesmo mes escolhido no topo:
//   - o calendario do mes so com as Acoes Sociais (de todas as divisoes e
//     do Regional) e, embaixo, a lista delas;
//   - o quadro das 6 divisoes: quem ja marcou/fez e quem ainda deve, com o
//     📋 Chamado pro grupo;
//   - as 4 Acoes Sociais obrigatorias do Regional no ano (Pascoa, Criancas,
//     Sangue, Natal), com o que falta pra cada uma;
//   - a grade do ano (divisao x mes) - tocar num mes leva pra ele.
// E a aba "Relatorio 10 dias": as Acoes Sociais de cada divisao num periodo
// (1-10, 11-20, 21-fim), com o texto pronto pro WhatsApp. E a aba
// "Planejadores": o planejador de Acoes Sociais de cada divisao, so leitura.
// O ➕ Registrar Acao Social, embaixo do calendario, cria o evento de
// qualquer divisao sem sair daqui.
// So le os eventos (state.events), buscados de novo ao entrar. As contas
// moram em dominio/painel-social.js.

import { carregarPlanejadoresDivisoes, recarregarEventos, salvarOuAvisar } from '../dados/carregar.js';
import { DIAS_SEMANA_LETRA, MESES_ABREV, NOMES_MESES, corTipoEvento, emojiTipoEvento, escopoPorChave, escoposNaOrdemOficial } from '../nucleo/config.js';
import { genId, state } from '../nucleo/estado.js';
import { render } from '../nucleo/render.js';
import { copiarTexto, dataISOdeBR, diaDaSemana, escapeHtml, formatDataBR, hexParaRgba, hojeISO, mostrarAviso } from '../nucleo/util.js';
import { soAtivos } from '../dominio/movimentos.js';
import { paramsDeEvento } from '../fila/presenca.js';
import { construirGradeCalendario } from '../dominio/estatisticas.js';
import { valeParaAsDivisoes } from '../dominio/obrigatoriedades.js';
import { quandoEOnde, situacaoPorChave } from '../dominio/acoes-sociais.js';
import { ESTADOS_SOCIAL, TIPO_SOCIAL, chaveDoMes, cumpriu, foiRealizada, gradeDoAno, gradePlanejadores, obrigatoriasDoAno, periodoDecendial, planejadoresDoMes, periodoVizinho, quadroDoMes, relatorioDecendial, rotuloDoDecendio, textoChamadoSocial, textoPrazoObrigatoria, textoRelatorioDecendial } from '../dominio/painel-social.js';

const COR_SOCIAL = corTipoEvento(TIPO_SOCIAL);
const COR_OK = '#4CAF6E';
const COR_ATENCAO = '#E0B24D';
const COR_URGENTE = '#D9573C';

// "Regional", "Barra", "Gardênia" - sem o " - RJ4".
function nomeCurto(categoria) {
  return categoria === 'regional' ? 'Regional' : escopoPorChave(categoria).nome.split(' - ')[0];
}

function mesOlhado() {
  const hoje = new Date();
  return {
    ano: state.painelSocialAno === null ? hoje.getFullYear() : state.painelSocialAno,
    mes: state.painelSocialMes === null ? hoje.getMonth() : state.painelSocialMes,
  };
}

function quadro() {
  const { ano, mes } = mesOlhado();
  return quadroDoMes(state.events, chaveDoMes(ano, mes), hojeISO());
}

function avisoDaBusca() {
  return `
    ${state.eventosAtualizando ? '<div class="painel-social-busca no-print">🔄 Buscando as ações marcadas pelas divisões…</div>' : ''}
    ${state.eventosErro ? `
      <div class="alert" style="margin-bottom:12px;">
        <div class="alert-msg">Não consegui buscar os eventos mais novos (${escapeHtml(state.eventosErro)}). O painel mostra o que o app já tinha.</div>
        <button class="btn secondary block" data-action="painel-social-atualizar" style="margin-top:8px;">Tentar de novo</button>
      </div>
    ` : ''}
  `;
}

export function renderAdminPainelSocial() {
  if (state.adminTab === 'painel-social-relatorio') return renderRelatorioDecendial();
  if (state.adminTab === 'painel-social-planejadores') return renderPlanejadores();
  const { ano, mes } = mesOlhado();
  const q = quadro();
  return `
    ${avisoDaBusca()}
    <div class="card calendario-card">
      <div class="calendario-cabecalho">
        <button class="btn ghost" data-action="painel-social-mes" data-value="-1" aria-label="Mês anterior">‹</button>
        <div class="calendario-titulo">${NOMES_MESES[mes]} de ${ano}</div>
        <button class="btn ghost" data-action="painel-social-mes" data-value="1" aria-label="Próximo mês">›</button>
      </div>
      ${calendario(ano, mes, q.acoes, obrigatoriasDoAno(state.events, ano, hojeISO()))}
      <div class="painel-social-legenda">🤝 Só as Ações Sociais · o nome no dia é de quem marcou · tracejado = obrigatória do Regional ainda sem evento</div>
    </div>
    ${state.painelSocialForm ? formularioRegistrar() : '<button class="btn block no-print" style="margin-bottom:14px;" data-action="painel-social-form-abrir">➕ Registrar Ação Social</button>'}
    ${listaDoMes(q)}
    ${cardDivisoes(q)}
    ${cardObrigatorias(ano)}
    ${cardAno(ano)}
  `;
}

// ---------- o calendario do mes ----------

// O dia de referencia de uma obrigatoria que ainda nao tem evento ganha um
// contorno tracejado com o emoji dela - lembrete de que ali tem que ter.
function calendario(ano, mes, acoes, obrigatorias) {
  const hoje = hojeISO();
  const porDia = {};
  acoes.forEach(ev => { (porDia[ev.data] = porDia[ev.data] || []).push(ev); });
  const lembrete = {};
  obrigatorias.filter(s => !s.evento).forEach(s => { lembrete[s.referencia] = s; });
  const estilo = `border-color:${COR_SOCIAL}; background:${hexParaRgba(COR_SOCIAL, 0.18)}; --cor-dia:${COR_SOCIAL};`;
  return `
    <div class="calendario-grade">
      ${DIAS_SEMANA_LETRA.map(l => `<div class="calendario-dia-semana">${l}</div>`).join('')}
      ${construirGradeCalendario(ano, mes).map(dia => {
        if (dia === null) return '<div class="calendario-dia calendario-dia-vazio"></div>';
        const iso = `${chaveDoMes(ano, mes)}-${String(dia).padStart(2, '0')}`;
        const doDia = porDia[iso] || [];
        const rotulo = doDia.length > 1 ? `${doDia.length} ações` : doDia.length ? nomeCurto(doDia[0].categoria) : '';
        const ob = !doDia.length && lembrete[iso];
        if (ob) {
          return `
          <div class="calendario-dia painel-social-dia-obrigatoria${iso === hoje ? ' calendario-dia-hoje' : ''}" title="${escapeHtml(`${ob.ob.nome} - obrigatória do Regional, ainda sem evento`)}">
            <span class="calendario-dia-numero">${dia}</span>
            <span class="calendario-dia-emoji">${ob.ob.emoji}</span><span class="calendario-dia-origem">${escapeHtml(ob.ob.curto)}</span>
          </div>
        `;
        }
        return `
          <div class="calendario-dia${iso === hoje ? ' calendario-dia-hoje' : ''}${doDia.length ? ' tem-evento' : ''}" style="${doDia.length ? estilo : ''}"
               title="${escapeHtml(doDia.map(ev => `${nomeCurto(ev.categoria)} - ${ev.nome}`).join('\n'))}">
            <span class="calendario-dia-numero">${dia}</span>
            ${doDia.length ? `<span class="calendario-dia-emoji">${emojiTipoEvento(TIPO_SOCIAL)}</span><span class="calendario-dia-origem">${escapeHtml(rotulo)}</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// A lista das acoes do mes, embaixo do calendario: dia, quem fez e o
// degrau (📅 marcada / 🏁 realizada). "Abrir" leva ao evento e o voltar
// traz de volta pra ca (open-event guarda a aba).
function listaDoMes(q) {
  if (!q.acoes.length) {
    return `<div class="card"><div class="empty" style="padding:8px 0;">Nenhuma Ação Social marcada em ${escapeHtml(q.nomeMes)}.</div></div>`;
  }
  return `
    <div class="rotulo-secao">Ações sociais de ${escapeHtml(q.nomeMes)} · ${q.acoes.length}</div>
    <div class="card" style="padding:4px 16px;">
      ${q.acoes.map(ev => {
        const e = ESTADOS_SOCIAL[foiRealizada(ev) ? 'realizada' : 'marcada'];
        const diaHora = [`${diaDaSemana(ev.data)}, ${formatDataBR(ev.data).slice(0, 5)}`, ev.horario].filter(Boolean).join(' · ');
        return `
          <div class="member-row painel-social-acao">
            <div class="member-head" data-action="open-event" data-id="${escapeHtml(ev.id)}">
              <div class="painel-social-acao-corpo">
                <div class="member-name">${escapeHtml(ev.nome)}</div>
                <div class="painel-social-detalhe">${escapeHtml(diaHora)} · <b>${escapeHtml(nomeCurto(ev.categoria))}</b></div>
              </div>
              <span class="painel-social-pilula ${foiRealizada(ev) ? 'realizada' : 'marcada'}">${e.emoji} ${e.rotulo}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ---------- o quadro das divisoes no mes ----------

function corDoEstado(estado, q) {
  if (cumpriu(estado)) return COR_OK;
  if (estado === 'nao-fez') return COR_URGENTE;
  if (estado === 'pendente') return q.urgente ? COR_URGENTE : COR_ATENCAO;
  return 'var(--line-strong)';
}

// O que cobre a divisao no mes: as acoes dela e, se ela nao tem nenhuma, a
// do Regional que vale pra todas.
function detalheDivisao(l) {
  const linha = (ev, doRegional) => {
    const e = ESTADOS_SOCIAL[foiRealizada(ev) ? 'realizada' : 'marcada'];
    return `<div class="painel-social-detalhe">${e.emoji} ${doRegional ? 'pelo Regional: ' : ''}${escapeHtml(ev.nome)} · ${escapeHtml(formatDataBR(ev.data).slice(0, 5))}</div>`;
  };
  if (l.proprias.length) return l.proprias.map(ev => linha(ev, false)).join('');
  if (l.regionais.length) return l.regionais.map(ev => linha(ev, true)).join('');
  return `<div class="painel-social-detalhe">${escapeHtml(ESTADOS_SOCIAL[l.estado].rotulo)}</div>`;
}

function cardDivisoes(q) {
  const n = q.faltando.length;
  let topo;
  if (q.atual) {
    const dias = q.diasRestantes <= 0 ? 'último dia do mês' : q.diasRestantes === 1 ? 'falta 1 dia' : `faltam ${q.diasRestantes} dias`;
    topo = `${q.emDia.length} de ${q.divisoes.length} já marcaram · ${dias}`;
  } else if (q.passado) {
    topo = `${q.emDia.length} de ${q.divisoes.length} fizeram`;
  } else {
    topo = `${q.emDia.length} de ${q.divisoes.length} já marcaram`;
  }
  const corTopo = n ? (q.urgente || q.passado ? COR_URGENTE : COR_ATENCAO) : COR_OK;
  return `
    <div class="rotulo-secao">Divisões em ${escapeHtml(q.nomeMes)}</div>
    <div class="card" style="padding:0; overflow:hidden;">
      <div class="painel-social-topo">
        <div style="font-size:12px; font-weight:600; color:${q.emDia.length === q.divisoes.length ? COR_OK : corTopo};">${q.emDia.length === q.divisoes.length ? '✅' : '⚠️'} ${escapeHtml(topo)}</div>
        ${n && (q.atual || q.passado) ? '<button class="aviso-cobrar no-print" data-action="painel-social-chamado" title="Copiar pro WhatsApp">📋 Chamado</button>' : ''}
      </div>
      ${q.divisoes.map(l => {
        const cor = corDoEstado(l.estado, q);
        return `
          <div class="aviso-linha" style="border-left-color:${cor}; height:auto; min-height:52px; padding:8px 12px; cursor:default;">
            <div class="aviso-icone" style="border-color:${cor};">${ESTADOS_SOCIAL[l.estado].emoji}</div>
            <div class="aviso-texto">
              <div class="aviso-nome">${escapeHtml(l.escopo.nome)}</div>
              ${detalheDivisao(l)}
            </div>
          </div>
        `;
      }).join('')}
      <div class="painel-social-rodape">Ação Social do Regional vale para todas as divisões. 📅 marcada no calendário · 🏁 já aconteceu (encerrada).</div>
    </div>
  `;
}

// ---------- as 4 obrigatorias do Regional ----------

function corObrigatoria(s) {
  if (cumpriu(s.estado)) return COR_OK;
  if (s.estado === 'nao-fez' || s.urgente) return COR_URGENTE;
  return COR_ATENCAO;
}

// Uma linha por obrigatoria. Com evento, tocar abre o evento; sem, leva o
// painel pro mes dela.
function linhaObrigatoria(s) {
  const cor = corObrigatoria(s);
  const dataTexto = `${diaDaSemana(s.data)}, ${formatDataBR(s.data).slice(0, 5)}`;
  let detalhe;
  if (s.evento) {
    const e = ESTADOS_SOCIAL[s.estado];
    detalhe = `${e.emoji} ${escapeHtml(s.evento.nome)} · ${escapeHtml(dataTexto)}${s.conferir ? ' · <i>confira se é esta</i>' : ''}`;
  } else {
    detalhe = `${escapeHtml(dataTexto)}${s.ob.dataSugerida ? ' (data sugerida)' : ''} · ainda sem evento`;
  }
  const acao = s.evento
    ? `data-action="open-event" data-id="${escapeHtml(s.evento.id)}"`
    : `data-action="painel-social-ir-mes" data-value="${Number(s.referencia.slice(5, 7)) - 1}"`;
  const prazo = textoPrazoObrigatoria(s);
  return `
    <div class="aviso-linha" style="border-left-color:${cor}; height:auto; min-height:58px; padding:8px 12px;" ${acao}>
      <div class="aviso-icone${s.urgente ? ' pulsando' : ''}" style="border-color:${cor};">${s.ob.emoji}</div>
      <div class="aviso-texto">
        <div class="aviso-nome">${escapeHtml(s.ob.nome)}</div>
        <div class="painel-social-detalhe">${detalhe}</div>
        <div class="aviso-contagem" style="color:${s.estado === 'marcada' ? 'var(--text-muted)' : cor};">${escapeHtml(prazo)}</div>
      </div>
      <div class="aviso-seta">›</div>
    </div>
  `;
}

function cardObrigatorias(ano) {
  const lista = obrigatoriasDoAno(state.events, ano, hojeISO());
  const ok = lista.filter(s => cumpriu(s.estado)).length;
  const faltam = lista.filter(s => s.estado === 'pendente' || s.estado === 'nao-fez');
  const cor = !faltam.length ? COR_OK : faltam.some(s => s.estado === 'nao-fez' || s.urgente) ? COR_URGENTE : COR_ATENCAO;
  return `
    <div class="rotulo-secao">Obrigatórias do Regional em ${ano}</div>
    <div class="card" style="padding:0; overflow:hidden;">
      <div class="painel-social-topo">
        <div style="font-size:12px; font-weight:600; color:${cor};">${faltam.length ? '⚠️' : '✅'} ${ok} de ${lista.length} com Ação Social do Regional</div>
      </div>
      ${lista.map(linhaObrigatoria).join('')}
      <div class="painel-social-rodape">Conta a Ação Social marcada no escopo Regional perto da data (Páscoa: até 30 dias antes; as outras: o mês inteiro). Tocar abre o evento, ou o mês dele.</div>
    </div>
  `;
}

// ---------- a grade do ano ----------

function cardAno(ano) {
  const grade = gradeDoAno(state.events, ano, hojeISO());
  const { mes: mesAberto } = mesOlhado();
  return `
    <div class="rotulo-secao">O ano de ${ano}</div>
    <div class="card painel-social-ano">
      <div class="painel-social-grade" role="table" aria-label="Ação Social de cada divisão, mês a mês">
        <div class="painel-social-linha painel-social-cabeca" role="row">
          <span class="painel-social-nome"></span>
          ${MESES_ABREV.map((m, i) => `<span class="painel-social-celula${i === mesAberto ? ' aberto' : ''}" role="columnheader">${m[0]}</span>`).join('')}
          <span class="painel-social-conta" title="Meses cumpridos, dos que já fecharam">✔</span>
        </div>
        ${grade.map(linha => `
          <div class="painel-social-linha" role="row">
            <span class="painel-social-nome">${escapeHtml(nomeCurto(linha.escopo.chave))}</span>
            ${linha.celulas.map((c, i) => `
              <span class="painel-social-celula estado-${c.estado}${c.peloRegional ? ' pelo-regional' : ''}${i === mesAberto ? ' aberto' : ''}" role="cell"
                    data-action="painel-social-ir-mes" data-value="${i}"
                    title="${escapeHtml(`${NOMES_MESES[i]}: ${ESTADOS_SOCIAL[c.estado].rotulo}${c.peloRegional ? ' (pelo Regional)' : ''}`)}">${c.estado === 'futuro' ? '·' : ESTADOS_SOCIAL[c.estado].emoji}</span>
            `).join('')}
            <span class="painel-social-conta">${linha.fechados ? `${linha.cumpridos}/${linha.fechados}` : '—'}</span>
          </div>
        `).join('')}
      </div>
      <div class="painel-social-rodape" style="padding:10px 0 0;">
        🏁 realizada · 📅 marcada · ⚠️ ainda não marcou · ⭕ não fez · com contorno = pela ação do Regional.<br>
        ✔ = meses cumpridos, dos que já fecharam. Toque num mês para abrir.
      </div>
    </div>
  `;
}

// ---------- o relatorio de 10 em 10 dias ----------

function periodoOlhado() {
  return periodoDecendial(state.relatorioSocialInicio || hojeISO());
}

function relatorio() { return relatorioDecendial(state.events, periodoOlhado(), hojeISO()); }

function linhaDoRelatorio(ev, extra) {
  const feita = foiRealizada(ev);
  const e = ESTADOS_SOCIAL[feita ? 'realizada' : 'marcada'];
  const diaHora = [`${diaDaSemana(ev.data)}, ${formatDataBR(ev.data).slice(0, 5)}`, ev.horario].filter(Boolean).join(' · ');
  return `
    <div class="member-row painel-social-acao">
      <div class="member-head" data-action="open-event" data-id="${escapeHtml(ev.id)}">
        <div class="painel-social-acao-corpo">
          <div class="member-name">${escapeHtml(ev.nome)}</div>
          <div class="painel-social-detalhe">${escapeHtml(diaHora)}${extra ? ' · ' + escapeHtml(extra) : ''}</div>
          ${ev.outros ? `<div class="painel-social-detalhe" style="white-space:pre-wrap;">↳ ${escapeHtml(ev.outros)}</div>` : ''}
        </div>
        <span class="painel-social-pilula ${feita ? 'realizada' : 'marcada'}">${e.emoji} ${e.rotulo}</span>
      </div>
    </div>
  `;
}

function blocoDoRelatorio(nome, acoes, extraDe) {
  return `
    <div class="painel-social-relatorio-divisao">${escapeHtml(nome)}</div>
    ${acoes.length
      ? acoes.map(ev => linhaDoRelatorio(ev, extraDe ? extraDe(ev) : '')).join('')
      : '<div class="painel-social-detalhe painel-social-relatorio-vazio">— nenhuma Ação Social no período</div>'}
  `;
}

function renderRelatorioDecendial() {
  const r = relatorio();
  const p = r.periodo;
  let situacao;
  if (r.futuro) situacao = 'Período que ainda não começou';
  else if (r.emAndamento) situacao = r.diasParaFechar <= 0 ? 'Período em andamento · fecha hoje' : `Período em andamento · fecha em ${r.diasParaFechar} ${r.diasParaFechar === 1 ? 'dia' : 'dias'}`;
  else situacao = 'Período fechado';
  const resumo = [`🏁 ${r.realizadas} ${r.realizadas === 1 ? 'realizada' : 'realizadas'}`, `📅 ${r.marcadas} ${r.marcadas === 1 ? 'marcada' : 'marcadas'}`,
    `${r.semAcao.length} ${r.semAcao.length === 1 ? 'divisão' : 'divisões'} sem ação`].join(' · ');
  return `
    ${avisoDaBusca()}
    <div class="card">
      <div class="calendario-cabecalho">
        <button class="btn ghost" data-action="relatorio-social-periodo" data-value="-1" aria-label="Período anterior">‹</button>
        <div class="calendario-titulo" style="font-size:15px;">${escapeHtml(rotuloDoDecendio(p))}</div>
        <button class="btn ghost" data-action="relatorio-social-periodo" data-value="1" aria-label="Próximo período">›</button>
      </div>
      <div class="painel-social-legenda" style="margin-top:4px;">${p.numero}º período do mês · ${escapeHtml(situacao)}</div>
      <div class="painel-social-legenda" style="margin-top:4px; color:var(--text);">${escapeHtml(resumo)}</div>
    </div>
    <div class="card" style="padding:4px 16px 10px;">
      ${r.regionais.length ? blocoDoRelatorio(escopoPorChave('regional').nome, r.regionais, ev => valeParaAsDivisoes(ev) ? 'vale para todas as divisões' : '') : ''}
      ${r.divisoes.map(l => blocoDoRelatorio(l.escopo.nome, l.acoes)).join('')}
    </div>
    <button class="btn block no-print" data-action="relatorio-social-copiar">📋 Copiar relatório pro WhatsApp</button>
    <div class="painel-social-legenda">🏁 realizada (evento encerrado) · 📅 marcada, ainda não encerrada · tocar abre o evento</div>
  `;
}

// ---------- os planejadores das divisoes (so leitura) ----------

// Mesmo mes do Painel (o ‹ › e o mesmo): o que cada divisao planejou pra ele
// no planejador dela, e embaixo a grade do ano.
function itemPlanejado(a) {
  const sit = situacaoPorChave(a.situacao);
  const evento = a.eventoId ? state.events.find(ev => ev.id === a.eventoId) : null;
  const detalhe = [quandoEOnde(a), evento ? '📌 já virou evento' : ''].filter(Boolean).join(' · ');
  return `
    <div class="painel-social-plano${a.situacao === 'ideia' ? ' ideia' : ''}"${evento ? ` data-action="open-event" data-id="${escapeHtml(evento.id)}"` : ''}>
      <div class="painel-social-plano-nome">${a.emoji ? escapeHtml(a.emoji) + ' ' : ''}${escapeHtml(a.acao)}</div>
      <div class="painel-social-detalhe">${sit.emoji} ${escapeHtml(sit.rotulo)}${detalhe ? ' · ' + escapeHtml(detalhe) : ''}</div>
    </div>
  `;
}

function corDoPlano(l) {
  if (l.erro || !l.melhor) return 'var(--line-strong)';
  if (l.melhor === 'ideia') return COR_ATENCAO;
  return COR_OK;
}

function corpoDoPlano(l) {
  if (!l.carregado) return '<div class="painel-social-detalhe">…</div>';
  if (l.erro) return `<div class="painel-social-detalhe">Não consegui ler o planejador (${escapeHtml(l.erro)})</div>`;
  if (!l.itens.length) return '<div class="painel-social-detalhe painel-social-relatorio-vazio">— nada planejado para este mês</div>';
  return l.itens.map(itemPlanejado).join('');
}

function renderPlanejadores() {
  const { ano, mes } = mesOlhado();
  const dados = state.planejadoresDados;
  const linhas = planejadoresDoMes(dados, chaveDoMes(ano, mes));
  const comAcao = linhas.filter(l => l.escolhidas).length;
  const grade = gradePlanejadores(dados, ano);
  return `
    ${state.planejadoresCarregando ? '<div class="painel-social-busca no-print">🔄 Buscando os planejadores das divisões…</div>' : ''}
    <div class="card">
      <div class="calendario-cabecalho">
        <button class="btn ghost" data-action="painel-social-mes" data-value="-1" aria-label="Mês anterior">‹</button>
        <div class="calendario-titulo">${NOMES_MESES[mes]} de ${ano}</div>
        <button class="btn ghost" data-action="painel-social-mes" data-value="1" aria-label="Próximo mês">›</button>
      </div>
      <div class="painel-social-legenda" style="margin-top:4px;">${dados ? `${comAcao} de ${linhas.length} divisões já escolheram a ação do mês` : 'Ainda não li os planejadores'}</div>
    </div>
    <div class="rotulo-secao">Planejado para ${escapeHtml(NOMES_MESES[mes])}</div>
    <div class="card" style="padding:0; overflow:hidden;">
      ${linhas.map(l => `
        <div class="aviso-linha" style="border-left-color:${corDoPlano(l)}; height:auto; min-height:52px; padding:8px 12px; cursor:default; align-items:flex-start;">
          <div class="aviso-texto">
            <div class="aviso-nome">${escapeHtml(l.escopo.nome)}</div>
            ${corpoDoPlano(l)}
          </div>
        </div>
      `).join('')}
      <div class="painel-social-rodape">Só leitura: quem mexe é o Social de cada divisão, no planejador dela. 💡 ideia (ainda opção) · 📅 planejada · ✅ confirmada · 🏁 realizada.</div>
    </div>
    <div class="rotulo-secao">Planejamento de ${ano}</div>
    <div class="card painel-social-ano">
      <div class="painel-social-grade" role="table" aria-label="O que cada divisão planejou, mês a mês">
        <div class="painel-social-linha painel-social-cabeca" role="row">
          <span class="painel-social-nome"></span>
          ${MESES_ABREV.map((m, i) => `<span class="painel-social-celula${i === mes ? ' aberto' : ''}" role="columnheader">${m[0]}</span>`).join('')}
          <span class="painel-social-conta" title="Meses com ação escolhida">✔</span>
        </div>
        ${grade.map(linha => `
          <div class="painel-social-linha" role="row">
            <span class="painel-social-nome">${escapeHtml(nomeCurto(linha.escopo.chave))}</span>
            ${linha.celulas.map((c, i) => `
              <span class="painel-social-celula${c.melhor ? '' : ' estado-futuro'}${i === mes ? ' aberto' : ''}" role="cell"
                    data-action="painel-social-ir-mes" data-value="${i}"
                    title="${escapeHtml(`${NOMES_MESES[i]}: ${c.melhor ? situacaoPorChave(c.melhor).rotulo : 'nada planejado'}`)}">${c.melhor ? situacaoPorChave(c.melhor).emoji : '·'}</span>
            `).join('')}
            <span class="painel-social-conta">${linha.carregado ? `${linha.mesesComAcao}/12` : '—'}</span>
          </div>
        `).join('')}
      </div>
      <div class="painel-social-rodape" style="padding:10px 0 0;">
        Cada mês mostra o ponto mais adiantado do planejamento. ✔ = meses do ano com uma ação já escolhida. Toque num mês para abrir.
      </div>
    </div>
    <button class="btn secondary block no-print" data-action="planejadores-atualizar"${state.planejadoresCarregando ? ' disabled' : ''}>🔄 Buscar de novo</button>
  `;
}

// ---------- registrar uma Acao Social pelo Painel ----------
//
// O Social Regional cria a Acao Social de qualquer divisao (ou do Regional)
// daqui, sem entrar em cada uma: o evento nasce com a categoria da divisao
// escolhida, igual ao que ela mesma criaria - aparece no calendario geral,
// no da divisao e aqui. O PIN do Regional abre qualquer divisao no
// servidor, entao o Code.gs nao muda.
//   - "Detalhes da acao social" vai no campo de observacoes do evento.
//   - Quem e convocado: a divisao inteira (os ativos) ou ninguem (so o
//     registro). "Ja aconteceu" cria o evento ja encerrado e SEMPRE sem
//     convocados: encerrar com gente convocada faria todo mundo que nao
//     respondeu virar falta (Infracional).

function formVazio() {
  return { categoria: '', nome: '', detalhes: '', data: '', horario: '', local: '', convocar: 'divisao', situacao: 'marcada', erro: '' };
}

function convocaveis(categoria) {
  if (!categoria) return [];
  if (categoria === 'regional') return soAtivos(state.roster);
  const nome = escopoPorChave(categoria).nome;
  return soAtivos(state.roster.filter(m => m.divisao === nome));
}

function chip(acao, valor, ativo, texto) {
  return `<button class="chip-option ${ativo ? 'active' : ''}" data-action="${acao}" data-value="${escapeHtml(valor)}">${texto}</button>`;
}

function formularioRegistrar() {
  const f = state.painelSocialForm;
  const jaFoi = f.situacao === 'realizada';
  const n = convocaveis(f.categoria).length;
  return `
    <div class="card no-print">
      <div class="painel-titulo">🤝 Registrar Ação Social</div>
      <div class="field">
        <label>De quem é a ação</label>
        <div class="painel-social-chips">
          ${escoposNaOrdemOficial().map(e => chip('painel-social-form-divisao', e.chave, f.categoria === e.chave, escapeHtml(nomeCurto(e.chave)))).join('')}
        </div>
      </div>
      <div class="field"><label>Nome</label><input type="text" maxlength="120" data-psf="nome" value="${escapeHtml(f.nome)}" placeholder="Ex: Ação Social - Arrecadação de alimentos"></div>
      <div class="field"><label>Detalhes da ação social</label><textarea rows="3" maxlength="600" data-psf="detalhes" placeholder="O que foi feito, para quem, quanto arrecadou…">${escapeHtml(f.detalhes)}</textarea></div>
      <div class="row-gap">
        <div class="field" style="flex:1; min-width:130px;"><label>Data</label><input type="text" inputmode="numeric" maxlength="10" class="campo-data" data-psf="data" value="${escapeHtml(f.data)}" placeholder="dd/mm/aaaa" autocomplete="off"></div>
        <div class="field" style="flex:1; min-width:100px;"><label>Horário (opcional)</label><input type="time" data-psf="horario" value="${escapeHtml(f.horario)}"></div>
      </div>
      <div class="field"><label>Local (opcional)</label><input type="text" maxlength="200" data-psf="local" value="${escapeHtml(f.local)}" placeholder="Ex: Sede da Barra"></div>
      <div class="field">
        <label>Situação</label>
        <div class="painel-social-chips">
          ${chip('painel-social-form-situacao', 'marcada', !jaFoi, '📅 Marcada (vai acontecer)')}
          ${chip('painel-social-form-situacao', 'realizada', jaFoi, '🏁 Já aconteceu')}
        </div>
      </div>
      <div class="field">
        <label>Quem fica convocado</label>
        ${jaFoi ? `
          <div class="painel-social-detalhe">📝 Ninguém: a ação já aconteceu, então ela entra só como registro. Se a divisão quiser marcar quem foi, ela convoca e encerra pelo Eventos dela.</div>
        ` : `
          <div class="painel-social-chips">
            ${chip('painel-social-form-convocar', 'divisao', f.convocar === 'divisao', `👥 ${f.categoria === 'regional' ? 'Todos da RJ4' : 'A divisão inteira'}${f.categoria ? ` (${n})` : ''}`)}
            ${chip('painel-social-form-convocar', 'registro', f.convocar === 'registro', '📝 Ninguém (só registro)')}
          </div>
        `}
      </div>
      ${f.erro ? `<div class="alert" style="margin-bottom:10px;"><div class="alert-msg">${escapeHtml(f.erro)}</div></div>` : ''}
      <div class="row-gap">
        <button class="btn" data-action="painel-social-form-salvar" ${state.painelSocialSalvando ? 'disabled' : ''}>${state.painelSocialSalvando ? 'Salvando…' : 'Registrar'}</button>
        <button class="btn secondary" data-action="painel-social-form-fechar">Cancelar</button>
      </div>
    </div>
  `;
}

// Os campos de texto so lembram (sem redesenhar), senao o teclado fecharia.
export function atualizarCampoPainelSocial(el) {
  const chave = el.dataset && el.dataset.psf;
  if (!chave || !state.painelSocialForm) return false;
  state.painelSocialForm[chave] = el.value;
  return true;
}

// O evento que o formulario cria - ou o erro que impede.
export function eventoDoFormulario(f, id) {
  const data = dataISOdeBR(f.data);
  if (!f.categoria) return { erro: 'Escolha de quem é a ação (a divisão ou o Regional).' };
  if (!f.nome.trim()) return { erro: 'Escreva o nome da ação.' };
  if (!data) return { erro: 'A data precisa estar completa (dd/mm/aaaa).' };
  const jaFoi = f.situacao === 'realizada';
  return {
    evento: {
      id, nome: f.nome.trim(), data, horario: f.horario || '', endereco: f.local.trim(), outros: f.detalhes.trim(),
      tipo: TIPO_SOCIAL, categoria: f.categoria, status: jaFoi ? 'encerrado' : 'ativo',
      memberIds: !jaFoi && f.convocar === 'divisao' ? convocaveis(f.categoria).map(m => m.id) : [],
    },
  };
}

// ---------- acoes ----------

export const acoes = {
  'painel-social-mes': async (id, target, action, e) => {
    const { ano, mes } = mesOlhado();
    const d = new Date(ano, mes + Number(target.dataset.value), 1);
    state.painelSocialAno = d.getFullYear();
    state.painelSocialMes = d.getMonth();
    return render();
  },
  'painel-social-ir-mes': async (id, target, action, e) => {
    state.painelSocialAno = mesOlhado().ano;
    state.painelSocialMes = Number(target.dataset.value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return render();
  },
  'painel-social-chamado': async (id, target, action, e) => copiarTexto(textoChamadoSocial(quadro())),
  'painel-social-atualizar': async (id, target, action, e) => recarregarEventos(),
  'relatorio-social-periodo': async (id, target, action, e) => {
    state.relatorioSocialInicio = periodoVizinho(periodoOlhado(), Number(target.dataset.value)).inicio;
    return render();
  },
  'painel-social-form-abrir': async (id, target, action, e) => { state.painelSocialForm = formVazio(); return render(); },
  'painel-social-form-fechar': async (id, target, action, e) => { state.painelSocialForm = null; return render(); },
  'painel-social-form-divisao': async (id, target, action, e) => {
    if (state.painelSocialForm) state.painelSocialForm = { ...state.painelSocialForm, categoria: target.dataset.value, erro: '' };
    return render();
  },
  'painel-social-form-situacao': async (id, target, action, e) => {
    if (state.painelSocialForm) state.painelSocialForm = { ...state.painelSocialForm, situacao: target.dataset.value, erro: '' };
    return render();
  },
  'painel-social-form-convocar': async (id, target, action, e) => {
    if (state.painelSocialForm) state.painelSocialForm = { ...state.painelSocialForm, convocar: target.dataset.value, erro: '' };
    return render();
  },
  'painel-social-form-salvar': async (id, target, action, e) => {
    const f = state.painelSocialForm;
    if (!f || state.painelSocialSalvando) return;
    const r = eventoDoFormulario(f, genId());
    if (r.erro) { state.painelSocialForm = { ...f, erro: r.erro }; return render(); }
    state.painelSocialSalvando = true;
    render();
    const ok = await salvarOuAvisar('eventoSalvar', paramsDeEvento(r.evento));
    state.painelSocialSalvando = false;
    if (!ok) return render();
    state.events = [...state.events, r.evento];
    state.painelSocialForm = null;
    // O calendario vai pro mes da acao, pra ela aparecer na hora.
    state.painelSocialAno = Number(r.evento.data.slice(0, 4));
    state.painelSocialMes = Number(r.evento.data.slice(5, 7)) - 1;
    render();
    mostrarAviso(`✅ Ação Social registrada · ${nomeCurto(r.evento.categoria)}`);
  },
  'planejadores-atualizar': async (id, target, action, e) => carregarPlanejadoresDivisoes(),
  'relatorio-social-copiar': async (id, target, action, e) => copiarTexto(textoRelatorioDecendial(relatorio())),
};
