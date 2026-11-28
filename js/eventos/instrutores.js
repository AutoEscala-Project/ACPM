// INVAs: a lista e o detalhe (o componente: js/views/mestre-detalhe.js, com os modelos de js/views/instrutores.js),
// incluir, excluir, os campos de cada instrutor (o "Vem" da linha e do detalhe, o cadastro, as habilitações, as horas de
// fora do app), os turnos, "Editar faixas" (o rascunho, "Salvar faixas" e a reversão setFaixas) e o filtro das
// habilitações. Os campos são gravados ao sair deles (change), pelo mesmo caminho de sempre (registro.js, gravarAlteracao);
// o valor recusado fica no campo, com a mensagem. Os dados pessoais são a seção do detalhe
// (js/views/editor-de-dados-pessoais.js) e os limites da lei, o item fixo do alto da lista (js/eventos/limites.js)
import { gravarAlteracao, ultimaGravacao } from '../actions.js';
import { conferirFaixas, faixasDe, faixasDoTurno, textoDasFaixas, textoDasPausas, TURNOS, ALMOCO, PAUSA_NOVA, mesmasFaixas, minutoDaFaixa } from '../disponibilidade.js';
import { anunciar } from '../dom.js';
import { nomeLimpo, numeroBr, hm } from '../format.js';
import { habilitacoesDoNivel, normalizarHabilitacoes, nomeDaHabilitacao } from '../habilitacoes.js';
import { INICIOS_DOS_TEMPOS } from '../horarios.js';
import { comHorasExternas } from '../limites.js';
import { comRepousoDoNoturno } from '../noturno.js';
import { pesoDoTexto, ERRO_DO_PESO } from '../rules.js';
import { fixoPeloStatus } from '../fixos.js';
import { S, DATA, insBy, isGestor } from '../state.js';
import { semFalhar } from '../sem-falhar.js';
import { confirmado } from './confirmacao.js';
import './limites.js';
import { aoAcionar, aoMudarCampo, aoReverter } from './registro.js';
import { registrarDesenho, redesenharPorNome } from '../redesenho.js';
import { criarMestreDetalhe } from '../views/mestre-detalhe.js';
import { criarFiltroMultiplo } from '../views/filtro-multiplo.js';
import { registrarTela } from '../views/telas.js';
import { aoMudarDadosPessoais } from '../views/dados-pessoais.js';
import { pessoaEscolhida } from '../views/editor-de-dados-pessoais.js';
import {
  modeloDosInstrutores, detalheDoInstrutor, opcoesDasHabilitacoes, ID_DOS_LIMITES, edicaoDasFaixas, editarFaixas, pararDeEditarFaixas,
  mudarEdicaoDasFaixas, erroNaEdicaoDasFaixas, idDoCampoDaFaixa
} from '../views/instrutores.js';

const tela = criarMestreDetalhe({
  id: 'ins',
  rotulo: 'INVAs',
  nomes: ['instrutor', 'instrutores'],
  semItens: 'Nenhum instrutor cadastrado. Clique em “+ Novo instrutor” acima para cadastrar.',
  vazio: 'Escolha um instrutor na lista.',
  // O filtro das habilitações (várias marcas): aparece quem tem todas as marcadas, porque uma missão pede várias juntas
  // (o Noturno no C172, Noturno e C172). As opções acompanham a frota (a habilitação própria de cada recurso)
  filtros: [{
    criar: aoMudar => criarFiltroMultiplo({
      id: 'flt-ins-hab', nome: 'Habilitações', todas: 'Todas as habilitações', regra: 'todas',
      dica: ['filtro-das-habilitacoes', 'Filtro das habilitações'], grupos: opcoesDasHabilitacoes, aoMudar
    }),
    valores: item => item.valores.hab
  }],
  modelo: () => modeloDosInstrutores(tela.selecionado()),
  // O instrutor escolhido: os dados pessoais dele são lidos (250 ms depois de a escolha parar nele)
  detalhe: id => {
    if (String(id) !== ID_DOS_LIMITES) pessoaEscolhida('instrutor', +id, opcoes => tela.desenhar(opcoes));
    return detalheDoInstrutor(id);
  },
  edita: () => !isGestor()
});

// Os desenhos de INVAs (js/redesenho.js): os dados de uma data, quem só consulta, a releitura e o perfil; a escala refeita
// (os voos e a tira de cada um), depois de o evento que a refez acabar; os limites da lei, também com um campo em foco
registrarDesenho('instrutores', tela.desenhar, { em: ['dados', 'consulta', 'releitura', 'perfil'], ordem: 20, comMomento: true });
let escalaPorDesenhar = false;
registrarDesenho('instrutores-na-escala', () => {
  if (escalaPorDesenhar) return;
  escalaPorDesenhar = true;
  queueMicrotask(() => { escalaPorDesenhar = false; semFalhar(() => tela.desenhar()); });
}, { em: ['escala'], ordem: 21 });
registrarDesenho('limites-da-lei', () => tela.desenhar());
// O endereço: #/ins/<id> escolhe o instrutor (#/ins/limites, os limites da lei); numa vista só, abre o detalhe
registrarTela('ins', { aoMostrar: (item, opcoes) => tela.aoMostrar(item, opcoes) });
// O CANAC da busca e do subtítulo acompanha os dados pessoais
aoMudarDadosPessoais(() => tela.desenhar());

// O instrutor novo: escolhido, com o nome selecionado, à vista mesmo fora dos filtros (até eles mudarem). Ele vem na data,
// o dia inteiro (o turno), e tem as habilitações do nível 1
aoAcionar('addi', () => {
  const novo = {
    id: S.nid++, nm: 'Novo instrutor', on: true, hab: habilitacoesDoNivel(1), kg: 0,
    aw: INICIOS_DOS_TEMPOS.map((_, i) => i < INICIOS_DOS_TEMPOS.length - 1), ...faixasDoTurno(TURNOS[0].id)
  };
  S.ins.push(novo);
  if (!gravarAlteracao('inc', `Instrutor adicionado: ${novo.nm}`)) { S.ins = S.ins.filter(x => x !== novo); return; }
  tela.novo(novo.id, ultimaGravacao());
  redesenharPorNome('alunos', 'pedidos-do-dia');
  tela.focarNoCampo('nm', { selecionar: true });
});

// "Excluir instrutor…", no rodapé do detalhe: dois cliques
aoAcionar('deli', (b, { id }) => {
  if (!confirmado(b, 'Confirmar exclusão')) return;
  const target = insBy(id);
  pararDeEditarFaixas(id);
  S.ins = S.ins.filter(x => x.id !== id);
  S.stu.forEach(s => s.bl = s.bl.filter(v => v !== id));
  S.stu.forEach(s => { if (s.voaCom) s.voaCom = s.voaCom.filter(v => v !== id); if (s.voaCom && !s.voaCom.length) delete s.voaCom; });
  // Os pedidos do dia com o instrutor escolhido voltam para a escolha do app, e os voos fixos pela escolha na Escala
  // são soltos (os da escala aprovada, os fixados pelo status, os agendados na Escala e o Noturno ficam, em conflito, com
  // as sugestões)
  S.stu.forEach(s => [s, ...(s.extra || [])].forEach(p => { if (p.insId === id) delete p.insId; }));
  S.fixos = Object.fromEntries(Object.entries(S.fixos || {}).filter(([k, p]) => !(p.escolhido && !p.agendado && !p.noturno && p.insId === id && !S.aprovacao && !fixoPeloStatus(k, S.fStatus))));
  gravarAlteracao('exc', `Instrutor excluído: ${target ? target.nm : id}`);
  tela.removido(id);
  redesenharPorNome('alunos', 'pedidos-do-dia');
});

// As faixas novas de um instrutor (um turno, "Salvar faixas"), com a reversão: as de antes. As mesmas de agora
// (jaSaoEstas) não são gravadas: nenhuma entrada no Histórico, e a data não muda
const jaSaoEstas = (x, novas) => mesmasFaixas(faixasDe(x), novas);
function gravarFaixas(x, novas, descricao) {
  const antes = faixasDe(x);
  Object.assign(x, { faixas: novas.faixas, pausas: novas.pausas });
  return gravarAlteracao('mod', descricao, { kind: 'setFaixas', insId: x.id, faixas: antes.faixas, pausas: antes.pausas, label: '↶ Reverter' });
}
const descricaoDasFaixas = (x, d) => `${textoDasFaixas(d)}${textoDasPausas(d) ? `; pausa ${textoDasPausas(d)}` : ''}`;
// O foco num controle do detalhe redesenhado (o botão acionado foi trocado)
const focar = idDoControle => { const el = document.getElementById(idDoControle); if (el) el.focus(); };

// Um turno: a faixa dele, sem pausa (o rascunho de "Editar faixas", se aberto, sai); o que já está só é dito
const jaEstao = x => `As faixas de ${x.nm} já são estas.`;
aoAcionar('turno', (b, { id }) => {
  const x = insBy(id), novas = faixasDoTurno(b.dataset.turno);
  if (!x || !novas) return;
  const turno = TURNOS.find(t => t.id === b.dataset.turno);
  pararDeEditarFaixas(id);
  const mudou = !jaSaoEstas(x, novas);
  if (mudou) gravarFaixas(x, novas, `Turno de ${x.nm} nesta data: ${turno.nome} (${hm(turno.de)}–${hm(turno.ate)})`);
  tela.desenhar({ forcar: true });
  focar(b.id);
  if (!mudou) anunciar(jaEstao(x));
});

// "Editar faixas": o rascunho com as faixas e as pausas de agora; o foco no De da 1ª faixa (sem faixa, no "+ Faixa")
aoAcionar('editar-faixas', (b, { id }) => {
  editarFaixas(id);
  tela.desenhar({ forcar: true });
  focar(document.getElementById('det-ins-faixa-0-de') ? 'det-ins-faixa-0-de' : 'det-ins-mais-faixa');
});
aoAcionar('cancelar-faixas', (b, { id }) => {
  pararDeEditarFaixas(id);
  tela.desenhar({ forcar: true });
  focar('det-ins-editar-faixas');
});
// O rascunho: "+ Faixa" (o dia inteiro), "+ Pausa", "Almoço" e o ✕ de cada uma; o foco vai para o campo novo, ou para
// o lugar do que saiu
const mais = (lista, novo) => e => ({ ...e, [lista]: [...e[lista], { ...novo }] });
aoAcionar('mais-faixa', (b, { id }) => {
  mudarEdicaoDasFaixas(id, mais('faixas', { de: TURNOS[0].de, ate: TURNOS[0].ate }));
  tela.desenhar({ forcar: true });
  focar(`det-ins-faixa-${edicaoDasFaixas(id).faixas.length - 1}-de`);
});
aoAcionar(['mais-pausa', 'almoco'], (b, { id }) => {
  mudarEdicaoDasFaixas(id, mais('pausas', b.dataset.act === 'almoco' ? ALMOCO : PAUSA_NOVA));
  tela.desenhar({ forcar: true });
  focar(`det-ins-pausa-${edicaoDasFaixas(id).pausas.length - 1}-de`);
});
aoAcionar(['tirar-faixa', 'tirar-pausa'], (b, { id }) => {
  const lista = b.dataset.act === 'tirar-faixa' ? 'faixas' : 'pausas', i = +b.dataset.i;
  mudarEdicaoDasFaixas(id, e => ({ ...e, [lista]: e[lista].filter((_, k) => k !== i) }));
  tela.desenhar({ forcar: true });
  const tipo = lista === 'faixas' ? 'faixa' : 'pausa', resta = edicaoDasFaixas(id)[lista].length;
  focar(resta ? `det-ins-${tipo}-${Math.min(i, resta - 1)}-tirar` : `det-ins-mais-${tipo}`);
});
// Um De ou um Até do rascunho (data-a="fx"): nada é gravado antes de "Salvar faixas"
aoMudarCampo('fx', t => {
  const det = t.closest('#det-ins .det[data-id]');
  if (!det || !minutoDaFaixa(+t.value)) return;
  const lista = t.dataset.fx === 'faixa' ? 'faixas' : 'pausas', i = +t.dataset.i, ponta = t.dataset.ponta;
  mudarEdicaoDasFaixas(det.dataset.id, e => ({ ...e, [lista]: e[lista].map((f, k) => (k === i ? { ...f, [ponta]: +t.value } : f)) }));
  tela.desenhar({ forcar: true });
});
// "Salvar faixas": conferidas (a recusa fica no rascunho, com a mensagem, no campo dela, com o foco), gravadas com a
// reversão (as mesmas de agora, não) e ditas; o foco em "Editar faixas". O rascunho que saiu (outra data, as faixas
// mudadas por fora) não grava nada: o detalhe é refeito
aoAcionar('salvar-faixas', (b, { id }) => {
  const x = insBy(id), e = edicaoDasFaixas(id);
  if (!x || !e) { tela.desenhar({ forcar: true }); return; }
  const conferidas = conferirFaixas(e);
  if (conferidas.erro) {
    erroNaEdicaoDasFaixas(id, conferidas.erro, conferidas.campo);
    tela.desenhar({ forcar: true });
    focar(conferidas.campo && document.getElementById(idDoCampoDaFaixa(conferidas.campo)) ? idDoCampoDaFaixa(conferidas.campo) : 'det-ins-salvar-faixas');
    anunciar(conferidas.erro);
    return;
  }
  pararDeEditarFaixas(id);
  const mudou = !jaSaoEstas(x, conferidas);
  if (mudou) gravarFaixas(x, conferidas, `Faixas de ${x.nm} nesta data: ${descricaoDasFaixas(x, conferidas)}`);
  tela.desenhar({ forcar: true });
  focar('det-ins-editar-faixas');
  anunciar(mudou ? `Faixas de ${x.nm} salvas: ${descricaoDasFaixas(x, conferidas)}.` : jaEstao(x));
});

// Os campos de um instrutor: o "Vem" (na linha e no detalhe), o cadastro, as habilitações e as horas de fora do app
aoMudarCampo('i', (t, { f, id }) => {
  const x = insBy(id);
  if (!x) return;
  let historico;
  if (f === 'on') {
    x.on = t.checked;
    historico = [t.checked ? 'inc' : 'exc', `${x.nm}: ${t.checked ? 'Disponível' : 'Indisponível'}`, {
      kind: 'setInsOn', insId: x.id, val: !t.checked, label: '↶ Reverter'
    }];
  } else if (f === 'nm') {
    const old = x.nm;
    x.nm = nomeLimpo(t.value, x.nm);
    historico = ['mod', `Instrutor: ${old} → ${x.nm}`];
  } else if (f === 'kg') {
    const kg = pesoDoTexto(t.value, t.validity.badInput);
    if (kg === null) { tela.erroNoCampo('kg', ERRO_DO_PESO); return; }
    x.kg = kg;
    historico = ['mod', `Peso ${x.nm}: ${numeroBr(x.kg)} kg`];
  } else if (f === 'hab') {
    const h = t.dataset.h;
    x.hab = normalizarHabilitacoes(t.checked ? [...x.hab, h] : x.hab.filter(k => k !== h));
    historico = ['mod', `Habilitação ${t.checked ? 'incluída' : 'retirada'}: ${x.nm} · ${nomeDaHabilitacao(h)}`];
  } else if (f === 'ext-mes' || f === 'ext-ano') {
    // Horas de voo fora do app (limites da lei): neste mês ou, no ano, antes deste mês
    const chave = f === 'ext-mes' ? DATA.slice(0, 7) : `${DATA.slice(0, 4)}-00`;
    const horas = Math.round(Math.min(2000, Math.max(0, +t.value || 0)) * 10) / 10;
    x.horasExternas = { ...(x.horasExternas || {}) };
    if (horas > 0) x.horasExternas[chave] = horas;
    else delete x.horasExternas[chave];
    if (!Object.keys(x.horasExternas).length) delete x.horasExternas;
    S.horasDosInstrutores = comRepousoDoNoturno(comHorasExternas(S.horasBase || {}, S.ins, DATA), S.noturnosDaVespera);
    historico = ['mod', `Horas de voo fora do app de ${x.nm} (${f === 'ext-mes' ? 'neste mês' : 'no ano, antes deste mês'}): ${numeroBr(horas)} h`];
  } else return;
  gravarAlteracao(...historico);
  tela.desenhar();
  if (f === 'nm') redesenharPorNome('alunos');
  // A Demanda mostra os instrutores de cada pedido: o nome, quem vem na data e quem tem a habilitação
  if (['nm', 'on', 'hab'].includes(f)) redesenharPorNome('pedidos-do-dia');
});

// "↶ Reverter" no histórico (js/eventos/historico.js): os tipos desta tela. A reversão chega validada (js/reversoes.js)
aoReverter('setInsOn', (rev, entry) => {
  const ins = insBy(rev.insId);
  if (ins) {
    ins.on = rev.val;
    gravarAlteracao(rev.val ? 'inc' : 'exc', `Revertido: ${ins.nm} ${rev.val ? 'disponível' : 'indisponível'}`, null, entry.id);
    tela.desenhar({ forcar: true });
    redesenharPorNome('pedidos-do-dia');
  }
});
// As faixas e as pausas de antes (um turno, "Salvar faixas"); o rascunho aberto do instrutor sai
aoReverter('setFaixas', (rev, entry) => {
  const x = insBy(rev.insId);
  if (!x) return;
  pararDeEditarFaixas(x.id);
  Object.assign(x, { faixas: rev.faixas, pausas: rev.pausas });
  gravarAlteracao('mod', `Revertido: faixas de ${x.nm} nesta data: ${descricaoDasFaixas(x, rev)}`, null, entry.id);
  tela.desenhar({ forcar: true });
});
