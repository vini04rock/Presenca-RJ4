// O Calendario do mes em texto, pro WhatsApp (o "📋 Copiar pro WhatsApp" da
// tela do Calendario). Os mesmos eventos e a mesma ordem da imagem do mes
// (ui/calendario-imagem.js): por data, horario e nome.
//
// No formato que o clube ja usava no grupo (19/10/2026): um bloco por dia,
// "📍 Dia 07 · Ter", e embaixo os eventos -
//   - de divisao: "🍻 Div. Barra: Pub";
//   - do Regional: o nome em destaque, "🏍️ *BATE E VOLTA - SERRA*";
//   - mais de um no mesmo dia: um por linha, com "•".
// `diasVazios` = do dia 1 ao ultimo, com os sem evento em branco (o
// "Relatar dias vazios"); sem ele, so os dias que tem alguma coisa.

import { NOMES_MESES, emojiTipoEvento, escopoPorChave } from '../nucleo/config.js';

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const dois = n => String(n).padStart(2, '0');

// "Barra", "Gardênia" - o nome sem o " - RJ4".
const nomeCurto = chave => escopoPorChave(chave).nome.split(' - ')[0];

function linhaEvento(ev) {
  const emoji = emojiTipoEvento(ev.tipo);
  const texto = ev.categoria === 'regional'
    ? `*${String(ev.nome || ev.tipo).trim().toUpperCase()}*`
    : `Div. ${nomeCurto(ev.categoria)}: ${ev.tipo}`;
  return emoji ? `${emoji} ${texto}` : texto;
}

export function textoCalendario({ ano, mes, escopo, eventos, diasVazios }) {
  const prefixo = `${ano}-${dois(mes + 1)}-`;
  const lista = (eventos || []).filter(ev => ev.data && ev.data.startsWith(prefixo))
    .slice().sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || '')
      || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  const porDia = {};
  lista.forEach(ev => { (porDia[Number(ev.data.slice(8, 10))] = porDia[Number(ev.data.slice(8, 10))] || []).push(ev); });

  const partes = [
    `📝 *CALENDÁRIO · ${NOMES_MESES[mes].toUpperCase()}/${ano}*`,
    `*${escopoPorChave(escopo).nome.toUpperCase()}*`,
  ];
  if (!lista.length && !diasVazios) {
    partes.push('', 'Nenhum evento marcado.');
    return partes.join('\n');
  }
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const doDia = porDia[dia];
    if (!doDia && !diasVazios) continue;
    const semana = DIAS_DA_SEMANA[new Date(ano, mes, dia).getDay()];
    partes.push('', `📍 *Dia ${dois(dia)} · ${semana}*`);
    if (!doDia) continue;
    if (doDia.length === 1) partes.push(linhaEvento(doDia[0]));
    else doDia.forEach(ev => partes.push('• ' + linhaEvento(ev)));
  }
  return partes.join('\n');
}
