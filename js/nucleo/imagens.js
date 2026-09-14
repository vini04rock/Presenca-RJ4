// Caminhos das artes usadas nos cards (os arquivos vivem em img/).

export const LOGO_SRC = 'img/logo.png';
// Segundo passo: escolher o tipo de evento, dentro do escopo ja escolhido.
// "Todos os eventos" entra como opcao a mais, pra eventos sem tipo marcado
// (o campo e opcional na criacao) nao ficarem impossiveis de achar.
// Frase de efeito de cada tipo, so estetica (nao entra em nenhum calculo) -
// aparece embaixo do contador na tela de escolha de tipo.
// Arte de fundo do botao "Rank de Insights" da tela inicial (mesma logica
// do Rank de Presença - texto ja desenhado, so a seta em cima).
export const IMG_RANK_INSIGHTS = 'img/rank-insights.webp';

// Arte de fundo do botao "Rank de Presença" da tela inicial (texto ja
// desenhado - por isso o card nao repete o texto em HTML, so a seta).
export const IMG_RANK_PRESENCA = 'img/rank-presenca.webp';

// Arte generica de fundo pra qualquer divisao que nao seja Regional (so tem
// o rotulo "DIVISÃO" desenhado - o nome de cada divisao continua em HTML
// por cima, ver renderCardEscopo).
export const IMG_DIVISAO = 'img/divisao.webp';
// Arte de fundo do card "Regional" (nome/tagline ja desenhados) -
// reaproveitada nas 3 telas que listam divisoes (ver eventos, Modo
// organizador, Relatorios) via renderCardEscopo, logo abaixo.
export const IMG_REGIONAL = 'img/regional.webp';

// Arte de fundo do card "Eventos" da tela inicial (ja vem com o texto
// "Eventos"/"Ver eventos por divisão" desenhado - por isso esse card nao
// repete esse texto em HTML por cima, so a seta).
export const IMG_HOME_EVENTOS = 'img/home-eventos.webp';


// Arte de fundo do card "Modo organizador" da tela inicial (texto ja
// desenhado - por isso o card nao repete esse texto em HTML, so a seta).
export const IMG_MODO_ORGANIZADOR = 'img/modo-organizador.jpg';
export const IMG_RELATORIOS_HOME = 'img/relatorios-home.jpg';
export const IMG_CALENDARIO_HOME = 'img/calendario-home.jpg';
// Arte de fundo de cada tipo (base64, comprimida pra WebP bem pequeno - ver
// processo no historico do projeto) - alimentado aos poucos conforme cada
// arte for chegando. Tipo sem entrada aqui cai na cor solida (ver
// renderHomeTipos), sem imagem nenhuma.
export const TIPO_HOME_IMAGEM = {
  todos: 'img/tipo-todos.webp',
  'Bate e Volta': 'img/tipo-bate-e-volta.webp',
  'Pub': 'img/tipo-pub.webp',
  'Ação Social': 'img/tipo-acao-social.webp',
  'Reunião': 'img/tipo-reuniao.webp'
};
