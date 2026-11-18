// O voo agendado pelo operador na Escala ("+ Agendar voo"; o diálogo é js/views/agendamento.js): um pedido do aluno (o
// principal, quando ele não voa e o dia não guarda nada da chave dele; senão, uma missão extra) e o voo fixo com a marca
// agendado (js/fixos.js), no horário, no recurso e com o instrutor que o operador confirmou. O que o operador define vale
// mais que a escolha do app: o pedido também guarda o instrutor (insId), como a escolha na Escala.
// O diálogo sugere o resto: a missão, pelo progresso do aluno e pelas regras do programa (js/progresso.js); o recurso e o
// instrutor, pelos candidatos do horário contra os voos fixos (js/candidatos.js: o motor encaixa os outros em volta); o
// horário, pelo contexto (a barra da Escala: o primeiro horário livre); a duração, pela missão; o peso, pelo cadastro de
// cada um. A conferência roda o motor numa cópia do estado, com a mesma função que grava (aplicarAgendamento): o que o
// motor marcaria como conflito, no voo novo ou num voo que não estava em conflito, não deixa agendar; as regras do curso,
// as que o motor não confere nos voos fixos, o peso que falta e o voo que sai da escala pedem uma confirmação; o resto é
// informação. Tudo aqui é puro: a tela só desenha o que sai daqui.
import { MIS, T, NI, DAY, GROUND_EQ_TYPE, GROUND_REG, GROUND_DURATION_MIN, DEFAULT_LIM, MINUTOS_DO_DIA, NOTURNO } from './config.js';
import {
  alvoDoNovoPedido, normalizeMissionFields, duracaoFixaDaMissao, duracaoPadraoDaMissao, duracaoValida, duracaoDigitada, isGroundMission,
  disponibilidadeDoAluno, pesoDigitado, ERRO_DA_DURACAO, ERRO_DO_PESO
} from './rules.js';
import { horariosDaMissao, periodoDoMinuto, paraMinuto } from './horarios.js';
import { ocupacaoDaEscala, avioesQueServem, instrutoresQueServem, problemaDoRecurso, problemaDoAluno } from './candidatos.js';
import { estadoDoAluno, proximasMissoes, progressoNoCurso, missoesDoDia } from './progresso.js';
import { indiceDoPrograma, percursoDoCurso, rotuloDaFase } from './programa.js';
import { chaveDoVoo, statusDoVoo, pedidoDoAluno, ocupacaoDoVoo } from './voo.js';
import { CAMPOS_DO_PEDIDO } from './dias.js';
import { runAllocationEngine } from './engine.js';
import { CODIGOS_DO_AGENDADO, GRUPO_DO_CONFLITO } from './conflitos.js';
import { pesoECombustivel, textoDoCombustivel } from './combustivel.js';
import { NOTA_DO_PROBLEMA } from './instrutor-escolhido.js';
import { sobrepoe } from './viabilidade.js';
import { hm, fmtH, numeroBr, rotuloDaData } from './format.js';
import { nomeDoRecurso } from './categorias.js';
import { categoriaDoRodizio, ajustarFilas } from './rodizio.js';
import { FROTA_INICIAL, recursoDaFrota, motivoDoAviao } from './frota.js';
import { podeFazer } from './habilitacoes.js';
import { ehDomingo } from './agenda.js';

const frotaDo = estado => (Array.isArray(estado.frota) ? estado.frota : FROTA_INICIAL);
const ativo = (o, fStatus) => statusDoVoo(o, fStatus) !== 'Cancelado';
const pedidosQueVoam = stu => [stu, ...(stu.extra || [])].filter(p => p.fly);
const porNome = (x, y) => x.nm.localeCompare(y.nm, 'pt-BR') || x.id - y.id;
const maiuscula = texto => texto.charAt(0).toUpperCase() + texto.slice(1);
const minuscula = texto => texto.charAt(0).toLowerCase() + texto.slice(1);
// "A", "A e B", "A, B e C"
const juntar = lista => (lista.length < 2 ? lista.join('') : `${lista.slice(0, -1).join(', ')} e ${lista.at(-1)}`);
const ddmm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const camposDoPedido = p => Object.fromEntries(CAMPOS_DO_PEDIDO.filter(c => p[c] !== undefined).map(c => [c, p[c]]));
const rotuloDoVoo = o => (o.mid ? `${o.s} (${o.mis})` : o.s);

// ---------------------------------------------------------------------------------------------------------------------
// O contexto e os horários

// O contexto de onde o diálogo abriu (data-agendar): a barra da Escala ('dia'), a linha de um recurso ('r:PR-VOB') ou de
// um instrutor ('i:7') no mapa, um horário da lista ('w:2'), a turma de Ground ('t:<turma>'), ou o clique no mapa
// ({ r ou insId, minuto }). minuto: de onde a busca do horário parte; desde e ate: os limites dela (null: sem limite);
// perto: o horário mais perto do minuto (o clique), senão o primeiro livre a partir dele. Na data de hoje, a partir de agora
export function contextoInicial(valor, { data, hoje, agora = 0 } = {}) {
  const agoraNaData = data === hoje ? agora : null;
  const contexto = {
    valor: typeof valor === 'string' ? valor : null, origem: 'dia', r: null, insId: null, classKey: null, w: null,
    minuto: agoraNaData ?? 0, desde: agoraNaData, ate: null, perto: false
  };
  if (valor && typeof valor === 'object') {
    return {
      ...contexto, origem: 'mapa', r: typeof valor.r === 'string' ? valor.r : null, insId: Number.isInteger(valor.insId) ? valor.insId : null,
      minuto: Number.isInteger(valor.minuto) ? valor.minuto : contexto.minuto, desde: null, perto: true
    };
  }
  const [tipo, ...resto] = String(valor || 'dia').split(':');
  const arg = resto.join(':');
  if (tipo === 'r' && arg) return { ...contexto, origem: 'recurso', r: arg };
  if (tipo === 'i' && /^\d+$/.test(arg) && +arg > 0) return { ...contexto, origem: 'instrutor', insId: +arg };
  if (tipo === 'w' && /^[0-8]$/.test(arg)) {
    const w = +arg;
    return { ...contexto, origem: 'periodo', w, minuto: T[w], desde: T[w], ate: w < NI ? T[w + 1] : MINUTOS_DO_DIA };
  }
  if (tipo === 't' && arg) return { ...contexto, origem: 'turma', classKey: arg };
  return contexto;
}

// Os horários de decolagem do agendamento: o Ground, só nas janelas do dia (T[0] a T[7]); o resto, os da missão no tipo
// (o Noturno às 17:30, o Voo Solo às 06:30, o PA-34 de 30 em 30 minutos, os outros, a lista da categoria). Só os que caem
// numa janela de operação aberta nesta data
export function horariosDoAgendamento(estado, { mis, tipo }) {
  const lista = isGroundMission(mis) ? DAY.map(w => T[w]) : horariosDaMissao(estado.horarios, mis, tipo);
  return lista.filter(m => !Array.isArray(estado.win) || estado.win[periodoDoMinuto(m)]);
}

// O horário da lista mais perto do minuto em que a linha (o recurso ou o instrutor) está livre (livre(horário)); no
// empate, o mais cedo; nenhum livre, o mais perto. Sem horários, null
export function encaixarHorario(minuto, lista, livre = () => true) {
  const naOrdem = [...lista].sort((x, y) => Math.abs(x - minuto) - Math.abs(y - minuto) || x - y);
  return naOrdem.find(m => livre(m)) ?? naOrdem[0] ?? null;
}

// As horas do voo agendado: a duração que não muda (o Ground, 1h30; o Noturno, 4 h no dia), a da missão do programa, a
// do pedido que muda de lugar, a padrão da missão (o simulador, 2 h) ou 1 h. fixa: o campo fica travado
export function duracaoDoAgendamento({ mis, missao = null, pedido = null }) {
  const fixa = duracaoFixaDaMissao(mis);
  if (fixa) return { horas: fixa, fixa: true };
  return { horas: duracaoValida((missao && missao.nb) || (pedido && pedido.nb) || duracaoPadraoDaMissao(mis)), fixa: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// A ocupação do dia: os voos fixos (que o agendamento não tira do lugar) e todos (os outros, o motor reorganiza)

// Os voos da escala na ordem em que o motor confere os fixos (js/engine.js): a volta do noturno de ontem, os fixos pelo
// status, pela escala aprovada e pelo instrutor escolhido, os agendados e os outros; em cada grupo, a ordem dos pedidos do
// motor (o Ground antes, o instrutor escolhido, a prioridade, o "Priorizar com", a agenda, o cadastro e a missão). A turma
// de Ground ocupa a sala e o instrutor pelo primeiro aluno dela que o motor confere (js/candidatos.js)
export function naOrdemDoMotor(estado, out) {
  const fixos = estado.fixos || {};
  const alunos = new Map(estado.stu.map((s, i) => [s.id, { s, i }]));
  const noCadastro = new Set(estado.ins.map(x => x.id));
  const chave = o => {
    const { s, i } = alunos.get(o.stuId) || {};
    const ref = s && !o.trecho ? pedidoDoAluno(s, o.mid || 0) : null;
    if (!ref) return [o.trecho ? 0 : 4];
    const pino = fixos[o.fKey];
    return [
      !pino ? 3 : pino.agendado ? 2 : 1, isGroundMission(ref.mis) ? 0 : 1, ref.insId && noCadastro.has(ref.insId) ? 0 : 1, -(ref.pr || 3),
      (s.voaCom || []).length ? 0 : 1, Number.isInteger(ref.solicitacao) ? ref.solicitacao : Infinity, i,
      o.mid ? (s.extra || []).findIndex(ex => ex.mid === o.mid) + 1 : 0
    ];
  };
  const comparar = (p, q) => {
    for (let k = 0; k < Math.max(p.length, q.length); k++) {
      const x = p[k] ?? 0, y = q[k] ?? 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  };
  return out.map((o, k) => ({ o, k, c: chave(o) })).sort((p, q) => comparar(p.c, q.c) || p.k - q.k).map(p => p.o);
}

// Calculada uma vez por escala (a base do diálogo)
const ocupacoesDaBase = new WeakMap();
function ocupacoes(estado, base) {
  if (!ocupacoesDaBase.has(base)) {
    const voos = naOrdemDoMotor(estado, base.out);
    const opcoes = { fStatus: estado.fStatus || {}, fObs: estado.fObs || {}, efetivo: true };
    ocupacoesDaBase.set(base, { fixos: ocupacaoDaEscala(voos, { ...opcoes, soFixos: true }), todos: ocupacaoDaEscala(voos, opcoes) });
  }
  return ocupacoesDaBase.get(base);
}

const sobrepoeVoo = (a, b) => o => sobrepoe(a, b, ...ocupacaoDoVoo(o));
const ocupaDaLista = (mapa, chave, a, b) => (mapa.get(chave) || []).find(sobrepoeVoo(a, b)) || null;
const textoDoVooFixo = o => (o.trecho === 'volta' ? `volta do noturno (livre às ${hm(o.livreAs)})`
  : o.isGround ? `turma fixa ${hm(o.a)}–${hm(o.b)} (${o.mis})` : `voo fixo ${hm(o.a)}–${hm(o.b)} (${o.s})`);

// ---------------------------------------------------------------------------------------------------------------------
// O curso do aluno: a próxima missão, o progresso e por que uma missão está fora da ordem

// O programa do aluno (null: sem curso, ou o curso não está no programa)
const cursoDoAluno = (ambiente, stu) => (stu && stu.curso && indiceDoPrograma(ambiente.programa || []).curso(stu.curso)) || null;

// As missões do curso que o aluno já tem no dia (os pedidos dele que voam, menos os cancelados: não são sugeridas de
// novo), as dos voos dele na escala que terminam até o horário a (contam como feitas sob condição: dependem do resultado)
// e o voo de cada uma (pelo id da missão)
function missoesNoDia(estado, base, curso, stu, a) {
  const idDe = new Map(curso.missoes.map(m => [m.codigo, m.id]));
  const voos = base.out.filter(o => o.stuId === stu.id && o.etapa && !o.trecho && ativo(o, estado.fStatus) && idDe.has(o.etapa));
  return {
    exceto: missoesDoDia(curso, stu, { fStatus: estado.fStatus }),
    planejadas: new Set(voos.filter(o => o.b <= a).map(o => idDe.get(o.etapa))),
    voos: new Map(voos.map(o => [idDe.get(o.etapa), o]))
  };
}

// A preferência de cada missão pelo contexto (a linha clicada no mapa): no recurso, 2 quando o programa faz a missão no
// tipo dele (o Ground na sala; o avião Só Parafuso só para o Parafuso), 1 quando a missão só permite o tipo (o voo fica
// com a missão do curso, com aviso) e 0 quando o recurso não serve; no instrutor, 2 quando ele pode dar a missão. Sem
// contexto, todas iguais (a primeira candidata). curso: a sigla (o Noturno do PC é IFR: só no avião homologado IFR, com
// o instrutor IFR)
function preferenciaDoContexto(estado, contexto, curso) {
  if (contexto.r === GROUND_REG) return m => (isGroundMission(m.mis) ? 2 : 0);
  if (contexto.r) {
    const recurso = recursoDaFrota(frotaDo(estado), contexto.r);
    return m => {
      if (!recurso || isGroundMission(m.mis) || !MIS[m.mis].eq.includes(recurso.tipo)) return 0;
      if (motivoDoAviao(recurso, { mis: m.mis, eq: recurso.tipo, curso })) return 0;
      return m.eq === recurso.tipo ? 2 : 1;
    };
  }
  if (contexto.insId) {
    const x = estado.ins.find(i => i.id === contexto.insId);
    return m => (x && podeFazer(x, m.mis, isGroundMission(m.mis) ? GROUND_EQ_TYPE : m.eq, { curso }) ? 2 : 0);
  }
  return () => 2;
}

// Por que a missão está fora da ordem (nas opções e no aviso): a missão do dia que voa depois ("PE-01 voa depois, às
// 13:40"), as fases que ela espera ("a Fase 6 abre depois da Fase 4: faltam TMA-04 e TMA-05") ou as missões que faltam
// ("falta PE-03 (reprovada em 14/11)")
function motivoDaMissao(curso, ambiente, stu, m, info, voosDoDia) {
  const porId = new Map(curso.missoes.map(x => [x.id, x]));
  const listar = ids => {
    const codigos = ids.map(id => porId.get(id).codigo);
    return codigos.length <= 3 ? juntar(codigos) : `${codigos.slice(0, 3).join(', ')} e mais ${codigos.length - 3}`;
  };
  const falta = ids => `${ids.length === 1 ? 'falta' : 'faltam'} ${listar(ids)}`;
  const voaDepois = info.faltam.map(id => voosDoDia.get(id)).find(Boolean);
  if (voaDepois) return `${voaDepois.etapa} voa depois, às ${hm(voaDepois.a)}`;
  if (info.fasesFechadas.length) {
    const fases = new Map(curso.fases.map(f => [f.id, f]));
    const daFase = new Set(curso.missoes.filter(x => info.fasesFechadas.includes(x.fase)).map(x => x.id));
    const faltam = info.faltam.filter(id => daFase.has(id));
    const esperadas = info.fasesFechadas.map((id, i) => `${i ? 'da ' : ''}${rotuloDaFase(fases.get(id))}`);
    return `a ${rotuloDaFase(fases.get(m.fase))} abre depois da ${juntar(esperadas)}${faltam.length ? `: ${falta(faltam)}` : ''}`;
  }
  if (!info.faltam.length) return 'fora da ordem do programa';
  const registro = info.faltam.length === 1 ? (ambiente.situacao || new Map()).get(`${stu.id}|${curso.sigla}|${porId.get(info.faltam[0]).codigo}`) : null;
  return `${falta(info.faltam)}${registro && registro.resultado === 'reprovado' && registro.data ? ` (reprovada em ${ddmm(registro.data)})` : ''}`;
}

const descreverMissao = m => `${m.codigo} · ${m.mis}${isGroundMission(m.mis) ? ' · 1h30' : ` · ${m.eq} · ${fmtH(m.nb)}`}`;
const descreverDependencias = (curso, ids, voosDoDia) => juntar(ids.map(id => {
  const voo = voosDoDia.get(id);
  const m = curso.missoes.find(x => x.id === id);
  return voo ? `${m.codigo} (hoje ${hm(voo.a)})` : m.codigo;
}));

// Os alunos (o select Aluno), em grupos: os que têm um pedido que ficou fora da escala, os que voam na data e os outros.
// Cada um com o curso e a próxima missão, os horários em que já voa e, com o instrutor do contexto, o "Não escalar com"
export function opcoesDeAluno(estado, base, ambiente, contexto = {}) {
  const naEscala = new Set(base.out.map(o => o.fKey));
  const instrutor = contexto.insId ? estado.ins.find(x => x.id === contexto.insId) : null;
  const grupos = [['Ficaram fora da escala', []], ['Na demanda de hoje', []], ['Outros alunos', []]];
  for (const stu of [...estado.stu].sort(porNome)) {
    const pedidos = pedidosQueVoam(stu);
    const curso = ambiente.inferir ? cursoDoAluno(ambiente, stu) : null;
    let proxima = null;
    if (curso) {
      const doDia = missoesDoDia(curso, stu, { fStatus: estado.fStatus });
      proxima = proximasMissoes(curso, ambiente.situacao, stu.id, { planejadas: doDia, exceto: doDia }).padrao;
    }
    const voos = base.out.filter(o => o.stuId === stu.id && ativo(o, estado.fStatus));
    const texto = [
      stu.nm, stu.curso ? ` — ${stu.curso}${proxima ? ` · próxima ${proxima.codigo}` : ''}` : '',
      voos.length ? ` · voa hoje às ${voos.map(o => hm(o.a)).join(', ')}` : '',
      instrutor && (stu.bl || []).includes(instrutor.id) ? ` · não voa com ${instrutor.nm}` : ''
    ].join('');
    const fora = pedidos.some(p => !naEscala.has(chaveDoVoo(stu.id, p.mid || 0)));
    grupos[fora ? 0 : pedidos.length ? 1 : 2][1].push({ valor: stu.id, texto });
  }
  return grupos.filter(([, opcoes]) => opcoes.length).map(([rotulo, opcoes]) => ({ rotulo, opcoes }));
}

// O aluno no diálogo: o curso, a fase, as aprovadas, a próxima missão, os voos dele na data e o pedido que ficou fora da
// escala ("PP · Fase 4 · 12/46 · próxima TMA-03 · já voa hoje 08:20 (TMA-02, PR-VOC)")
function infoDoAluno(estado, base, ambiente, stu) {
  const partes = [];
  const curso = cursoDoAluno(ambiente, stu);
  if (stu.curso) partes.push(`${stu.curso}${curso && curso.ativo === false ? ' (encerrado)' : ''}`);
  if (curso && ambiente.inferir) {
    const { aprovadas, total, faseAtual, proxima } = progressoNoCurso(curso, ambiente.situacao, stu.id);
    if (faseAtual && percursoDoCurso(curso).fases.length > 1) partes.push(rotuloDaFase(faseAtual));
    if (total) partes.push(`${aprovadas}/${total}`);
    if (proxima) partes.push(`próxima ${proxima.codigo}`);
  }
  const voos = base.out.filter(o => o.stuId === stu.id && ativo(o, estado.fStatus));
  if (voos.length) partes.push(`já voa hoje ${voos.map(o => `${hm(o.a)} (${[o.etapa || o.mis, nomeDoRecurso(o.r)].join(', ')})`).join('; ')}`);
  const naEscala = new Set(base.out.map(o => o.fKey));
  const fora = pedidosQueVoam(stu).filter(p => !naEscala.has(chaveDoVoo(stu.id, p.mid || 0)));
  if (fora.length) partes.push(`ficou fora da escala: ${fora.map(p => p.mis).join(', ')}`);
  return partes.join(' · ');
}

// As missões que o aluno pode voar (o select Missão), em grupos: as liberadas do curso (a condicional diz de que resultado
// depende), as outras missões do curso, fora da ordem (com o motivo: pedem confirmação), e as missões sem o curso (os
// tipos de missão que o recurso serve, e "Outro tipo de missão…"). Sem os resultados, as missões do curso vêm sem a
// ordem conferida, e não há missão padrão. Devolve os grupos (cada opção: valor, texto e o que a conferência usa), a
// missão padrão (valor, ou null) e a nota com a próxima e as outras liberadas
export function opcoesDeMissao(estado, base, ambiente, stu, { a = 0, contexto = {}, recurso = null } = {}) {
  const curso = cursoDoAluno(ambiente, stu);
  const grupos = [];
  let padrao = null, nota = '';
  if (curso) {
    const percurso = percursoDoCurso(curso);
    const faseDe = new Map(percurso.fases.map(f => [f.id, f]));
    const variasFases = percurso.fases.length > 1;
    const comum = m => ({ tipo: 'missao', missao: m, mis: m.mis, eq: m.eq, sigla: curso.sigla });
    if (ambiente.inferir) {
      const { exceto, planejadas, voos } = missoesNoDia(estado, base, curso, stu, a);
      const { porMissao } = estadoDoAluno(curso, ambiente.situacao, stu.id, { planejadas, exceto });
      const { padrao: proxima, candidatas } = proximasMissoes(curso, ambiente.situacao, stu.id, {
        planejadas, exceto, preferencia: preferenciaDoContexto(estado, contexto, curso.sigla)
      });
      const liberadas = candidatas.map(m => {
        const info = porMissao.get(m.id);
        const depende = info.estado === 'condicional' ? ` — depende do resultado de ${descreverDependencias(curso, info.dependeDe, voos)}` : '';
        return { valor: `missao:${m.id}`, texto: `${descreverMissao(m)}${depende}`, info: { ...comum(m), estado: info.estado, dependeDe: descreverDependencias(curso, info.dependeDe, voos) } };
      });
      const foraDaOrdem = percurso.missoes.filter(m => !candidatas.includes(m)).map(m => {
        const info = porMissao.get(m.id) || { estado: 'bloqueada', faltam: [], fasesFechadas: [], dependeDe: [] };
        const voo = info.estado === 'no-dia' ? [...(voos.values())].find(o => o.etapa === m.codigo) : null;
        const motivo = info.estado === 'aprovada' ? 'já aprovada' : info.estado === 'dispensada' ? 'dispensada'
          : info.estado === 'no-dia' ? (voo ? `já no voo de hoje às ${hm(voo.a)}` : 'já em outro pedido de hoje')
            : motivoDaMissao(curso, ambiente, stu, m, info, voos);
        const texto = info.estado === 'bloqueada' ? `${descreverMissao(m)} — ${motivo}` : `${descreverMissao(m)} (${motivo})`;
        return { valor: `missao:${m.id}`, texto, info: { ...comum(m), estado: info.estado, motivo } };
      });
      if (liberadas.length) grupos.push({ rotulo: `Liberadas no ${curso.sigla}`, opcoes: liberadas });
      if (foraDaOrdem.length) grupos.push({ rotulo: 'Fora da ordem (pede confirmação)', opcoes: foraDaOrdem });
      if (proxima) {
        padrao = `missao:${proxima.id}`;
        const onde = m => {
          const fase = faseDe.get(m.fase);
          return m.regra === 'livre' ? `livre na ${rotuloDaFase(fase)}` : variasFases ? rotuloDaFase(fase) : '';
        };
        const comOnde = m => (onde(m) ? `${m.codigo} (${onde(m)})` : m.codigo);
        const outras = candidatas.filter(m => m !== proxima);
        nota = `Próxima do ${curso.sigla}: ${comOnde(proxima)}.${outras.length ? ` Também ${outras.length === 1 ? 'liberada' : 'liberadas'}: ${outras.map(comOnde).join(', ')}.` : ''}`;
      } else nota = percurso.missoes.length ? `Nenhuma missão do ${curso.sigla} liberada agora.` : `O programa do ${curso.sigla} não tem missões.`;
    } else {
      grupos.push({
        rotulo: `Missões do ${curso.sigla} (a ordem não foi conferida)`,
        opcoes: percurso.missoes.map(m => ({ valor: `missao:${m.id}`, texto: descreverMissao(m), info: { ...comum(m), estado: null } }))
      });
      nota = 'Sem os resultados dos cursos, a ordem do programa não é conferida: escolha a missão.';
    }
    if (curso.ativo === false) nota = `O curso ${curso.sigla} está encerrado. ${nota}`;
  }
  // Sem os programas dos cursos (a leitura falhou, ou ainda não foram trazidos do cadastro), as missões do curso do aluno
  // não aparecem, e nenhuma missão é sugerida: o operador escolhe
  const semPrograma = !curso && Boolean(stu.curso) && Boolean(ambiente.programaIndisponivel);
  if (semPrograma) nota = `Sem os programas dos cursos, as missões do ${stu.curso} não aparecem: escolha a missão.`;
  else if (!curso && stu.curso && (ambiente.programa || []).length) nota = `O curso ${stu.curso} não está no programa dos cursos.`;
  // Sem missão do curso: os tipos de missão que o recurso serve (sem recurso, todos), e os outros pelo "Tipo de missão"
  const serve = mis => !recurso || (recurso === GROUND_REG ? isGroundMission(mis)
    : !isGroundMission(mis) && MIS[mis].eq.includes(recurso.tipo) && !motivoDoAviao(recurso, { mis, eq: recurso.tipo, curso: stu.curso }));
  const tipos = Object.keys(MIS).filter(serve);
  grupos.push({
    rotulo: 'Sem missão do curso',
    opcoes: [...tipos.map(mis => ({ valor: `tipo:${mis}`, texto: mis, info: { tipo: 'tipo', mis } })),
      ...(recurso ? [{ valor: 'tipo:', texto: 'Outro tipo de missão…', info: { tipo: 'outro' } }] : [])]
  });
  if (!padrao && !semPrograma && (!curso || ambiente.inferir)) padrao = `tipo:${tipos.includes('Voo Local') ? 'Voo Local' : tipos[0] || 'Voo Local'}`;
  return { grupos, padrao, nota };
}

// ---------------------------------------------------------------------------------------------------------------------
// Os candidatos: os recursos e os instrutores no horário, contra os voos fixos

function textoDoRecurso(problema, { mis, instrutor }) {
  return {
    'aviao-indisponivel': () => 'em manutenção',
    'aviao-ocupado': () => textoDoVooFixo(problema.voo),
    'sala-ocupada': () => textoDoVooFixo(problema.voo),
    revisao: () => 'sem saldo até a revisão de 50 h',
    'so-parafuso': () => (mis === 'Parafuso' ? 'não é Só Parafuso' : 'só Parafuso'),
    'so-vfr': () => 'só VFR (o voo é IFR)',
    'tipo-de-aviao': () => 'outro tipo',
    habilitacao: () => (instrutor ? `exige a habilitação própria (${instrutor.nm} não tem)` : 'exige a habilitação própria')
  }[problema.codigo]?.() || problema.codigo;
}

// Os recursos para a missão no horário [a, b) (o select Recurso), contra os voos fixos. O que não serve vem desligado, com
// o motivo: em manutenção, o voo fixo que ocupa, a revisão de 50 horas, o Só Parafuso e o Só VFR, a habilitação própria
// que o instrutor não tem. O que só tem voos que não são fixos no horário vem com a nota "ocupado agora (o app
// reorganiza)". Na ordem: os livres (sem voo nenhum no horário, depois os ocupados só por voos que não são fixos); os do
// tipo do programa (sem programa, o tipo padrão da missão); os do instrutor no dia; a menor folga; a frente do hangar
export function opcoesDeRecurso(estado, base, { mis, eq = null, curso, a, b, instrutor = null }) {
  const { fixos, todos } = ocupacoes(estado, base);
  const ground = isGroundMission(mis);
  const tipos = ground ? [GROUND_EQ_TYPE] : MIS[mis].eq;
  const preferido = ground ? GROUND_EQ_TYPE : tipos.includes(eq) ? eq : MIS[mis].defEq;
  const doInstrutor = new Set(instrutor ? base.out.filter(o => o.insId === instrutor.id && ativo(o, estado.fStatus)).map(o => o.r) : []);
  return tipos.flatMap(tipo => avioesQueServem(estado, fixos, { tipo, mis, curso, a, b, ground, instrutor }).map(c => ({ ...c, tipo })))
    .map((c, k) => ({ ...c, k, ocupadoAgora: !c.problema && Boolean(problemaDoRecurso(estado, todos, c.r, { a, b, ground })) }))
    .sort((p, q) => Boolean(p.problema) - Boolean(q.problema) || p.ocupadoAgora - q.ocupadoAgora || (q.tipo === preferido) - (p.tipo === preferido)
      || doInstrutor.has(q.r) - doInstrutor.has(p.r) || (p.folga === q.folga ? 0 : p.folga - q.folga) || p.k - q.k)
    .map(c => ({
      valor: c.r, tipo: c.tipo, problema: c.problema, desligada: Boolean(c.problema),
      texto: `${nomeDoRecurso(c.r)}${ground ? '' : ` · ${c.tipo}`}${c.problema ? ` — ${textoDoRecurso(c.problema, { mis, instrutor })}` : c.ocupadoAgora ? ' — ocupado agora (o app reorganiza)' : ''}`
    }));
}

// Os instrutores para o voo [a, b) (o select Instrutor), em grupos: os que servem neste horário; os com aviso (o
// indisponível, que o agendamento pode marcar disponível, e o ocupado só com voos que não são fixos: o app reorganiza) e
// os que não servem (desligados: a habilitação, o "Não escalar com", o voo fixo no horário, o limite da lei, o peso
// acima do limite mesmo com o mínimo de combustível), com os textos curtos da Escala. Na ordem: o tanque cheio; nas
// categorias do rodízio, menos voos da categoria no dia e a fila; menos horas no dia, menos habilitações, o id
export function opcoesDeInstrutor(estado, base, { mis, tipo, a, b, stu, stuKg = 0, curso, r = null }) {
  const { fixos, todos } = ocupacoes(estado, base);
  const categoria = categoriaDoRodizio(mis, tipo);
  const fila = categoria ? ajustarFilas(estado.filas, estado.ins)[categoria] : [];
  const naCategoria = new Map();
  if (categoria) {
    for (const o of base.out) {
      if (!o.trecho && ativo(o, estado.fStatus) && categoriaDoRodizio(o.mis, o.eqType) === categoria) naCategoria.set(o.insId, (naCategoria.get(o.insId) || 0) + 1);
    }
  }
  const posicao = id => (fila.includes(id) ? fila.indexOf(id) : Infinity);
  const pares = new Set(stu.voaCom || []);
  const lista = instrutoresQueServem(estado, fixos, { mis, tipo, a, b, alunos: [stu], stuKg, curso, r })
    .map((c, k) => ({ ...c, k }))
    .sort((p, q) => (p.reducao > 0) - (q.reducao > 0)
      || (categoria ? (naCategoria.get(p.x.id) || 0) - (naCategoria.get(q.x.id) || 0) || (posicao(p.x.id) === posicao(q.x.id) ? 0 : posicao(p.x.id) - posicao(q.x.id)) : 0)
      || p.k - q.k);
  const grupos = { servem: [], aviso: [], nao: [] };
  for (const { x, problemas, reducao } of lista) {
    const codigos = problemas.map(p => p.codigo);
    const par = pares.has(x.id) ? ' · Priorizar com' : '';
    const opcao = { valor: x.id, problemas: codigos, reducao, x };
    if (!codigos.length) {
      const agora = ocupaDaLista(todos.instrutores, x.id, a, b);
      grupos[agora ? 'aviso' : 'servem'].push({ ...opcao, texto: `${x.nm}${par}${agora ? ' — ocupado agora (o app reorganiza)' : ''}` });
    } else if (codigos.every(c => c === 'instrutor-indisponivel')) {
      grupos.aviso.push({ ...opcao, texto: `${x.nm}${par} — ${NOTA_DO_PROBLEMA['instrutor-indisponivel']}` });
    } else {
      const codigo = codigos.find(c => c !== 'instrutor-indisponivel');
      const voo = codigo === 'instrutor-ocupado' ? ocupaDaLista(fixos.instrutores, x.id, a, b) : null;
      grupos.nao.push({ ...opcao, desligada: true, texto: `${x.nm}${par} — ${voo ? `ocupado: ${textoDoVooFixo(voo)}` : NOTA_DO_PROBLEMA[codigo] || codigo}` });
    }
  }
  return [['Servem neste horário', grupos.servem], ['Com aviso', grupos.aviso], ['Não servem', grupos.nao]]
    .filter(([, opcoes]) => opcoes.length).map(([rotulo, opcoes]) => ({ rotulo, opcoes }));
}

// ---------------------------------------------------------------------------------------------------------------------
// O formulário: o que o diálogo mostra, montado dos dados e do que o operador escolheu

const BLOQUEIO_SEM_ALUNO = { codigo: 'sem-aluno', texto: 'Escolha o aluno: a missão, o horário e o peso vêm dele.', campo: 'agd-aluno' };

// O peso de um campo: vazio é sem peso (0), como no cadastro; fora de 1 a 300 kg, null
const pesoDoCampo = texto => (String(texto ?? '').trim() === '' ? 0 : pesoDigitado(texto));

// O formulário do agendamento, montado dos dados (estado; base: a escala calculada agora; ambiente: o programa, a situação
// das missões, a data, hoje e agora) e do que o operador já escolheu (escolhas: o valor de cada campo; tocados: os campos
// que ele mudou, que ficam como ele deixou), na ordem: aluno → missão → recurso e instrutor → horário → duração → peso.
// Os campos que ele não mudou recebem o padrão: a missão do progresso; o recurso e o instrutor que servem no horário de
// onde o contexto parte; o horário livre do recurso e do instrutor; a duração da missão; o peso do cadastro. Devolve as
// opções de cada campo, o valor escolhido, os textos de apoio, os bloqueios de formato e a proposta (o que aplicar)
export function formularioDoAgendamento(estado, base, ambiente, contexto, escolhas = {}, tocados = new Set()) {
  const f = { contexto, formato: [], notas: [], alunos: opcoesDeAluno(estado, base, ambiente, contexto), aluno: null, proposta: null };
  const stu = estado.stu.find(s => s.id === escolhas.aluno) || null;
  if (!stu) { f.formato.push(BLOQUEIO_SEM_ALUNO); return f; }
  f.aluno = stu.id;
  f.alunoInfo = infoDoAluno(estado, base, ambiente, stu);
  const curso = stu.curso || null;
  const frota = frotaDo(estado);
  const recursoAtual = (escolhas.recurso && escolhas.recurso !== GROUND_REG ? recursoDaFrota(frota, escolhas.recurso) : escolhas.recurso)
    || (contexto.r && contexto.r !== GROUND_REG ? recursoDaFrota(frota, contexto.r) : contexto.r) || null;

  // A missão: a escolhida, ou a padrão (a próxima do curso no horário escolhido, ou no de onde o contexto parte; sem curso,
  // o tipo)
  const inicio = tocados.has('horario') && Number.isInteger(escolhas.horario) ? escolhas.horario : contexto.minuto;
  const daMissao = opcoesDeMissao(estado, base, ambiente, stu, { a: inicio, contexto, recurso: recursoAtual });
  const valores = new Set(daMissao.grupos.flatMap(g => g.opcoes.map(o => o.valor)));
  const missao = tocados.has('missao') && valores.has(escolhas.missao) ? escolhas.missao : daMissao.padrao;
  const opcaoDe = (grupos, valor) => grupos.flatMap(g => g.opcoes).find(o => o.valor === valor) || null;
  let info = (missao && opcaoDe(daMissao.grupos, missao) || {}).info || null;
  if (info && info.tipo === 'outro') {
    f.tipos = Object.keys(MIS);
    f.tipo = Object.hasOwn(MIS, escolhas.tipo) ? escolhas.tipo : null;
    info = f.tipo ? { tipo: 'tipo', mis: f.tipo, outro: true } : null;
  }
  f.missoes = daMissao;
  f.missao = missao || '';
  if (!info) {
    f.formato.push({ codigo: 'sem-missao', texto: 'Escolha a missão.', campo: missao ? 'agd-tipo' : 'agd-missao' });
    return f;
  }
  const { mis } = info;
  const ground = isGroundMission(mis);

  // A duração (o Ground e o Noturno: fixa)
  const padraoDaDuracao = duracaoDoAgendamento({ mis, missao: info.missao });
  const horas = padraoDaDuracao.fixa || !tocados.has('horas') ? padraoDaDuracao.horas : duracaoDigitada(escolhas.horas);
  f.horas = { valor: padraoDaDuracao.fixa || !tocados.has('horas') ? String(horas) : String(escolhas.horas ?? ''), fixa: padraoDaDuracao.fixa };
  const minutos = ground ? GROUND_DURATION_MIN : Math.round((horas || padraoDaDuracao.horas) * 60);

  // O recurso e o instrutor no horário de onde o contexto parte; depois, o horário livre deles, e de novo os padrões nele
  const preferido = ground ? GROUND_EQ_TYPE : MIS[mis].eq.includes(info.eq) ? info.eq : recursoAtual && MIS[mis].eq.includes(recursoAtual.tipo) ? recursoAtual.tipo : MIS[mis].defEq;
  const listaDoTipo = tipo => horariosDoAgendamento(estado, { mis, tipo });
  const outro = escolhas.horario === 'outro' && !ground;
  const tocado = (campo, lista) => tocados.has(campo) && lista.includes(escolhas[campo]);
  const primeiroNaLista = lista => lista.find(s => s >= (contexto.desde ?? 0) && (contexto.ate === null || s < contexto.ate)) ?? null;
  const alunoKg = tocados.has('kgAluno') ? pesoDoCampo(escolhas.kgAluno) : stu.kg || 0;
  const pesoDoInstrutor = x => {
    const digitado = (escolhas.kgInstrutor || {})[x.id];
    return digitado !== undefined ? pesoDoCampo(digitado) : x.kg || 0;
  };
  // Algum instrutor serve no recurso no horário, contra os voos fixos (o avião com habilitação própria pede a dele)
  const algumInstrutorServe = (a, r) => instrutoresQueServem(estado, ocupacoes(estado, base).fixos, {
    mis, tipo: tipoDe(r), a, b: a + minutos, alunos: [stu], stuKg: alunoKg || 0, curso, r
  }).some(c => !c.problemas.length);
  // O recurso que o operador escolheu (ou o do contexto) fica enquanto serve à missão. Sem ele, o primeiro que serve; sem
  // o instrutor escolhido, o primeiro do mesmo tipo em que algum instrutor serve: o avião com habilitação própria que
  // ninguém do horário tem não vira o padrão (o peso e a habilitação da missão valem para o tipo inteiro: trocar de tipo
  // fica com o operador)
  const escolherRecurso = (a, x) => {
    const opcoes = opcoesDeRecurso(estado, base, { mis, eq: preferido, curso, a, b: a + minutos, instrutor: x });
    const valores = opcoes.map(o => o.valor);
    const proprio = tocado('recurso', valores) && serveAMissao(escolhas.recurso) ? escolhas.recurso
      : contexto.r && valores.includes(contexto.r) && serveAMissao(contexto.r) ? contexto.r : null;
    const ligadas = opcoes.filter(o => !o.desligada);
    const doTipo = ligadas.filter(o => o.tipo === (ligadas[0] || {}).tipo);
    const padrao = (x ? ligadas[0] : doTipo.find(o => algumInstrutorServe(a, o.valor)) || ligadas[0]) || opcoes[0] || {};
    return { opcoes, r: proprio || padrao.valor || null, fixo: Boolean(proprio) };
  };
  const tipoDe = r => (ground ? GROUND_EQ_TYPE : (recursoDaFrota(frota, r) || {}).tipo || preferido);
  const escolherInstrutor = (a, r) => {
    const grupos = opcoesDeInstrutor(estado, base, { mis, tipo: tipoDe(r), a, b: a + minutos, stu, stuKg: alunoKg || 0, curso, r });
    const todas = grupos.flatMap(g => g.opcoes);
    const habilitadas = todas.filter(o => !o.desligada);
    const servem = (grupos.find(g => g.rotulo === 'Servem neste horário') || { opcoes: [] }).opcoes;
    const proprio = tocado('instrutor', todas.map(o => o.valor)) ? escolhas.instrutor
      : contexto.insId && todas.some(o => o.valor === contexto.insId) ? contexto.insId : null;
    const doPar = (stu.voaCom || []).find(id => servem.some(o => o.valor === id));
    return { grupos, insId: proprio ?? doPar ?? (habilitadas[0] || todas[0] || {}).valor ?? null, fixo: proprio !== null };
  };

  // O tipo do recurso que o operador escolheu (ou o do contexto), quando ele serve à missão (o tipo e os atributos: o Só
  // Parafuso, o Só VFR no voo IFR); senão, o preferido. O instrutor que o operador escolheu (ou o do contexto) já conta na
  // escolha do recurso (a habilitação própria do avião)
  const serveAMissao = r => {
    if (!r || ground || r === GROUND_REG) return Boolean(r) && ground && r === GROUND_REG;
    const recurso = recursoDaFrota(frota, r);
    return Boolean(recurso) && MIS[mis].eq.includes(recurso.tipo) && !motivoDoAviao(recurso, { mis, eq: recurso.tipo, curso });
  };
  const recursoDoOperador = [tocados.has('recurso') ? escolhas.recurso : null, contexto.r].find(serveAMissao) || null;
  const instrutorDoOperador = estado.ins.find(i => i.id === (tocados.has('instrutor') ? escolhas.instrutor : contexto.insId)) || null;
  let lista = listaDoTipo(recursoDoOperador ? tipoDe(recursoDoOperador) : preferido);
  let a = outro ? paraMinuto(escolhas.outroHorario) : tocado('horario', lista) ? escolhas.horario : null;
  const horarioDoOperador = a !== null || outro;
  const ancora = contexto.perto ? contexto.minuto : primeiroNaLista(lista) ?? contexto.minuto;
  const inicial = a ?? ancora;
  let rec = escolherRecurso(inicial, instrutorDoOperador);
  let ins = escolherInstrutor(inicial, rec.r);
  if (!horarioDoOperador) {
    // O horário livre do recurso, do instrutor e do aluno (nos voos fixos; a volta do noturno ocupa até as 10:10): o mais
    // perto do clique, ou o primeiro a partir do início do contexto (na janela do horário da lista)
    lista = listaDoTipo(tipoDe(rec.r));
    const { fixos } = ocupacoes(estado, base);
    const instrutor = estado.ins.find(i => i.id === ins.insId) || null;
    const livre = s => {
      if (rec.r && problemaDoRecurso(estado, fixos, rec.r, { a: s, b: s + minutos, ground })) return false;
      if (problemaDoAluno(fixos, stu.id, { a: s, b: s + minutos })) return false;
      return !instrutor || !instrutoresQueServem(estado, fixos, { mis, tipo: tipoDe(rec.r), a: s, b: s + minutos, alunos: [stu], stuKg: alunoKg || 0, curso, r: rec.r })
        .find(c => c.x === instrutor).problemas.length;
    };
    const naJanela = lista.filter(s => (contexto.desde === null || s >= contexto.desde) && (contexto.ate === null || s < contexto.ate));
    a = contexto.perto || !naJanela.length ? encaixarHorario(ancora, lista, livre) : encaixarHorario(naJanela[0], naJanela, livre);
    // No horário encontrado, os padrões de novo: o recurso do mesmo tipo e o instrutor que melhor servem nele
    if (a !== null) {
      const novo = escolherRecurso(a, instrutorDoOperador);
      rec = { ...novo, r: !novo.fixo && novo.r && tipoDe(novo.r) === tipoDe(rec.r) ? novo.r : rec.r };
      ins = escolherInstrutor(a, rec.r);
    }
  }
  const x = estado.ins.find(i => i.id === ins.insId) || null;
  // Com o instrutor, os recursos de novo: o avião com habilitação própria que ele não tem fica desligado
  if (a !== null && x) {
    const comInstrutor = escolherRecurso(a, x);
    rec = { ...comInstrutor, r: rec.r };
  }
  const tipo = tipoDe(rec.r);
  lista = listaDoTipo(tipo);
  const b = a === null ? null : a + minutos;

  f.recursos = rec.opcoes;
  f.recurso = rec.r;
  f.instrutores = ins.grupos;
  f.instrutor = x ? x.id : null;
  f.horario = outro ? 'outro' : a;
  f.outroHorario = outro ? escolhas.outroHorario || '' : '';
  // Os horários do recurso, com "(ocupado)" onde o recurso ou o instrutor já tem um voo fixo; outro horário, nos aviões e
  // simuladores
  const { fixos } = ocupacoes(estado, base);
  const ocupado = s => Boolean((rec.r && ocupaDaLista(fixos.recursos, rec.r, s, s + minutos)) || (x && ocupaDaLista(fixos.instrutores, x.id, s, s + minutos)));
  f.horarios = { opcoes: lista.map(s => ({ valor: s, texto: `${hm(s)}${ocupado(s) ? ' (ocupado)' : ''}` })), outro: !ground };

  // As missões de novo, no horário e no recurso escolhidos: o estado da missão do curso (liberada, condicional, fora da
  // ordem) vale para o horário, e os tipos sem o curso são os que o recurso serve
  const noHorario = opcoesDeMissao(estado, base, ambiente, stu, { a: a ?? inicio, contexto, recurso: rec.r && rec.r !== GROUND_REG ? recursoDaFrota(frota, rec.r) : rec.r });
  f.missoes = { ...noHorario, padrao: daMissao.padrao };
  const atual = info.tipo === 'missao' ? opcaoDe(noHorario.grupos, missao) : null;
  if (atual) info = atual.info;
  f.missaoInfo = info;

  // O peso, nos aviões: o do cadastro, ou o digitado (o do instrutor, para cada instrutor)
  const lim = DEFAULT_LIM[tipo] || 0;
  const insKg = x ? pesoDoInstrutor(x) : 0;
  f.peso = {
    visivel: Boolean(lim),
    aluno: tocados.has('kgAluno') ? String(escolhas.kgAluno ?? '') : stu.kg ? String(stu.kg) : '',
    instrutor: x && (escolhas.kgInstrutor || {})[x.id] !== undefined ? String(escolhas.kgInstrutor[x.id]) : x && x.kg ? String(x.kg) : '',
    resumo: ''
  };
  if (lim && a !== null && alunoKg !== null && insKg !== null) f.peso.resumo = resumoDoPeso({ stuKg: alunoKg, insKg, tipo, minutos, mis, lim });

  // O contexto, no alto do diálogo
  f.contextoTexto = textoDoContexto(contexto, ambiente, { r: rec.r, tipo, a, recursoTrocado: contexto.r && rec.r && contexto.r !== rec.r ? contexto.r : null, mis });
  if ((mis === 'Noturno' || mis === 'Voo Solo') && a !== null && inicial !== a && !horarioDoOperador) {
    f.notas.push({ codigo: 'horario-da-missao', texto: `O ${mis} sai às ${hm(a)}.` });
  }

  // Os bloqueios de formato, na ordem dos campos
  const formato = f.formato;
  if (!rec.r) formato.push({ codigo: 'sem-recurso', texto: `Nenhum recurso para ${mis} na frota.`, campo: 'agd-recurso' });
  else if (ground !== (rec.r === GROUND_REG)) formato.push({ codigo: 'ground-ou-voo', texto: 'O Ground é na sala de Ground; o voo, num avião ou simulador.', campo: 'agd-recurso' });
  if (!x) formato.push({ codigo: 'sem-instrutor', texto: 'Escolha o instrutor.', campo: 'agd-instrutor' });
  if (a === null) formato.push({ codigo: 'horario-invalido', texto: outro ? 'Informe o horário de decolagem (hh:mm).' : 'Nenhum horário de decolagem aberto para esta missão nesta data.', campo: outro ? 'agd-outro-horario' : 'agd-horario' });
  if (horas === null) formato.push({ codigo: 'duracao', texto: ERRO_DA_DURACAO, campo: 'agd-horas' });
  else if (b !== null && b > MINUTOS_DO_DIA) formato.push({ codigo: 'depois-da-meia-noite', texto: 'O voo terminaria depois da meia-noite.', campo: outro ? 'agd-outro-horario' : 'agd-horario' });
  if (lim && alunoKg === null) formato.push({ codigo: 'peso-invalido', texto: ERRO_DO_PESO, campo: 'agd-kg-aluno' });
  if (lim && x && insKg === null) formato.push({ codigo: 'peso-invalido', texto: ERRO_DO_PESO, campo: 'agd-kg-instrutor' });
  if (formato.length) return f;

  f.proposta = {
    stuId: stu.id, mis, eq: ground ? GROUND_EQ_TYPE : tipo, nb: ground ? GROUND_DURATION_MIN / 60 : horas, a, b, r: rec.r, insId: x.id,
    missao: info.tipo === 'missao' ? { sigla: info.sigla, codigo: info.missao.codigo } : null,
    pesos: lim ? { aluno: alunoKg, instrutor: insKg } : null,
    disponibilizar: escolhas.disponibilizar === x.id ? { insId: x.id } : null
  };
  f.selecao = { stu, x, r: rec.r, tipo, a, b, mis, info, ground, horas, fixa: padraoDaDuracao.fixa };
  return f;
}

// O peso da tripulação no avião: dentro do limite, com o tanque cheio; acima, quanto abastecer; nem com o mínimo de
// combustível, o bloqueio. Sem um dos pesos, o limite não é conferido
function resumoDoPeso({ stuKg, insKg, tipo, minutos, mis, lim }) {
  if (!stuKg || !insKg) return `Sem ${!stuKg && !insKg ? 'os pesos' : 'um dos pesos'}, o limite de ${lim} kg do ${tipo} não é conferido.`;
  const r = pesoECombustivel({ stuKg, insKg, tipo, minutos, mis });
  const kg = `${numeroBr(Math.round(r.kg * 10) / 10)} kg de ${lim} kg no ${tipo}`;
  if (!r.cabe) return 'Acima do limite mesmo com o mínimo de combustível.';
  if (!r.reduzirGal) return `${kg}: tanque cheio.`;
  return `${kg}: ${minuscula(textoDoCombustivel(r))}`;
}

function textoDoContexto(contexto, ambiente, { r, tipo, a, recursoTrocado, mis }) {
  const onde = r ? `${nomeDoRecurso(r)}${r === GROUND_REG ? '' : ` · ${tipo}`}` : '';
  // Sem horário (nenhum aberto para a missão na data), o contexto diz isso, sem o horário pela metade
  const quando = a === null ? null : hm(a);
  const SEM_HORARIO = 'nenhum horário de decolagem aberto';
  let texto;
  if (contexto.origem === 'mapa') texto = [onde, quando ? `clique perto de ${hm(contexto.minuto)} → ${quando} (horários do ${tipo})` : SEM_HORARIO].filter(Boolean).join(' · ');
  else if (contexto.origem === 'periodo') texto = [onde, quando ? `o primeiro horário livre a partir de ${hm(contexto.desde)}: ${quando}` : SEM_HORARIO].filter(Boolean).join(' · ');
  else {
    const data = ambiente.data && ambiente.hoje ? rotuloDaData(ambiente.data, ambiente.hoje).dia : '';
    const horario = !quando ? SEM_HORARIO
      : contexto.desde !== null && ambiente.data === ambiente.hoje ? `o primeiro horário livre a partir de agora: ${quando}` : `o primeiro horário livre: ${quando}`;
    texto = [maiuscula(data), horario].filter(Boolean).join(' · ');
  }
  return recursoTrocado ? `${texto}. O ${nomeDoRecurso(recursoTrocado)} não serve ao ${mis}: o voo vai no ${nomeDoRecurso(r)}.` : texto;
}

// ---------------------------------------------------------------------------------------------------------------------
// Aplicar, simular e conferir

// Agenda o voo no estado (o do app, ao confirmar; uma cópia, na simulação): o pedido (o principal, quando ele não voa e a
// chave está limpa; senão uma missão extra nova), com a missão, o recurso, as horas, a preferência no horário agendado, a
// missão do curso e o instrutor (o do operador vale mais que a escolha do app); o voo fixo com a marca agendado; os pesos
// digitados no cadastro de cada um; e, com "Marcar disponível", o instrutor disponível nos períodos do voo. Devolve como
// estava (a reversão do histórico): o pedido principal de antes (só quando é ele o pedido do voo; a missão extra nova sai
// inteira), o voo fixo e a disponibilidade de antes, os pesos que mudaram e o pedido como o agendamento o deixou
export function aplicarAgendamento(estado, base, proposta) {
  const aluno = estado.stu.find(s => s.id === proposta.stuId);
  // O pedido principal como estava, antes de alvoDoNovoPedido o limpar: só vale quando é ele o pedido do voo
  const principal = camposDoPedido(aluno);
  const alvo = alvoDoNovoPedido(estado, aluno);
  const mid = alvo === aluno ? 0 : alvo.mid;
  const fKey = chaveDoVoo(aluno.id, mid);
  const fixo = (estado.fixos || {})[fKey] || null;
  Object.assign(alvo, { fly: true, mis: proposta.mis, eq: proposta.eq, nb: proposta.nb, p1: proposta.a, p2: -1, insId: proposta.insId });
  if (proposta.missao) Object.assign(alvo, { etapa: proposta.missao.codigo, cursoDaEtapa: proposta.missao.sigla });
  else { delete alvo.etapa; delete alvo.cursoDaEtapa; }
  const permitidas = disponibilidadeDoAluno(alvo.jan);
  if (permitidas && !permitidas(proposta.a)) delete alvo.jan;
  normalizeMissionFields(alvo);
  const ground = isGroundMission(proposta.mis);
  estado.fixos = { ...(estado.fixos || {}), [fKey]: { a: proposta.a, b: proposta.b, r: ground ? GROUND_REG : proposta.r, insId: proposta.insId, agendado: true } };
  const x = estado.ins.find(i => i.id === proposta.insId) || null;
  const pesos = [];
  if (proposta.pesos) {
    for (const [pessoa, tipo, kg] of [[aluno, 'aluno', proposta.pesos.aluno], [x, 'instrutor', proposta.pesos.instrutor]]) {
      if (!pessoa || !Number.isFinite(kg) || kg === (pessoa.kg || 0)) continue;
      pessoa.kg = kg;
      pesos.push({ tipo, id: pessoa.id, nm: pessoa.nm, kg });
    }
  }
  let disponibilidade = null;
  if (proposta.disponibilizar && x) {
    disponibilidade = { insId: x.id, on: x.on, aw: [...x.aw] };
    x.on = true;
    x.aw = x.aw.map((v, k) => v || sobrepoe(proposta.a, proposta.b, T[k], k < NI ? T[k + 1] : MINUTOS_DO_DIA));
  }
  return { stuId: aluno.id, mid, criado: true, pedido: mid === 0 ? principal : null, fixo, disponibilidade, pesos, criadoComo: camposDoPedido(alvo) };
}

// O estado com os pesos digitados (só os pesos): a escala dele separa o que os pesos sozinhos mudam do que o agendamento
// muda. Sem peso digitado diferente do cadastro, o próprio estado
export function comPesos(estado, proposta) {
  if (!proposta || !proposta.pesos) return estado;
  const aluno = estado.stu.find(s => s.id === proposta.stuId), x = estado.ins.find(i => i.id === proposta.insId);
  const mudaAluno = aluno && proposta.pesos.aluno !== (aluno.kg || 0), mudaInstrutor = x && proposta.pesos.instrutor !== (x.kg || 0);
  if (!mudaAluno && !mudaInstrutor) return estado;
  return {
    ...estado,
    stu: mudaAluno ? estado.stu.map(s => (s === aluno ? { ...s, kg: proposta.pesos.aluno } : s)) : estado.stu,
    ins: mudaInstrutor ? estado.ins.map(i => (i === x ? { ...i, kg: proposta.pesos.instrutor } : i)) : estado.ins
  };
}

// A simulação: a mesma função que grava, numa cópia do estado, e o motor nela (a escala que fica se o operador confirmar)
export function simularAgendamento(estado, base, proposta, motor = runAllocationEngine) {
  const copia = {
    ...estado, stu: structuredClone(estado.stu), ins: structuredClone(estado.ins), fixos: { ...(estado.fixos || {}) },
    fStatus: { ...(estado.fStatus || {}) }, fObs: { ...(estado.fObs || {}) }
  };
  const antes = aplicarAgendamento(copia, base, proposta);
  return { sim: motor(copia), antes, fKey: chaveDoVoo(antes.stuId, antes.mid) };
}

// O campo do diálogo de cada grupo de conflito (o foco vai para ele)
const CAMPO_DO_GRUPO = { instrutor: 'agd-instrutor', aviao: 'agd-recurso', horario: 'agd-horario', pedido: 'agd-missao' };
// O resumo de cada aviso confirmado, para o histórico
const RESUMO_DO_AVISO = {
  'fora-dos-horarios': 'fora dos horários de decolagem', 'depois-das-17h30': 'depois das 17:30', 'limite-de-locais': 'acima do limite de voos locais no horário',
  'antes-do-ground': 'antes do Ground', 'sem-peso': 'sem peso'
};

// A conferência do agendamento (formulario, a simulação sim e a chave fKey do voo novo; baseComPesos: a escala com os
// pesos digitados, sem o agendamento):
// - bloqueios (não deixa agendar): os de formato; cada conflito do voo novo na simulação (o instrutor indisponível, com
//   "Marcar disponível"); outro voo que fica em conflito por causa do agendamento;
// - avisos (pedem uma confirmação): as regras do curso, as regras que o motor não confere nos voos agendados (os horários
//   de decolagem, o pouso até as 17:30, o limite de voos locais, o Ground antes), o peso que falta, os voos que saem da
//   escala, o conflito que o peso digitado cria em outro voo, o horário que já passou, a data passada, o domingo e os
//   limites da lei sem as horas;
// - notas (só informação).
// Cada item: { codigo, texto, campo?, opcoes?, resumo? (o texto curto do histórico) }. previa: o voo novo e os voos que
// mudam de lugar, saem ou entram
export function avaliarAgendamento({ estado, baseComPesos, base = baseComPesos, sim, fKey, formulario, ambiente = {} }) {
  const bloqueios = [...formulario.formato], avisos = [], notas = [...formulario.notas];
  if (bloqueios.length || !sim || !formulario.selecao) return { bloqueios, avisos, notas, previa: null };
  const { stu, x, r, tipo, a, b, mis, info, horas, fixa } = formulario.selecao;
  const novo = sim.out.find(o => o.fKey === fKey) || null;

  // Bloqueios: os conflitos do voo novo e os que ele cria nos outros
  if (!novo) bloqueios.push({ codigo: 'sem-voo', texto: 'O voo não entrou na escala.', campo: 'agd-horario' });
  else {
    (novo.conflitoCodigos || []).forEach((codigo, i) => {
      const item = { codigo, texto: `${maiuscula(novo.conflito[i])}.`, campo: CAMPO_DO_GRUPO[GRUPO_DO_CONFLITO[codigo]] || 'agd-horario' };
      if (codigo === 'instrutor-indisponivel') item.opcoes = [{ opcao: 'disponibilizar', texto: `Marcar ${x.nm} disponível às ${hm(a)}` }];
      bloqueios.push(item);
    });
  }
  const antes = new Map(baseComPesos.out.map(o => [o.fKey, o]));
  for (const o of sim.out) {
    if (o.fKey === fKey || !o.conflito || (antes.get(o.fKey) || {}).conflito) continue;
    bloqueios.push({ codigo: 'conflito-em-outro-voo', texto: `Agendar aqui deixa o voo de ${rotuloDoVoo(o)} em conflito: ${o.conflito.join('; ')}.`, campo: 'agd-horario' });
  }

  // Avisos: as regras do curso
  if (info.tipo === 'missao') {
    const { missao: m, sigla } = info;
    const curso = indiceDoPrograma(ambiente.programa || []).curso(sigla);
    if (!ambiente.inferir) avisos.push({ codigo: 'ordem-nao-conferida', texto: `Sem os resultados dos cursos, a ordem do programa não foi conferida (${m.codigo}).`, resumo: 'ordem do curso não conferida' });
    else if (info.estado === 'bloqueada') avisos.push({ codigo: 'fora-da-ordem', texto: `${m.codigo} fora da ordem: ${info.motivo}.`, resumo: `fora da ordem (${info.motivo})`, campo: 'agd-missao' });
    else if (info.estado === 'aprovada') avisos.push({ codigo: 'ja-aprovada', texto: `${m.codigo} já foi aprovada: o aluno voa a missão de novo.`, resumo: `${m.codigo} já aprovada`, campo: 'agd-missao' });
    else if (info.estado === 'dispensada') avisos.push({ codigo: 'dispensada', texto: `${m.codigo} é dispensada no ${sigla}.`, resumo: `${m.codigo} dispensada`, campo: 'agd-missao' });
    else if (info.estado === 'no-dia') avisos.push({ codigo: 'repetida-no-dia', texto: `${m.codigo} ${info.motivo.replace(/^já /, 'já está ')}: o aluno voa a missão duas vezes no dia.`, resumo: `${m.codigo} repetida no dia`, campo: 'agd-missao' });
    if (sigla !== stu.curso) avisos.push({ codigo: 'outro-curso', texto: `${m.codigo} é do ${sigla}, e ${stu.nm} está no ${stu.curso || 'nenhum curso'}.`, resumo: 'missão de outro curso', campo: 'agd-missao' });
    if (curso && curso.ativo === false) avisos.push({ codigo: 'curso-encerrado', texto: `O curso ${sigla} está encerrado.`, resumo: 'curso encerrado', campo: 'agd-missao' });
    if (!isGroundMission(mis) && tipo !== m.eq) {
      avisos.push({ codigo: 'recurso-do-programa', texto: `O programa faz ${m.codigo} no ${m.eq}; o voo vai no ${tipo}, e a missão continua ${m.codigo}.`, resumo: `${m.codigo} no ${tipo}`, campo: 'agd-recurso' });
    }
  }
  // As regras que o motor não confere nos voos agendados e o peso que falta (os avisos do motor com a chave do voo novo)
  for (const al of sim.al) {
    if (al.t !== 'warn' || al.fKey !== fKey || ![...CODIGOS_DO_AGENDADO, 'sem-peso'].includes(al.codigo)) continue;
    const campo = al.codigo === 'sem-peso' ? (!(formulario.proposta.pesos || {}).aluno ? 'agd-kg-aluno' : 'agd-kg-instrutor')
      : al.codigo === 'antes-do-ground' ? 'agd-horario' : al.codigo === 'depois-das-17h30' ? 'agd-horas' : 'agd-horario';
    avisos.push({ codigo: al.codigo, texto: al.m, resumo: RESUMO_DO_AVISO[al.codigo], campo });
  }
  // Os voos que saem da escala (com o motivo do motor) e o conflito que o peso digitado sozinho cria em outro voo
  const naSim = new Set(sim.out.map(o => o.fKey));
  const saem = baseComPesos.out.filter(o => o.fKey !== fKey && !naSim.has(o.fKey));
  if (saem.length) {
    const motivo = o => {
      const err = sim.al.find(al => al.t === 'err' && al.s === rotuloDoVoo(o));
      return err ? ` (${minuscula(err.m.replace(/^Rejeitado: /, '').replace(/\.$/, ''))})` : '';
    };
    avisos.push({
      codigo: 'saem', texto: `Agendar aqui tira da escala: ${saem.slice(0, 8).map(o => `${rotuloDoVoo(o)}${motivo(o)}`).join('; ')}${saem.length > 8 ? ` e mais ${saem.length - 8}` : ''}.`,
      resumo: `tira ${saem.length} ${saem.length === 1 ? 'voo' : 'voos'} da escala`
    });
  }
  if (baseComPesos !== base) {
    const daBase = new Map(base.out.map(o => [o.fKey, o]));
    for (const o of baseComPesos.out) {
      if (!o.conflito || (daBase.get(o.fKey) || {}).conflito) continue;
      avisos.push({ codigo: 'peso-muda-outro-voo', texto: `Com o peso digitado, o voo de ${rotuloDoVoo(o)} fica em conflito: ${o.conflito.join('; ')}.`, resumo: `o peso muda o voo de ${rotuloDoVoo(o)}`, campo: 'agd-kg-aluno' });
    }
  }
  // A data e o horário
  if (ambiente.data && ambiente.hoje && ambiente.data < ambiente.hoje) avisos.push({ codigo: 'data-passada', texto: 'A data já passou.', resumo: 'data passada' });
  else if (ambiente.data === ambiente.hoje && a < ambiente.agora) avisos.push({ codigo: 'horario-passado', texto: `O horário ${hm(a)} já passou.`, resumo: 'horário que já passou', campo: 'agd-horario' });
  if (ambiente.data && ehDomingo(ambiente.data)) avisos.push({ codigo: 'domingo', texto: 'O aeroclube não opera aos domingos.', resumo: 'domingo' });
  if (ambiente.semHoras) {
    avisos.push({ codigo: 'lei-nao-conferida', texto: 'Sem as horas de voo dos instrutores, os limites da lei do mês e do ano não foram conferidos.', resumo: 'limites da lei não conferidos' });
  }

  // Notas
  if (info.tipo === 'missao' && info.estado === 'condicional') notas.push({ codigo: 'condicional', texto: `${info.missao.codigo} depende do resultado de ${info.dependeDe}.` });
  if (info.tipo === 'missao' && !fixa && horas !== info.missao.nb) {
    notas.push({ codigo: 'duracao-do-programa', texto: `A duração (${fmtH(horas)}) é diferente da do programa para ${info.missao.codigo} (${fmtH(info.missao.nb)}).` });
  }
  if (novo && novo.comb) notas.push({ codigo: 'reduzir-combustivel', texto: `O avião sai com menos combustível: reduzir ${novo.comb.reduzirGal} gal.` });
  if ((stu.voaCom || []).length && !stu.voaCom.includes(x.id)) notas.push({ codigo: 'fora-do-priorizar', texto: `${x.nm} está fora do Priorizar com de ${stu.nm}.` });
  if (formulario.proposta.disponibilizar) notas.push({ codigo: 'disponibilizar', texto: `${x.nm} fica disponível às ${hm(a)} com o agendamento.` });
  if (estado.aprovacao) notas.push({ codigo: 'escala-aprovada', texto: 'A escala está aprovada: o voo novo entra fixo e os outros não mudam.' });
  if (mis === 'Noturno') {
    notas.push({ codigo: 'noturno', texto: `O Noturno volta amanhã às ${hm(NOTURNO.voltaInicio)}; o instrutor, o aluno e o avião ficam livres às ${hm(NOTURNO.livreAs)}.` });
  }
  const naBase = new Set(baseComPesos.out.map(o => o.fKey));
  const fora = pedidosQueVoam(stu).filter(p => !naBase.has(chaveDoVoo(stu.id, p.mid || 0)));
  if (fora.length) notas.push({ codigo: 'pedido-fora', texto: `${stu.nm} tem ${fora.length === 1 ? 'um pedido' : 'pedidos'} que ficou fora da escala (${fora.map(p => p.mis).join(', ')}): ${fora.length === 1 ? 'ele continua' : 'eles continuam'} fora.` });

  // A prévia: o voo novo e o que muda nos outros
  const movidos = sim.out.filter(o => {
    const era = antes.get(o.fKey);
    return o.fKey !== fKey && era && (era.a !== o.a || era.r !== o.r || era.insId !== o.insId);
  });
  const entram = sim.out.filter(o => o.fKey !== fKey && !antes.has(o.fKey));
  return { bloqueios, avisos, notas, previa: { novo, movidos, saem, entram, r, a, b } };
}

// A assinatura dos avisos: a confirmação vale para estes avisos; outro conjunto pede outra
export const assinaturaDosAvisos = avisos => avisos.map(a => `${a.codigo}:${a.texto}`).join('|');

// O texto do histórico (até 500 caracteres): o aluno, a missão, o horário, o recurso e o instrutor, os avisos confirmados
// e o instrutor marcado disponível
export function descricaoDoAgendamento(estado, proposta, { avisos = [] } = {}) {
  const stu = estado.stu.find(s => s.id === proposta.stuId), x = estado.ins.find(i => i.id === proposta.insId);
  const missao = proposta.missao ? `${proposta.missao.codigo} (${proposta.mis})` : proposta.mis;
  const onde = nomeDoRecurso(isGroundMission(proposta.mis) ? GROUND_REG : proposta.r);
  const inicio = `${estado.aprovacao ? 'Agendado na escala aprovada' : 'Agendado na escala'}: ${stu ? stu.nm : proposta.stuId} · ${missao} · ${hm(proposta.a)}–${hm(proposta.b)} · ${onde} · ${x ? x.nm : proposta.insId}`;
  const disponivel = proposta.disponibilizar ? ` · ${x ? x.nm : proposta.insId} marcado disponível às ${hm(proposta.a)}` : '';
  const resumos = avisos.map(a => a.resumo || a.codigo);
  let confirmado = resumos.length ? ` · confirmado: ${resumos.join('; ')}` : '';
  const LIMITE = 500;
  if (inicio.length + confirmado.length + disponivel.length > LIMITE) {
    confirmado = `${confirmado.slice(0, Math.max(0, LIMITE - inicio.length - disponivel.length - 1))}…`;
  }
  return `${inicio}${confirmado}${disponivel}`.slice(0, LIMITE);
}

// A reversão do histórico ("↶ Desfazer"): o que aplicarAgendamento devolveu, no formato de js/reversoes.js
export const reversaoDoAgendamento = ({ stuId, mid, criado, pedido, fixo, disponibilidade, criadoComo }) =>
  ({ kind: 'desfazerAgendamento', stuId, mid, criado, pedido, fixo, disponibilidade, criadoComo, label: '↶ Desfazer' });

// Os pesos digitados que foram para o cadastro: uma entrada do histórico cada (sem reversão, como os pesos editados no
// cadastro)
export const historicoDosPesos = ({ pesos = [] }) => pesos.map(p => `Peso ${p.nm}: ${numeroBr(p.kg)} kg (agendamento)`);
