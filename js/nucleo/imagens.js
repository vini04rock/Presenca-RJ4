// Caminhos das artes usadas nos cards (os arquivos vivem em img/).

export const LOGO_SRC = 'img/logo.webp';
// A foto de fundo do app (no CSS, body::before) - aqui pras imagens de
// compartilhar, que desenham o mesmo fundo (ui/imagem.js).
export const IMG_FUNDO = 'img/fundo.jpg';
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


// Arte de fundo do card "Calendario" da tela inicial (texto ja desenhado).
// Redesenhada em 21:9 (1200x515) em 23/09/2026, junto com a do card Eventos:
// os dois sao os cards GRANDES da tela, e o banner antigo de 4.84:1 nao
// cabia na altura nova sem ser cortado no meio do titulo.
export const IMG_CALENDARIO_HOME = 'img/calendario-home.webp';

// Artes dos cards de area do menu do organizador (ADM, Operacional e
// Social), com titulo, descricao, icone e seta ja desenhados (20/10/2026).
export const IMG_AREAS = {
  adm: 'img/area-adm.webp',
  operacional: 'img/area-operacional.webp',
  social: 'img/area-social.webp',
};

// Artes dos cards de secao dentro de cada area do organizador (21/10/2026):
// as versoes antigas dos cards Eventos e Rank de Insights, com o texto
// desenhado APAGADO - o card escreve o proprio nome e descricao no lugar.
// largura/altura: a proporcao da arte (o card nao corta nada); texto: onde
// o texto comeca e quanto ocupa, em % da largura; cores: nome e descricao,
// no tom da arte. Secao sem entrada aqui fica com o card de sempre.
export const IMG_SECOES = {
  eventos: { src: 'img/secao-eventos.webp', largura: 900, altura: 179, texto: [13, 40], cores: ['#F3E6C4', '#C9C2B4'] },
  insights: { src: 'img/secao-insights.webp', largura: 900, altura: 172, texto: [25.5, 46], cores: ['#E6F0FF', '#8FB7E8'] },
};

// Arte do botao "Modo organizador", no rodape da tela inicial (engrenagem,
// texto e seta ja desenhados - por isso o botao nao repete nada em HTML).
// 4:1, a proporcao em que ele foi desenhado; e o menor elemento da tela
// (~180px no computador, ~115px no celular), entao a arte foi composta
// "grande", com o texto ocupando boa parte da altura.
export const IMG_MODO_ORGANIZADOR = 'img/modo-organizador.webp';
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
