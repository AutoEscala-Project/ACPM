// A agenda do servidor falso (test/e2e/supabase-falso.js): a tabela solicitacoes e as funções dela, com as regras do banco
// (a migração aprovacao_dos_pedidos, o passo D1). O app chama a função de 16 argumentos; a de 13 (as abas abertas antes do
// D1) é o atalho dela, que aprova o pedido do operador e não tem a 2ª preferência nem a lista de espera. As regras, na
// ordem do banco: quem pode, o horário específico e a duração, o recurso, o horário fixo e a missão do curso
// (recusaDoPedido, com os cursos das tabelas), a 2ª preferência, a confirmação e a lista de espera juntas, o domingo e a
// data que já passou, o limite de voos locais no horário (o 7º só com a confirmação, que fica registrada, ou na lista de
// espera), o prazo, a exceção da coordenação e a aprovação, só dos operadores. E aprovar (uma lista), retirar a aprovação,
// cancelar (o aprovado de uma data que já passou, não) e a contagem por dia (com a regra de leitura). O roteador lê a
// tabela (GET /rest/v1/solicitacoes) e manda as funções para cá
import { prazoDaAgendaPermite, RECURSO_DO_PEDIDO, recusaDoPedido, recusaDaSegundaPreferencia, recusaDaData, hojeEmSaoPaulo } from '../../../js/agenda.js';
import { GROUND_DURATION_H, MISSOES_LOCAIS, LIMITE_DE_VOOS_LOCAIS } from '../../../js/config.js';

export const FUNCOES_DA_AGENDA = ['registrar_solicitacao', 'cancelar_solicitacao', 'aprovar_solicitacoes', 'retirar_aprovacao_da_solicitacao', 'solicitacoes_por_dia'];

// Os status do PostgREST para os códigos das funções (PTxyz: o status xyz)
const STATUS = { 42501: 403, P0002: 404, 22023: 400, 23514: 400, PT403: 403, PT422: 422 };
const ARGUMENTOS_DE_13 = ['p_data', 'p_aluno', 'p_aluno_nome', 'p_missao', 'p_janela', 'p_horario', 'p_horas', 'p_registrado_por', 'p_observacao', 'p_excecao',
  'p_recurso', 'p_missao_do_curso', 'p_confirmar_limite'];
const ARGUMENTOS_DE_16 = [...ARGUMENTOS_DE_13, 'p_horario2', 'p_aprovar', 'p_esperar'];
const comOsArgumentos = (args, nomes) => Object.keys(args).length === nomes.length && nomes.every(n => Object.hasOwn(args, n));

// agora: o relógio do servidor para o prazo da agenda; cursos: os cursos das tabelas agora (a missão do curso do pedido).
// atender devolve [status, corpo] (corpo undefined: sem corpo)
export function criarAgenda({ agora, cursos = () => [] }) {
  const solicitacoes = [];
  const recusa = (code, message, hint = null) => [STATUS[code], { code, message, ...(hint ? { hint } : {}) }];
  const hoje = () => hojeEmSaoPaulo(agora);

  function registrar(args, conta, operador) {
    // A função de 16 argumentos, ou o atalho de 13: a chamada com outros nomes não acha nenhuma (o app não chama as de antes)
    const de16 = comOsArgumentos(args, ARGUMENTOS_DE_16);
    if (!de16 && !comOsArgumentos(args, ARGUMENTOS_DE_13)) {
      return [404, { code: 'PGRST202', message: 'Could not find the function public.registrar_solicitacao in the schema cache' }];
    }
    const horario2 = de16 ? args.p_horario2 : null, esperar = de16 && Boolean(args.p_esperar), aprovar = de16 ? Boolean(args.p_aprovar) : operador;
    if (args.p_janela !== 'horario' || !args.p_horario) return recusa('22023', 'o pedido é num horário específico', 'horario');
    const horas = String(args.p_missao).startsWith('Ground') ? GROUND_DURATION_H : Math.round(+args.p_horas * 10) / 10;
    if (!(horas > 0 && horas <= 5)) return recusa('22023', 'a duração vai de 0,1 h a 5 h', 'horas');
    const regra = recusaDoPedido({ missao: args.p_missao, recurso: args.p_recurso, horario: args.p_horario, horas, missaoDoCurso: args.p_missao_do_curso }, cursos())
      || recusaDaSegundaPreferencia({ missao: args.p_missao, horario: args.p_horario, horario2 })
      || (args.p_confirmar_limite && esperar ? { code: '22023', campo: 'esperar', mensagem: 'confirmação ou lista de espera, não as duas' } : null)
      || recusaDaData(args.p_data, agora);
    if (regra) return recusa(regra.code, regra.mensagem, regra.campo);
    // No máximo 6 voos locais no mesmo horário; o 7º, com a confirmação, fica registrado com quem confirmou; na lista de
    // espera, sem nada a mais
    const cheio = MISSOES_LOCAIS.includes(args.p_missao)
      && solicitacoes.filter(s => s.data === args.p_data && !s.cancelada_em && s.horario === args.p_horario && MISSOES_LOCAIS.includes(s.missao)).length >= LIMITE_DE_VOOS_LOCAIS;
    if (cheio && !args.p_confirmar_limite && !esperar) return recusa('PT422', 'já há 6 voos locais no horário', 'locais');
    const alemDoLimite = cheio && Boolean(args.p_confirmar_limite);
    const noPrazo = prazoDaAgendaPermite(args.p_data, agora);
    if (!noPrazo && !args.p_excecao) return recusa('PT403', 'prazo encerrado', 'prazo');
    if (!noPrazo && !operador) return recusa('42501', 'exceção só para operadores', 'excecao');
    if (aprovar && !operador) return recusa('42501', 'somente os operadores aprovam pedidos', 'aprovar');
    const recurso = args.p_recurso.trim();
    if (!RECURSO_DO_PEDIDO.test(recurso)) return recusa('23514', 'violates check constraint');
    const id = solicitacoes.length + 1;
    const aprovado = aprovar || !noPrazo;
    solicitacoes.push({
      id, data: args.p_data, aluno: args.p_aluno, aluno_nome: args.p_aluno_nome.trim(), missao: args.p_missao, janela: args.p_janela,
      horario: args.p_horario, horario2: horario2 ?? null, horas, recurso, missao_do_curso: args.p_missao_do_curso, observacao: (args.p_observacao || '').trim() || null,
      registrado_por: args.p_registrado_por.trim(), registrado_em: agora.toISOString(), usuario: conta.id, conta: conta.nome, excecao: !noPrazo,
      limite_confirmado_por: alemDoLimite ? conta.nome : null, limite_confirmado_em: alemDoLimite ? agora.toISOString() : null,
      aprovada_em: aprovado ? agora.toISOString() : null, aprovada_por: aprovado ? conta.nome : null, aprovada_usuario: aprovado ? conta.id : null,
      aprovacao_retirada_em: null, aprovacao_retirada_por: null, aprovacao_retirada_usuario: null,
      cancelada_em: null, cancelada_por: null
    });
    return [200, id];
  }

  function atender(funcao, args, conta) {
    // A contagem por dia lê com a regra de leitura da tabela: quem não lê a agenda (a TV, a conta sem perfil) recebe {}
    if (funcao === 'solicitacoes_por_dia') {
      if (!conta) return [401, { code: '42501', message: 'permission denied for function solicitacoes_por_dia' }];
      if (!['secretaria', 'operador', 'administrador', 'gestor'].includes(conta.perfil)) return [200, {}];
      const contagem = {};
      for (const s of solicitacoes.filter(x => !x.cancelada_em && x.data >= args.p_de && x.data <= args.p_ate)) {
        contagem[s.data] ??= { aguardando: 0, aprovadas: 0 };
        contagem[s.data][s.aprovada_em ? 'aprovadas' : 'aguardando']++;
      }
      return [200, contagem];
    }
    const operador = Boolean(conta) && ['operador', 'administrador'].includes(conta.perfil);
    // Aprovar e retirar a aprovação: só os operadores
    if (funcao === 'aprovar_solicitacoes' || funcao === 'retirar_aprovacao_da_solicitacao') {
      if (!operador) return recusa('42501', 'somente os operadores aprovam pedidos', 'aprovar');
      if (funcao === 'aprovar_solicitacoes') {
        if (!Array.isArray(args.p_ids) || !args.p_ids.length || args.p_ids.length > 200) return recusa('22023', 'aprove de 1 a 200 pedidos de cada vez', 'ids');
        const aprovadas = solicitacoes.filter(s => args.p_ids.includes(s.id) && !s.cancelada_em && !s.aprovada_em && s.data >= hoje());
        for (const s of aprovadas) {
          Object.assign(s, { aprovada_em: agora.toISOString(), aprovada_por: conta.nome, aprovada_usuario: conta.id, aprovacao_retirada_em: null, aprovacao_retirada_por: null, aprovacao_retirada_usuario: null });
        }
        return [200, aprovadas.map(s => s.id).sort((a, b) => a - b)];
      }
      const s = solicitacoes.find(x => x.id === args.p_id && !x.cancelada_em && x.aprovada_em);
      if (!s) return recusa('P0002', 'pedido não encontrado, cancelado ou sem aprovação');
      if (s.data < hoje()) return recusa('PT403', 'a aprovação de uma data que já passou não é retirada', 'passada');
      Object.assign(s, { aprovada_em: null, aprovada_por: null, aprovada_usuario: null, aprovacao_retirada_em: agora.toISOString(), aprovacao_retirada_por: conta.nome, aprovacao_retirada_usuario: conta.id });
      return [204];
    }
    // Agenda: secretaria e operadores registram e cancelam; fora do prazo, só operadores pela exceção da coordenação
    if (!conta || !['secretaria', 'operador', 'administrador'].includes(conta.perfil)) return recusa('42501', 'sem permissão na agenda');
    if (funcao === 'cancelar_solicitacao') {
      const s = solicitacoes.find(x => x.id === args.p_id && !x.cancelada_em);
      if (!s) return recusa('P0002', 'pedido não encontrado');
      if (s.aprovada_em && s.data < hoje()) return recusa('PT403', 'o pedido aprovado de uma data que já passou não é cancelado', 'passada');
      Object.assign(s, { cancelada_em: agora.toISOString(), cancelada_por: args.p_cancelada_por.trim() });
      return [204];
    }
    return registrar(args, conta, operador);
  }

  return { solicitacoes, atender };
}
