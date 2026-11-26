// O componente de lista e detalhe: a lista à esquerda (js/views/lista.js) e o registro escolhido à direita
// (js/views/detalhe.js), como um cliente de e-mail. Daqui saem a escolha (um clique, as setas, o endereço), o detalhe numa
// vista só (abaixo de 800 px: a lista, depois o detalhe, e Voltar devolve a lista), "Anterior" e "Próximo" (também
// Ctrl+, e Ctrl+.), o Esc, o registro novo que espera a gravação e o desenho que espera o clique acabar. O endereço é da
// casca (js/views/telas.js): o registro escolhido fica nele (#/alu/1000), e o componente nunca mexe no histórico sozinho.
// criarMestreDetalhe só registra: os ouvintes ficam no documento, para os elementos da lista dele (data-lista, #det-<id>),
// e nenhum elemento é lido antes do primeiro desenho
import { algumDialogoAberto, gavetaDoEsc, ponteiroApertado, depoisDoClique } from '../dom.js';
import { vizinhoNaLista, teclaNaLista, primeiraDaBusca } from '../lista.js';
import { criarLista } from './lista.js';
import { criarDetalhe } from './detalhe.js';
import { itemNoEndereco, telaAberta } from './telas.js';

// Uma vista só: abaixo de 800 px de largura da janela (a moldura de altura fixa começa nos mesmos 800 px)
const umaVista = () => typeof matchMedia === 'function' && matchMedia('(max-width: 799px)').matches;
// O endereço da escolha espera as setas pararem
const ESPERA_DO_ENDERECO = 300;

// opcoes: { id ('alu': ul#alu, #det-alu, section#s-alu), rotulo ('Alunos'), nomes (['aluno', 'alunos']), semItens, vazio
//   (o texto com nada escolhido, ou { elemento }), chaveDaBusca, filtros, modelo(), detalhe(id), edita(), secao (a seção
//   da tela, quando não é s-<id>) }
export function criarMestreDetalhe(opcoes) {
  const { id, rotulo, nomes, secao = `s-${id}` } = opcoes;
  const [um] = nomes;
  let adiado = false;
  let esperaDoEndereco = null;

  const lista = criarLista({ ...opcoes, redesenhar: desenhar });
  const estado = lista.estado;
  const detalhe = criarDetalhe({ id, nomes, rotulo, vazio: opcoes.vazio, detalhe: opcoes.detalhe, edita: opcoes.edita || (() => true) });
  const elSecao = () => document.getElementById(secao);
  const aberta = () => telaAberta() === id;

  // O endereço do registro: o novo que o servidor ainda não confirmou é "novo" (o id dele pode ser o de outra pessoa)
  const noEndereco = sel => (sel === null || sel === undefined ? null : estado.naoConfirmados.has(sel) ? 'novo' : sel);
  function enderecar(sel, { empilhar = false } = {}) {
    clearTimeout(esperaDoEndereco);
    if (aberta()) itemNoEndereco(id, noEndereco(sel), { empilhar, detalhe: empilhar ? id : null });
  }

  // Desenha a lista e o detalhe. Com o botão do mouse apertado (um campo digitado avisa a mudança no mousedown do clique
  // que tira o foco dele), espera o clique acabar: o que está sendo clicado não sai da tela
  function desenhar(momento = null) {
    const opcoesDoDesenho = momento && typeof momento === 'object' ? momento : { momento };
    if (ponteiroApertado() && opcoesDoDesenho.momento !== 'consulta') {
      if (!adiado) {
        adiado = true;
        depoisDoClique(() => { adiado = false; desenhar(); });
      }
      return;
    }
    const { desenhou, saiu } = lista.desenhar(opcoesDoDesenho);
    if (!desenhou) return;
    if (saiu) {
      detalhe.trocouDeRegistro();
      detalhe.avisarSemEscolha(`Este ${um} saiu do cadastro.`);
      if (aberta()) enderecar(null);
      const s = elSecao();
      if (s && s.dataset.vendo === 'detalhe') s.dataset.vendo = 'lista';
    }
    const vista = lista.vista();
    const retidas = detalhe.desenhar(estado.selecionado, {
      momento: opcoesDoDesenho.momento,
      forcar: Boolean(opcoesDoDesenho.forcar),
      anterior: vizinhoNaLista(vista, estado.selecionado, -1),
      proximo: vizinhoNaLista(vista, estado.selecionado, 1)
    });
    if (retidas) setTimeout(() => desenhar(), 600);
  }

  // A vista do detalhe (numa vista só): a entrada nova no histórico (Voltar devolve a lista), o topo, o foco no título
  function abrirDetalhe({ empilhar = true } = {}) {
    if (empilhar) enderecar(estado.selecionado, { empilhar: true });
    const s = elSecao();
    if (s) s.dataset.vendo = 'detalhe';
    window.scrollTo(0, 0);
    detalhe.focarNoTitulo();
  }

  // A lista de volta (numa vista só), com o foco na linha escolhida
  function voltarParaALista({ focar = true } = {}) {
    const s = elSecao();
    if (s) s.dataset.vendo = 'lista';
    const botao = lista.botaoDe(estado.selecionado);
    if (focar && botao) {
      botao.focus({ preventScroll: true });
      botao.scrollIntoView({ block: 'nearest' });
    }
  }

  // Escolhe um registro (null: nenhum). origem: 'clique', 'teclas' (as setas: o endereço espera elas pararem),
  // 'vizinho' ("Anterior", "Próximo"), 'endereco' (a casca: não mexe no endereço), 'novo'
  function escolher(sel, { abrir = false, origem = 'clique' } = {}) {
    const novo = sel === null || sel === undefined ? null : String(sel);
    if (novo !== null && origem !== 'endereco') estado.perdidos.delete(novo);
    if (estado.selecionado !== novo) detalhe.trocouDeRegistro();
    detalhe.avisarSemEscolha('');
    estado.selecionado = novo;
    estado.pedida = null;
    // A parada do Tab vai para a escolhida (a que a lista ainda não tem, um registro novo: a da escolha, no desenho)
    estado.parada = novo !== null ? lista.chaveDe(novo) : estado.parada;
    desenhar();
    if (abrir && umaVista() && novo !== null) { abrirDetalhe({ empilhar: origem !== 'endereco' }); return; }
    if (origem === 'endereco') return;
    if (origem === 'teclas') {
      clearTimeout(esperaDoEndereco);
      esperaDoEndereco = setTimeout(() => enderecar(estado.selecionado), ESPERA_DO_ENDERECO);
    } else enderecar(novo);
  }

  // O vizinho do escolhido ("Anterior": -1, "Próximo": 1). De um campo, o campo é gravado antes (o blur faz o change) e o
  // foco vai para o mesmo campo do vizinho
  function irAoVizinho(passo, { campo = null } = {}) {
    const vizinho = vizinhoNaLista(lista.vista(), estado.selecionado, passo);
    if (vizinho === null) return false;
    // O elemento do foco: o campo, ou o botão ("Anterior", "Próximo"), que o detalhe do vizinho também tem
    const ativo = campo || document.activeElement;
    const seletor = ativo && ativo.id && detalhe.regiao() && detalhe.regiao().contains(ativo) ? `#${CSS.escape(ativo.id)}` : null;
    if (campo && campo.matches('input, select, textarea')) campo.blur();
    escolher(vizinho, { origem: 'vizinho' });
    const mesmo = seletor && document.querySelector(seletor);
    if (mesmo) {
      mesmo.focus();
      if (campo && mesmo.select && mesmo.matches('input:not([type="checkbox"])')) mesmo.select();
    } else if (campo) detalhe.focarNoTitulo();
    return true;
  }

  // ——— Os ouvintes, no documento ———
  const naLista = el => el instanceof Element && el.closest(`ul[data-lista="${id}"]`);
  const noDetalhe = el => el instanceof Element && el.closest(`#det-${id}`);

  document.addEventListener('input', e => {
    if (e.target instanceof Element && e.target.matches(`[data-flt="${id}"]`)) lista.buscar(e.target.value);
  });

  document.addEventListener('click', e => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest(`#${id}-inativos, [data-lista-inativos="${id}"]`)) { lista.alternarInativos(); return; }
    if (e.target.closest(`[data-lista-limpar="${id}"]`)) { lista.limpar(); return; }
    if (e.target.closest(`[data-lista-tentar="${id}"]`)) { const m = opcoes.modelo(); if (m && m.tentar) m.tentar(); return; }
    const abrirDoAviso = e.target.closest(`[data-lista-abrir="${id}"]`);
    if (abrirDoAviso) { escolher(abrirDoAviso.dataset.item, { abrir: true }); detalhe.focarNoTitulo(); return; }
    const ul = naLista(e.target);
    if (ul) {
      const grupo = e.target.closest('[data-lista-grupo]');
      if (grupo) { lista.alternarGrupo(grupo.dataset.listaGrupo); return; }
      const botao = e.target.closest('.lista-botao[data-item]');
      if (botao) escolher(botao.dataset.item, { abrir: true });
      return;
    }
    const det = noDetalhe(e.target);
    if (!det) return;
    const secaoBtn = e.target.closest('.det-secao-btn[data-secao]');
    if (secaoBtn) { detalhe.alternarSecao(secaoBtn.dataset.secao); desenhar(); return; }
    const anterior = e.target.closest(`[data-lista-anterior="${id}"]`), proximo = e.target.closest(`[data-lista-proximo="${id}"]`);
    if (anterior || proximo) { irAoVizinho(anterior ? -1 : 1); return; }
    // "‹ Alunos": a entrada que abriu o detalhe sai do histórico (Voltar), e a casca devolve a lista
    const voltar = e.target.closest(`[data-lista-voltar="${id}"]`);
    if (voltar && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.history.state && window.history.state.detalhe === id) window.history.back();
      else { voltarParaALista(); enderecar(null); }
    }
  });

  // A parada do Tab acompanha o foco
  document.addEventListener('focusin', e => {
    const ul = naLista(e.target);
    const li = ul && e.target.closest(`ul[data-lista="${id}"] > [data-chave]`);
    if (!li || estado.parada === li.dataset.chave) return;
    estado.parada = li.dataset.chave;
    desenhar();
  });

  // As teclas na lista e na busca
  document.addEventListener('keydown', e => {
    if (!(e.target instanceof Element) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.matches(`[data-flt="${id}"]`)) {
      const vista = lista.vista();
      if (!vista) return;
      const comTexto = Boolean(e.target.value.trim());
      if (e.key === 'ArrowDown') {
        const parada = primeiraDaBusca(vista, comTexto);
        const botao = parada && lista.botaoDaParada(parada);
        if (!botao) return;
        e.preventDefault();
        const sel = botao.dataset.item;
        if (sel !== undefined) escolher(sel, { origem: 'teclas' });
        (lista.botaoDaParada(parada) || botao).focus();
      } else if (e.key === 'Enter' && comTexto) {
        const parada = primeiraDaBusca(vista, true);
        const botao = parada && lista.botaoDaParada(parada);
        if (!botao) return;
        e.preventDefault();
        escolher(botao.dataset.item, { abrir: true });
        if (!umaVista()) detalhe.focarNoTitulo();
      }
      return;
    }
    const li = naLista(e.target) && e.target.closest('[data-chave]');
    if (!li || !e.target.matches('.lista-botao, .lista-seta')) return;
    if (e.key === ' ') return;
    const r = teclaNaLista(lista.vista(), li.dataset.chave, e.key);
    if (!r) return;
    e.preventDefault();
    if (r.grupo !== undefined) {
      estado.parada = li.dataset.chave;
      lista.alternarGrupo(r.grupo, r.recolher);
      const botao = lista.botaoDaParada(li.dataset.chave);
      if (botao) botao.focus();
      return;
    }
    if (r.detalhe) {
      if (umaVista()) abrirDetalhe();
      else detalhe.focarNoTitulo();
      return;
    }
    estado.parada = r.ir;
    if (r.escolher !== null && r.escolher !== undefined) escolher(r.escolher, { origem: 'teclas' });
    else desenhar();
    const botao = lista.botaoDaParada(r.ir);
    if (botao) botao.focus();
  });

  // As teclas no detalhe: Ctrl+. e Ctrl+, (o vizinho); o Esc num campo digitado devolve o valor gravado (e tira o erro); o
  // Esc no resto do detalhe volta à linha (numa vista só, à lista). Com uma gaveta ou um diálogo aberto, o Esc é deles
  document.addEventListener('keydown', e => {
    const det = noDetalhe(e.target);
    if (!det) return;
    if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === '.' || e.key === ',')) {
      e.preventDefault();
      irAoVizinho(e.key === '.' ? 1 : -1, { campo: e.target.closest('[data-f], [data-a], [data-dado]') });
      return;
    }
    if (e.key !== 'Escape' || e.defaultPrevented || gavetaDoEsc(e) !== null || algumDialogoAberto()) return;
    const campo = e.target.matches('input:not([type="checkbox"]), textarea') ? e.target : null;
    const nome = campo && detalhe.campoDe(campo);
    if (campo && (campo.value !== campo.defaultValue || (nome && detalhe.temErro(nome)))) {
      e.preventDefault();
      if (nome && detalhe.temErro(nome)) { detalhe.limparErro(nome); desenhar({ forcar: true }); }
      const atual = nome ? document.getElementById(`det-${id}-${nome}`) : campo;
      if (atual && atual.value !== atual.defaultValue) atual.value = atual.defaultValue;
      if (atual) atual.focus();
      return;
    }
    if (e.target.matches('select')) return;
    e.preventDefault();
    if (umaVista()) {
      if (window.history.state && window.history.state.detalhe === id) window.history.back();
      else { voltarParaALista(); enderecar(null); }
    } else voltarParaALista();
  });

  // O erro de um campo sai quando ele muda de novo (antes do handler da tela, que pode recusar outra vez)
  document.addEventListener('change', e => {
    if (!noDetalhe(e.target)) return;
    const nome = detalhe.campoDe(e.target);
    if (nome) detalhe.limparErro(nome);
  }, true);

  return {
    desenhar,
    escolher,
    selecionado: () => estado.selecionado,
    voltarParaALista,
    // O que a tela faz ao aparecer (js/views/telas.js): com um item no endereço, escolhe o registro (numa vista só, o
    // detalhe aparece); sem item, a lista (com duas vistas, a escolha que estava na memória volta para o endereço).
    // Responde o item que fica no endereço
    aoMostrar(item, { historico = null } = {}) {
      const s = elSecao();
      if (item !== null && item !== undefined) {
        const sel = item === 'novo' ? [...estado.naoConfirmados.keys()].find(k => k === estado.selecionado) ?? null : String(item);
        if (sel === null) { voltarParaALista({ focar: false }); return { item: null }; }
        estado.pedida = sel;
        escolher(sel, { origem: 'endereco' });
        const escolhido = estado.selecionado === sel;
        if (umaVista() && escolhido) { if (s) s.dataset.vendo = 'detalhe'; return { item: noEndereco(sel), lugar: detalhe.regiao(), focou: false }; }
        return { item: escolhido ? noEndereco(sel) : estado.pedida ? sel : null };
      }
      if (umaVista()) {
        const voltando = Boolean(s && s.dataset.vendo === 'detalhe' && historico === 'nenhum');
        voltarParaALista({ focar: voltando });
        return { item: null, focou: voltando };
      }
      return { item: noEndereco(estado.selecionado) };
    },
    // O registro que a tela acabou de criar ("+ Novo aluno"): escolhido, à vista mesmo fora dos filtros, "novo" no endereço
    // até a gravação (gravacao: a promessa dela) ser confirmada; recusada, ele sai da escolha e o detalhe diz por quê
    novo(idNovo, gravacao) {
      const sel = String(idNovo);
      estado.naoConfirmados.set(sel, gravacao);
      estado.mantidos.add(sel);
      escolher(sel, { abrir: true, origem: 'novo' });
      Promise.resolve(gravacao).then(gravou => {
        estado.naoConfirmados.delete(sel);
        if (gravou) { if (estado.selecionado === sel) enderecar(sel); return; }
        estado.perdidos.add(sel);
        estado.mantidos.delete(sel);
        if (estado.selecionado !== sel) return;
        const s = elSecao();
        const focoNoDetalhe = Boolean(detalhe.regiao() && detalhe.regiao().contains(document.activeElement));
        estado.selecionado = null;
        detalhe.trocouDeRegistro();
        detalhe.avisarSemEscolha(`A inclusão do ${um} novo não foi confirmada pelo servidor.`);
        desenhar();
        enderecar(null);
        if (s && s.dataset.vendo === 'detalhe') s.dataset.vendo = 'lista';
        if (focoNoDetalhe && detalhe.regiao()) detalhe.regiao().focus();
      });
    },
    // O registro excluído pela tela: nada escolhido, o foco na linha que ficou no lugar dele
    removido(idRemovido) {
      const vista = lista.vista();
      const antes = vista ? vista.registros.findIndex(r => r.id === String(idRemovido)) : -1;
      if (estado.selecionado === String(idRemovido)) estado.selecionado = null;
      detalhe.trocouDeRegistro();
      desenhar();
      enderecar(null);
      const s = elSecao();
      if (s) s.dataset.vendo = 'lista';
      const depois = lista.vista();
      const destino = depois && depois.registros[Math.min(Math.max(antes, 0), depois.registros.length - 1)];
      const botao = destino && lista.botaoDe(destino.id);
      if (botao) { estado.parada = destino.chave; desenhar(); (lista.botaoDe(destino.id) || botao).focus(); }
    },
    // Um valor recusado: fica no campo, com a mensagem; o foco fica onde a pessoa o pôs
    erroNoCampo(campo, texto) {
      detalhe.erroNoCampo(campo, texto);
      desenhar({ forcar: true });
    },
    focarNoCampo(campo, { selecionar = false } = {}) {
      const el = document.getElementById(`det-${id}-${campo}`);
      if (!el) return;
      el.focus();
      if (selecionar && el.select) el.select();
    }
  };
}
