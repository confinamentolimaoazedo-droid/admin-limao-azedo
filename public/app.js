"use strict";

const TOKEN_KEY = "limao_azedo_admin_token";
let currentLot = null;

document.addEventListener("DOMContentLoaded", () => {
  bind();

  if (localStorage.getItem(TOKEN_KEY)) {
    validateSession();
  }
});

function bind() {
  document.getElementById("loginForm").addEventListener("submit", login);
  document.getElementById("logoutButton").addEventListener("click", logout);
  document.getElementById("addLotForm").addEventListener("submit", addLot);
  document.getElementById("searchForm").addEventListener("submit", searchLot);
  document.getElementById("lotForm").addEventListener("submit", updateLot);
  document.getElementById("removeLotButton").addEventListener("click", removeLot);
  document.getElementById("deathForm").addEventListener("submit", registerDeath);
  document.getElementById("movePenForm").addEventListener("submit", movePen);
  document.getElementById("financeForm").addEventListener("submit", updateFinance);
  document.getElementById("financeFreightActive").addEventListener("change", updateFreightFields);
  document.getElementById("financeFreightDistance").addEventListener("input", calculateFreightTotal);
  document.getElementById("financeFreightKmValue").addEventListener("input", calculateFreightTotal);
  document.getElementById("newModalidade").addEventListener("change", updateNewLotPricingFields);
  document.getElementById("treatmentForm").addEventListener("submit", registerTreatment);
  document.getElementById("tratQuantidade").addEventListener("input", calculateVolume);
  document.getElementById("tratDose").addEventListener("input", calculateVolume);

  document.querySelectorAll(".tab").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
}

async function login(event) {
  event.preventDefault();
  clearMessage("loginMessage");
  setLoading(true);

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        usuario: value("adminUser"),
        senha: value("adminPassword")
      })
    });
    const data = await readJson(response);

    if (!response.ok || !data.sucesso) {
      throw new Error(data.mensagem || "Não foi possível entrar.");
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    text("adminName", data.usuario);
    showAdmin();
    await loadDashboard();
  } catch (error) {
    showMessage("loginMessage", error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function validateSession() {
  setLoading(true);

  try {
    const data = await adminRequest("validarSessao", {});
    text("adminName", data.usuario || "Administrador");
    showAdmin();
    await loadDashboard();
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
  document.getElementById("lotSection").classList.add("hidden");
  document.getElementById("sanidadeForms").classList.add("hidden");
  document.getElementById("financeForms").classList.add("hidden");
  showLogin();
}

async function loadDashboard() {
  clearMessage("dashboardMessage");

  try {
    const data = await adminRequest("obterDashboardAdmin", {});
    fillDashboard(data.dashboard || {});
    renderAlerts(data.dashboard?.alertas || []);
    renderLots(data.dashboard?.lotesAtivos || []);
  } catch (error) {
    showMessage("dashboardMessage", error.message, "error");
  }
}

function fillDashboard(data) {
  text("mLotes", data.lotesAtivosQuantidade ?? 0);
  text("mAnimais", data.animaisAtuais ?? 0);
  text("mDoentes", data.animaisDoentes ?? 0);
  text("mEnfermaria", data.animaisEnfermaria ?? 0);
  text("mGmd", unit(data.gmdMedio, "kg/dia"));
  text("mConsumo", unit(data.consumoMSMedio, "kg"));
  text("mTratamentosHoje", data.tratamentosHoje ?? 0);
  text("mCustoMes", data.custoSanitarioMes || "R$ 0,00");
}

function renderAlerts(items) {
  const container = document.getElementById("alerts");
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = '<p class="empty">Nenhum alerta no momento.</p>';
    return;
  }

  items.forEach(item => {
    const element = document.createElement("article");
    element.className = "alert-item";
    element.innerHTML = `<div>⚠️</div><div><strong>${escapeHtml(item.titulo)}</strong><span>${escapeHtml(item.descricao)}</span></div>`;
    container.appendChild(element);
  });
}

function renderLots(items) {
  const container = document.getElementById("activeLots");
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = '<p class="empty">Nenhum lote ativo.</p>';
    return;
  }

  items.forEach(item => {
    const element = document.createElement("article");
    element.className = "lot-item";
    element.innerHTML = `<div><strong>${escapeHtml(item.cliente || "Cliente")}</strong><span>Curral ${escapeHtml(item.curral)} • Carimbo ${escapeHtml(item.carimbo)} • ${escapeHtml(item.cabecasAtuais || "0")} cabeças</span></div><button type="button">Abrir</button>`;
    element.querySelector("button").addEventListener("click", () => openLot(item.curral, item.carimbo));
    container.appendChild(element);
  });
}

async function addLot(event) {
  event.preventDefault();
  clearMessage("addLotMessage");
  setLoading(true);

  try {
    const data = await adminRequest("adicionarLote", {
      lote: {
        curral: value("newCurral"),
        carimbo: value("newCarimbo"),
        cliente: value("newCliente"),
        lote: value("newLote"),
        dataEntrada: value("newDataEntrada"),
        dataAbate: value("newDataAbate"),
        cabecasIniciais: value("newCabecasIniciais"),
        pesoEntrada: value("newPesoEntrada"),
        gmdProjetado: value("newGmdProjetado"),
        consumoMS: value("newConsumoMS"),
        dieta: value("newDieta"),
        modalidade: value("newModalidade"),
        valorDiaria: value("newValorDiaria"),
        valorArroba: value("newValorArroba"),
        valorKgMS: value("newValorKgMS"),
        consumoTotalMS: value("newConsumoTotalMS")
      }
    });

    if (!data.resultado) {
      throw new Error("O lote foi criado, mas não pôde ser recarregado.");
    }

    currentLot = data.resultado;
    document.getElementById("addLotForm").reset();
    setValue("searchCurral", currentLot.curral);
    setValue("searchCarimbo", currentLot.carimbo);
    displayCurrentLot();
    showMessage("addLotMessage", `Lote ${currentLot.id} adicionado com sucesso.`, "success");
    await loadDashboard();
  } catch (error) {
    showMessage("addLotMessage", error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function openLot(curral, carimbo) {
  setValue("searchCurral", curral);
  setValue("searchCarimbo", carimbo);
  showView("lotView");
  await searchLot(null);
}

async function searchLot(event) {
  if (event) event.preventDefault();
  clearMessage("searchMessage");
  setLoading(true);

  try {
    const data = await adminRequest("buscarLoteAdmin", {
      curral: value("searchCurral"),
      carimbo: value("searchCarimbo")
    });

    if (!data.resultado) {
      throw new Error("Lote não encontrado.");
    }

    currentLot = data.resultado;
    displayCurrentLot();
    showMessage("searchMessage", "Lote carregado.", "success");
  } catch (error) {
    currentLot = null;
    document.getElementById("lotSection").classList.add("hidden");
    document.getElementById("sanidadeForms").classList.add("hidden");
    document.getElementById("financeForms").classList.add("hidden");
    showMessage("searchMessage", error.message, "error");
  } finally {
    setLoading(false);
  }
}

function displayCurrentLot() {
  fillLot(currentLot);
  renderHistory(currentLot.sanidade?.tratamentos || []);
  renderMovements(currentLot.movimentacoes || []);
  fillFinance(currentLot.financeiro || {});
  document.getElementById("lotSection").classList.remove("hidden");
  document.getElementById("sanidadeForms").classList.remove("hidden");
  text("sanidadeLoteTitulo", `${currentLot.cliente || "Cliente"} — ${currentLot.lote || currentLot.id}`);
  text("sanidadeAjuda", `Curral ${currentLot.curral} • Carimbo ${currentLot.carimbo}`);
  text("financeLotTitle", `${currentLot.cliente || "Cliente"} — ${currentLot.lote || currentLot.id}`);
  text("financeHelp", `Curral ${currentLot.curral} • Carimbo ${currentLot.carimbo}`);
  document.getElementById("financeForms").classList.remove("hidden");
}

async function updateLot(event) {
  event.preventDefault();
  clearMessage("lotMessage");

  if (!currentLot) {
    showMessage("lotMessage", "Busque um lote primeiro.", "error");
    return;
  }

  setLoading(true);

  try {
    const data = await adminRequest("atualizarLote", {
      idLote: currentLot.id,
      campos: {
        animaisDoentes: value("animaisDoentes"),
        animaisEnfermaria: value("animaisEnfermaria"),
        consumoMS: value("consumoMS"),
        gmdProjetado: value("gmdProjetado"),
        dieta: value("dieta"),
        modalidade: value("modalidade"),
        status: value("status"),
        dataAbate: value("dataAbate")
      }
    });

    currentLot = data.resultado || currentLot;
    fillLot(currentLot);
    showMessage("lotMessage", "Dados atualizados com sucesso.", "success");
    await loadDashboard();
  } catch (error) {
    showMessage("lotMessage", error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function removeLot() {
  clearMessage("removeLotMessage");

  if (!currentLot) {
    showMessage("removeLotMessage", "Busque um lote primeiro.", "error");
    return;
  }

  const confirmed = window.confirm(
    `Arquivar o lote ${currentLot.id}?\n\nEle será encerrado e ocultado dos ativos, mas todo o histórico será preservado.`
  );

  if (!confirmed) return;

  const removedId = currentLot.id;
  setLoading(true);

  try {
    await adminRequest("removerLote", {
      idLote: removedId,
      dadosEncerramento: {
        pesoFinalRealKg: value("archiveFinalWeight"),
        rendimentoCarcacaFinalPct: value("archiveYield"),
        cabecasFinais: value("archiveFinalHeads")
      }
    });
    currentLot = null;
    document.getElementById("lotSection").classList.add("hidden");
    document.getElementById("sanidadeForms").classList.add("hidden");
    document.getElementById("searchForm").reset();
    showMessage("searchMessage", `Lote ${removedId} arquivado com sucesso.`, "success");
    await loadDashboard();
  } catch (error) {
    showMessage("removeLotMessage", error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function registerTreatment(event) {
  event.preventDefault();
  clearMessage("treatmentMessage");

  if (!currentLot) {
    showMessage("treatmentMessage", "Busque um lote primeiro.", "error");
    return;
  }

  setLoading(true);

  try {
    const data = await adminRequest("registrarTratamento", {
      tratamento: {
        idLote: currentLot.id,
        data: value("tratData"),
        quantidadeAnimais: value("tratQuantidade"),
        produto: value("tratProduto"),
        dosePorAnimalML: value("tratDose"),
        volumeTotalML: value("tratVolume"),
        custoTotal: value("tratCusto"),
        motivo: value("tratMotivo"),
        observacoes: value("tratObservacoes")
      }
    });

    showMessage("treatmentMessage", "Tratamento registrado com sucesso.", "success");
    document.getElementById("treatmentForm").reset();
    renderHistory(data.tratamentos || []);
    await loadDashboard();
  } catch (error) {
    showMessage("treatmentMessage", error.message, "error");
  } finally {
    setLoading(false);
  }
}

function fillLot(lot) {
  text("summaryCliente", lot.cliente || "—");
  text("summaryLote", lot.lote || "—");
  text("summaryId", lot.id || "—");
  text("summaryCabecas", lot.cabecasAtuais || "—");
  setValue("animaisDoentes", lot.animaisDoentes || 0);
  setValue("animaisEnfermaria", lot.animaisEnfermaria || 0);
  setValue("mortes", lot.mortes || 0);
  setValue("consumoMS", lot.consumoMS || "");
  setValue("gmdProjetado", lot.gmdProjetado || "");
  setValue("dieta", lot.dieta || "");
  setValue("modalidade", lot.modalidade || "");
  setValue("status", lot.status || "");
  setValue("dataAbate", toInputDate(lot.dataAbate));

  const removed = String(lot.status || "").toLowerCase().includes("encerr") ||
    ["não", "nao", "false", "0"].includes(String(lot.ativoApp || "").toLowerCase());
  const button = document.getElementById("removeLotButton");
  button.disabled = removed;
  button.textContent = removed ? "Lote já arquivado" : "Arquivar lote";
}

function renderHistory(items) {
  const container = document.getElementById("treatmentHistory");
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = '<p class="empty">Nenhum tratamento registrado.</p>';
    return;
  }

  items.slice().reverse().forEach(item => {
    const element = document.createElement("article");
    element.className = "history-item";
    element.innerHTML = `<div class="history-top"><div><strong>${escapeHtml(item.produto || "Produto")}</strong><span>${escapeHtml(item.data || "Data não informada")}</span></div><strong>${escapeHtml(item.custoTotal || "R$ 0,00")}</strong></div><div class="history-grid"><div><span>Animais</span><strong>${escapeHtml(item.quantidadeAnimais || "0")}</strong></div><div><span>Dose</span><strong>${escapeHtml(unit(item.dosePorAnimal, "ml"))}</strong></div><div><span>Volume total</span><strong>${escapeHtml(unit(item.volumeTotal, "ml"))}</strong></div><div><span>Motivo</span><strong>${escapeHtml(item.motivo || "—")}</strong></div><div class="full"><span>Observações</span><strong>${escapeHtml(item.observacoes || "—")}</strong></div></div>`;
    container.appendChild(element);
  });
}


function updateNewLotPricingFields() {
  const mode = value("newModalidade");
  toggle("newValorDiariaGroup", mode === "Diária");
  toggle("newValorArrobaGroup", mode === "Arroba Produzida");
  toggle("newValorKgMSGroup", mode === "Consumo de MS");
  toggle("newConsumoTotalMSGroup", mode === "Consumo de MS");
}

async function registerDeath(event) {
  event.preventDefault();
  clearMessage("deathMessage");
  if (!currentLot) return showMessage("deathMessage", "Busque um lote primeiro.", "error");
  setLoading(true);
  try {
    const data = await adminRequest("registrarMorte", {
      idLote: currentLot.id,
      data: value("deathDate"),
      quantidade: value("deathQuantity"),
      motivo: value("deathReason"),
      observacoes: value("deathNotes")
    });
    currentLot = data.resultado;
    document.getElementById("deathForm").reset();
    displayCurrentLot();
    showMessage("deathMessage", "Morte registrada e financeiro recalculado.", "success");
    await loadDashboard();
  } catch (error) { showMessage("deathMessage", error.message, "error"); }
  finally { setLoading(false); }
}

async function movePen(event) {
  event.preventDefault();
  clearMessage("movePenMessage");
  if (!currentLot) return showMessage("movePenMessage", "Busque um lote primeiro.", "error");
  setLoading(true);
  try {
    const data = await adminRequest("mudarCurral", {
      idLote: currentLot.id,
      data: value("movePenDate"),
      curralNovo: value("movePenNew"),
      motivo: value("movePenReason"),
      observacoes: value("movePenNotes")
    });
    currentLot = data.resultado;
    document.getElementById("movePenForm").reset();
    setValue("searchCurral", currentLot.curral);
    displayCurrentLot();
    showMessage("movePenMessage", `Curral atualizado para ${currentLot.curral}.`, "success");
    await loadDashboard();
  } catch (error) { showMessage("movePenMessage", error.message, "error"); }
  finally { setLoading(false); }
}

async function updateFinance(event) {
  event.preventDefault();
  clearMessage("financeMessage");

  if (!currentLot) {
    return showMessage(
      "financeMessage",
      "Busque um lote primeiro.",
      "error"
    );
  }

  setLoading(true);

  try {
    const data = await adminRequest(
      "atualizarFinanceiro",
      {
        idLote: currentLot.id,
        campos: {
          valorDiaria:
            value("financeDaily"),
          valorArroba:
            value("financeArroba"),
          valorKgMS:
            value("financeMSPrice"),
          consumoTotalMS:
            value("financeMSTotal"),

          freteAtivo:
            value("financeFreightActive"),
          freteData:
            value("financeFreightDate"),
          freteDistanciaKm:
            value("financeFreightDistance"),
          freteValorKm:
            value("financeFreightKmValue"),

          protocoloPago:
            document.getElementById(
              "financeProtocolPaid"
            ).checked,

          sanidadePago:
            document.getElementById(
              "financeHealthPaid"
            ).checked,

          fretePago:
            document.getElementById(
              "financeFreightPaid"
            ).checked
        }
      }
    );

    const finance =
      data.resultado ||
      data.financeiro ||
      {};

    currentLot.financeiro =
      finance;

    fillFinance(
      finance
    );

    showMessage(
      "financeMessage",
      "Financeiro, frete e pagamentos atualizados.",
      "success"
    );

    await loadDashboard();

  } catch (error) {
    showMessage(
      "financeMessage",
      error.message,
      "error"
    );
  } finally {
    setLoading(false);
  }
}

function fillFinance(finance) {
  finance = finance || {};

  const mode =
    finance.modalidade ||
    currentLot?.modalidade ||
    "";

  setValue(
    "financeMode",
    mode
  );

  setValue(
    "financeDaily",
    finance.valorDiaria || ""
  );

  setValue(
    "financeArroba",
    finance.valorArroba || ""
  );

  setValue(
    "financeMSPrice",
    finance.valorKgMS || ""
  );

  setValue(
    "financeMSTotal",
    finance.consumoTotalMS || ""
  );

  toggle(
    "financeDailyGroup",
    mode === "Diária" ||
    mode === "DIARIA"
  );

  toggle(
    "financeArrobaGroup",
    mode === "Arroba Produzida" ||
    mode === "ARROBA"
  );

  toggle(
    "financeMSPriceGroup",
    mode === "Consumo de MS" ||
    mode === "MS"
  );

  toggle(
    "financeMSTotalGroup",
    mode === "Consumo de MS" ||
    mode === "MS"
  );

  const freightActive =
    Boolean(finance.freteAtivo);

  setValue(
    "financeFreightActive",
    freightActive
      ? "SIM"
      : "NAO"
  );

  setValue(
    "financeFreightDate",
    finance.freteDataIso || ""
  );

  setValue(
    "financeFreightDistance",
    finance.freteDistanciaKm || ""
  );

  setValue(
    "financeFreightKmValue",
    finance.freteValorKm || ""
  );

  document.getElementById(
    "financeProtocolPaid"
  ).checked =
    Boolean(
      finance.protocoloPago
    );

  document.getElementById(
    "financeHealthPaid"
  ).checked =
    Boolean(
      finance.sanidadePago
    );

  document.getElementById(
    "financeFreightPaid"
  ).checked =
    Boolean(
      finance.fretePago
    );

  updateFreightFields();

  text(
    "fRevenue",
    finance
      .receitaModalidadeFormatada ||
    finance.exibicao?.receitaModalidade ||
    "R$ 0,00"
  );

  text(
    "fProtocol",
    finance
      .custoProtocoloFormatado ||
    finance.exibicao?.custoProtocolo ||
    "R$ 0,00"
  );

  text(
    "fHealth",
    finance
      .custoSanidadeFormatado ||
    finance.exibicao?.custoSanidade ||
    "R$ 0,00"
  );

  text(
    "fFreight",
    finance
      .freteTotalFormatado ||
    finance.exibicao?.frete ||
    "R$ 0,00"
  );

  text(
    "fServicesTotal",
    finance
      .totalServicosFormatado ||
    finance.exibicao?.totalServicos ||
    "R$ 0,00"
  );

  text(
    "fServicesPaid",
    finance
      .totalPagoServicosFormatado ||
    finance.exibicao?.totalPagoServicos ||
    "R$ 0,00"
  );

  text(
    "fServicesPending",
    finance
      .saldoServicosFormatado ||
    finance.exibicao?.saldoServicos ||
    "R$ 0,00"
  );

  text(
    "fTotal",
    finance
      .valorTotalFormatado ||
    finance.exibicao?.valorTotal ||
    "R$ 0,00"
  );

  calculateFreightTotal();

  const details =
    document.getElementById(
      "financeDetails"
    );

  const rows =
    finance.memoriaCalculo ||
    [];

  details.innerHTML =
    rows.length
      ? rows.map(
          row =>
            `<div class="calculation-row"><span>${escapeHtml(row.rotulo)}</span><strong>${escapeHtml(row.valor)}</strong></div>`
        ).join("")
      : '<p class="empty">Sem memória de cálculo.</p>';
}

function updateFreightFields() {
  const active =
    value(
      "financeFreightActive"
    ) === "SIM";

  [
    "financeFreightDateGroup",
    "financeFreightDistanceGroup",
    "financeFreightKmValueGroup",
    "financeFreightTotalGroup",
    "financeFreightPaidGroup"
  ].forEach(
    id => toggle(id, active)
  );

  [
    "financeFreightDate",
    "financeFreightDistance",
    "financeFreightKmValue",
    "financeFreightPaid"
  ].forEach(
    id => {
      const element =
        document.getElementById(id);

      if (element) {
        element.disabled = !active;
      }
    }
  );

  if (!active) {
    setValue(
      "financeFreightTotal",
      "R$ 0,00"
    );

    document.getElementById(
      "financeFreightPaid"
    ).checked = false;
  } else {
    calculateFreightTotal();
  }
}

function calculateFreightTotal() {
  const active =
    value(
      "financeFreightActive"
    ) === "SIM";

  const distance =
    parseBrazilian(
      value(
        "financeFreightDistance"
      )
    );

  const kmValue =
    parseBrazilian(
      value(
        "financeFreightKmValue"
      )
    );

  const total =
    active
      ? distance * kmValue
      : 0;

  setValue(
    "financeFreightTotal",
    total.toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL"
      }
    )
  );
}

function renderMovements(items) {
  const container = document.getElementById("movementHistory");
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = '<p class="empty">Nenhuma movimentação registrada.</p>';
    return;
  }
  items.slice().reverse().forEach(item => {
    const article = document.createElement("article");
    article.className = "history-item";
    article.innerHTML = `<div class="history-top"><div><strong>${escapeHtml(item.tipo || "Movimentação")}</strong><span>${escapeHtml(item.data || "")}</span></div><span class="movement-badge">${escapeHtml(item.quantidade || item.curralNovo || "—")}</span></div><div class="history-grid"><div><span>Motivo</span><strong>${escapeHtml(item.motivo || "—")}</strong></div><div><span>Observações</span><strong>${escapeHtml(item.observacoes || "—")}</strong></div></div>`;
    container.appendChild(article);
  });
}

function toggle(id, visible) {
  document.getElementById(id).classList.toggle("hidden", !visible);
}

async function adminRequest(action, payload) {
  const token = localStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Sessão expirada.");
  }

  const response = await fetch("/api/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    cache: "no-store",
    body: JSON.stringify({ acao: action, ...payload })
  });
  const data = await readJson(response);

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }

  if (!response.ok || !data.sucesso) {
    throw new Error(data.mensagem || "Não foi possível concluir a operação.");
  }

  return data;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error("O servidor retornou uma resposta inválida.");
  }
}

function showView(id) {
  document.querySelectorAll(".view").forEach(view => {
    view.classList.toggle("active", view.id === id);
  });
  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle("active", button.dataset.view === id);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function calculateVolume() {
  const quantity = parseBrazilian(value("tratQuantidade"));
  const dose = parseBrazilian(value("tratDose"));

  if (quantity > 0 && dose > 0) {
    setValue("tratVolume", (quantity * dose).toLocaleString("pt-BR", {
      maximumFractionDigits: 2
    }));
  }
}

function showAdmin() {
  document.getElementById("loginScreen").classList.remove("active");
  document.getElementById("adminScreen").classList.add("active");
}

function showLogin() {
  document.getElementById("adminScreen").classList.remove("active");
  document.getElementById("loginScreen").classList.add("active");
  setValue("adminPassword", "");
}

function setLoading(active) {
  document.getElementById("loading").classList.toggle("hidden", !active);
}

function showMessage(id, message, type = "") {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = `message ${type}`.trim();
}

function clearMessage(id) {
  showMessage(id, "");
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function setValue(id, newValue) {
  document.getElementById(id).value = newValue ?? "";
}

function text(id, newValue) {
  document.getElementById(id).textContent = newValue;
}

function parseBrazilian(input) {
  const parsed = Number(String(input || "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInputDate(input) {
  const string = String(input || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(string)) {
    return string;
  }

  const match = string.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function unit(input, suffix) {
  const string = String(input ?? "").trim();

  if (!string) return "—";

  return string.toLowerCase().includes(suffix.toLowerCase())
    ? string
    : `${string} ${suffix}`;
}

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
