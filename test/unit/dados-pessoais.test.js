// Dados pessoais de alunos e instrutores: nome completo, CPF, CANAC, nascimento, celular e e-mail. Ficam fora do
// cadastro, numa tabela que só operadores, administradores e a secretaria leem (e só operadores e administradores
// gravam); o servidor valida de novo. O histórico registra só quais campos mudaram, nunca os valores.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS_PESSOAIS, cpfValido, validarDadosPessoais, formatarCpf, formatarCelular, camposAlterados, gravarDadosPessoais, semQuemSaiu, nomeNoCadastro, paraGravar, juntarAListaLida } from '../../js/dados-pessoais.js';
import { CASOS_DOS_DADOS_PESSOAIS, CADASTRO_DOS_CASOS, ALUNO_DOS_CASOS, tabelaDoCaso, versaoLidaDoCaso } from '../helpers/casos-dos-dados-pessoais.js';

describe('Dados pessoais: validação', () => {
  it('os campos: nome completo (o primeiro), CPF, CANAC, nascimento, celular e e-mail', () => {
    assert.deepEqual(CAMPOS_PESSOAIS.map(c => [c.id, c.rotulo]), [
      ['nome_completo', 'Nome completo'], ['cpf', 'CPF'], ['canac', 'CANAC'], ['nascimento', 'Nascimento'], ['celular', 'Celular'], ['email', 'E-mail']
    ]);
  });

  it('o nome completo: sem os espaços das pontas, com um espaço só entre as palavras, até 120 caracteres', () => {
    assert.deepEqual(validarDadosPessoais({ nome_completo: '  Ana\t Maria   Souza ' }, '2026-11-13'), { dados: { nome_completo: 'Ana Maria Souza' }, erros: {} });
    assert.deepEqual(validarDadosPessoais({ nome_completo: 'x'.repeat(120) }, '2026-11-13').erros, {});
    assert.equal(validarDadosPessoais({ nome_completo: 'x'.repeat(121) }, '2026-11-13').erros.nome_completo, 'O nome completo tem no máximo 120 caracteres.');
    assert.deepEqual(validarDadosPessoais({ nome_completo: '   ' }, '2026-11-13'), { dados: {}, erros: {} });
  });

  it('o que o app manda: sempre a chave do nome completo (vazia apaga), os outros campos só preenchidos', () => {
    assert.deepEqual(paraGravar({ canac: '123456' }), { canac: '123456', nome_completo: '' });
    assert.deepEqual(paraGravar({ nome_completo: 'Ana Souza' }), { nome_completo: 'Ana Souza' });
  });

  it('CPF: 11 dígitos com os verificadores certos (com ou sem pontos e traço); todos iguais não vale', () => {
    assert.equal(cpfValido('529.982.247-25'), true);
    assert.equal(cpfValido('11144477735'), true);
    assert.equal(cpfValido('529.982.247-24'), false);
    assert.equal(cpfValido('111.111.111-11'), false);
    assert.equal(cpfValido('1234567890'), false);
    assert.equal(cpfValido(''), false);
  });

  it('valida e normaliza: só dígitos no CPF, CANAC e celular; e-mail em minúsculas; vazio fica de fora', () => {
    const { dados, erros } = validarDadosPessoais({
      cpf: '529.982.247-25', canac: ' 123456 ', nascimento: '2001-05-20', celular: '(37) 99123-4567', email: ' Ana@Exemplo.com '
    }, '2026-11-13');
    assert.deepEqual(erros, {});
    assert.deepEqual(dados, { cpf: '52998224725', canac: '123456', nascimento: '2001-05-20', celular: '37991234567', email: 'ana@exemplo.com' });
    assert.deepEqual(validarDadosPessoais({ cpf: '', canac: ' ', email: '' }, '2026-11-13'), { dados: {}, erros: {} });
  });

  it('cada campo inválido tem a sua mensagem', () => {
    const { erros } = validarDadosPessoais({ cpf: '529.982.247-24', canac: '12345', nascimento: '2030-01-01', celular: '3733334444', email: 'ana@' }, '2026-11-13');
    assert.deepEqual(erros, {
      cpf: 'CPF inválido.',
      canac: 'O CANAC tem 6 dígitos.',
      nascimento: 'Data de nascimento inválida.',
      celular: 'Celular com DDD e 9 dígitos, como (37) 99123-4567.',
      email: 'E-mail inválido.'
    });
    assert.equal(validarDadosPessoais({ nascimento: '1899-12-31' }, '2026-11-13').erros.nascimento, 'Data de nascimento inválida.');
    assert.equal(validarDadosPessoais({ nascimento: '2026-02-30' }, '2026-11-13').erros.nascimento, 'Data de nascimento inválida.');
    assert.equal(validarDadosPessoais({ celular: '03991234567' }, '2026-11-13').erros.celular !== undefined, true, 'DDD não começa com 0');
  });
});

describe('Dados pessoais: na tela e no histórico', () => {
  it('CPF com pontos e traço, celular com DDD entre parênteses', () => {
    assert.equal(formatarCpf('52998224725'), '529.982.247-25');
    assert.equal(formatarCelular('37991234567'), '(37) 99123-4567');
    assert.equal(formatarCpf(''), '');
    assert.equal(formatarCelular(undefined), '');
  });

  it('o histórico registra só os nomes dos campos que mudaram, nunca os valores', () => {
    assert.deepEqual(camposAlterados({ cpf: '52998224725', email: 'a@b.com' }, { cpf: '52998224725', celular: '37991234567' }), ['Celular', 'E-mail']);
    assert.deepEqual(camposAlterados({}, {}), []);
    assert.deepEqual(camposAlterados(null, { canac: '123456' }), ['CANAC']);
  });
});

// A mesma regra do servidor (salvar_dados_pessoais) para o modo local e o servidor dos testes
describe('Dados pessoais: gravar com a versão lida', () => {
  const cadastro = { stu: [{ id: 1000, nm: 'Ana Souza' }, { id: 1001, nm: 'Bia' }], ins: [{ id: 7, nm: 'Instrutor 07' }] };
  const opcoes = (extra = {}) => ({ hoje: '2026-11-14', autor: 'Operador 01', agora: '2026-11-14T12:00:00.000Z', cadastro, ...extra });

  it('grava, diz quando e o que mudou (a descrição do histórico, sem os valores)', () => {
    const r = gravarDadosPessoais({}, 'aluno', 1000, { cpf: '529.982.247-25', canac: '123456' }, opcoes({ atualizadoEmLido: null }));
    assert.deepEqual(r.tabela, { 'aluno:1000': { cpf: '52998224725', canac: '123456', atualizado_em: '2026-11-14T12:00:00.000Z', atualizado_por: 'Operador 01' } });
    assert.equal(r.atualizado_em, '2026-11-14T12:00:00.000Z');
    assert.equal(r.descricao, 'Dados pessoais de Ana Souza atualizados: CPF, CANAC');
    const igual = gravarDadosPessoais(r.tabela, 'aluno', 1000, { cpf: '52998224725', canac: '123456' }, opcoes({ atualizadoEmLido: r.atualizado_em, agora: '2026-11-14T13:00:00.000Z' }));
    assert.equal(igual.descricao, null, 'sem mudança, nada para o histórico');
  });

  it('outra pessoa gravou antes (a versão lida não é a guardada): recusa com o código do servidor', () => {
    const { tabela } = gravarDadosPessoais({}, 'aluno', 1000, { canac: '123456' }, opcoes({ atualizadoEmLido: null }));
    assert.throws(() => gravarDadosPessoais(tabela, 'aluno', 1000, { canac: '654321' }, opcoes({ atualizadoEmLido: null })), e => e.code === 'PT409');
    assert.throws(() => gravarDadosPessoais(tabela, 'aluno', 1000, { canac: '654321' }, opcoes({ atualizadoEmLido: '2000-01-01T00:00:00.000Z' })), e => e.code === 'PT409');
  });

  it('só quem está no cadastro', () => {
    assert.equal(nomeNoCadastro(cadastro, 'instrutor', 7), 'Instrutor 07');
    assert.equal(nomeNoCadastro(cadastro, 'aluno', 7), null);
    assert.throws(() => gravarDadosPessoais({}, 'aluno', 1003, { canac: '123456' }, opcoes({ atualizadoEmLido: null })), e => e.code === 'P0002');
  });

  it('o histórico: o nome completo sem a chave não mudou; com a chave, conta como os outros, e vem primeiro', () => {
    assert.deepEqual(camposAlterados({ nome_completo: 'Ana Souza', canac: '1' }, { canac: '2' }), ['CANAC']);
    assert.deepEqual(camposAlterados({ nome_completo: 'Ana Souza', canac: '1' }, { nome_completo: '', canac: '2' }), ['Nome completo', 'CANAC']);
    assert.deepEqual(camposAlterados(null, { nome_completo: 'Ana Souza' }), ['Nome completo']);
  });

  it('quem sai do cadastro leva os dados pessoais junto', () => {
    const tabela = { 'aluno:1000': { canac: '1' }, 'aluno:1002': { canac: '2' }, 'instrutor:7': { canac: '3' }, 'instrutor:8': { canac: '4' } };
    assert.deepEqual(Object.keys(semQuemSaiu(tabela, cadastro)), ['aluno:1000', 'instrutor:7']);
    assert.equal(semQuemSaiu(tabela, { stu: [] }), tabela, 'sem as duas listas no cadastro, nada sai');
  });
});

// Os casos do nome completo (test/helpers/casos-dos-dados-pessoais.js), os mesmos do banco
describe('Dados pessoais: os casos do nome completo, na regra pura', () => {
  for (const caso of CASOS_DOS_DADOS_PESSOAIS) {
    it(caso.nome, () => {
      const gravar = () => gravarDadosPessoais(tabelaDoCaso(caso), 'aluno', ALUNO_DOS_CASOS, caso.dados,
        { hoje: '2026-11-14', autor: 'Operador 01', agora: '2026-11-14T12:00:00.000Z', atualizadoEmLido: versaoLidaDoCaso(caso), cadastro: CADASTRO_DOS_CASOS });
      if (caso.erro) {
        assert.throws(gravar, e => e.code === caso.erro.code && e.campo === caso.erro.campo);
        return;
      }
      const r = gravar();
      const linha = r.tabela[`aluno:${ALUNO_DOS_CASOS}`];
      assert.equal(Boolean(linha), caso.gravado.linha);
      assert.equal((linha && linha.nome_completo) ?? null, caso.gravado.nome_completo);
      if (caso.gravado.historico) assert.equal(r.descricao, caso.gravado.historico);
    });
  }
});

// A lista lida traz só o CANAC, o nome completo e a versão: a pessoa já lida inteira (a leitura dela pode chegar antes da
// lista) fica inteira enquanto a versão é a mesma; com a versão nova, vale a lista (a pessoa é lida de novo ao ser
// escolhida); a lida que a lista não trouxe fica (a lista tem no máximo 1000 linhas)
describe('Dados pessoais: a lista lida junto com as pessoas já lidas', () => {
  it('a pessoa lida inteira fica com a mesma versão; com outra versão, vale a lista; as outras vêm da lista', () => {
    const v1 = '2026-11-10T12:00:00.000Z', v2 = '2026-11-10T13:00:00.000Z';
    const lista = { 1000: { canac: '123456', atualizado_em: v1 }, 1001: { nome_completo: 'Bia Lima', atualizado_em: v2 }, 1002: { canac: '222333', atualizado_em: v1 } };
    const guardados = { 1000: { cpf: '52998224725', canac: '123456', atualizado_em: v1 }, 1001: { cpf: '11144477735', atualizado_em: v1 }, 1003: { email: 'x@y.com', atualizado_em: v1 } };
    assert.deepEqual(juntarAListaLida(lista, guardados), {
      1000: { cpf: '52998224725', canac: '123456', atualizado_em: v1 },
      1001: { nome_completo: 'Bia Lima', atualizado_em: v2 },
      1002: { canac: '222333', atualizado_em: v1 },
      1003: { email: 'x@y.com', atualizado_em: v1 }
    });
    assert.deepEqual(juntarAListaLida(lista, {}), lista);
  });
});
