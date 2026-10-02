// Os quadros da chamada que aparecem em duas telas: "Criar chamada" e o
// formulário de criar/editar evento. O evento já nasce com os quadros 1 a 3
// preenchidos, então os dois lugares precisam desenhar exatamente o mesmo.
//
// Nada aqui lê o state: quem chama passa os campos e o nome do atributo em
// que cada campo vai (data-campo na chamada, data-evc no evento), e cada
// tela liga a digitação ao próprio state.

import { TIPOS_EVENTO, emojiTipoEvento } from '../nucleo/config.js';
import { escapeHtml } from '../nucleo/util.js';
import { linhaDoBonde } from '../dominio/convocacao.js';

export function quadro(numero, titulo, corpo, nota) {
  return `
    <div class="card chamada-quadro">
      <div class="chamada-quadro-titulo"><span>${numero}</span>${escapeHtml(titulo)}</div>
      ${nota ? `<div class="chamada-quadro-nota">${nota}</div>` : ''}
      ${corpo}
    </div>
  `;
}

export function caixa({ rotulo, valor, dica, linhas, atributos, desligado }) {
  const v = escapeHtml(valor || '');
  const d = escapeHtml(dica || '');
  const off = desligado ? 'disabled' : '';
  const entrada = linhas > 1
    ? `<textarea ${atributos} rows="${linhas}" placeholder="${d}" ${off}>${v}</textarea>`
    : `<input type="text" ${atributos} placeholder="${d}" value="${v}" ${off}>`;
  return `<div class="field">${rotulo ? `<label>${escapeHtml(rotulo)}</label>` : ''}${entrada}</div>`;
}

// Os quadros de texto fixo mostram o texto como vai sair, sem campo.
export function textoFixo(linhas) {
  return `<pre class="chamada-fixo">${escapeHtml(linhas.join('\n'))}</pre>`;
}

// Um campo dos quadros. `attr` é o atributo que diz à tela onde guardar o
// que for digitado; num P.E., vai junto o data-pe com o índice dele.
function campo(campos, attr, chave, rotulo, dica, linhas) {
  return caixa({ rotulo, dica, linhas, valor: campos[chave], atributos: `${attr}="${chave}"` });
}

// Quadro 1. `tipo` e a ação dos chips vêm de fora: na chamada o tipo é um
// campo dela, no evento é o tipo do próprio evento.
export function quadroTipo({ campos, attr, categoria, tipo, acaoTipo }) {
  return quadro(1, 'Tipo de chamada', `
    <div class="chip-grid wide" style="margin-bottom:12px;">
      ${TIPOS_EVENTO.map(t => `
        <button class="chip-option ${tipo === t ? 'active' : ''}" data-action="${acaoTipo}" data-value="${escapeHtml(t)}">${emojiTipoEvento(t)} ${escapeHtml(t)}</button>
      `).join('')}
    </div>
    <div class="info-line chamada-auto">${escapeHtml(linhaDoBonde(categoria))}</div>
    ${campo(campos, attr, 'subtitulo', 'Subtítulo', 'Se ficar em branco, vai o nome do evento')}
  `, 'O tipo vai no topo e a linha do bonde logo abaixo.');
}

// Os três horários lado a lado, pra não ocupar três linhas com três números.
function horariosDoPe(pe, i, attr) {
  return `<div class="row-gap">${[
    ['concentracao', 'Concentração', '06:00'],
    ['briefing', 'Briefing', '06:30'],
    ['saida', 'Saída', '07:00'],
  ].map(([chave, rotulo, dica]) => `
    <div class="field" style="flex:1; margin-bottom:0;">
      <label>${rotulo}</label>
      <input type="text" data-pe="${i}" ${attr}="${chave}" placeholder="${dica}" value="${escapeHtml(pe[chave] || '')}">
    </div>`).join('')}</div>`;
}

// O roteiro é montado dos P.E.: o app escreve a sequência, os 📍 e o 🏁, e
// cada trecho ganha uma caixa só para as vias. Entra na chamada quando
// alguma via (ou observação) for preenchida.
function roteiroDoBonde(campos, attr) {
  const pes = campos.pes || [];
  const destino = String(campos.destino || '').trim().toUpperCase() || 'DESTINO';
  const trechos = pes.map((pe, i) => {
    const fim = i + 1 < pes.length ? `PE ${i + 2}` : destino;
    return caixa({ rotulo: `🛣️ Trecho ${i + 1} — PE ${i + 1} → ${fim}`, linhas: 4, valor: pe.vias,
      atributos: `data-pe="${i}" ${attr}="vias"`,
      dica: 'Uma via por linha\nAv. Ayrton Senna\nLinha Amarela — sentido Fundão' });
  }).join('');
  return `
    <div style="font-weight:600; margin:8px 0;">🎯 Roteiro do bonde</div>
    <div class="chamada-quadro-nota">${pes.length
      ? 'A sequência dos pontos o app monta sozinho. Preencha só as vias de cada trecho.'
      : 'Adicione um P.E. acima para montar os trechos.'}</div>
    ${trechos}
    ${campo(campos, attr, 'roteiro', 'Observações do roteiro (opcional)', 'Ex: A partir da Casa do Alemão, o bonde segue pela BR-040.', 3)}
  `;
}

// Quadro 3. As ações de acrescentar/remover P.E. são de cada tela, porque
// cada uma guarda os P.E. num lugar do state.
export function quadroRoteiro({ campos, attr, acaoAdicionarPe, acaoRemoverPe }) {
  const pes = campos.pes || [];
  return quadro(3, 'Roteiro', `
    ${pes.map((pe, i) => `
      <div class="chamada-pe">
        <div class="chamada-pe-topo">
          <b>📍 PE ${i + 1}</b>
          <button class="btn ghost" style="padding:2px 0; font-size:12px;" data-action="${acaoRemoverPe}" data-value="${i}">Remover</button>
        </div>
        ${caixa({ rotulo: 'Nome do ponto', linhas: 2, valor: pe.nome, atributos: `data-pe="${i}" ${attr}="nome"`,
          dica: 'Ex: Posto Ipiranga - Cebolão' })}
        ${caixa({ rotulo: 'Endereço (opcional)', valor: pe.endereco, atributos: `data-pe="${i}" ${attr}="endereco"` })}
        ${caixa({ rotulo: 'Link do Maps', valor: pe.maps, atributos: `data-pe="${i}" ${attr}="maps"`,
          dica: 'https://maps.app.goo.gl/…' })}
        ${horariosDoPe(pe, i, attr)}
      </div>
    `).join('')}
    <button class="btn secondary block" data-action="${acaoAdicionarPe}" style="margin-bottom:16px;">+ Adicionar P.E.</button>
    <div style="font-weight:600; margin-bottom:8px;">🏁 Destino final</div>
    ${campo(campos, attr, 'destinoEndereco', 'Endereço', 'Rua, número - bairro, cidade')}
    ${campo(campos, attr, 'destinoMaps', 'Link do Maps', 'https://maps.app.goo.gl/…')}
    ${roteiroDoBonde(campos, attr)}
  `, 'O nome do destino é o do quadro 2.');
}

// Guarda o que foi digitado num campo dos quadros. `el` é o campo, `attr` o
// nome do atributo sem o "data-" (campo, evc). Devolve false se o campo não
// é dos quadros.
export function guardarDigitado(campos, el, chaveAttr) {
  const chave = el.dataset && el.dataset[chaveAttr];
  if (!chave) return false;
  if (el.dataset.pe !== undefined) {
    const pe = (campos.pes || [])[Number(el.dataset.pe)];
    if (pe) pe[chave] = el.value;
  } else {
    campos[chave] = el.value;
  }
  return true;
}
