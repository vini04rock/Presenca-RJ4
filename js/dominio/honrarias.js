// Avisos das medalhas por tempo de clube. A data ja vive no cadastro do
// integrante; daqui saem apenas os proximos marcos que cabem na janela do
// mural, sem gravar estado novo na planilha.

import { escopoPorChave } from '../nucleo/config.js';

export const ANOS_HONRARIAS = [3, 6, 9];
export const DIAS_ANTES_HONRARIA = 60;
export const DIAS_DEPOIS_HONRARIA = 30;

function partesData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const p = { ano:Number(m[1]), mes:Number(m[2]), dia:Number(m[3]) };
  const d = new Date(p.ano, p.mes - 1, p.dia);
  return d.getFullYear() === p.ano && d.getMonth() === p.mes - 1 && d.getDate() === p.dia ? p : null;
}

function bissexto(ano) { return ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0); }
const dois = n => String(n).padStart(2, '0');

// Quem entrou em 29/02 completa a honraria em 28/02 quando o ano do marco
// nao e bissexto. Date.setFullYear usaria 01/03, por isso a regra e explicita.
export function dataDaHonraria(entradaISO, anos) {
  const p = partesData(entradaISO);
  if (!p || !ANOS_HONRARIAS.includes(Number(anos))) return '';
  const ano = p.ano + Number(anos);
  const dia = p.mes === 2 && p.dia === 29 && !bissexto(ano) ? 28 : p.dia;
  return `${ano}-${dois(p.mes)}-${dois(dia)}`;
}

function isoDaBase(base) {
  return `${base.getFullYear()}-${dois(base.getMonth() + 1)}-${dois(base.getDate())}`;
}

function diasEntre(deISO, ateISO) {
  const de = partesData(deISO), ate = partesData(ateISO);
  if (!de || !ate) return null;
  return Math.round((Date.UTC(ate.ano, ate.mes - 1, ate.dia) - Date.UTC(de.ano, de.mes - 1, de.dia)) / 86400000);
}

function proximaHonraria(membro, hoje) {
  const entrada = partesData(membro && membro.entrada);
  if (!entrada || diasEntre(hoje, membro.entrada) > 0) return null;
  for (const anos of ANOS_HONRARIAS) {
    const data = dataDaHonraria(membro.entrada, anos);
    const dias = diasEntre(hoje, data);
    if (dias >= -DIAS_DEPOIS_HONRARIA && dias <= DIAS_ANTES_HONRARIA) {
      return { membro, anos, data, dias };
    }
  }
  return null;
}

// A divisao ve os proprios integrantes. O Regional coordena as honrarias de
// toda a RJ4, por isso recebe o cadastro inteiro, inclusive os afastados.
// Desligados ja nao existem em Membros e portanto nao entram.
export function alertasHonrarias(membros, escopo, base = new Date()) {
  const hoje = isoDaBase(base);
  const nomeEscopo = escopoPorChave(escopo).nome;
  return (membros || [])
    .filter(m => escopo === 'regional' || m.divisao === nomeEscopo)
    .map(m => proximaHonraria(m, hoje))
    .filter(Boolean)
    .sort((a, b) => {
      // Quem ja completou vem antes; entre os futuros, o mais proximo vem
      // primeiro. Nome desempata para a ordem nao piscar entre desenhos.
      const grupoA = a.dias <= 0 ? 0 : 1, grupoB = b.dias <= 0 ? 0 : 1;
      return grupoA - grupoB || a.dias - b.dias || a.membro.nome.localeCompare(b.membro.nome);
    });
}

export function textoPrazoHonraria(dias) {
  if (dias === 0) return 'Completa hoje';
  if (dias === 1) return 'Completa amanhã';
  if (dias > 1) return `Completa em ${dias} dias`;
  if (dias === -1) return 'Completou há 1 dia';
  return `Completou há ${Math.abs(dias)} dias`;
}
