// Os modelos de curso: um programa pronto (as fases, na ordem, e as missões de cada uma) que o Administrador põe num curso
// na aba Cursos ("Usar o cronograma do PP", ou "+ Novo curso" começando por ele). Nada entra sozinho: o modelo só vale
// quando alguém o escolhe (aplicarModelo e novoCurso, em js/programa.js). Cada fase tem uma chave (a de "depois de…" das
// outras); cada missão, o código. Os ids das fases e das missões são dados quando o modelo entra num curso.
//
// O cronograma do Piloto Privado (P.I PPA 001A), como a ficha impressa: as fases na ordem impressa (a Fase 6, do voo
// noturno, entre a 8 e a 9, abre depois da Fase 4); a PE-04 (SPIN) é livre na Fase 5; a ADAPTAÇÃO AO CESSNA 152 é
// dispensada; o AV PROF. vem antes de cada SOLO; o TSL-01, o NOT e o TSL-02 são o Noturno de dois dias em trechos (a ida
// para BH, a noite em BH e a volta do dia seguinte: um voo só). São 9 fases e 47 missões (46 contam), 45 h.
const M01 = 'Módulo 01 – Treinamento Duplo Comando', M02 = 'Módulo 02 – Treinamento de Voo Solo', M03 = 'Módulo 03 – Avaliação';

const missao = (codigo, nome, mis, eq, nb, marcas = {}) => ({ codigo, nome, mis, eq, nb, ...marcas });
const local = (codigo, marcas) => missao(codigo, codigo, 'Voo Local', 'C152', 1, marcas);
const noturno = (codigo, nb, trecho) => missao(codigo, codigo, 'Noturno', 'C172', nb, { trecho });
const de1a5 = fazer => ['01', '02', '03', '04', '05'].flatMap(fazer);
const fase = (chave, nome, modulo, missoes, regra = {}) => ({ chave, nome, modulo, ...regra, missoes });

// O modelo e tudo dentro dele não mudam
const congelado = v => {
  if (v && typeof v === 'object') Object.values(v).forEach(congelado);
  return Object.freeze(v);
};

// Cada modelo: o nome, o documento de onde vem, o curso para o qual foi feito (a sigla: o botão aparece nele) e as fases
// na ordem do curso. Na fase, a regra e os requisitos (as chaves das fases anteriores) podem faltar (depois das
// anteriores); na missão, a regra, "dispensada", "avaliação" e o trecho do Noturno
export const MODELOS = congelado({
  'pp-acpm': {
    nome: 'Cronograma do Piloto Privado',
    documento: 'P.I PPA 001A',
    curso: 'PP',
    fases: [
      fase('F1', 'Fase 1 – Introdução ao Voo', M01, [local('IN-01'), local('IN-02')]),
      fase('F2', 'Fase 2 – O Controle da Aeronave', M01, [local('CT-01'), local('CT-02')]),
      fase('F3', 'Fase 3 – A Coordenação de Atitude e Potência', M01, [local('CAP-01'), local('CAP-02'), local('CAP-03'), local('CAP-04', { avaliacao: true })]),
      fase('F4', 'Fase 4 – Treinamento de Manobras e Aproximações', M01,
        [local('TMA-01'), local('TMA-02'), local('TMA-03'), local('TMA-04'), local('TMA-05', { avaliacao: true })]),
      fase('F5', 'Fase 5 – Procedimentos Avançados e de Emergência', M01, [
        missao('NAV-01', 'NAV 01', 'Navegação', 'C152', 1.5), missao('NAV-02', 'NAV 02', 'Navegação', 'C152', 1.5),
        missao('NAV-150NM', 'NAV – 150NM', 'Navegação', 'C152', 3),
        local('PE-01'), local('PE-02'), local('PE-03', { avaliacao: true }),
        missao('PE-04', 'PE-04 – SPIN', 'Parafuso', 'C152', 1, { regra: 'livre' })
      ]),
      fase('F7', 'Fase 7 – Treinamento de Voo Solo', M02, [
        missao('ADAPT-C152', 'ADAPTAÇÃO AO CESSNA 152', 'Voo Local', 'C152', 1, { dispensada: true }),
        missao('END-SOLO', 'ENDOSSO SOLO LOCAL', 'Voo Local', 'C152', 1),
        ...de1a5(n => [missao(`AVP-SOLO-${n}`, `AV PROF. SOLO ${n}`, 'Voo Local', 'C152', 0.3), missao(`SOLO-${n}`, `SOLO ${n}`, 'Voo Solo', 'C152', 1)])
      ]),
      fase('F8', 'Fase 8 – Procedimentos de Navegação Solo', M02, [
        missao('END-SOLO-NAV', 'ENDOSSO SOLO NAV', 'Navegação', 'C152', 1),
        ...de1a5(n => [missao(`AVP-NSOLO-${n}`, `AV PROF. NAV SOLO ${n}`, 'Voo Local', 'C152', 0.3), missao(`NAV-SOLO-${n}`, `NAV SOLO ${n}`, 'Voo Solo', 'C152', 1)])
      ]),
      fase('F6', 'Fase 6 – Treinamento de Voo Noturno', M02, [noturno('TSL-01', 1, 'ida'), noturno('NOT', 3, 'noite'), noturno('TSL-02', 1, 'volta')],
        { regra: 'depois', requer: ['F4'] }),
      fase('F9', 'Fase 9 – Avaliação para Voo de Cheque', M03, [missao('AVX-CQ', 'AVX ENDOSSO CQ', 'Navegação', 'C152', 2)])
    ]
  }
});
