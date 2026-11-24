// Escolha do projeto Supabase pelo endereço do site.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projetoSupabase, enderecoSemBanco, PROJETOS } from '../../js/config-supabase.js';

const endereco = href => {
  const url = new URL(href);
  return { hostname: url.hostname, search: url.search };
};

describe('Projeto Supabase por endereço', () => {
  it('o site oficial usa o projeto de produção', () => {
    const projeto = projetoSupabase(endereco('https://gdruumond.github.io/ACPM/'));
    assert.equal(projeto.nome, 'producao');
    assert.equal(projeto.url, 'https://iszaomkinojwxymyglmh.supabase.co');
  });

  it('a prévia usa o projeto de prévia', () => {
    const projeto = projetoSupabase(endereco('https://thephfernandes.github.io/ACPM/'));
    assert.equal(projeto.nome, 'previa');
    assert.equal(projeto.url, 'https://llylkdgfuagzdaualvqa.supabase.co');
  });

  it('no Cloudflare, o Worker da produção usa a produção e o da prévia usa a prévia', () => {
    assert.equal(projetoSupabase(endereco('https://autoescala.autoescala-acpm.workers.dev/')).nome, 'producao');
    assert.equal(projetoSupabase(endereco('https://autoescala.autoescala-acpm.workers.dev/painel')).nome, 'producao');
    assert.equal(projetoSupabase(endereco('https://autoescala-previa.autoescala-acpm.workers.dev/')).nome, 'previa');
  });

  it('um endereço que não é o do app nunca abre a produção', () => {
    assert.equal(projetoSupabase(endereco('https://outro.autoescala-acpm.workers.dev/')), null);
    assert.equal(projetoSupabase(endereco('https://autoescala.autoescala-acpm.workers.dev.exemplo.com/')), null);
  });

  it('localhost fica no modo local, sem login', () => {
    assert.equal(projetoSupabase(endereco('http://localhost:4173/')), null);
  });

  it('em localhost, ?supabase= escolhe a prévia ou o servidor falso dos testes', () => {
    assert.equal(projetoSupabase(endereco('http://localhost:4173/?supabase=previa')).nome, 'previa');
    assert.equal(projetoSupabase(endereco('http://127.0.0.1:4173/?supabase=teste')).nome, 'teste');
  });

  it('fora do localhost o parâmetro ?supabase é ignorado', () => {
    assert.equal(projetoSupabase(endereco('https://gdruumond.github.io/ACPM/?supabase=teste')).nome, 'producao');
    assert.equal(projetoSupabase(endereco('https://exemplo.com/?supabase=previa')), null);
  });

  it('nomes desconhecidos ou herdados do Object são ignorados', () => {
    assert.equal(projetoSupabase(endereco('http://localhost:4173/?supabase=constructor')), null);
    assert.equal(projetoSupabase(endereco('http://localhost:4173/?supabase=outro')), null);
  });

  it('o navegador recebe somente chaves publicáveis, nunca a chave secreta', () => {
    assert.match(PROJETOS.producao.chave, /^sb_publishable_/);
    assert.match(PROJETOS.previa.chave, /^sb_publishable_/);
    for (const { chave } of Object.values(PROJETOS)) assert.doesNotMatch(chave, /^sb_secret_|service_role/);
  });
});

// Fora dos endereços do app e do localhost, o app funciona no modo local (sem o banco) e avisa no alto (js/main.js)
describe('Endereço sem banco', () => {
  it('um endereço que não é o do app é sem banco, também com ?supabase=', () => {
    assert.equal(enderecoSemBanco(endereco('https://copia-do-autoescala.invalid/')), true);
    assert.equal(enderecoSemBanco(endereco('https://autoescala-project.github.io/ACPM/')), true);
    assert.equal(enderecoSemBanco(endereco('https://outro.autoescala-acpm.workers.dev/?supabase=previa')), true);
    assert.equal(enderecoSemBanco(endereco('http://192.168.0.10:4173/')), true);
  });

  it('os endereços do app (produção e prévia, no Cloudflare e no GitHub Pages) têm o banco', () => {
    for (const href of ['https://autoescala.autoescala-acpm.workers.dev/', 'https://autoescala-previa.autoescala-acpm.workers.dev/painel',
      'https://gdruumond.github.io/ACPM/', 'https://thephfernandes.github.io/ACPM/']) {
      assert.equal(enderecoSemBanco(endereco(href)), false, href);
    }
  });

  it('o localhost é o modo local de quem desenvolve: sem o aviso, com ou sem ?supabase=', () => {
    for (const href of ['http://localhost:4173/', 'http://127.0.0.1:4173/', 'http://localhost:4173/?supabase=teste']) {
      assert.equal(enderecoSemBanco(endereco(href)), false, href);
    }
  });
});
