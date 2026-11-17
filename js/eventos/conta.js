// Minha conta (trocar a senha e o e-mail, no modo compartilhado; vale para todos os perfis) e Usuários (só
// administradores; o servidor confere)
import { $, showToast } from '../dom.js';
import { ApiClient } from '../storage.js';
import { confirmado } from './confirmacao.js';
import { aoAcionar } from './registro.js';
import { carregarContas, gerarSenha, mensagem } from '../views/conta.js';

$('#form-senha').onsubmit = async e => {
  e.preventDefault();
  const nova = $('#senha-nova').value;
  if (nova !== $('#senha-repetida').value) return mensagem('#senha-msg', 'As duas senhas novas não são iguais.');
  try {
    await ApiClient.alterarSenha($('#senha-atual').value, nova);
  } catch (err) {
    return mensagem('#senha-msg', {
      senha_atual: 'Senha atual incorreta.',
      weak_password: 'A nova senha precisa ter pelo menos 12 caracteres.',
      same_password: 'A nova senha precisa ser diferente da atual.'
    }[err.code] || 'Não foi possível trocar a senha. Verifique a conexão e tente de novo.');
  }
  $('#form-senha').reset();
  mensagem('#senha-msg', 'Senha trocada.', 'ok');
};

$('#form-email').onsubmit = async e => {
  e.preventDefault();
  const novo = $('#email-novo').value.trim().toLowerCase();
  if (novo === ApiClient.emailAtual) return mensagem('#email-msg', 'Este já é o seu e-mail.');
  try {
    await ApiClient.alterarEmail($('#email-senha').value, novo, window.location.origin + window.location.pathname);
  } catch (err) {
    return mensagem('#email-msg', {
      senha_atual: 'Senha atual incorreta.',
      email_exists: 'Já existe uma conta com este e-mail.'
    }[err.code] || 'Não foi possível pedir a troca do e-mail (o envio da confirmação falhou). Tente de novo mais tarde ou fale com um administrador.');
  }
  $('#form-email').reset();
  mensagem('#email-msg', `Enviamos um link de confirmação para ${ApiClient.emailAtual} e para ${novo}. O e-mail muda depois que os dois links forem abertos.`, 'ok');
};

// Usuários: criar e excluir contas
$('#nc-gerar').onclick = () => { $('#nc-senha').value = gerarSenha(); };
$('#form-nova-conta').onsubmit = async e => {
  e.preventDefault();
  const email = $('#nc-email').value.trim().toLowerCase();
  try {
    await ApiClient.criarConta({ email, senha: $('#nc-senha').value, perfil: $('#nc-perfil').value, nome: $('#nc-nome').value.trim() });
  } catch (err) {
    return mensagem('#nc-msg', {
      23505: 'Já existe uma conta com este e-mail.',
      22023: 'Confira o nome, o e-mail e a senha (pelo menos 12 caracteres).',
      42501: 'Só administradores criam contas.'
    }[err.code] || 'Não foi possível criar a conta. Verifique a conexão e tente de novo.');
  }
  $('#form-nova-conta').reset();
  mensagem('#nc-msg', `Conta criada para ${email}. Passe a senha inicial para a pessoa; ela pode trocar em “Minha conta”.`, 'ok');
  await carregarContas();
};

async function excluirConta(b) {
  if (!confirmado(b, 'Confirmar exclusão')) return;
  try {
    await ApiClient.excluirConta(b.dataset.id);
    showToast(`Conta de ${b.dataset.email} excluída.`, 'ok');
  } catch (err) {
    showToast(err.code === '22023' ? 'Não é possível excluir a própria conta.' : 'Não foi possível excluir a conta. Verifique a conexão e tente de novo.');
  }
  await carregarContas();
}
aoAcionar('excluir-conta', excluirConta, { confereAPermissao: true });
