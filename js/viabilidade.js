// Regras de viabilidade da escala: o que torna possível pôr um voo num horário, num recurso e com um instrutor.
// O motor (com a divisão das horas e a troca de matrículas), a compactação e as sugestões de reparo usam as mesmas
// regras.
import { REVISAO_H, AIRCRAFT_EQ_TYPES, DEFAULT_LIM } from './config.js';
import { disponivelPara } from './disponibilidade.js';
import { podeFazer, faltaDaMissaoDoCurso, PREFIXO_DA_MISSAO_DO_CURSO } from './habilitacoes.js';
import { instrutorVoaNoAviao, habilitacaoQueFalta } from './frota.js';
import { dentroDosLimites } from './limites.js';
import { reducaoNecessaria } from './combustivel.js';
import { tiraOAlmoco } from './almoco.js';

// Dois intervalos (em minutos) se sobrepõem quando um começa antes de o outro terminar; encostar não conta
export const sobrepoe = (a1, b1, a2, b2) => a1 < b2 && b1 > a2;

// Nenhum dos intervalos ocupados ([início, fim]) se sobrepõe ao voo
export const livre = (ocupados, a, b) => !(ocupados || []).some(([x, y]) => sobrepoe(a, b, x, y));

// O voo cabe no saldo de horas do avião até a revisão de 50 horas (sem o saldo informado, Infinity)
export const cabeNoSaldo = (horasNoDia, h, saldo) => horasNoDia + h <= saldo + 1e-9;

// As horas que o avião ainda pode voar até a revisão de 50 horas (sem as horas informadas, não há limite)
export const saldoAteARevisao = (horas, r) => (typeof (horas || {})[r] === 'number' ? REVISAO_H - horas[r] : Infinity);

// A folga entre um voo e o que o avião já voa: 0 se encosta ou se sobrepõe; Infinity se o avião ainda está no hangar
export const folgaAte = (ocupados, a, b) => ocupados.reduce((menor, [x, y]) => Math.min(menor, y <= a ? a - y : x >= b ? x - b : 0), Infinity);

// Se o instrutor pode assumir um compromisso (voo, simulador ou aula de Ground): as regras, na ordem em que o motor as
// confere, devolvem os problemas ({ codigo, motivo }, com os códigos dos conflitos): só o primeiro, ou todos (todos:
// true, para os conflitos da escala aprovada).
// O compromisso: a missão, o tipo (a sala de Ground na aula), o horário, o intervalo efetivo (o atrasado ocupa o horário novo:
// vale para a lei), os alunos (o "Não escalar com" de cada um), o peso do aluno, o curso do aluno (o Noturno do PC exige
// IFR), o recurso, quando já se sabe qual (o avião com habilitação própria exige a dele), e o que a missão do curso do
// pedido exige do INVA (exige).
// compromissos: os que o instrutor já tem no dia ({ a, b, voo }, e ocupaDe/ocupaAte quando ocupa mais que o voo, como a
// volta do noturno: a lei conta o voo, e o instrutor está ocupado no intervalo maior). jaOcupa: ele já está neste compromisso (o aluno que
// entra na turma dele), então a ocupação e a lei não mudam. peso: null não confere; reducaoMaxima é o combustível a
// menos aceito (0: só o tanque cheio) e exigirPesoDoInstrutor recusa o instrutor sem peso quando o peso importa.
// almoco (#104, só o motor: js/engine.js, a compactação e o pareamento do “Priorizar com”): { guarda, horas, recusou },
// os ids dos INVAs com o almoço do motor (js/almoco.js), a hora reservada de alguns deles ({ de, ate }) e o que anota cada
// recusa (o motor conta para saber se ela mudou alguma coisa, e de quem); a última regra, depois das duras: o compromisso
// não leva a última hora livre de 11:00 a 14:00 de um INVA da guarda (com a hora reservada, não toca nela). Sem almoco, não
// confere (a conferência dos fixos, os candidatos, as sugestões e o instrutor escolhido não o leem: a escolha do operador
// vale, e a Escala mostra o aviso)
export function problemasDoInstrutor(x, { mis, tipo, a, b, efetivo = { a, b }, alunos = [], stuKg = 0, curso, recurso, exige },
  { compromissos = [], historico = null, limites, jaOcupa = false, peso = {}, todos = false, almoco = null }) {
  if (!x) return [{ codigo: 'instrutor-saiu' }];
  const { reducaoMaxima = Infinity, exigirPesoDoInstrutor = false } = peso || {};
  const pesoServe = () => {
    if (!peso || !stuKg || !DEFAULT_LIM[tipo]) return true;
    if (!x.kg) return !exigirPesoDoInstrutor;
    const reducao = reducaoNecessaria({ stuKg, insKg: x.kg, tipo, minutos: b - a, mis });
    return reducao < Infinity && reducao <= reducaoMaxima;
  };
  const dentroDaLei = () => {
    if (jaOcupa) return true;
    const lei = dentroDosLimites({ compromissos, novo: { ...efetivo, voo: AIRCRAFT_EQ_TYPES.includes(tipo) }, historico, limites });
    return lei.ok || { motivo: lei.motivo };
  };
  const ocupados = () => compromissos.map(c => [c.ocupaDe ?? c.a, c.ocupaAte ?? c.b]);
  // Com a hora reservada (almoco.horas, a que o motor tenta quando a busca de um pedido por vez deixou o INVA sem ela), o
  // compromisso não a toca enquanto ela estiver livre; sem ela, não leva a última hora livre
  const guardaOAlmoco = () => {
    if (!almoco || jaOcupa || !almoco.guarda.has(x.id)) return true;
    const hora = almoco.horas ? almoco.horas.get(x.id) : null;
    const tira = hora && livre(ocupados(), hora.de, hora.ate) ? sobrepoe(a, b, hora.de, hora.ate) : tiraOAlmoco(ocupados(), a, b);
    if (!tira) return true;
    almoco.recusou(x.id);
    return false;
  };
  const regras = [
    // Ele vem, e o compromisso começa dentro de uma faixa da data sem tocar uma pausa (a regra do início, C), ou nas do aw
    // onde não há faixas
    ['instrutor-indisponivel', () => disponivelPara(x, a, b)],
    // A habilitação da missão e do tipo; com o contexto, a do curso do aluno, a própria do avião e a que a missão do curso
    // exige (o motivo diz qual faltou: a do avião, a do curso, a da missão do curso)
    ['habilitacao', () => (!podeFazer(x, mis, tipo) ? false : podeFazer(x, mis, tipo, { curso, recurso, exige }) ||
      { motivo: recurso && !instrutorVoaNoAviao(x, recurso) ? habilitacaoQueFalta(x, recurso)
        : !podeFazer(x, mis, tipo, { curso }) || !faltaDaMissaoDoCurso(x, exige) ? 'curso' : `${PREFIXO_DA_MISSAO_DO_CURSO}${faltaDaMissaoDoCurso(x, exige)}` })],
    ['instrutor-ocupado', () => jaOcupa || livre(ocupados(), a, b)],
    ['bloqueio', () => !alunos.some(s => s && (s.bl || []).includes(x.id))],
    ['limite-da-lei', dentroDaLei],
    ['peso', pesoServe],
    ['almoco', guardaOAlmoco]
  ];
  const problemas = [];
  for (const [codigo, cumpre] of regras) {
    const resultado = cumpre();
    if (resultado === true) continue;
    problemas.push({ codigo, ...(resultado && resultado.motivo ? { motivo: resultado.motivo } : {}) });
    if (!todos) break;
  }
  return problemas;
}
