// O glossário: os termos da tela, explicados numa frase curta. Os textos vão para a dica (o balão que aparece no
// mouse, no foco ou no toque) e para a seção Glossário do Manual.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { GLOSSARIO, montarGlossario, ABAS_DO_GLOSSARIO } from '../../js/glossario.js';
import { REVISAO_H, MENOR_VOO_H, LIMITE_DE_VOOS_LOCAIS } from '../../js/config.js';
import { HORARIO_DO_NOTURNO } from '../../js/horarios.js';
import { hm } from '../../js/format.js';
import { ligada } from '../../js/funcionalidades.js';
import { LIMITES_DA_LEI } from '../../js/limites.js';
import { INTERVALO_DO_HANGAR } from '../../js/metricas.js';

const raiz = new URL('../../', import.meta.url);
const fontes = [
  readFileSync(new URL('index.html', raiz), 'utf8'),
  ...readdirSync(new URL('js/', raiz)).filter(f => f.endsWith('.js')).map(f => readFileSync(new URL(`js/${f}`, raiz), 'utf8')),
  ...readdirSync(new URL('js/views/', raiz)).filter(f => f.endsWith('.js')).map(f => readFileSync(new URL(`js/views/${f}`, raiz), 'utf8'))
].join('\n');

// O glossário inteiro (com todas as funcionalidades ligadas) e o de nenhuma (js/funcionalidades.js)
const INTEIRO = montarGlossario(() => true), SEM_FUNCIONALIDADES = montarGlossario(() => false);

describe('Glossário', () => {
  it('cada termo tem o nome, uma frase curta (até 240 caracteres, texto puro, termina com ponto) e a aba', () => {
    assert.ok(Object.keys(INTEIRO).length >= 25);
    for (const [id, { termo, texto, aba }] of [...Object.entries(INTEIRO), ...Object.entries(SEM_FUNCIONALIDADES)]) {
      assert.match(id, /^[a-z0-9-]+$/, id);
      assert.ok(termo && termo.length <= 40, id);
      assert.ok(texto.length <= 240, `${id}: ${texto.length} caracteres`);
      assert.ok(texto.endsWith('.'), `${id}: termina com ponto`);
      assert.doesNotMatch(texto, /[<>]/, `${id}: texto puro`);
      assert.ok(ABAS_DO_GLOSSARIO.includes(aba), `${id}: aba ${aba}`);
    }
  });

  it('toda dica usada nas telas existe no glossário', () => {
    const usadas = [...fontes.matchAll(/data-dica="([a-z0-9-]+)"/g)].map(m => m[1]);
    const desconhecidas = [...new Set(usadas)].filter(id => !Object.hasOwn(INTEIRO, id));
    assert.deepEqual(desconhecidas, []);
  });

  it('os números das regras vêm da configuração', () => {
    assert.match(GLOSSARIO['horas-disponiveis'].texto, new RegExp(`revisão de ${REVISAO_H} horas`));
    assert.match(GLOSSARIO['horas-disponiveis'].texto, new RegExp(`voo de ${MENOR_VOO_H} h`));
    assert.match(GLOSSARIO['tempo-parado'].texto, new RegExp(`${INTERVALO_DO_HANGAR / 60} h ou mais`));
    assert.match(GLOSSARIO['limites-da-lei'].texto, new RegExp(`${LIMITES_DA_LEI.vooMesH} h no mês`));
    assert.match(GLOSSARIO['limites-da-lei'].texto, new RegExp(`${LIMITES_DA_LEI.vooAnoH} h no ano`));
    assert.match(GLOSSARIO['fora-da-regra'].texto, new RegExp(`até as ${hm(HORARIO_DO_NOTURNO)}, no máximo ${LIMITE_DE_VOOS_LOCAIS} voos locais`));
  });

  // A seção Glossário do Manual lista os termos de cada aba na ordem do glossário: os da aba Cursos ficam no bloco dela,
  // e o grupo começa pela fase do curso e pelos alunos nela (o índice das fases), não pelo trecho do Noturno, que fica no
  // fim
  it('os termos da aba Cursos, na ordem do bloco dela', () => {
    const daAba = Object.entries(INTEIRO).filter(([, t]) => t.aba === 'Cursos').map(([id]) => id);
    assert.deepEqual(daAba, ['fase-do-curso', 'alunos-na-fase', 'quando-voar', 'dispensada', 'trecho-do-noturno', 'habilitacoes-da-missao']);
  });

  it('com o hangar, o progresso e a prioridade desligados, os termos deles saem, e os outros não falam deles', () => {
    const saem = Object.keys(INTEIRO).filter(id => !Object.hasOwn(SEM_FUNCIONALIDADES, id));
    assert.deepEqual(saem, ['resultado', 'prioridade', 'fora-da-ordem', 'curso-encerrado', 'hangar', 'progresso', 'missao-anterior', 'missao-atual', 'resultado-sem-voo', 'colocar-no-curso', 'alunos-na-fase']);
    for (const [id, { termo, texto }] of Object.entries(SEM_FUNCIONALIDADES)) {
      assert.doesNotMatch(`${termo} ${texto}`, /hangar|progresso|próxima missão|ainda não aprovou|sugerida|o resultado|prioridade/i, id);
    }
    // Uma só: os termos dela saem, e os da outra ficam como estão
    const semHangar = montarGlossario(nome => nome !== 'hangar');
    assert.deepEqual(Object.keys(INTEIRO).filter(id => !Object.hasOwn(semHangar, id)), ['hangar']);
    assert.equal(semHangar['missao-do-curso'].texto, INTEIRO['missao-do-curso'].texto);
    assert.doesNotMatch(Object.values(semHangar).map(t => t.texto).join(' '), /hangar/i);
  });

  // A tela mostra a prioridade com 1 a mais alta (a guardada continua com 5 a mais alta: js/rules.js, prioridadeNaTela)
  // Alunos (passo A): o nome completo (dado pessoal, fora da escala) e as missões do aluno, com o progresso ligado
  // C, "tela": os termos de INVAs; o "turno" saiu (os três turnos são faixas prontas, com os horários no botão), e as
  // faixas ("Pode decolar") e a pausa entraram; as colunas da grade ("Voos", "Mês") saíram com ela
  it('os termos da tela INVAs, na ordem do bloco dela, sem o turno', () => {
    const daAba = Object.entries(INTEIRO).filter(([, t]) => t.aba === 'INVAs').map(([id]) => id);
    assert.deepEqual(daAba, ['vem-nesta-data', 'faixas', 'pausa', 'checador', 'filtro-das-habilitacoes', 'fora-do-app', 'limites-da-lei']);
    for (const id of ['turno', 'voos-do-instrutor', 'horas-do-mes']) assert.equal(Object.hasOwn(INTEIRO, id), false, id);
    assert.ok(!ABAS_DO_GLOSSARIO.includes('Instrutores'));
    // C, "regra": a missão começa dentro da faixa e pode terminar depois; a pausa, nenhuma missão a toca
    assert.match(INTEIRO.faixas.texto, /a missão começa dentro de uma faixa e pode terminar depois dela/);
    assert.match(INTEIRO.faixas.texto, /até 17:30 não inclui o Noturno/);
    assert.doesNotMatch(INTEIRO.faixas.texto, /voo inteiro/);
    assert.match(INTEIRO.pausa.texto, /não voa/);
    assert.match(INTEIRO.pausa.texto, /nem a que começou antes dela/);
  });

  it('os termos da tela Alunos, na ordem do bloco dela', () => {
    const daAba = Object.entries(INTEIRO).filter(([, t]) => t.aba === 'Alunos').map(([id]) => id);
    assert.deepEqual(daAba, ['voa-com', 'nao-escalar-com', 'progresso', 'missao-anterior', 'missao-atual', 'resultado-sem-voo', 'colocar-no-curso', 'inativo', 'filtro-dos-cursos', 'nome-completo']);
    assert.match(INTEIRO['nome-completo'].texto, /não vai para a escala/);
  });

  it('a prioridade, ligada: de 1 a 5, e 1 é a mais alta', () => {
    assert.equal(INTEIRO.prioridade.funcionalidade, undefined);
    assert.match(INTEIRO.prioridade.texto, /^De 1 a 5, e 1 é a mais alta/);
    assert.doesNotMatch(INTEIRO.prioridade.texto, /maior/);
    assert.deepEqual(Object.keys(INTEIRO).filter(id => !Object.hasOwn(montarGlossario(nome => nome !== 'prioridade'), id)), ['prioridade']);
  });

  // O almoço (#104): o aviso "Sem almoço" da Escala tem a dica, e a pausa que é o almoço é a que cobre 1 h da janela (de
  // qualquer tamanho: a de 10:30 a 12:30 também; a de 1 h das 10:30 às 11:30, só 30 min nela, não). O almoço vem antes do
  // “Priorizar com”, e a escala muda outras missões antes de desistir dele (Pedro, 28/11)
  it('o almoço: a dica do aviso "Sem almoço" na Escala e a pausa que cobre 1 h entre 11:00 e 14:00', () => {
    const escala = readFileSync(new URL('js/views/escala.js', raiz), 'utf8');
    assert.match(escala, /data-dica="almoco"/);
    assert.match(GLOSSARIO.pausa.texto, /A que cobre 1 h entre 11:00 e 14:00 é o almoço dele\.$/);
    assert.match(GLOSSARIO.almoco.texto, /antes do Priorizar com/);
    assert.match(GLOSSARIO.almoco.texto, /muda outras missões/);
  });

  it('o glossário das telas é o das funcionalidades ligadas no app', () => assert.deepEqual(GLOSSARIO, montarGlossario(ligada)));
});

// A Agenda pelo curso do aluno (F1c): a missão do pedido e o 7º voo local, com o limite da configuração
describe('Glossário: a Agenda', () => {
  it('a missão do pedido vem do curso do aluno, e o 7º voo local pede a confirmação', () => {
    assert.match(GLOSSARIO['missao-do-pedido'].texto, /as missões do programa dele, por fase/);
    assert.equal(GLOSSARIO['setimo-voo-local'].termo, `${LIMITE_DE_VOOS_LOCAIS + 1}º voo local`);
    assert.match(GLOSSARIO['setimo-voo-local'].texto, new RegExp(`No máximo ${LIMITE_DE_VOOS_LOCAIS} voos locais .*“Registrar mesmo assim”`));
  });
});
