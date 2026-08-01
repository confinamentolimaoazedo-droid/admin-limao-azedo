const ID_PLANILHA =
  '119ORBFtDVOLpb1tCZW3fqLDIU_g11ddCiWomAWgjnKI';

const NOME_ABA_LOTES = 'Lotes';
const NOME_ABA_SANIDADE = 'Sanidade';
const NOME_ABA_PROTOCOLO = 'Protocolo Sanitário';
const NOME_ABA_CONFIG = 'Config';

// Use exatamente a mesma chave cadastrada como API_SECRET
// nos dois Workers da Cloudflare.
const SEGREDO_API = 'COLOQUE_AQUI_SUA_CHAVE_ATUAL';

/**
 * Acesso direto à implantação do Apps Script.
 * O portal oficial continua hospedado na Cloudflare.
 */
function doGet() {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Limão Azedo Confinamento')
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1, viewport-fit=cover'
    );
}

/**
 * Recebe tanto consultas do Portal do Cliente quanto
 * operações do Painel Administrativo.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responderJson({
        sucesso: false,
        mensagem: 'Requisição inválida.'
      });
    }

    const corpo = JSON.parse(e.postData.contents);

    if (!corpo.segredo || corpo.segredo !== SEGREDO_API) {
      return responderJson({
        sucesso: false,
        mensagem: 'Acesso não autorizado.'
      });
    }

    if (String(corpo.modo || '').toLowerCase() === 'admin') {
      return processarAcaoAdministrativa(corpo);
    }

    const curral = String(corpo.curral || '').trim();
    const carimbo = String(corpo.carimbo || '').trim();

    if (!curral || !carimbo) {
      return responderJson({
        sucesso: false,
        mensagem: 'Informe o curral e o carimbo.'
      });
    }

    const resultado = buscarLote(curral, carimbo);

    return responderJson({
      sucesso: true,
      resultado: resultado
    });
  } catch (erro) {
    console.error(erro);

    return responderJson({
      sucesso: false,
      mensagem:
        erro && erro.message
          ? erro.message
          : 'Não foi possível concluir a operação.'
    });
  }
}

/**
 * Direciona as ações enviadas pelo Painel Administrativo.
 */
function processarAcaoAdministrativa(corpo) {
  const acao = String(corpo.acao || '').trim();

  switch (acao) {
    case 'obterDashboardAdmin': {
      return responderJson({
        sucesso: true,
        dashboard: obterDashboardAdmin()
      });
    }

    case 'buscarLoteAdmin': {
      const curral = String(corpo.curral || '').trim();
      const carimbo = String(corpo.carimbo || '').trim();

      if (!curral || !carimbo) {
        return responderJson({
          sucesso: false,
          mensagem: 'Informe o curral e o carimbo.'
        });
      }

      return responderJson({
        sucesso: true,
        resultado: buscarLote(curral, carimbo)
      });
    }

    case 'atualizarLote': {
      const resultado = atualizarLote(
        corpo.idLote,
        corpo.campos || {},
        corpo.administrador
      );

      return responderJson({
        sucesso: true,
        mensagem: 'Dados do lote atualizados.',
        resultado: resultado
      });
    }

    case 'registrarTratamento': {
      const resultado = registrarTratamento(
        corpo.tratamento || {},
        corpo.administrador
      );

      return responderJson({
        sucesso: true,
        mensagem: 'Tratamento registrado.',
        idTratamento: resultado.idTratamento,
        tratamentos: resultado.tratamentos
      });
    }

    default:
      return responderJson({
        sucesso: false,
        mensagem: 'Ação administrativa não reconhecida.'
      });
  }
}

/**
 * Retorna JSON ao Worker da Cloudflare.
 */
function responderJson(conteudo) {
  return ContentService
    .createTextOutput(JSON.stringify(conteudo))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Localiza um lote por Curral e Carimbo.
 */
function buscarLote(curral, carimbo) {
  const planilha = SpreadsheetApp.openById(ID_PLANILHA);
  const abaLotes = planilha.getSheetByName(NOME_ABA_LOTES);

  if (!abaLotes) {
    throw new Error(
      `A aba "${NOME_ABA_LOTES}" não foi encontrada.`
    );
  }

  const dados = abaLotes.getDataRange().getDisplayValues();

  if (dados.length < 2) {
    return null;
  }

  const cabecalhos = dados[0].map(normalizarTexto);
  const indices = criarMapaDeColunasLotes(cabecalhos);

  validarColunasObrigatorias(indices);

  const curralBuscado = normalizarTexto(curral);
  const carimboBuscado = normalizarTexto(carimbo);

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];

    const curralPlanilha = normalizarTexto(
      obterValor(linha, indices.curral)
    );

    const carimboPlanilha = normalizarTexto(
      obterValor(linha, indices.carimbo)
    );

    if (
      curralPlanilha === curralBuscado &&
      carimboPlanilha === carimboBuscado
    ) {
      const resultado = montarResultadoLote(linha, indices);

      resultado.sanidade = buscarSanidadeDoLote(
        planilha,
        resultado.id
      );

      resultado.protocoloSanitario =
        buscarProtocoloSanitario(planilha);

      resultado.configuracoes =
        buscarConfiguracoes(planilha);

      const custoProtocolo = converterNumero(
        resultado.configuracoes.custoProtocoloEntrada
      );

      const cabecasIniciais = converterNumero(
        resultado.cabecasIniciais
      );

      resultado.custoProtocoloPorAnimal =
        formatarMoeda(custoProtocolo);

      resultado.custoProtocoloTotal =
        formatarMoeda(custoProtocolo * cabecasIniciais);

      return resultado;
    }
  }

  return null;
}

/**
 * Atualiza campos permitidos na aba Lotes.
 */
function atualizarLote(idLote, campos, administrador) {
  const id = String(idLote || '').trim();

  if (!id) {
    throw new Error('O ID do lote não foi informado.');
  }

  const planilha = SpreadsheetApp.openById(ID_PLANILHA);
  const aba = planilha.getSheetByName(NOME_ABA_LOTES);

  if (!aba) {
    throw new Error(
      `A aba "${NOME_ABA_LOTES}" não foi encontrada.`
    );
  }

  const dados = aba.getDataRange().getDisplayValues();
  const cabecalhos = dados[0].map(normalizarTexto);
  const indices = criarMapaDeColunasLotes(cabecalhos);

  if (indices.id === -1) {
    throw new Error('A coluna "ID" não foi encontrada.');
  }

  const idNormalizado = normalizarTexto(id);
  let numeroLinha = -1;

  for (let i = 1; i < dados.length; i++) {
    if (
      normalizarTexto(
        obterValor(dados[i], indices.id)
      ) === idNormalizado
    ) {
      numeroLinha = i + 1;
      break;
    }
  }

  if (numeroLinha === -1) {
    throw new Error('Lote não encontrado para atualização.');
  }

  const atualizacoes = [
    {
      chave: 'animaisDoentes',
      indice: indices.animaisDoentes,
      tipo: 'numeroInteiro'
    },
    {
      chave: 'animaisEnfermaria',
      indice: indices.animaisEnfermaria,
      tipo: 'numeroInteiro'
    },
    {
      chave: 'mortes',
      indice: indices.mortes,
      tipo: 'numeroInteiro'
    },
    {
      chave: 'consumoMS',
      indice: indices.consumoMS,
      tipo: 'numeroDecimal'
    },
    {
      chave: 'gmdProjetado',
      indice: indices.gmdProjetado,
      tipo: 'numeroDecimal'
    },
    {
      chave: 'dieta',
      indice: indices.dieta,
      tipo: 'texto'
    },
    {
      chave: 'modalidade',
      indice: indices.modalidade,
      tipo: 'texto'
    },
    {
      chave: 'status',
      indice: indices.status,
      tipo: 'texto'
    },
    {
      chave: 'dataAbate',
      indice: indices.dataAbate,
      tipo: 'data'
    }
  ];

  atualizacoes.forEach(function(item) {
    if (
      item.indice === -1 ||
      !Object.prototype.hasOwnProperty.call(campos, item.chave)
    ) {
      return;
    }

    const valorRecebido = campos[item.chave];
    const celula = aba.getRange(numeroLinha, item.indice + 1);

    if (item.tipo === 'numeroInteiro') {
      celula.setValue(
        Math.max(0, Math.round(converterNumero(valorRecebido)))
      );
      return;
    }

    if (item.tipo === 'numeroDecimal') {
      celula.setValue(converterNumero(valorRecebido));
      return;
    }

    if (item.tipo === 'data') {
      const data = converterDataEntrada(valorRecebido);

      if (data) {
        celula
          .setValue(data)
          .setNumberFormat('dd/MM/yyyy');
      } else {
        celula.clearContent();
      }

      return;
    }

    celula.setValue(String(valorRecebido || '').trim());
  });

  if (indices.atualizadoEm !== -1) {
    aba
      .getRange(numeroLinha, indices.atualizadoEm + 1)
      .setValue(new Date())
      .setNumberFormat('dd/MM/yyyy HH:mm');
  }

  SpreadsheetApp.flush();

  const curral = obterValor(
    aba.getRange(numeroLinha, 1, 1, aba.getLastColumn())
      .getDisplayValues()[0],
    indices.curral
  );

  const carimbo = obterValor(
    aba.getRange(numeroLinha, 1, 1, aba.getLastColumn())
      .getDisplayValues()[0],
    indices.carimbo
  );

  console.log(
    `Lote ${id} atualizado por ${administrador || 'administrador'}.`
  );

  return buscarLote(curral, carimbo);
}

/**
 * Registra nova linha na aba Sanidade.
 */
function registrarTratamento(tratamento, administrador) {
  const idLote = String(tratamento.idLote || '').trim();
  const produto = String(tratamento.produto || '').trim();

  if (!idLote) {
    throw new Error('O ID do lote não foi informado.');
  }

  if (!produto) {
    throw new Error('Informe o produto utilizado.');
  }

  const quantidade = Math.max(
    1,
    Math.round(
      converterNumero(tratamento.quantidadeAnimais)
    )
  );

  const dose = converterNumero(
    tratamento.dosePorAnimalML
  );

  const volumeInformado = converterNumero(
    tratamento.volumeTotalML
  );

  const volumeTotal =
    volumeInformado > 0
      ? volumeInformado
      : quantidade * dose;

  const custoTotal = converterNumero(
    tratamento.custoTotal
  );

  const dataTratamento =
    converterDataEntrada(tratamento.data) ||
    new Date();

  const planilha = SpreadsheetApp.openById(ID_PLANILHA);
  const aba = planilha.getSheetByName(NOME_ABA_SANIDADE);

  if (!aba) {
    throw new Error(
      `A aba "${NOME_ABA_SANIDADE}" não foi encontrada.`
    );
  }

  const ultimaColuna = Math.max(aba.getLastColumn(), 10);
  const cabecalhosOriginais = aba
    .getRange(1, 1, 1, ultimaColuna)
    .getDisplayValues()[0];

  const cabecalhos = cabecalhosOriginais.map(
    normalizarTexto
  );

  const indices = criarMapaDeColunasSanidade(cabecalhos);

  const obrigatorias = [
    'idTratamento',
    'idLote',
    'data',
    'quantidadeAnimais',
    'produto',
    'dosePorAnimal',
    'volumeTotal',
    'custoTotal',
    'motivo',
    'observacoes'
  ];

  obrigatorias.forEach(function(chave) {
    if (indices[chave] === -1) {
      throw new Error(
        `Não foi possível localizar a coluna "${chave}" na aba Sanidade.`
      );
    }
  });

  const idTratamento = gerarIdTratamento(aba);
  const novaLinha = new Array(ultimaColuna).fill('');

  novaLinha[indices.idTratamento] = idTratamento;
  novaLinha[indices.idLote] = idLote;
  novaLinha[indices.data] = dataTratamento;
  novaLinha[indices.quantidadeAnimais] = quantidade;
  novaLinha[indices.produto] = produto;
  novaLinha[indices.dosePorAnimal] = dose;
  novaLinha[indices.volumeTotal] = volumeTotal;
  novaLinha[indices.custoTotal] = custoTotal;
  novaLinha[indices.motivo] = String(
    tratamento.motivo || ''
  ).trim();
  novaLinha[indices.observacoes] = String(
    tratamento.observacoes || ''
  ).trim();

  const novaLinhaNumero = aba.getLastRow() + 1;

  aba
    .getRange(novaLinhaNumero, 1, 1, ultimaColuna)
    .setValues([novaLinha]);

  aba
    .getRange(novaLinhaNumero, indices.data + 1)
    .setNumberFormat('dd/MM/yyyy');

  aba
    .getRange(novaLinhaNumero, indices.custoTotal + 1)
    .setNumberFormat('R$ #,##0.00');

  SpreadsheetApp.flush();

  console.log(
    `Tratamento ${idTratamento} registrado por ${
      administrador || 'administrador'
    }.`
  );

  return {
    idTratamento: idTratamento,
    tratamentos:
      buscarSanidadeDoLote(planilha, idLote).tratamentos
  };
}

/**
 * Gera IDs como TRAT000001, TRAT000002...
 */
function gerarIdTratamento(aba) {
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) {
    return 'TRAT000001';
  }

  const valores = aba
    .getRange(2, 1, ultimaLinha - 1, 1)
    .getDisplayValues()
    .flat();

  let maiorNumero = 0;

  valores.forEach(function(valor) {
    const correspondencia = String(valor || '')
      .toUpperCase()
      .match(/TRAT(\d+)/);

    if (correspondencia) {
      maiorNumero = Math.max(
        maiorNumero,
        Number(correspondencia[1]) || 0
      );
    }
  });

  return 'TRAT' +
    String(maiorNumero + 1).padStart(6, '0');
}

/**
 * Mapeia a aba Lotes.
 */
function criarMapaDeColunasLotes(cabecalhos) {
  return {
    id: localizarPrimeiroIndice(
      cabecalhos,
      ['id', 'idlote']
    ),

    curral: localizarPrimeiroIndice(
      cabecalhos,
      ['curral']
    ),

    carimbo: localizarPrimeiroIndice(
      cabecalhos,
      ['carimbo']
    ),

    cliente: localizarPrimeiroIndice(
      cabecalhos,
      ['cliente']
    ),

    lote: localizarPrimeiroIndice(
      cabecalhos,
      ['lote']
    ),

    dieta: localizarPrimeiroIndice(
      cabecalhos,
      ['dieta']
    ),

    gmdProjetado: localizarPrimeiroIndice(
      cabecalhos,
      ['gmdprojetado', 'gmd']
    ),

    modalidade: localizarPrimeiroIndice(
      cabecalhos,
      ['modalidade']
    ),

    animaisDoentes: localizarPrimeiroIndice(
      cabecalhos,
      ['animaisdoentes']
    ),

    animaisEnfermaria: localizarPrimeiroIndice(
      cabecalhos,
      [
        'animaisenfermaria',
        'animaisnaenfermaria'
      ]
    ),

    dataEntrada: localizarPrimeiroIndice(
      cabecalhos,
      ['dataentrada']
    ),

    dataAbate: localizarPrimeiroIndice(
      cabecalhos,
      ['dataabate', 'previsaoabate']
    ),

    cabecasIniciais: localizarPrimeiroIndice(
      cabecalhos,
      ['cabecasiniciais']
    ),

    mortes: localizarPrimeiroIndice(
      cabecalhos,
      ['mortes']
    ),

    pesoEntrada: localizarPrimeiroIndice(
      cabecalhos,
      ['pesoentradakg', 'pesoentrada']
    ),

    consumoMS: localizarPrimeiroIndice(
      cabecalhos,
      ['consumomskg', 'consumoms']
    ),

    status: localizarPrimeiroIndice(
      cabecalhos,
      ['status']
    ),

    ativoApp: localizarPrimeiroIndice(
      cabecalhos,
      ['ativoapp']
    ),

    dataEncerramento: localizarPrimeiroIndice(
      cabecalhos,
      ['dataencerramento']
    ),

    atualizadoEm: localizarPrimeiroIndice(
      cabecalhos,
      ['atualizadoem']
    ),

    diasConfinados: localizarPrimeiroIndice(
      cabecalhos,
      ['diasconfinados']
    ),

    cabecasAtuais: localizarPrimeiroIndice(
      cabecalhos,
      ['cabecasatuais']
    ),

    mortalidade: localizarPrimeiroIndice(
      cabecalhos,
      ['mortalidadepct', 'mortalidade']
    ),

    pesoEstimado: localizarPrimeiroIndice(
      cabecalhos,
      [
        'pesoestimadohoje',
        'pesoestimadoatual',
        'pesoestimado'
      ]
    ),

    arrobasEstimadas: localizarPrimeiroIndice(
      cabecalhos,
      [
        'arrobasestimadohoje',
        'arrobasestimadas'
      ]
    ),

    ganhoTotalKg: localizarPrimeiroIndice(
      cabecalhos,
      ['ganhototalkg']
    ),

    ganhoTotalArroba: localizarPrimeiroIndice(
      cabecalhos,
      ['ganhototalarroba']
    ),

    consumoPV: localizarPrimeiroIndice(
      cabecalhos,
      ['consumopvpct', 'consumopv']
    ),

    diasRestantes: localizarPrimeiroIndice(
      cabecalhos,
      ['diasrestantes']
    ),

    pesoFinalProjetado: localizarPrimeiroIndice(
      cabecalhos,
      [
        'pesofinalprojetado',
        'pesovivofinalprojetado'
      ]
    ),

    arrobaFinalProjetada: localizarPrimeiroIndice(
      cabecalhos,
      [
        'arrobafinaprojetado',
        'arrobafinalprojetada',
        'arrobasfinais'
      ]
    )
  };
}

/**
 * Mapeia a aba Sanidade com tolerância a variações de cabeçalho.
 */
function criarMapaDeColunasSanidade(cabecalhos) {
  return {
    idTratamento: localizarIndiceFlexivel(
      cabecalhos,
      ['IDTratamento', 'ID'],
      0
    ),

    idLote: localizarIndiceFlexivel(
      cabecalhos,
      ['IDLote', 'LoteID'],
      1
    ),

    data: localizarIndiceFlexivel(
      cabecalhos,
      ['Data', 'DataTratamento'],
      2
    ),

    quantidadeAnimais: localizarIndiceFlexivel(
      cabecalhos,
      [
        'QuantidadeAnimais',
        'QuantidadedeAnimais',
        'QuantidadeDeAnimais',
        'QuantidadeAnimal',
        'QtdAnimais',
        'QtdAnimal'
      ],
      3
    ),

    produto: localizarIndiceFlexivel(
      cabecalhos,
      ['Produto', 'Medicamento', 'Vacina'],
      4
    ),

    dosePorAnimal: localizarIndiceFlexivel(
      cabecalhos,
      [
        'DosePorAnimalML',
        'DosePorAnimal',
        'DosePorAnim',
        'DoseAnimalML',
        'DoseAnimal',
        'DoseML'
      ],
      5
    ),

    volumeTotal: localizarIndiceFlexivel(
      cabecalhos,
      [
        'VolumeTotalML',
        'VolumeTotal',
        'VolumeTot',
        'TotalML'
      ],
      6
    ),

    custoTotal: localizarIndiceFlexivel(
      cabecalhos,
      ['CustoTotal', 'ValorTotal', 'Custo'],
      7
    ),

    motivo: localizarIndiceFlexivel(
      cabecalhos,
      ['Motivo', 'Diagnostico', 'Ocorrencia'],
      8
    ),

    observacoes: localizarIndiceFlexivel(
      cabecalhos,
      ['Observacoes', 'Observacao'],
      9
    )
  };
}

function validarColunasObrigatorias(indices) {
  if (indices.id === -1) {
    throw new Error(
      'A coluna "ID" não foi encontrada na aba Lotes.'
    );
  }

  if (indices.curral === -1) {
    throw new Error(
      'A coluna "Curral" não foi encontrada.'
    );
  }

  if (indices.carimbo === -1) {
    throw new Error(
      'A coluna "Carimbo" não foi encontrada.'
    );
  }
}

/**
 * Monta o objeto principal do lote.
 */
function montarResultadoLote(linha, indices) {
  return {
    id: obterValor(linha, indices.id),
    curral: obterValor(linha, indices.curral),
    carimbo: obterValor(linha, indices.carimbo),
    cliente: obterValor(linha, indices.cliente),
    lote: obterValor(linha, indices.lote),
    dieta: obterValor(linha, indices.dieta),

    gmdProjetado:
      obterValor(linha, indices.gmdProjetado),

    modalidade:
      obterValor(linha, indices.modalidade),

    animaisDoentes:
      obterValor(linha, indices.animaisDoentes) || '0',

    animaisEnfermaria:
      obterValor(linha, indices.animaisEnfermaria) || '0',

    dataEntrada:
      obterValor(linha, indices.dataEntrada),

    dataAbate:
      obterValor(linha, indices.dataAbate),

    cabecasIniciais:
      obterValor(linha, indices.cabecasIniciais),

    mortes:
      obterValor(linha, indices.mortes),

    pesoEntrada:
      obterValor(linha, indices.pesoEntrada),

    consumoMS:
      obterValor(linha, indices.consumoMS),

    status:
      obterValor(linha, indices.status),

    ativoApp:
      obterValor(linha, indices.ativoApp),

    dataEncerramento:
      obterValor(linha, indices.dataEncerramento),

    atualizadoEm:
      obterValor(linha, indices.atualizadoEm),

    diasConfinados:
      obterValor(linha, indices.diasConfinados),

    cabecasAtuais:
      obterValor(linha, indices.cabecasAtuais),

    mortalidade:
      obterValor(linha, indices.mortalidade),

    pesoEstimado:
      obterValor(linha, indices.pesoEstimado),

    arrobasEstimadas:
      obterValor(linha, indices.arrobasEstimadas),

    ganhoTotalKg:
      obterValor(linha, indices.ganhoTotalKg),

    ganhoTotalArroba:
      obterValor(linha, indices.ganhoTotalArroba),

    consumoPV:
      obterValor(linha, indices.consumoPV),

    diasRestantes:
      obterValor(linha, indices.diasRestantes),

    pesoFinalProjetado:
      obterValor(linha, indices.pesoFinalProjetado),

    arrobaFinalProjetada:
      obterValor(linha, indices.arrobaFinalProjetada)
  };
}

/**
 * Busca os tratamentos pertencentes ao lote.
 */
function buscarSanidadeDoLote(planilha, idLote) {
  const aba = planilha.getSheetByName(NOME_ABA_SANIDADE);

  const resultado = {
    tratamentos: [],
    quantidadeRegistros: 0,
    totalAnimaisTratados: 0,
    custoTotalNumerico: 0,
    custoTotal: 'R$ 0,00'
  };

  if (!aba || aba.getLastRow() < 2) {
    return resultado;
  }

  const dados = aba.getDataRange().getDisplayValues();
  const cabecalhos = dados[0].map(normalizarTexto);
  const indices = criarMapaDeColunasSanidade(cabecalhos);

  const idLoteNormalizado = normalizarTexto(idLote);

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];

    if (
      normalizarTexto(
        obterValor(linha, indices.idLote)
      ) !== idLoteNormalizado
    ) {
      continue;
    }

    const quantidadeTexto =
      obterValor(linha, indices.quantidadeAnimais);

    const quantidadeNumerica =
      converterNumero(quantidadeTexto);

    const custoNumerico = converterNumero(
      obterValor(linha, indices.custoTotal)
    );

    resultado.tratamentos.push({
      idTratamento:
        obterValor(linha, indices.idTratamento),

      data:
        obterValor(linha, indices.data),

      quantidadeAnimais:
        quantidadeTexto || '0',

      produto:
        obterValor(linha, indices.produto),

      dosePorAnimal:
        obterValor(linha, indices.dosePorAnimal),

      volumeTotal:
        obterValor(linha, indices.volumeTotal),

      custoTotal:
        formatarMoeda(custoNumerico),

      motivo:
        obterValor(linha, indices.motivo),

      observacoes:
        obterValor(linha, indices.observacoes)
    });

    resultado.totalAnimaisTratados +=
      quantidadeNumerica;

    resultado.custoTotalNumerico +=
      custoNumerico;
  }

  resultado.quantidadeRegistros =
    resultado.tratamentos.length;

  resultado.custoTotal = formatarMoeda(
    resultado.custoTotalNumerico
  );

  return resultado;
}

/**
 * Busca os itens ativos do protocolo sanitário.
 */
function buscarProtocoloSanitario(planilha) {
  const aba = planilha.getSheetByName(NOME_ABA_PROTOCOLO);

  if (!aba || aba.getLastRow() < 2) {
    return [];
  }

  const dados = aba.getDataRange().getDisplayValues();
  const cabecalhos = dados[0].map(normalizarTexto);

  const indices = {
    idProtocolo: localizarPrimeiroIndice(
      cabecalhos,
      ['idprotocolo', 'id']
    ),

    nomeProtocolo: localizarPrimeiroIndice(
      cabecalhos,
      ['nomeprotocolo', 'nome']
    ),

    ordem: localizarPrimeiroIndice(
      cabecalhos,
      ['ordem']
    ),

    procedimento: localizarPrimeiroIndice(
      cabecalhos,
      ['procedimento']
    ),

    produto: localizarPrimeiroIndice(
      cabecalhos,
      ['produto']
    ),

    dose: localizarPrimeiroIndice(
      cabecalhos,
      ['dose']
    ),

    unidade: localizarPrimeiroIndice(
      cabecalhos,
      ['unidade']
    ),

    ativo: localizarPrimeiroIndice(
      cabecalhos,
      ['ativo']
    )
  };

  const protocolo = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];

    const ativo = normalizarTexto(
      obterValor(linha, indices.ativo)
    );

    if (
      ativo &&
      ativo !== 'sim' &&
      ativo !== 'ativo' &&
      ativo !== 'true' &&
      ativo !== '1'
    ) {
      continue;
    }

    const procedimento = obterValor(
      linha,
      indices.procedimento
    );

    if (!procedimento) {
      continue;
    }

    protocolo.push({
      idProtocolo:
        obterValor(linha, indices.idProtocolo),

      nomeProtocolo:
        obterValor(linha, indices.nomeProtocolo),

      ordem:
        obterValor(linha, indices.ordem),

      procedimento: procedimento,

      produto:
        obterValor(linha, indices.produto),

      dose:
        obterValor(linha, indices.dose),

      unidade:
        obterValor(linha, indices.unidade)
    });
  }

  protocolo.sort(function(a, b) {
    return converterNumero(a.ordem) -
      converterNumero(b.ordem);
  });

  return protocolo;
}

/**
 * Busca parâmetros da aba Config.
 */
function buscarConfiguracoes(planilha) {
  const aba = planilha.getSheetByName(NOME_ABA_CONFIG);

  const configuracoes = {
    custoProtocoloEntrada: '22'
  };

  if (!aba || aba.getLastRow() < 2) {
    return configuracoes;
  }

  const dados = aba.getDataRange().getDisplayValues();
  const cabecalhos = dados[0].map(normalizarTexto);

  const indiceParametro = localizarPrimeiroIndice(
    cabecalhos,
    ['parametro', 'chave']
  );

  const indiceValor = localizarPrimeiroIndice(
    cabecalhos,
    ['valor']
  );

  if (indiceParametro === -1 || indiceValor === -1) {
    return configuracoes;
  }

  for (let i = 1; i < dados.length; i++) {
    const parametro = normalizarTexto(
      obterValor(dados[i], indiceParametro)
    );

    const valor = obterValor(
      dados[i],
      indiceValor
    );

    if (!parametro) {
      continue;
    }

    if (parametro === 'custoprotocoloentrada') {
      configuracoes.custoProtocoloEntrada = valor;
    }

    configuracoes[parametro] = valor;
  }

  return configuracoes;
}

/**
 * Localiza cabeçalho por correspondência exata.
 */
function localizarPrimeiroIndice(
  cabecalhos,
  possibilidades
) {
  for (let i = 0; i < possibilidades.length; i++) {
    const procurado = normalizarTexto(possibilidades[i]);
    const indice = cabecalhos.indexOf(procurado);

    if (indice !== -1) {
      return indice;
    }
  }

  return -1;
}

/**
 * Localiza cabeçalho com tolerância a pequenas diferenças.
 */
function localizarIndiceFlexivel(
  cabecalhos,
  possibilidades,
  indicePadrao
) {
  for (let i = 0; i < possibilidades.length; i++) {
    const procurado = normalizarTexto(possibilidades[i]);

    const indiceExato = cabecalhos.indexOf(procurado);

    if (indiceExato !== -1) {
      return indiceExato;
    }

    const indiceParcial = cabecalhos.findIndex(
      function(cabecalho) {
        if (!cabecalho) {
          return false;
        }

        return (
          cabecalho.startsWith(procurado) ||
          procurado.startsWith(cabecalho) ||
          cabecalho.includes(procurado) ||
          procurado.includes(cabecalho)
        );
      }
    );

    if (indiceParcial !== -1) {
      return indiceParcial;
    }
  }

  if (
    indicePadrao !== undefined &&
    indicePadrao !== null &&
    indicePadrao >= 0 &&
    indicePadrao < cabecalhos.length
  ) {
    return indicePadrao;
  }

  return -1;
}

function obterValor(linha, indice) {
  if (
    indice === -1 ||
    indice === undefined ||
    indice === null
  ) {
    return '';
  }

  return linha[indice] || '';
}

function normalizarTexto(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function converterNumero(valor) {
  const texto = String(valor || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');

  const numero = Number(texto);

  return Number.isFinite(numero)
    ? numero
    : 0;
}

function converterDataEntrada(valor) {
  const texto = String(valor || '').trim();

  if (!texto) {
    return null;
  }

  let correspondencia = texto.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (correspondencia) {
    return new Date(
      Number(correspondencia[1]),
      Number(correspondencia[2]) - 1,
      Number(correspondencia[3]),
      12,
      0,
      0
    );
  }

  correspondencia = texto.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/
  );

  if (correspondencia) {
    return new Date(
      Number(correspondencia[3]),
      Number(correspondencia[2]) - 1,
      Number(correspondencia[1]),
      12,
      0,
      0
    );
  }

  const data = new Date(texto);

  return Number.isNaN(data.getTime())
    ? null
    : data;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  );
}

/**
 * Testa conexão e existência das abas.
 */
function testarConexao() {
  const planilha = SpreadsheetApp.openById(ID_PLANILHA);

  Logger.log(`Planilha: ${planilha.getName()}`);

  [
    NOME_ABA_LOTES,
    NOME_ABA_SANIDADE,
    NOME_ABA_PROTOCOLO,
    NOME_ABA_CONFIG
  ].forEach(function(nomeAba) {
    const aba = planilha.getSheetByName(nomeAba);

    Logger.log(
      `${nomeAba}: ${
        aba
          ? aba.getLastRow() + ' linhas'
          : 'não encontrada'
      }`
    );
  });
}

/**
 * Teste manual da sanidade do lote.
 */
function testarSanidade() {
  const planilha = SpreadsheetApp.openById(ID_PLANILHA);

  Logger.log(
    JSON.stringify(
      buscarSanidadeDoLote(
        planilha,
        'LOT000001'
      ),
      null,
      2
    )
  );
}


/**
 * Consolida os principais indicadores para o painel administrativo.
 */
function obterDashboardAdmin() {
  const planilha = SpreadsheetApp.openById(ID_PLANILHA);
  const abaLotes = planilha.getSheetByName(NOME_ABA_LOTES);

  if (!abaLotes) {
    throw new Error('A aba Lotes não foi encontrada.');
  }

  const dados = abaLotes.getDataRange().getDisplayValues();
  const cabecalhos = dados[0].map(normalizarTexto);
  const indices = criarMapaDeColunasLotes(cabecalhos);

  let lotesAtivosQuantidade = 0;
  let animaisAtuais = 0;
  let animaisDoentes = 0;
  let animaisEnfermaria = 0;
  let somaGmd = 0;
  let quantidadeGmd = 0;
  let somaConsumo = 0;
  let quantidadeConsumo = 0;
  const lotesAtivos = [];
  const alertas = [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    const id = obterValor(linha, indices.id);

    if (!id) continue;

    const status = normalizarTexto(obterValor(linha, indices.status));
    const ativoApp = normalizarTexto(obterValor(linha, indices.ativoApp));
    const estaAtivo = !status.includes('encerr') &&
      ativoApp !== 'nao' && ativoApp !== 'false' && ativoApp !== '0';

    if (!estaAtivo) continue;

    lotesAtivosQuantidade++;

    const cabecas = converterNumero(obterValor(linha, indices.cabecasAtuais));
    const doentes = converterNumero(obterValor(linha, indices.animaisDoentes));
    const enfermaria = converterNumero(obterValor(linha, indices.animaisEnfermaria));
    const gmd = converterNumero(obterValor(linha, indices.gmdProjetado));
    const consumo = converterNumero(obterValor(linha, indices.consumoMS));

    animaisAtuais += cabecas;
    animaisDoentes += doentes;
    animaisEnfermaria += enfermaria;

    if (gmd > 0) {
      somaGmd += gmd;
      quantidadeGmd++;
    }

    if (consumo > 0) {
      somaConsumo += consumo;
      quantidadeConsumo++;
    }

    const loteResumo = {
      id: id,
      curral: obterValor(linha, indices.curral),
      carimbo: obterValor(linha, indices.carimbo),
      cliente: obterValor(linha, indices.cliente),
      lote: obterValor(linha, indices.lote),
      cabecasAtuais: obterValor(linha, indices.cabecasAtuais),
      animaisDoentes: doentes,
      animaisEnfermaria: enfermaria,
      dataAbate: obterValor(linha, indices.dataAbate)
    };

    lotesAtivos.push(loteResumo);

    if (doentes > 0 || enfermaria > 0) {
      alertas.push({
        titulo: `${loteResumo.cliente || loteResumo.id} — atenção sanitária`,
        descricao: `${doentes} doente(s) e ${enfermaria} na enfermaria. Curral ${loteResumo.curral}.`
      });
    }

    const dataAbate = converterDataEntrada(loteResumo.dataAbate);

    if (dataAbate) {
      dataAbate.setHours(0, 0, 0, 0);
      const dias = Math.ceil((dataAbate - hoje) / 86400000);

      if (dias >= 0 && dias <= 7) {
        alertas.push({
          titulo: `${loteResumo.cliente || loteResumo.id} — abate próximo`,
          descricao: `Previsão em ${dias} dia(s), no curral ${loteResumo.curral}.`
        });
      }
    }
  }

  const dadosSanidade = obterResumoSanidadeMes(planilha);

  lotesAtivos.sort(function(a, b) {
    return converterNumero(a.curral) - converterNumero(b.curral);
  });

  return {
    lotesAtivosQuantidade: lotesAtivosQuantidade,
    animaisAtuais: animaisAtuais,
    animaisDoentes: animaisDoentes,
    animaisEnfermaria: animaisEnfermaria,
    gmdMedio: quantidadeGmd
      ? formatarNumeroDecimal(somaGmd / quantidadeGmd, 2)
      : '0,00',
    consumoMSMedio: quantidadeConsumo
      ? formatarNumeroDecimal(somaConsumo / quantidadeConsumo, 2)
      : '0,00',
    tratamentosHoje: dadosSanidade.tratamentosHoje,
    custoSanitarioMes: formatarMoeda(dadosSanidade.custoMes),
    alertas: alertas.slice(0, 12),
    lotesAtivos: lotesAtivos
  };
}

function obterResumoSanidadeMes(planilha) {
  const aba = planilha.getSheetByName(NOME_ABA_SANIDADE);
  const resultado = { tratamentosHoje: 0, custoMes: 0 };

  if (!aba || aba.getLastRow() < 2) return resultado;

  const valores = aba.getDataRange().getValues();
  const exibidos = aba.getDataRange().getDisplayValues();
  const cabecalhos = exibidos[0].map(normalizarTexto);
  const indices = criarMapaDeColunasSanidade(cabecalhos);
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  for (let i = 1; i < valores.length; i++) {
    const data = valores[i][indices.data] instanceof Date
      ? valores[i][indices.data]
      : converterDataEntrada(exibidos[i][indices.data]);

    if (!data) continue;

    const dataLimpa = new Date(data.getFullYear(), data.getMonth(), data.getDate());

    if (dataLimpa.getTime() === inicioHoje.getTime()) {
      resultado.tratamentosHoje++;
    }

    if (dataLimpa >= inicioMes && dataLimpa <= hoje) {
      resultado.custoMes += converterNumero(exibidos[i][indices.custoTotal]);
    }
  }

  return resultado;
}

function formatarNumeroDecimal(valor, casas) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}
