'use strict';

const TOKEN_KEY = 'limao_azedo_admin_token';
let currentLot = null;

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('loginForm').addEventListener('submit', login);
  document.getElementById('logoutButton').addEventListener('click', logout);
  document.getElementById('searchForm').addEventListener('submit', searchLot);
  document.getElementById('lotForm').addEventListener('submit', updateLot);
  document.getElementById('treatmentForm').addEventListener('submit', registerTreatment);
  document.getElementById('tratQuantidade').addEventListener('input', calculateVolume);
  document.getElementById('tratDose').addEventListener('input', calculateVolume);

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) validateSession();
});

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
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  } finally {
    setLoading(false);
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  currentLot = null;
  document.getElementById('lotSection').classList.add('hidden');
  showLogin();
}

async function searchLot(event) {
  event.preventDefault();
  clearMessage('searchMessage');
  setLoading(true);

  try {
    const data = await adminRequest('buscarLoteAdmin', {
      curral: value('searchCurral'),
      carimbo: value('searchCarimbo')
    });

    if (!data.resultado) throw new Error('Lote não encontrado.');

    currentLot = data.resultado;
    fillLot(currentLot);
    renderHistory(currentLot.sanidade?.tratamentos || []);
    document.getElementById('lotSection').classList.remove('hidden');
    showMessage('searchMessage', 'Lote carregado.', 'success');
  } catch (error) {
    document.getElementById('lotSection').classList.add('hidden');
    showMessage('searchMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function updateLot(event) {
  event.preventDefault();
  clearMessage('lotMessage');

  if (!currentLot) {
    showMessage('lotMessage', 'Busque um lote primeiro.', 'error');
    return;
  }

  setLoading(true);

  try {
    await adminRequest('atualizarLote', {
      idLote: currentLot.id,
      campos: {
        animaisDoentes: value('animaisDoentes'),
        animaisEnfermaria: value('animaisEnfermaria'),
        mortes: value('mortes'),
        consumoMS: value('consumoMS'),
        gmdProjetado: value('gmdProjetado'),
        dieta: value('dieta'),
        modalidade: value('modalidade'),
        status: value('status'),
        dataAbate: value('dataAbate')
      }
    });

    showMessage('lotMessage', 'Dados atualizados com sucesso.', 'success');
  } catch (error) {
    showMessage('lotMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function registerTreatment(event) {
  event.preventDefault();
  clearMessage('treatmentMessage');

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

    showMessage('treatmentMessage', 'Tratamento registrado com sucesso.', 'success');
    document.getElementById('treatmentForm').reset();

    if (data.tratamentos) {
      renderHistory(data.tratamentos);
    } else {
      await reloadCurrentLot();
    }
  } catch (error) {
    showMessage('treatmentMessage', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function reloadCurrentLot() {
  const data = await adminRequest('buscarLoteAdmin', {
    curral: currentLot.curral,
    carimbo: currentLot.carimbo
  });

  currentLot = data.resultado;
  fillLot(currentLot);
  renderHistory(currentLot.sanidade?.tratamentos || []);
}

function fillLot(lot) {
  text('summaryCliente', lot.cliente || '—');
  text('summaryLote', lot.lote || '—');
  text('summaryId', lot.id || '—');
  setValue('animaisDoentes', lot.animaisDoentes || 0);
  setValue('animaisEnfermaria', lot.animaisEnfermaria || 0);
  setValue('mortes', lot.mortes || 0);
  setValue('consumoMS', lot.consumoMS || '');
  setValue('gmdProjetado', lot.gmdProjetado || '');
  setValue('dieta', lot.dieta || '');
  setValue('modalidade', lot.modalidade || '');
  setValue('status', lot.status || '');
  setValue('dataAbate', toInputDate(lot.dataAbate));
}

function renderHistory(items) {
  const container = document.getElementById('treatmentHistory');
  container.innerHTML = '';

  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = '<p class="empty">Nenhum tratamento registrado.</p>';
    return;
  }

  items.slice().reverse().forEach(function (item) {
    const article = document.createElement('article');
    article.className = 'history-item';
    article.innerHTML = `
      <div class="history-top">
        <div>
          <strong>${escapeHtml(item.produto || 'Produto')}</strong>
          <span>${escapeHtml(item.data || 'Data não informada')}</span>
        </div>
        <strong>${escapeHtml(item.custoTotal || 'R$ 0,00')}</strong>
      </div>

      <div class="history-grid">
        <div><span>Animais</span><strong>${escapeHtml(item.quantidadeAnimais || '0')}</strong></div>
        <div><span>Dose</span><strong>${escapeHtml(unit(item.dosePorAnimal, 'ml'))}</strong></div>
        <div><span>Volume total</span><strong>${escapeHtml(unit(item.volumeTotal, 'ml'))}</strong></div>
        <div><span>Motivo</span><strong>${escapeHtml(item.motivo || '—')}</strong></div>
        <div class="full"><span>Observações</span><strong>${escapeHtml(item.observacoes || '—')}</strong></div>
      </div>
    `;
    container.appendChild(article);
  });
}

async function adminRequest(acao, payload) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Sessão expirada.');

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
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }

  if (!response.ok || !data.sucesso) {
    throw new Error(data.mensagem || 'Não foi possível concluir a operação.');
  }

  return data;
}

function calculateVolume() {
  const quantidade = parseBrazilian(value('tratQuantidade'));
  const dose = parseBrazilian(value('tratDose'));

  if (quantidade > 0 && dose > 0) {
    setValue('tratVolume', (quantidade * dose).toLocaleString('pt-BR', {
      maximumFractionDigits: 2
    }));
  }
}

function showAdmin() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('adminScreen').classList.add('active');
}

function showLogin() {
  document.getElementById('adminScreen').classList.remove('active');
  document.getElementById('loginScreen').classList.add('active');
}

function setLoading(active) {
  document.getElementById('loading').classList.toggle('hidden', !active);
}

function showMessage(id, message, type = '') {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = `message ${type}`.trim();
}

function clearMessage(id) {
  showMessage(id, '');
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function setValue(id, value) {
  document.getElementById(id).value = value ?? '';
}

function text(id, value) {
  document.getElementById(id).textContent = value;
}

function parseBrazilian(value) {
  const number = Number(String(value || '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, ''));

  return Number.isFinite(number) ? number : 0;
}

function toInputDate(value) {
  const text = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function unit(value, suffix) {
  const text = String(value ?? '').trim();
  if (!text) return '—';

  return text.toLowerCase().includes(suffix.toLowerCase())
    ? text
    : `${text} ${suffix}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
