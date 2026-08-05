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
  const texto = String(valor || '')
    .trim()
    .toUpperCase();

  /*
   * Captura somente o primeiro número depois de BOX.
   *
   * Exemplos:
   * BOX 18       → 18
   * BOX 18 [1]   → 18
   * BOX 04       → 04
   */
  const encontrado = texto.match(
    /\bBOX\s*0*(\d{1,2})\b/i
  );

  if (!encontrado) {
    return '';
  }

  const curral = Number(
    encontrado[1]
  );

  if (
    !Number.isInteger(curral) ||
    curral < 1 ||
    curral > 22
  ) {
    return '';
  }

  return String(curral).padStart(
    2,
    '0'
  );
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


/* =========================================================
 * V6.6 — IMPORTAÇÃO DO DETALHADO DE DESCARGA
 * Somente dados operacionais são enviados ao backend.
 * Custos e operador não são incluídos nos registros.
 * ======================================================= */

document.addEventListener('DOMContentLoaded', function() {
  instalarImportadorTratosV66();
});

let registrosTratosV66 = [];
let nomeArquivoTratosV66 = '';

function instalarImportadorTratosV66() {
  const view = document.getElementById('automationView');

  if (!view || document.getElementById('automationTreatmentsCard')) {
    return;
  }

  const card = document.createElement('section');
  card.id = 'automationTreatmentsCard';
  card.className = 'card';

  card.innerHTML = `
    <div class="section-title">
      <div>
        <span>Integração com a balança</span>
        <h2>Importar tratos realizados</h2>
      </div>
    </div>

    <p class="automation-description">
      Selecione o CSV “Detalhado de Descarga”.
      O sistema usará somente data, horário, BOX/Curral,
      trato, dieta, cabeças e peso descarregado.
      Custos, operador e precisão não serão enviados ao cliente.
    </p>

    <label class="automation-file full">
      Arquivo CSV
      <input
        id="treatmentsFile"
        type="file"
        accept=".csv,text/csv"
      >
    </label>

    <div
      id="treatmentsMessage"
      class="message"
    ></div>

    <div
      id="treatmentsPreview"
      class="automation-preview hidden"
    ></div>

    <div class="automation-actions">
      <button
        id="treatmentsAnalyze"
        class="secondary"
        type="button"
      >
        Analisar detalhado
      </button>

      <button
        id="treatmentsImport"
        class="primary"
        type="button"
        disabled
      >
        Confirmar tratos
      </button>
    </div>
  `;

  const firstCard = view.querySelector('.card');
  if (firstCard) {
    firstCard.insertAdjacentElement('afterend', card);
  } else {
    view.appendChild(card);
  }

  document
    .getElementById('treatmentsAnalyze')
    .addEventListener(
      'click',
      analisarDetalhadoDescargaV66
    );

  document
    .getElementById('treatmentsImport')
    .addEventListener(
      'click',
      importarTratosV66
    );
}

async function analisarDetalhadoDescargaV66() {
  clearMessage('treatmentsMessage');

  const input = document.getElementById('treatmentsFile');
  const file = input && input.files
    ? input.files[0]
    : null;

  if (!file) {
    showMessage(
      'treatmentsMessage',
      'Selecione o arquivo Detalhado de Descarga.',
      'error'
    );
    return;
  }

  setLoading(true);

  try {
    const texto = await file.text();
    const registros = interpretarDetalhadoDescargaV66(texto);

    if (!registros.length) {
      throw new Error(
        'Nenhum trato válido foi encontrado no arquivo.'
      );
    }

    registrosTratosV66 = registros;
    nomeArquivoTratosV66 = file.name;

    renderizarPreviaTratosV66(registros);

    document.getElementById(
      'treatmentsImport'
    ).disabled = false;

    showMessage(
      'treatmentsMessage',
      `${registros.length} descarga(s) encontrada(s). Confira a prévia.`,
      'success'
    );
  } catch (error) {
    registrosTratosV66 = [];
    nomeArquivoTratosV66 = '';

    document.getElementById(
      'treatmentsImport'
    ).disabled = true;

    showMessage(
      'treatmentsMessage',
      error.message,
      'error'
    );
  } finally {
    setLoading(false);
  }
}

function interpretarDetalhadoDescargaV66(textoOriginal) {
  const texto = String(textoOriginal || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '');

  const linhas = texto.split('\n');
  const registros = [];

  let dataAtual = '';
  let balancaAtual = '';
  let numeroTratoAtual = 0;
  let totalTratosAtual = 0;
  let dietaAtual = '';
  let horaInicioAtual = '';
  let horaFimAtual = '';
  let duracaoAtual = '';
  let dentroLotes = false;

  linhas.forEach(function(linha) {
    const limpa = linha.trim();

    if (!limpa) {
      return;
    }

    const dataMatch = limpa.match(
      /Relatório detalhado de descarga\s+—\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i
    );

    if (dataMatch) {
      dataAtual = dataMatch[1];
      dentroLotes = false;
      return;
    }

    const balancaMatch = limpa.match(
      /^Balança:\s*([^\s;]+).*?Trato;(\d+)\/(\d+)/i
    );

    if (balancaMatch) {
      balancaAtual = balancaMatch[1];
      numeroTratoAtual = Number(balancaMatch[2]) || 0;
      totalTratosAtual = Number(balancaMatch[3]) || 0;
      dentroLotes = false;
      return;
    }

    if (
      /^ROTEIRO;DIETA;/i.test(limpa)
    ) {
      dentroLotes = false;
      return;
    }

    if (
      dataAtual &&
      numeroTratoAtual &&
      !dentroLotes &&
      !/^Lotes;+$/i.test(limpa) &&
      !/^NOME;/i.test(limpa) &&
      !/^MOTIVO/i.test(limpa) &&
      !/^TOTAIS:/i.test(limpa)
    ) {
      const colunasRoteiro = separarLinhaCsvV66(linha);

      if (
        colunasRoteiro.length >= 10 &&
        !/^Balança:/i.test(limpa) &&
        !/^Relatório/i.test(limpa)
      ) {
        const possivelInicio =
          String(colunasRoteiro[7] || '').trim();

        const possivelFim =
          String(colunasRoteiro[8] || '').trim();

        if (
          /^\d{2}:\d{2}:\d{2}$/.test(possivelInicio) &&
          /^\d{2}:\d{2}:\d{2}$/.test(possivelFim)
        ) {
          dietaAtual = String(
            colunasRoteiro[1] ||
            colunasRoteiro[0] ||
            ''
          ).trim();

          horaInicioAtual = possivelInicio;
          horaFimAtual = possivelFim;
          duracaoAtual = String(
            colunasRoteiro[9] || ''
          ).trim();

          return;
        }
      }
    }

    if (/^Lotes;+$/i.test(limpa)) {
      dentroLotes = true;
      return;
    }

    if (!dentroLotes) {
      return;
    }

    if (
      /^NOME;/i.test(limpa) ||
      /^MOTIVO/i.test(limpa) ||
      /^TOTAIS:/i.test(limpa)
    ) {
      return;
    }

    if (!/^BOX\s*\d+/i.test(limpa)) {
      return;
    }

    const colunas = separarLinhaCsvV66(linha);

    if (colunas.length < 6) {
      return;
    }

    const curral = normalizarCurralArquivoV65(
      colunas[0]
    );

    const cabecasExecutadas =
      numeroRelatorioV65(colunas[2]);

    const pesoDescarregadoKg =
      numeroRelatorioV65(colunas[5]);

    if (
      !curral ||
      !dataAtual ||
      !numeroTratoAtual ||
      pesoDescarregadoKg <= 0
    ) {
      return;
    }

    registros.push({
      data: dataAtual,
      horaInicio: horaInicioAtual,
      horaFim: horaFimAtual,
      duracao: duracaoAtual,
      curral: curral,
      numeroTrato: numeroTratoAtual,
      totalTratosPrevistos:
        totalTratosAtual || numeroTratoAtual,
      dieta: dietaAtual,
      cabecasExecutadas: cabecasExecutadas,
      pesoDescarregadoKg:
        pesoDescarregadoKg,
      balanca: balancaAtual
    });
  });

  return registros;
}

function separarLinhaCsvV66(linha) {
  const resultado = [];
  let atual = '';
  let entreAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const caractere = linha[i];

    if (caractere === '"') {
      entreAspas = !entreAspas;
      continue;
    }

    if (caractere === ';' && !entreAspas) {
      resultado.push(atual);
      atual = '';
      continue;
    }

    atual += caractere;
  }

  resultado.push(atual);

  return resultado.map(function(valor) {
    return String(valor || '')
      .replace(/\n/g, ' ')
      .trim();
  });
}

function renderizarPreviaTratosV66(registros) {
  const preview = document.getElementById(
    'treatmentsPreview'
  );

  preview.classList.remove('hidden');

  preview.innerHTML = `
    <div class="automation-preview-summary">
      <strong>${registros.length} descarga(s)</strong>
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
            <th>Trato</th>
            <th>Horário</th>
            <th>Dieta</th>
            <th>Cabeças</th>
            <th>Descarregado</th>
          </tr>
        </thead>

        <tbody>
          ${registros.map(function(item) {
            return `
              <tr>
                <td>${escapeHtml(item.data)}</td>
                <td>${escapeHtml(item.curral)}</td>
                <td>
                  ${escapeHtml(item.numeroTrato)}
                  /
                  ${escapeHtml(item.totalTratosPrevistos)}
                </td>
                <td>
                  ${escapeHtml(item.horaInicio || '—')}
                  ${item.horaFim
                    ? ` às ${escapeHtml(item.horaFim)}`
                    : ''}
                </td>
                <td>${escapeHtml(item.dieta || '—')}</td>
                <td>${escapeHtml(item.cabecasExecutadas)}</td>
                <td>
                  ${escapeHtml(
                    Number(
                      item.pesoDescarregadoKg || 0
                    ).toLocaleString('pt-BR', {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3
                    })
                  )} kg
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function importarTratosV66() {
  if (!registrosTratosV66.length) {
    showMessage(
      'treatmentsMessage',
      'Analise o arquivo antes de importar.',
      'error'
    );
    return;
  }

  setLoading(true);

  try {
    const data = await adminRequest(
      'importarTratosAutomacao',
      {
        registros: registrosTratosV66,
        arquivoOrigem: nomeArquivoTratosV66
      }
    );

    const detalhes = [
      `${data.inseridos || 0} inserido(s)`,
      `${data.atualizados || 0} atualizado(s)`,
      `${data.ignorados || 0} ignorado(s)`
    ].join(' • ');

    showMessage(
      'treatmentsMessage',
      `Importação concluída: ${detalhes}.`,
      data.ignorados ? 'error' : 'success'
    );

    registrosTratosV66 = [];
    nomeArquivoTratosV66 = '';

    document.getElementById(
      'treatmentsImport'
    ).disabled = true;

    document.getElementById(
      'treatmentsFile'
    ).value = '';

    document.getElementById(
      'treatmentsPreview'
    ).classList.add('hidden');

    await loadDashboard();
  } catch (error) {
    showMessage(
      'treatmentsMessage',
      error.message,
      'error'
    );
  } finally {
    setLoading(false);
  }
}
