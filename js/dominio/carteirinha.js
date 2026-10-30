// A carteirinha do integrante: as contas (idade, aniversario) e os links
// de telefone. Os dados vem da aba MembrosFicha (Code.gs), atras do PIN.

import { funcaoPorChave } from '../nucleo/config.js';
import { formatDataBR } from '../nucleo/util.js';
import { textoIngresso } from './movimentos.js';

export const TIPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Quantos anos completos tem em `diaDeHoje` quem nasceu em `nascimentoISO`.
export function idadeEm(nascimentoISO, diaDeHoje) {
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(nascimentoISO || ''));
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(diaDeHoje || ''));
  if (!n || !h) return null;
  let idade = Number(h[1]) - Number(n[1]);
  if (h[2] + h[3] < n[2] + n[3]) idade--;
  return idade;
}

// '(21) 99999-0000' -> '+5521999990000' (o Brasil quando nao vier o pais).
export function telefoneParaLink(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  if (!d) return '';
  return '+' + (d.length <= 11 ? '55' + d : d);
}
export function linkWhatsApp(numero) {
  return 'https://wa.me/' + telefoneParaLink(numero).replace('+', '');
}

// Os aniversarios do mural: de `diasAntes` dias antes ate o proprio dia.
// Cada um com quantos dias faltam (0 = hoje) e a idade que vai fazer. Quem
// nasceu em 29/02 faz aniversario em 28/02 nos anos que nao sao bissextos
// (a mesma regra das honrarias).
export function aniversariosProximos(lista, diaDeHoje, diasAntes = 7) {
  const [ha, hm, hd] = String(diaDeHoje).split('-').map(Number);
  const hoje = new Date(ha, hm - 1, hd);
  const saida = [];
  (lista || []).forEach(p => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p.nascimento || ''));
    if (!m) return;
    for (const ano of [ha, ha + 1]) {
      let mes = Number(m[2]) - 1, dia = Number(m[3]);
      const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
      if (mes === 1 && dia === 29 && !bissexto) dia = 28;
      const dias = Math.round((new Date(ano, mes, dia) - hoje) / 86400000);
      if (dias >= 0 && dias <= diasAntes) {
        saida.push({ ...p, dias, idade: ano - Number(m[1]) });
        return;
      }
    }
  });
  return saida.sort((a, b) => a.dias - b.dias || String(a.nome).localeCompare(String(b.nome)));
}

// O texto da carteirinha pro WhatsApp (30/10/2026): em cima o que o app ja
// sabe do irmao, embaixo os dados da ficha. Campo vazio sai com "—", pra
// ficar claro que falta preencher. `pct` = % total de presenca (ou null).
// Simplificado (30/10/2026, pra relatorio com os dados do irmao): sem a
// data de ingresso, sem a % e sem o "Nome de colete" embaixo - o nome ja
// vai em cima.
export function textoCarteirinha(m, ficha, pct, diaDeHoje, { simplificado = false } = {}) {
  const f = ficha || {};
  const ou = v => (v ? String(v) : '—');
  const idade = idadeEm(f.nascimento, diaDeHoje);
  const funcoes = (m.funcoes || []).map(funcaoPorChave).filter(Boolean).map(x => `${x.selo} ${x.label}`).join(' · ');
  const emergencia = f.emergenciaNome ? f.emergenciaNome + (f.emergenciaParentesco ? ` (${f.emergenciaParentesco})` : '') : '';
  return [
    '🪪 *CARTEIRINHA · INSANOS MC · REGIONAL RJ4*',
    '',
    `*${String(m.nome || '').toUpperCase()}*`,
    [m.grau ? `Grau ${m.grau}` : '', m.cargo, m.divisao].filter(Boolean).join(' · ') || '—',
    ...(funcoes ? [funcoes] : []),
    ...(simplificado ? [] : [`🗓️ ${textoIngresso(m.entrada || '')}`]),
    ...(simplificado || pct === null || pct === undefined ? [] : [`📊 Presença: ${pct}%`]),
    '',
    ...(simplificado ? [] : [`🧥 Nome de colete: ${ou(m.nome)}`]),
    `👤 Nome completo: ${ou(f.nomeCompleto)}`,
    `📞 Telefone: ${ou(f.telefone)}`,
    `🎂 Nascimento: ${f.nascimento ? formatDataBR(f.nascimento) + (idade !== null ? ` (${idade} anos)` : '') : '—'}`,
    `🆘 Emergência: ${ou(emergencia)}`,
    `🆘 Tel. emergência: ${ou(f.emergenciaTelefone)}`,
    `🩸 Tipo sanguíneo: ${ou(f.tipoSanguineo)}`,
    `🏥 Plano de saúde: ${ou(f.planoSaude)}`,
    `⚕️ Alergias e condições: ${ou(f.saude)}`,
  ].join('\n');
}
