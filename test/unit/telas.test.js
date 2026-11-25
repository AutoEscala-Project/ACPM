// As telas do app (js/telas.js): quem vê cada uma, a tela da abertura e o endereço (#/<tela>[/<item>])
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TELAS, podeVer, telaDeAbertura, destinoDoEndereco, enderecoDoDestino } from '../../js/telas.js';

const PERFIS = ['operador', 'administrador', 'gestor', 'secretaria'];

describe('Quem vê cada tela', () => {
  it('o rótulo de cada tela é o nome dela hoje', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(TELAS).map(([id, t]) => [id, t.rotulo])), {
      age: 'Agenda', dem: 'Demanda', esc: 'Escala', apr: 'Aprovar', alu: 'Alunos', ins: 'Instrutores', rec: 'Recursos',
      cur: 'Cursos', rod: 'Rodízio', bi: 'BI', manual: 'Manual', conta: 'Minha conta'
    });
  });

  it('Operador, Administrador e Gestor veem todas as telas', () => {
    for (const perfil of ['operador', 'administrador', 'gestor']) {
      for (const tela of Object.keys(TELAS)) assert.equal(podeVer(tela, perfil), true, `${perfil} ${tela}`);
    }
  });

  it('a Secretaria: Agenda, Escala, Aprovar, Alunos, Instrutores, Cursos, o Manual e a conta', () => {
    const dela = Object.keys(TELAS).filter(t => podeVer(t, 'secretaria'));
    assert.deepEqual(dela, ['age', 'esc', 'apr', 'alu', 'ins', 'cur', 'manual', 'conta']);
  });

  it('no modo local (sem perfil), todas as telas menos a conta', () => {
    assert.deepEqual(Object.keys(TELAS).filter(t => podeVer(t, null)), Object.keys(TELAS).filter(t => t !== 'conta'));
  });

  it('uma tela que não existe ninguém vê', () => {
    for (const perfil of [...PERFIS, null]) assert.equal(podeVer('xyz', perfil), false);
  });

  it('a tela da abertura: a Agenda para a Secretaria, a Escala para os outros', () => {
    assert.equal(telaDeAbertura('secretaria'), 'age');
    for (const perfil of ['operador', 'administrador', 'gestor', null]) assert.equal(telaDeAbertura(perfil), 'esc');
  });
});

describe('O endereço', () => {
  it('lê a tela e o item', () => {
    assert.deepEqual(destinoDoEndereco('#/alu'), { tela: 'alu', item: null });
    assert.deepEqual(destinoDoEndereco('#/alu/1012'), { tela: 'alu', item: '1012' });
    assert.deepEqual(destinoDoEndereco('#/rec/PR-VOB'), { tela: 'rec', item: 'PR-VOB' });
    assert.deepEqual(destinoDoEndereco('#/esc/fora-1012_0_1'), { tela: 'esc', item: 'fora-1012_0_1' });
    assert.deepEqual(destinoDoEndereco('#/apr'), { tela: 'apr', item: null });
    assert.deepEqual(destinoDoEndereco('#/manual/manual-aba-rodizio'), { tela: 'manual', item: 'manual-aba-rodizio' });
  });

  it('recusa o que não é uma tela: a volta do login, o vazio, uma tela desconhecida, um item com espaço, acento ou longo', () => {
    for (const hash of ['#access_token=abc&type=recovery', '#/', '#/xyz', '#/alu/Maria Silva', '#/alu/João', `#/alu/${'1'.repeat(41)}`, '', '#conteudo', null, undefined, '#/alu/1/2']) {
      assert.equal(destinoDoEndereco(hash), null, String(hash));
    }
  });

  it('enderecoDoDestino é o inverso', () => {
    for (const hash of ['#/alu', '#/alu/1012', '#/rec/PR-VOB', '#/apr', '#/conta/usuarios']) assert.equal(enderecoDoDestino(destinoDoEndereco(hash)), hash);
    assert.equal(enderecoDoDestino({ tela: 'esc' }), '#/esc');
  });
});
