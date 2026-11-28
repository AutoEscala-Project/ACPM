// As telas do app (js/telas.js): quem vê cada uma, a tela da abertura e o endereço (#/<tela>[/<item>])
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TELAS, ESTAGIOS, podeVer, telaDeAbertura, dataDeAbertura, destinoDoEndereco, enderecoDoDestino, linhaAbertaPorPadrao,
  lerPreferencias
} from '../../js/telas.js';

const PERFIS = ['operador', 'administrador', 'gestor', 'secretaria'];

describe('Quem vê cada tela', () => {
  it('as quatro etapas, na ordem, cada uma com a sua tela', () => {
    assert.deepEqual(ESTAGIOS, ['pedidos', 'processamento', 'escala', 'aprovar']);
    assert.deepEqual(ESTAGIOS.map(e => Object.keys(TELAS).find(t => TELAS[t].estagio === e)), ['age', 'dem', 'esc', 'apr']);
  });

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

describe('A linha aberta por padrão', () => {
  it('só quando cabe numa fileira e a janela é alta', () => {
    assert.equal(linhaAbertaPorPadrao(1540, 760), true);
    assert.equal(linhaAbertaPorPadrao(1539, 1080), false);
    assert.equal(linhaAbertaPorPadrao(1888, 759), false);
  });
});

describe('A data da abertura', () => {
  const base = { amanha: '2026-11-11', primeiraAberta: '2026-11-12' };
  it('a data do link vale para todos os perfis', () => {
    for (const perfil of ['operador', 'administrador', 'gestor', 'secretaria', null]) assert.deepEqual(dataDeAbertura({ ...base, pedida: '2026-11-20', perfil }), { data: '2026-11-20', aviso: null });
  });
  it('um domingo no link abre a segunda, com o aviso', () => {
    assert.deepEqual(dataDeAbertura({ ...base, pedida: '2026-11-15', perfil: 'operador' }), { data: '2026-11-16', aviso: 'domingo' });
  });
  it('uma data que não existe abre amanhã, com o aviso', () => {
    assert.deepEqual(dataDeAbertura({ ...base, pedida: '2026-02-30', perfil: 'operador' }), { data: '2026-11-11', aviso: 'invalida' });
  });
  it('sem data no link: a Secretaria na primeira data que aceita pedidos; os outros amanhã', () => {
    assert.deepEqual(dataDeAbertura({ ...base, pedida: null, perfil: 'secretaria' }), { data: '2026-11-12', aviso: null });
    assert.deepEqual(dataDeAbertura({ ...base, pedida: null, perfil: 'gestor' }), { data: '2026-11-11', aviso: null });
  });
});

// linha-fix-escala-sem-caixas (Pedro, 28/11): o trilho está sempre à vista; o calendário e os avisos da data recolhem, cada
// um, e o que a pessoa escolheu fica guardado (acpm_trilho). Sem "Fixar ao lado" e sem as classes da largura
describe('O que o trilho guarda', () => {
  it('lerPreferencias: o calendário e os avisos, abertos ou recolhidos', () => {
    assert.deepEqual(lerPreferencias('{"calendario":"recolhido","avisos":"recolhidos"}'), { calendario: 'recolhido', avisos: 'recolhidos' });
    assert.deepEqual(lerPreferencias('{"calendario":"aberto"}'), { calendario: 'aberto' });
    assert.deepEqual(lerPreferencias('{"avisos":"abertos"}'), { avisos: 'abertos' });
  });
  it('lerPreferencias: o guardado de antes ("Fixar ao lado", por largura) e o que não se entende valem nada', () => {
    for (const texto of [null, '', 'xyz', '[1,2]', '"recolhido"', '{"media":"fixo","larga":"solto"}', '{"calendario":"fixo"}', '{"avisos":"recolhido"}', '{"calendario":"recolhido","avisos":1}']) {
      assert.deepEqual(lerPreferencias(texto), {}, String(texto));
    }
  });
});

describe('O trilho em index.html', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('a região do trilho, entre a linha e a tela, sempre à vista; o topo sem a data', () => {
    assert.match(html, /<aside class="trilho" id="trilho" aria-label="Data e avisos" data-regiao="trilho">/);
    assert.ok(html.indexOf('id="linha"') < html.indexOf('id="trilho"') && html.indexOf('id="trilho"') < html.indexOf('<main id="conteudo"'));
    const topo = html.slice(html.indexOf('<header class="topo"'), html.indexOf('</header>'));
    assert.doesNotMatch(topo, /btn-data|topo-data|dt-rotulo|i-calendario/);
    assert.doesNotMatch(html, /id="btn-data"|id="btn-fixar-trilho"|id="btn-fechar-trilho"/);
  });

  it('os dois botões que recolhem: o do calendário (no alto do trilho, com a data) e o dos avisos da data', () => {
    assert.match(html, /id="btn-recolher-trilho" aria-expanded="true" aria-controls="trilho-corpo"/);
    assert.match(html, /id="btn-avisos" aria-expanded="true" aria-controls="avisos-corpo"/);
    assert.ok(html.indexOf('id="trilho-rotulo"') < html.indexOf('id="btn-recolher-trilho"') && html.indexOf('id="btn-recolher-trilho"') < html.indexOf('id="trilho-corpo"'));
  });
});
