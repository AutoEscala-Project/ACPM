// O cronograma do Piloto Privado (P.I PPA 001A) como curso do app, para os testes da próxima missão: o desenho dos
// cursos, apêndice A. As fases ficam na ordem impressa (a Fase 6, do voo noturno, entre a 8 e a 9, abre depois da
// Fase 4); a PE-04 (SPIN) é livre na Fase 5; a ADAPTAÇÃO AO CESSNA 152 é dispensada; o AV PROF. vem antes de cada SOLO.
// São 47 missões (46 contam), 45 h. Provisório: o modelo do curso no app (js/modelos-de-curso.js) toma o lugar dele.
const M01 = 'Módulo 01 – Treinamento Duplo Comando', M02 = 'Módulo 02 – Treinamento de Voo Solo', M03 = 'Módulo 03 – Avaliação';

const missao = (codigo, nome, mis, eq, nb, marcas = {}) => ({ codigo, nome, mis, eq, nb, ...marcas });
const local = (codigo, marcas) => missao(codigo, codigo, 'Voo Local', 'C152', 1, marcas);
const de1a5 = fazer => [1, 2, 3, 4, 5].flatMap(n => fazer(String(n).padStart(2, '0')));

// [número impresso, nome, módulo, missões, regra e requisitos (pelo número impresso)]
const FASES = [
  [1, 'Fase 1 – Introdução ao Voo', M01, [local('IN-01'), local('IN-02')]],
  [2, 'Fase 2 – O Controle da Aeronave', M01, [local('CT-01'), local('CT-02')]],
  [3, 'Fase 3 – A Coordenação de Atitude e Potência', M01, [local('CAP-01'), local('CAP-02'), local('CAP-03'), local('CAP-04', { avaliacao: true })]],
  [4, 'Fase 4 – Treinamento de Manobras e Aproximações', M01,
    [local('TMA-01'), local('TMA-02'), local('TMA-03'), local('TMA-04'), local('TMA-05', { avaliacao: true })]],
  [5, 'Fase 5 – Procedimentos Avançados e de Emergência', M01, [
    missao('NAV-01', 'NAV 01', 'Navegação', 'C152', 1.5), missao('NAV-02', 'NAV 02', 'Navegação', 'C152', 1.5),
    missao('NAV-150NM', 'NAV – 150NM', 'Navegação', 'C152', 3),
    local('PE-01'), local('PE-02'), local('PE-03', { avaliacao: true }),
    missao('PE-04', 'PE-04 – SPIN', 'Parafuso', 'C152', 1, { regra: 'livre' })
  ]],
  [7, 'Fase 7 – Treinamento de Voo Solo', M02, [
    missao('ADAPT-C152', 'ADAPTAÇÃO AO CESSNA 152', 'Voo Local', 'C152', 1, { dispensada: true }),
    missao('END-SOLO', 'ENDOSSO SOLO LOCAL', 'Voo Local', 'C152', 1),
    ...de1a5(n => [missao(`AVP-SOLO-${n}`, `AV PROF. SOLO ${n}`, 'Voo Local', 'C152', 0.3), missao(`SOLO-${n}`, `SOLO ${n}`, 'Voo Solo', 'C152', 1)])
  ]],
  [8, 'Fase 8 – Procedimentos de Navegação Solo', M02, [
    missao('END-SOLO-NAV', 'ENDOSSO SOLO NAV', 'Navegação', 'C152', 1),
    ...de1a5(n => [missao(`AVP-NSOLO-${n}`, `AV PROF. NAV SOLO ${n}`, 'Voo Local', 'C152', 0.3), missao(`NAV-SOLO-${n}`, `NAV SOLO ${n}`, 'Voo Solo', 'C152', 1)])
  ]],
  [6, 'Fase 6 – Treinamento de Voo Noturno', M02, [
    missao('TSL-01', 'TSL-01', 'Navegação', 'C172', 1), missao('NOT', 'NOT', 'Noturno', 'C172', 3), missao('TSL-02', 'TSL-02', 'Navegação', 'C172', 1)
  ], { regra: 'depois', requer: [4] }],
  [9, 'Fase 9 – Avaliação para Voo de Cheque', M03, [missao('AVX-CQ', 'AVX ENDOSSO CQ', 'Navegação', 'C152', 2)]]
];

const idDaFase = numero => `PP:F${numero}`;

// O curso PP no formato do programa (js/programa.js), novo a cada chamada (os testes podem mudá-lo)
export function cursoPP() {
  const fases = FASES.map(([numero, nome, modulo, , { regra = 'ordem', requer = [] } = {}], ordem) => ({
    id: idDaFase(numero), nome, modulo, ordem, regra, requer: requer.map(idDaFase), removida: false
  }));
  const missoes = FASES.flatMap(([numero, , , lista]) => lista.map(({ regra = 'ordem', dispensada = false, avaliacao = false, ...m }, ordem) => ({
    id: `PP:${m.codigo}`, fase: idDaFase(numero), ...m, ordem, regra, requer: [], dispensada, avaliacao, removida: false
  })));
  return { sigla: 'PP', nome: 'Piloto Privado', ordem: 0, ativo: true, fases, missoes };
}
