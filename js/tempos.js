// Os nove inícios dos tempos de antes (as "Janelas de operação" até o formato 28), congelados: não abrem, não fecham e não
// decidem nenhum início. Leem estes só o w de uma linha da escala e as chaves das turmas de Ground (periodoDoMinuto,
// js/horarios.js), a leitura dos dados antigos (a preferência de 0 a 8, o "hN", o win e o aw) e, até o passo C, a grade
// dos instrutores (aw). Os outros módulos os leem por js/horarios.js (INICIOS_DOS_TEMPOS). Este módulo não importa nada:
// js/format.js também o lê, e js/horarios.js importa js/format.js
export const INICIOS_DOS_TEMPOS = Object.freeze([390, 500, 610, 690, 760, 820, 870, 980, 1050]);
