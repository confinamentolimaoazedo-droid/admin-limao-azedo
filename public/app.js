'use strict';

const TOKEN_KEY = 'limao_azedo_admin_token';
let currentLot = null;

document.addEventListener('DOMContentLoaded', () => {
  bind();
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) validateSession();
});

function bind() {
  byId('loginForm').addEventListener('submit', login);
  byId('logoutButton').addEventListener('click', logout);
  byId('newLotForm').addEventListener('submit', createLot);
  byId('newModalidade').addEventListener('change', toggleNewLotFields);
  byId('searchForm').addEventListener('submit', searchLot);
  byId('lotForm').addEventListener('submit', updateLot);
  byId('archiveButton').addEventListener('click', archiveLot);
  byId('movementForm').addEventListener('submit', registerMovement);
  byId('movTipo').addEventListener('change', toggleMovementFields);
  byId('financeForm').addEventListener('submit', updateFinance);
  byId('treatmentForm').addEventListener('submit', registerTreatment);
  byId('tratQuantidade').addEventListener('input', calculateVolume);
  byId('tratDose').addEventListener('input', calculateVolume);

  document.querySelectorAll('.tab').forEach(button => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });
}

async function login(event) {
  event.preventDefault();
  clearMessage('loginMessage');
  setLoading(true);

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario: value('adminUser'),
        senha: value('adminPassword')
      })
    });

    const data = await response.json();

    if (!response.ok || !data.sucesso) {
      throw new Error(data.mensagem || 'Não foi possível entrar.');
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    text('adminName', data.usuario);
    showAdmin();
    await loadDashboard();
  } catch (error) {
    showMessage('loginMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function validateSession() {
  setLoading(true);

  try {
    const data = await adminRequest('validarSessao', {});
    text('adminName', data.usuario || 'Administrador');
    showAdmin();
    await loadDashboard();
  } catch {
    logout();
  } finally {
    setLoading(false);
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  currentLot = null;
  showLogin();
}

async function loadDashboard() {
  clearMessage('dashboardMessage');

  try {
    const data = await adminRequest('obterDashboardAdmin', {});
    const dashboard = data.dashboard || {};

    text('mLotes', dashboard.lotesAtivosQuantidade ?? 0);
    text('mAnimais', dashboard.animaisAtuais ?? 0);
    text('mDoentes', dashboard.animaisDoentes ?? 0);
    text('mEnfermaria', dashboard.animaisEnfermaria ?? 0);
    text('mReceita', dashboard.receitaModalidades || 'R$ 0,00');
    text('mProtocolo', dashboard.custoProtocolo || 'R$ 0,00');
    text('mSanidade', dashboard.custoSanidade || 'R$ 0,00');
    text('mTotal', dashboard.valorTotal || 'R$ 0,00');

    renderLots(dashboard.lotesAtivos || []);
  } catch (error) {
    showMessage('dashboardMessage', error.message, 'error');
  }
}

function renderLots(items) {
  const container = byId('activeLots');
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = '<p class="empty">Nenhum lote ativo.</p>';
    return;
  }

  items.forEach(item => {
    const article = document.createElement('article');
    article.className = 'lot-item';
    article.innerHTML = `
      <div>
        <strong>${escapeHtml(item.cliente || 'Cliente')}</strong>
        <span>Curral ${escapeHtml(item.curral)} • Carimbo ${escapeHtml(item.carimbo)} • ${escapeHtml(item.cabecasAtuais || 0)} cabeças</span>
      </div>
      <button type="button">Abrir</button>
    `;

    article.querySelector('button').addEventListener('click', async () => {
      setValue('searchCurral', item.curral);
      setValue('searchCarimbo', item.carimbo);
      showView('lotView');
      await searchLot();
    });

    container.appendChild(article);
  });
}

function toggleNewLotFields() {
  const modalidade = value('newModalidade');

  byId('fieldValorDiaria').classList.toggle('hidden', modalidade !== 'DIARIA');
  byId('fieldValorArroba').classList.toggle('hidden', modalidade !== 'ARROBA');
  byId('fieldValorKgMS').classList.toggle('hidden', modalidade !== 'MS');
  byId('fieldConsumoTotalMS').classList.toggle('hidden', modalidade !== 'MS');
}

async function createLot(event) {
  event.preventDefault();
  clearMessage('newLotMessage');
  setLoading(true);

  try {
    const data = await adminRequest('criarLote', {
      dados: {
        cliente: value('newCliente'),
        lote: value('newLote'),
        curral: value('newCurral'),
        carimbo: value('newCarimbo'),
        dataEntrada: value('newDataEntrada'),
        dataAbate: value('newDataAbate'),
        cabecasIniciais: value('newCabecas'),
        pesoEntradaKg: value('newPesoEntrada'),
        gmdProjetado: value('newGmd'),
        consumoMSKg: value('newConsumoMS'),
        dieta: value('newDieta'),
        modalidade: value('newModalidade'),
        valorDiaria: value('newValorDiaria'),
        valorArroba: value('newValorArroba'),
        valorKgMS: value('newValorKgMS'),
        consumoTotalMS: value('newConsumoTotalMS')
      }
    });

    showMessage(
      'newLotMessage',
      `Lote ${data.idLote} criado com financeiro ${data.idFinanceiro}.`,
      'success'
    );

    byId('newLotForm').reset();
    toggleNewLotFields();
    await loadDashboard();
  } catch (error) {
    showMessage('newLotMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function searchLot(event) {
  if (event) event.preventDefault();

  clearMessage('searchMessage');
  setLoading(true);

  try {
    const data = await adminRequest('buscarLoteAdmin', {
      curral: value('searchCurral'),
      carimbo: value('searchCarimbo')
    });

    currentLot = normalizeLot(data.resultado);
    fillLot(currentLot);
    renderMovementHistory(currentLot.movimentacoes || []);
    renderTreatmentHistory(currentLot.sanidade?.tratamentos || []);
    fillFinance(currentLot.financeiro, data.resultado);

    byId('lotSection').classList.remove('hidden');
    byId('movementForms').classList.remove('hidden');
    byId('financeForms').classList.remove('hidden');
    byId('healthForms').classList.remove('hidden');

    const title = `${currentLot.cliente || 'Cliente'} — ${currentLot.lote || currentLot.id}`;

    text('movementLotTitle', title);
    text('financeLotTitle', title);
    text('healthLotTitle', title);

    showMessage('searchMessage', 'Lote carregado.', 'success');
  } catch (error) {
    showMessage('searchMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function normalizeLot(raw) {
  return {
    ...raw,
    id: raw.id || raw.ID || raw.IDLote || '',
    curral: raw.curral ?? raw.Curral ?? '',
    carimbo: raw.carimbo ?? raw.Carimbo ?? '',
    cliente: raw.cliente ?? raw.Cliente ?? '',
    lote: raw.lote ?? raw.Lote ?? '',
    cabecasAtuais: raw.cabecasAtuais ?? raw.CabecasAtuais ?? 0,
    animaisDoentes: raw.animaisDoentes ?? raw.AnimaisDoentes ?? 0,
    animaisEnfermaria: raw.animaisEnfermaria ?? raw.AnimaisEnfermaria ?? 0,
    consumoMS: raw.consumoMS ?? raw.ConsumoMSKg ?? '',
    gmdProjetado: raw.gmdProjetado ?? raw.GMDProjetado ?? '',
    dieta: raw.dieta ?? raw.Dieta ?? '',
    status: raw.status ?? raw.Status ?? '',
    dataAbate: raw.dataAbate ?? raw.DataAbate ?? '',
    pesoFinalRealKg: raw.pesoFinalRealKg ?? raw.PesoFinalRealKg ?? '',
    rendimentoFinal: raw.rendimentoCarcacaFinalPct ?? raw.RendimentoCarcacaFinalPct ?? '',
    cabecasFinais: raw.cabecasFinais ?? raw.CabecasFinais ?? ''
  };
}

function fillLot(lot) {
  text('summaryCliente', lot.cliente || '—');
  text('summaryLote', lot.lote || '—');
  text('summaryId', lot.id || '—');
  text('summaryCabecas', lot.cabecasAtuais || 0);
  setValue('animaisDoentes', lot.animaisDoentes);
  setValue('animaisEnfermaria', lot.animaisEnfermaria);
  setValue('consumoMS', lot.consumoMS);
  setValue('gmdProjetado', lot.gmdProjetado);
  setValue('dieta', lot.dieta);
  setValue('status', lot.status);
  setValue('dataAbate', toInputDate(lot.dataAbate));
  setValue('pesoFinalRealKg', lot.pesoFinalRealKg);
  setValue('rendimentoFinal', lot.rendimentoFinal);
  setValue('cabecasFinais', lot.cabecasFinais);
}

async function updateLot(event) {
  event.preventDefault();

  if (!currentLot) {
    showMessage('lotMessage', 'Busque um lote primeiro.', 'error');
    return;
  }

  setLoading(true);

  try {
    const data = await adminRequest('atualizarLote', {
      idLote: currentLot.id,
      campos: {
        animaisDoentes: value('animaisDoentes'),
        animaisEnfermaria: value('animaisEnfermaria'),
        consumoMS: value('consumoMS'),
        gmdProjetado: value('gmdProjetado'),
        dieta: value('dieta'),
        status: value('status'),
        dataAbate: value('dataAbate'),
        pesoFinalRealKg: value('pesoFinalRealKg'),
        rendimentoCarcacaFinalPct: value('rendimentoFinal'),
        cabecasFinais: value('cabecasFinais')
      }
    });

    currentLot = normalizeLot(data.resultado || currentLot);
    fillLot(currentLot);
    showMessage('lotMessage', 'Lote atualizado.', 'success');
    await refreshFinance();
    await loadDashboard();
  } catch (error) {
    showMessage('lotMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function archiveLot() {
  if (!currentLot) return;

  if (!confirm('Arquivar este lote? O histórico não será apagado.')) {
    return;
  }

  setLoading(true);

  try {
    await adminRequest('arquivarLote', { idLote: currentLot.id });
    showMessage('lotMessage', 'Lote arquivado.', 'success');
    currentLot = null;
    byId('lotSection').classList.add('hidden');
    byId('movementForms').classList.add('hidden');
    byId('financeForms').classList.add('hidden');
    byId('healthForms').classList.add('hidden');
    await loadDashboard();
  } catch (error) {
    showMessage('lotMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function toggleMovementFields() {
  const isMove = value('movTipo') === 'MUDANCA_CURRAL';

  byId('movCurralField').classList.toggle('hidden', !isMove);
  byId('movQuantidadeField').classList.toggle('hidden', isMove);
}

async function registerMovement(event) {
  event.preventDefault();

  if (!currentLot) {
    showMessage('movementMessage', 'Busque um lote primeiro.', 'error');
    return;
  }

  setLoading(true);

  try {
    const data = await adminRequest('registrarMovimentacao', {
      movimentacao: {
        idLote: currentLot.id,
        data: value('movData'),
        tipo: value('movTipo'),
        quantidade: value('movQuantidade'),
        curralNovo: value('movCurralNovo'),
        motivo: value('movMotivo'),
        observacoes: value('movObservacoes')
      }
    });

    showMessage('movementMessage', 'Movimentação registrada.', 'success');
    byId('movementForm').reset();
    toggleMovementFields();

    currentLot = normalizeLot(data.lote || currentLot);
    fillLot(currentLot);

    if (value('movTipo') === 'MUDANCA_CURRAL') {
      setValue('searchCurral', currentLot.curral);
    }

    await searchLot();
    await loadDashboard();
  } catch (error) {
    showMessage('movementMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function renderMovementHistory(items) {
  const container = byId('movementHistory');
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = '<p class="empty">Nenhuma movimentação.</p>';
    return;
  }

  items.slice().reverse().forEach(item => {
    const article = document.createElement('article');
    article.className = 'history-item';
    article.innerHTML = `
      <div>
        <strong>${escapeHtml(item.Tipo || item.tipo || 'Movimentação')}</strong>
        <span>${escapeHtml(formatDate(item.Data || item.data))}</span>
        <span>${escapeHtml(item.Motivo || item.motivo || '')}</span>
      </div>
      <strong>${escapeHtml(item.Quantidade || item.quantidade || item.CurralNovo || item.curralNovo || '')}</strong>
    `;

    container.appendChild(article);
  });
}

function fillFinance(calculation, raw) {
  const financeRow = raw.financeiroRegistro || raw.financeiro || {};
  const calc = calculation || raw.financeiro || {};

  text('fReceita', calc.exibicao?.receitaModalidade || 'R$ 0,00');
  text('fProtocolo', calc.exibicao?.custoProtocolo || 'R$ 0,00');
  text('fSanidade', calc.exibicao?.custoSanidade || 'R$ 0,00');
  text('fTotal', calc.exibicao?.valorTotal || 'R$ 0,00');

  setValue('finValorDiaria', financeRow.ValorDiaria ?? '');
  setValue('finValorArroba', financeRow.ValorArroba ?? '');
  setValue('finValorKgMS', financeRow.ValorKgMS ?? '');
  setValue('finConsumoTotalMS', financeRow.ConsumoTotalMS ?? '');

  text('financeMemory', JSON.stringify(calc.memoria || {}, null, 2));
}

async function refreshFinance() {
  if (!currentLot) return;

  const data = await adminRequest('obterFinanceiro', {
    idLote: currentLot.id
  });

  fillFinance(data.resultado, data.resultado);
}

async function updateFinance(event) {
  event.preventDefault();

  if (!currentLot) {
    showMessage('financeMessage', 'Busque um lote primeiro.', 'error');
    return;
  }

  setLoading(true);

  try {
    const data = await adminRequest('atualizarFinanceiro', {
      idLote: currentLot.id,
      campos: {
        valorDiaria: value('finValorDiaria'),
        valorArroba: value('finValorArroba'),
        valorKgMS: value('finValorKgMS'),
        consumoTotalMS: value('finConsumoTotalMS')
      }
    });

    fillFinance(data.resultado, data.resultado);
    showMessage('financeMessage', 'Financeiro atualizado.', 'success');
    await loadDashboard();
  } catch (error) {
    showMessage('financeMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function registerTreatment(event) {
  event.preventDefault();

  if (!currentLot) {
    showMessage('treatmentMessage', 'Busque um lote primeiro.', 'error');
    return;
  }

  setLoading(true);

  try {
    const data = await adminRequest('registrarTratamento', {
      tratamento: {
        idLote: currentLot.id,
        data: value('tratData'),
        quantidadeAnimais: value('tratQuantidade'),
        produto: value('tratProduto'),
        dosePorAnimalML: value('tratDose'),
        volumeTotalML: value('tratVolume'),
        custoTotal: value('tratCusto'),
        motivo: value('tratMotivo'),
        observacoes: value('tratObservacoes')
      }
    });

    showMessage('treatmentMessage', 'Tratamento registrado.', 'success');
    byId('treatmentForm').reset();
    renderTreatmentHistory(data.tratamentos || []);
    await refreshFinance();
    await loadDashboard();
  } catch (error) {
    showMessage('treatmentMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function renderTreatmentHistory(items) {
  const container = byId('treatmentHistory');
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = '<p class="empty">Nenhum tratamento.</p>';
    return;
  }

  items.slice().reverse().forEach(item => {
    const article = document.createElement('article');
    article.className = 'history-item';
    article.innerHTML = `
      <div>
        <strong>${escapeHtml(item.Produto || item.produto || 'Produto')}</strong>
        <span>${escapeHtml(formatDate(item.Data || item.data))}</span>
        <span>${escapeHtml(item.Motivo || item.motivo || '')}</span>
      </div>
      <strong>${escapeHtml(item.CustoTotal || item.custoTotal || '')}</strong>
    `;

    container.appendChild(article);
  });
}

async function adminRequest(acao, payload) {
  const token = localStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error('Sessão expirada.');
  }

  const response = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    cache: 'no-store',
    body: JSON.stringify({ acao, ...payload })
  });

  const data = await response.json();

  if (response.status === 401) {
    logout();
  }

  if (!response.ok || !data.sucesso) {
    throw new Error(data.mensagem || 'Não foi possível concluir a operação.');
  }

  return data;
}

function calculateVolume() {
  const quantity = parseBrazilian(value('tratQuantidade'));
  const dose = parseBrazilian(value('tratDose'));

  if (quantity > 0 && dose > 0) {
    setValue(
      'tratVolume',
      (quantity * dose).toLocaleString('pt-BR', {
        maximumFractionDigits: 2
      })
    );
  }
}

function showView(id) {
  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view.id === id);
  });

  document.querySelectorAll('.tab').forEach(button => {
    button.classList.toggle('active', button.dataset.view === id);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showAdmin() {
  byId('loginScreen').classList.remove('active');
  byId('adminScreen').classList.add('active');
}

function showLogin() {
  byId('adminScreen').classList.remove('active');
  byId('loginScreen').classList.add('active');
}

function setLoading(active) {
  byId('loading').classList.toggle('hidden', !active);
}

function showMessage(id, message, type = '') {
  const element = byId(id);
  element.textContent = message;
  element.className = `message ${type}`.trim();
}

function clearMessage(id) {
  showMessage(id, '');
}

function byId(id) {
  return document.getElementById(id);
}

function value(id) {
  return byId(id).value.trim();
}

function setValue(id, value) {
  byId(id).value = value ?? '';
}

function text(id, value) {
  byId(id).textContent = value ?? '';
}

function parseBrazilian(value) {
  const result = Number(
    String(value || '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.-]/g, '')
  );

  return Number.isFinite(result) ? result : 0;
}

function toInputDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const textValue = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(textValue)) {
    return textValue.slice(0, 10);
  }

  const match = textValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('pt-BR');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
