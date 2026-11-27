// Os dados pessoais do servidor falso (test/e2e/supabase-falso.js): a tabela dados_pessoais e a função
// salvar_dados_pessoais, com as regras do banco (js/dados-pessoais.js, as mesmas do modo local). Operadores e a
// secretaria leem e gravam; quem sai do cadastro leva os dados pessoais junto
import { gravarDadosPessoais, semQuemSaiu } from '../../../js/dados-pessoais.js';

const PERFIS_QUE_VEEM = ['operador', 'administrador', 'secretaria'];
export const veDadosPessoais = conta => Boolean(conta && PERFIS_QUE_VEEM.includes(conta.perfil));
const COLUNAS = ['tipo', 'id_cadastro', 'cpf', 'canac', 'nascimento', 'celular', 'email', 'atualizado_em', 'atualizado_por'];
// As colunas do select (sem ele, ou com *, todas)
export function soAsColunas(linhas, url) {
  const pedidas = (url.searchParams.get('select') || '*').split(',').map(c => c.trim()).filter(Boolean);
  if (pedidas.includes('*')) return linhas;
  return linhas.map(l => Object.fromEntries(pedidas.filter(c => COLUNAS.includes(c)).map(c => [c, l[c] ?? null])));
}

// agora: o relógio do servidor; historico: as entradas do histórico (uma gravação que muda algo acrescenta uma);
// cadastro(): o documento do cadastro guardado agora (ou undefined). ler devolve as linhas; salvar, [status, corpo]
export function criarDadosPessoais({ agora, historico, cadastro }) {
  // 'aluno:1000' → campos, atualizado_em e atualizado_por
  const dadosPessoais = new Map();
  let gravacoesDeDados = 0;

  const linhas = () => [...dadosPessoais].map(([chave, d]) => ({ tipo: chave.split(':')[0], id_cadastro: Number(chave.split(':')[1]), cpf: null, canac: null, nascimento: null, celular: null, email: null, ...d }));

  function salvar(args, conta) {
    if (!veDadosPessoais(conta)) return [403, { code: '42501', message: 'somente operadores e a secretaria alteram dados pessoais' }];
    try {
      const doc = cadastro();
      // Cada gravação com a sua data (como o clock_timestamp do banco)
      const quando = new Date(agora.getTime() + gravacoesDeDados++).toISOString();
      const r = gravarDadosPessoais(Object.fromEntries(dadosPessoais), args.p_tipo, args.p_id, args.p_dados,
        { hoje: agora.toISOString().slice(0, 10), autor: conta.nome, agora: quando, atualizadoEmLido: args.p_atualizado_em, cadastro: doc && doc.conteudo });
      dadosPessoais.clear();
      Object.entries(r.tabela).forEach(([chave, d]) => dadosPessoais.set(chave, d));
      let entrada = null;
      if (r.descricao) {
        const id = historico.length + 1;
        historico.push({ id, data: args.p_data, registrado_em: quando, usuario: conta.id, autor: conta.nome, tipo: 'mod', descricao: r.descricao, reverter: null, reverte: null, importado: false });
        entrada = { id, descricao: r.descricao };
      }
      return [200, { atualizado_em: r.atualizado_em, atualizado_por: conta.nome, historico: entrada }];
    } catch (e) {
      return [{ 23505: 409, PT409: 409, P0002: 404 }[e.code] || 400, { code: e.code, message: e.message.replace(/\.$/, ''), hint: e.campo }];
    }
  }

  // O cadastro novo foi gravado: os dados de quem saiu dele saem também
  function aposGravarCadastro(conteudo) {
    const ficam = semQuemSaiu(Object.fromEntries(dadosPessoais), conteudo);
    for (const chave of [...dadosPessoais.keys()]) if (!Object.hasOwn(ficam, chave)) dadosPessoais.delete(chave);
  }

  return { dadosPessoais, linhas, salvar, aposGravarCadastro };
}
