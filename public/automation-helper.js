'use strict';

/**
 * Portal Administrativo — V6.5
 * Importador do relatório "Consumo por Lote (Por dia)".
 */

document.addEventListener('DOMContentLoaded', function() {
  instalarModuloAutomacaoV65();
});

function instalarModuloAutomacaoV65() {
  const tabs = document.querySelector('.tabs');
  const adminScreen = document.getElementById('adminScreen');

  if (!tabs || !adminScreen) return;

  if (!document.getElementById('automationView')) {
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.dataset.view = 'automationView';
    tab.textContent = 'Automação';
    tabs.appendChild(tab);

    const view = document.createElement('section');
    view.id = 'automationView';
    view.className = 'view';
    view.innerHTML = `
      <section class="card">
        <div class="section-title">
          <div>
            <span>Integração</span>
            <h2>Importar consumo diário</h2>
          </div>
        </div>

        <p class="automation-description">
          Selecione o CSV “Consumo por Lote (Por dia)”.
          O BOX será vinculado ao Curral do lote ativo.
        </p>

        <label class="automation-file full">
          Arquivo CSV
          <input
            id="automationFile"
            type="file"
            accept=".csv,text/csv"
          >
        </label>

        <div
          id="automationMessage"
          class="message"
        ></div>

        <div
          id="automationPreview"
          class="automation-preview hidden"
        ></div>

        <div class="automation-actions">
          <button
            id="automationAnalyze"
            class="secondary"
            type="button"
          >
            Analisar arquivo
          </button>

          <button
            id="automationImport"
            class="primary"
            type="button"
            disabled
          >
            Confirmar importação
          </button>
        </div>
      </section>

      <section class="card">
        <div class="section-title">
          <div>
            <span>Histórico</span>
            <h2>Últimas importações</h2>
          </div>
        </div>

        <div
          id="automationHistory"
          class="history"
        >
          <p class="empty">
            Abra esta aba para carregar o histórico.
          </p>
        </div>
      </section>
    `;

    adminScreen.appendChild(view);

    tab.addEventListener('click', async function() {
      showView('automationView');
      await carregarHistoricoAutomacaoV65();
    });
  }

  const analyze = document.getElementById('automationAnalyze');
  const importButton = document.getElementById('automationImport');

  if (analyze) {
    analyze.addEventListener(
      'click',
      analisarArquivoAutomacaoV65
    );
  }

  if (importButton) {
    importButton.addEventListener(
      'click',
      importarArquivoAutomacaoV65
    );
  }
}

let registrosAutomacaoV65 = [];
let nomeArquivoAutomacaoV65 = '';

async function analisarArquivoAutomacaoV65() {
  clearMessage('automationMessage');

  const input = document.getElementById('automationFile');
  const file = input && input.files
    ? input.files[0]
    : null;

  if (!file) {
    showMessage(
      'automationMessage',
      'Selecione um arquivo CSV.',
      'error'
    );
    return;
  }

  setLoading(true);

  try {
    const texto = await file.text();
    const registros = interpretarConsumoPorLoteV65(texto);

    if (!registros.length) {
      throw new Error(
        'Nenhum registro de consumo foi encontrado.'
      );
    }

    registrosAutomacaoV65 = registros;
    nomeArquivoAutomacaoV65 = file.name;

    renderizarPreviaAutomacaoV65(registros);

    document.getElementById(
      'automationImport'
    ).disabled = false;

    showMessage(
      'automationMessage',
      `${registros.length} registro(s) encontrado(s). Confira a prévia.`,
      'success'
    );
  } catch (error) {
    registrosAutomacaoV65 = [];
    nomeArquivoAutomacaoV65 = '';

    document.getElementById(
      'automationImport'
    ).disabled = true;

    showMessage(
      'automationMessage',
      error.message,
      'error'
    );
  } finally {
    setLoading(false);
  }
}

function interpretarConsumoPorLoteV65(textoOriginal) {
  const texto = String(textoOriginal || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '');

  const linhas = texto.split('\n');
  const registros = [];
  let dataAtual = '';

  linhas.forEach(function(linha) {
    const limpa = linha.trim();

    if (!limpa) return;

    const diaMatch = limpa.match(
      /^DIA:\s*(\d{2}\/\d{2}\/\d{4})$/i
    );

    if (diaMatch) {
      dataAtual = diaMatch[1];
      return;
    }

    if (
      !dataAtual ||
      !/^BOX\s*\d+/i.test(limpa)
    ) {
      return;
    }

    const colunas = limpa.split(';');

    if (colunas.length < 14) {
      return;
    }

    registros.push({
      data: dataAtual,
      curral: normalizarCurralArquivoV65(colunas[0]),
      dieta: String(colunas[2] || '').trim(),
      diasLote: numeroRelatorioV65(colunas[3]),
      cabecasTratadas: numeroRelatorioV65(colunas[4]),
      pesoEntradaKg: numeroRelatorioV65(colunas[5]),
      pesoProjetadoKg: numeroRelatorioV65(colunas[6]),
      consumoNaturalTotalKg: numeroRelatorioV65(colunas[7]),
      consumoMSTotalKg: numeroRelatorioV65(colunas[8]),
      consumoNaturalPorCabecaKg:
        numeroRelatorioV65(colunas[9]),
      consumoMSPorCabecaKg:
        numeroRelatorioV65(colunas[10]),
      consumoMSPVPct:
        numeroRelatorioV65(colunas[13])
    });
  });

  return registros.filter(function(item) {
    return (
      item.curral &&
      item.cabecasTratadas > 0 &&
      (
        item.consumoNaturalTotalKg > 0 ||
        item.consumoMSTotalKg > 0
      )
    );
  });
}

function numeroRelatorioV65(valor) {
  const limpo = String(valor || '')
    .replace(/\s/g, '')
    .replace(/KG/gi, '')
    .replace(/%/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');

  const numero = Number(limpo);

  return Number.isFinite(numero) ? numero : 0;
}

function normalizarCurralArquivoV65(valor) {
  const numero = String(valor || '')
    .toUpperCase()
    .replace('BOX', '')
    .replace(/[^0-9]/g, '');

  if (!numero) return '';

  const curral = Number(numero);

  if (
    !Number.isInteger(curral) ||
    curral < 1 ||
    curral > 22
  ) {
    return '';
  }

  return String(curral).padStart(2, '0');
}

function renderizarPreviaAutomacaoV65(registros) {
  const preview = document.getElementById(
    'automationPreview'
  );

  preview.classList.remove('hidden');

  preview.innerHTML = `
    <div class="automation-preview-summary">
      <strong>${registros.length} registros</strong>
      <span>
        ${new Set(
          registros.map(item => item.curral)
        ).size} curral(is)
      </span>
    </div>

    <div class="automation-table-wrapper">
      <table class="automation-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Curral</th>
            <th>Cabeças</th>
            <th>Natural/cab.</th>
            <th>MS/cab.</th>
            <th>Dieta</th>
          </tr>
        </thead>
        <tbody>
          ${registros.map(function(item) {
            return `
              <tr>
                <td>${escapeHtml(item.data)}</td>
                <td>${escapeHtml(item.curral)}</td>
                <td>${escapeHtml(item.cabecasTratadas)}</td>
                <td>${escapeHtml(
                  item.consumoNaturalPorCabecaKg
                    .toLocaleString('pt-BR', {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3
                    })
                )} kg</td>
                <td>${escapeHtml(
                  item.consumoMSPorCabecaKg
                    .toLocaleString('pt-BR', {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3
                    })
                )} kg</td>
                <td>${escapeHtml(item.dieta)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function importarArquivoAutomacaoV65() {
  if (!registrosAutomacaoV65.length) {
    showMessage(
      'automationMessage',
      'Analise um arquivo antes de importar.',
      'error'
    );
    return;
  }

  setLoading(true);

  try {
    const data = await adminRequest(
      'importarConsumoAutomacao',
      {
        registros: registrosAutomacaoV65,
        arquivoOrigem: nomeArquivoAutomacaoV65
      }
    );

    const detalhes = [
      `${data.inseridos || 0} inserido(s)`,
      `${data.atualizados || 0} atualizado(s)`,
      `${data.ignorados || 0} ignorado(s)`
    ].join(' • ');

    showMessage(
      'automationMessage',
      `Importação concluída: ${detalhes}.`,
      data.ignorados ? 'error' : 'success'
    );

    registrosAutomacaoV65 = [];
    nomeArquivoAutomacaoV65 = '';

    document.getElementById(
      'automationImport'
    ).disabled = true;

    document.getElementById(
      'automationFile'
    ).value = '';

    document.getElementById(
      'automationPreview'
    ).classList.add('hidden');

    await Promise.all([
      carregarHistoricoAutomacaoV65(),
      loadDashboard()
    ]);
  } catch (error) {
    showMessage(
      'automationMessage',
      error.message,
      'error'
    );
  } finally {
    setLoading(false);
  }
}

async function carregarHistoricoAutomacaoV65() {
  const container = document.getElementById(
    'automationHistory'
  );

  if (!container) return;

  container.innerHTML =
    '<p class="empty">Carregando...</p>';

  try {
    const data = await adminRequest(
      'listarConsumoAutomacao',
      { limite: 100 }
    );

    const itens = Array.isArray(data.registros)
      ? data.registros
      : [];

    if (!itens.length) {
      container.innerHTML =
        '<p class="empty">Nenhuma importação realizada.</p>';
      return;
    }

    container.innerHTML = '';

    itens.forEach(function(item) {
      const article = document.createElement('article');
      article.className = 'history-item';

      article.innerHTML = `
        <div>
          <strong>
            Curral ${escapeHtml(item.curral)}
            — ${escapeHtml(item.data)}
          </strong>

          <span>
            Natural:
            ${escapeHtml(
              Number(
                item.consumoNaturalPorCabecaKg || 0
              ).toLocaleString('pt-BR', {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
              })
            )} kg/cab.
          </span>

          <span>
            MS:
            ${escapeHtml(
              Number(
                item.consumoMSPorCabecaKg || 0
              ).toLocaleString('pt-BR', {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
              })
            )} kg/cab.
          </span>
        </div>

        <strong>
          ${escapeHtml(item.dieta || '—')}
        </strong>
      `;

      container.appendChild(article);
    });
  } catch (error) {
    container.innerHTML = `
      <p class="empty">
        ${escapeHtml(error.message)}
      </p>
    `;
  }
}
