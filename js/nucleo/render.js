// Interruptor de redesenho.
//
// O roteador de verdade (aquele que olha state.view e escolhe a tela) vive
// no app.js, porque e ele quem conhece todas as telas. Se os modulos
// importassem o roteador direto, daria ciclo: tela -> roteador -> tela.
// Aqui fica so o interruptor - qualquer modulo pede um redesenho sem
// precisar saber que telas existem.
let desenhar = () => {};

// Chamado uma unica vez pelo app.js, na partida.
export function definirRender(fn) { desenhar = fn; }

export function render() { return desenhar(); }
