'use strict';

/**
 * Portal Administrativo — V6.5
 * Calculadora automática do período previsto do lote.
 */

document.addEventListener('DOMContentLoaded', function() {
  instalarCalculadoraDuracaoLoteV65();
});

function instalarCalculadoraDuracaoLoteV65() {
  const entrada = document.getElementById(
    'newDataEntrada'
  );

  const abate = document.getElementById(
    'newDataAbate'
  );

  if (!entrada || !abate) {
    return;
  }

  let painel = document.getElementById(
    'newLotDurationCard'
  );

  if (!painel) {
    painel = document.createElement('div');
    painel.id = 'newLotDurationCard';
    painel.className =
      'duracao-lote-card full aguardando';

    painel.innerHTML = `
      <span class="duracao-lote-rotulo">
        Período previsto do lote
      </span>

      <strong id="newLotDurationValue">
        Informe as duas datas
      </strong>

      <small id="newLotDurationDetail">
        A duração será calculada automaticamente.
      </small>
    `;

    const referencia = abate.closest('label');

    if (referencia) {
      referencia.insertAdjacentElement(
        'afterend',
        painel
      );
    }
  }

  entrada.addEventListener(
    'input',
    atualizarDuracaoLoteV65
  );

  entrada.addEventListener(
    'change',
    atualizarDuracaoLoteV65
  );

  abate.addEventListener(
    'input',
    atualizarDuracaoLoteV65
  );

  abate.addEventListener(
    'change',
    atualizarDuracaoLoteV65
  );

  const formulario = document.getElementById(
    'newLotForm'
  );

  if (formulario) {
    formulario.addEventListener('reset', function() {
      window.setTimeout(
        atualizarDuracaoLoteV65,
        0
      );
    });
  }

  atualizarDuracaoLoteV65();
}

function atualizarDuracaoLoteV65() {
  const entradaCampo = document.getElementById(
    'newDataEntrada'
  );

  const abateCampo = document.getElementById(
    'newDataAbate'
  );

  const painel = document.getElementById(
    'newLotDurationCard'
  );

  const valor = document.getElementById(
    'newLotDurationValue'
  );

  const detalhe = document.getElementById(
    'newLotDurationDetail'
  );

  if (
    !entradaCampo ||
    !abateCampo ||
    !painel ||
    !valor ||
    !detalhe
  ) {
    return;
  }

  abateCampo.setCustomValidity('');

  if (!entradaCampo.value || !abateCampo.value) {
    painel.className =
      'duracao-lote-card full aguardando';

    valor.textContent = 'Informe as duas datas';

    detalhe.textContent =
      'A duração será calculada automaticamente.';

    return;
  }

  const entrada = dataLocalV65(
    entradaCampo.value
  );

  const abate = dataLocalV65(
    abateCampo.value
  );

  const diferencaMs =
    abate.getTime() - entrada.getTime();

  const dias = Math.round(
    diferencaMs / 86400000
  );

  if (dias < 0) {
    painel.className =
      'duracao-lote-card full invalido';

    valor.textContent = 'Datas inválidas';

    detalhe.textContent =
      'A previsão de abate não pode ser anterior à entrada.';

    abateCampo.setCustomValidity(
      'A previsão de abate deve ser posterior à data de entrada.'
    );

    return;
  }

  painel.className =
    'duracao-lote-card full calculado';

  valor.textContent =
    dias === 1
      ? '1 dia previsto'
      : `${dias} dias previstos`;

  detalhe.textContent =
    `${formatarDataV65(entrada)} até ` +
    `${formatarDataV65(abate)}`;
}

function dataLocalV65(valor) {
  const partes = String(valor)
    .split('-')
    .map(Number);

  return new Date(
    partes[0],
    partes[1] - 1,
    partes[2],
    12,
    0,
    0
  );
}

function formatarDataV65(data) {
  return data.toLocaleDateString('pt-BR');
}
