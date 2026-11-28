// Exportação da escala do dia em CSV, PDF (jsPDF + AutoTable carregados no index.html) e na planilha do modelo do
// aeroclube (Excel, js/planilha.js).
import { hm, rotuloDoInicio, fmtH, pesoBr } from './format.js';
import { sumUniqueOperationalHours, consolidateTimelineSlots } from './engine.js';
import { S, RES, DATA, inativoNaDataAberta, estadoDaEscala } from './state.js';
import { showToast } from './dom.js';
import { HT } from './views/escala.js';
import { montarCsv, nomeDoCsv } from './csv.js';
import { textoDoStatus } from './status.js';
import { statusDoVoo } from './voo.js';
import { MODELO, nomeDaPlanilha, montarPlanilha } from './planilha.js';

// Baixa o arquivo pelo navegador; o navegador que não deixar recebe um aviso (o que é: "o CSV", "o PDF", "a planilha")
function baixar(nome, dados, oQue) {
  try {
    const blob = dados instanceof Blob ? dados : new Blob([dados], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    showToast(`Não foi possível baixar ${oQue} neste navegador.`);
    return false;
  }
}

// CSV para o portal de agendamento: agrupado por avião, em ordem de horário (js/csv.js). Cada exportação diz se o
// arquivo foi entregue ao navegador (o H só registra a que foi)
export function exp() {
  if (!RES) { showToast('Não há escala para exportar nesta data.'); return false; }
  const ok = baixar(nomeDoCsv(DATA), montarCsv(RES, S.fStatus || {}, S.fObs || {}), 'o CSV');
  if (ok) showToast('CSV exportado.', 'ok');
  return ok;
}

export function pdf() {
  if (!RES) { showToast('Não há escala para o PDF nesta data.'); return false; }
  if (!window.jspdf) { showToast('A biblioteca de PDF não carregou. Verifique a conexão e recarregue a página.'); return false; }

  const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { out, al, tot } = RES;
  // O documento é a escala de voo do dia; o programa que o gerou, o AutoEscala (nos metadados do PDF)
  doc.setProperties({ title: `Escala de Voo - ACPM - ${DATA.split('-').reverse().join('/')}`, creator: 'AutoEscala - ACPM' });
  const rej = al.filter(a => a.t === 'err').length;
  const dt = DATA.split('-').reverse().join('/');
  const H = { fillColor: [18, 38, 58] };
  const Y = () => doc.lastAutoTable.finalY + 8;
  const hrs = a => fmtH(sumUniqueOperationalHours(a));

  doc.setFontSize(18); doc.text('Escala de Voo - ACPM', 14, 15);
  doc.setFontSize(11);
  doc.text(`Data da escala: ${dt}     Emitida em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);
  doc.text(`Missões na demanda: ${tot}     Atendidas: ${tot - rej}     Horas escaladas: ${hrs(out)}     Alertas: ${al.length}`, 14, 28);

  const body = [];
  // Os grupos pelo horário de início de cada voo (J, S1), como na Lista
  let inicio = -1;
  out.forEach(o => {
    if (o.a !== inicio) {
      inicio = o.a;
      body.push([{ content: `${rotuloDoInicio(o.a)}  -  ${out.filter(x => x.a === o.a).length} lançamento(s) iniciando`, colSpan: 9, styles: { fillColor: [222, 230, 238], fontStyle: 'bold' } }]);
    }
    // Status com o detalhe (o novo horário do atraso ou o motivo do cancelamento)
    // Só a categoria do motivo: o PDF sai do app (o texto livre pode ter dados pessoais)
    const status = textoDoStatus(statusDoVoo(o, S.fStatus), S.fObs && S.fObs[o.fKey], { textoLivre: false, voo: o });
    const pesoComCombustivel = o.kg ? `${pesoBr(o.kg)} kg${o.comb ? ` · abastecer ${o.comb.abastecerGal} gal` : ''}` : '-';
    body.push([`${hm(o.a)}-${hm(o.b)}`, o.s, o.mis, o.r, o.ins, HT(o), pesoComCombustivel, o.tag, status]);
  });

  doc.autoTable({ startY: 33, head: [['Horário','Aluno','Missão','Equipamento','Instrutor','Duração','Peso tripulação','Encaixe','Status']], body, styles: { fontSize: 9 }, headStyles: H });

  const grp = k => {
    const g = {};
    out.forEach(o => (g[o[k]] = g[o[k]] || []).push(o));
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  };
  const lst = a => consolidateTimelineSlots(a).map(o => `${hm(o.a)}-${hm(o.b)} ${o.students.join(', ')} (${o.mis})`).join('; ');
  const tb = (t, head, rows) => {
    let y = Y();
    if (y > 165) { doc.addPage(); y = 15; }
    doc.setFontSize(13); doc.text(t, 14, y);
    doc.autoTable({ startY: y + 3, head: [head], body: rows, styles: { fontSize: 9 }, headStyles: H });
  };

  tb('Quadro por instrutor', ['Instrutor','Horas','Horários e alunos'], grp('ins').map(([n, a]) => [n, hrs(a), lst(a)]));
  tb('Quadro por equipamento / sala', ['Recurso','Horas','Horários e alunos'], grp('r').map(([n, a]) => [n, hrs(a), lst(a)]));
  if (al.length) tb('Alertas e pendências', ['Situação','Aluno','Detalhe'], al.map(a => [a.t === 'err' ? 'Rejeitado' : 'Aviso', a.s, a.m]));

  let y = Y();
  if (y > 185) { doc.addPage(); y = 20; }
  doc.setFontSize(10);
  doc.text('Responsável pela escala: ______________________________      Visto do Chefe de Operações: ______________________________', 14, y + 8);

  const n = doc.getNumberOfPages(), pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8);
    doc.text(`ACPM - Escala de ${dt} - Página ${i} de ${n}`, pw - 14, ph - 6, { align: 'right' });
  }

  const ok = baixar(`escala-acpm-${dt.split('/').reverse().join('-')}.pdf`, doc.output('blob'), 'o PDF');
  if (ok) showToast('PDF emitido.', 'ok');
  return ok;
}

// O .xlsx é montado com a compressão do navegador ("deflate-raw": Safari 16.4, Chrome 103 e Firefox 113 em diante; o
// resto do app roda em navegadores mais antigos)
function navegadorMontaPlanilha() {
  try {
    new CompressionStream('deflate-raw');
    new DecompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

// A planilha no modelo do aeroclube, para o lançamento no CAVOK. A escala, os dados e a data são os do clique (copiados
// na hora): o modelo chega depois (fetch), e a data aberta ou o status de um voo podem ter mudado. Um segundo clique
// enquanto a planilha é montada não baixa outra
let montando = false;
export async function planilha() {
  if (!RES) { showToast('Não há escala para exportar nesta data.'); return false; }
  if (!navegadorMontaPlanilha()) { showToast('Este navegador não monta a planilha do Excel. Atualize o navegador ou use o CSV.'); return false; }
  if (montando) return false;
  montando = true;
  try {
    // O recurso inativo no cadastro solta a coluna dele (um com voo na escala continua com a sua)
    return await baixarPlanilha(RES, DATA, { frota: S.frota ? S.frota.filter(f => !inativoNaDataAberta(f)) : undefined, av: { ...estadoDaEscala().av }, fStatus: { ...S.fStatus }, fObs: { ...S.fObs } });
  } finally {
    montando = false;
  }
}

async function baixarPlanilha(res, data, estado) {
  let modelo;
  try {
    const resposta = await fetch(MODELO, { signal: AbortSignal.timeout(20000) });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    modelo = new Uint8Array(await resposta.arrayBuffer());
  } catch {
    showToast('O modelo da planilha não carregou. Verifique a conexão e tente de novo.');
    return false;
  }
  let pronta;
  try {
    pronta = await montarPlanilha(modelo, res, estado, data);
  } catch (e) {
    // O modelo que chegou não é o esperado (uma página no lugar dele, um arquivo estragado ou mudado)
    console.warn(e);
    showToast('Não foi possível montar a planilha: o modelo que chegou não é o esperado. Recarregue a página e tente de novo, ou use o CSV.');
    return false;
  }
  const arquivo = new Blob([pronta.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (!baixar(nomeDaPlanilha(data), arquivo, 'a planilha')) return false;
  const n = pronta.foraDoModelo.length;
  if (n) showToast(`Planilha exportada. ${n === 1 ? '1 voo não coube' : `${n} voos não couberam`} no modelo: estão na última linha da planilha.`);
  else showToast('Planilha exportada.', 'ok');
  return true;
}
