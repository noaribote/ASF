
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const currency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const state = {
  models: [],
  activeFile: null,
  chart: null,
  itemType: "expenses",
  editingIndex: null,
  view: "general",
};
const localKey = "asf-preferences";
function normalizeModel(model, file) {
  const data = (model.data ??= {});
  data.products ??= { items: [] };
  data.products.items ??= [];
  data.expenses ??= { prefix: "-", items: [] };
  data.expenses.items ??= [];
  data.profits ??= { prefix: "+", items: [] };
  data.profits.items ??= [];
  for (const product of data.products.items) {
    const quantity =
      product.quantite === undefined
        ? 1
        : Math.max(0, Math.floor(Number(product.quantite) || 0));
    product.quantiteInitiale = Math.max(
      quantity,
      Math.floor(Number(product.quantiteInitiale) || quantity || 1),
    );
    product.quantite = product.etat === true ? 0 : quantity;
    product.quantiteVendu = Math.max(
      0,
      Math.floor(
        Number(product.quantiteVendu) ||
          (product.etat === true
            ? product.quantiteInitiale
            : product.quantiteInitiale - product.quantite),
      ),
    );
    if (product.quantite === 0) product.etat = true;
    else product.etat = false;
  }
  return {
    ...model,
    name: model.name || file.replace(/\.json$/i, ""),
    description: model.description || "",
    marketplace: model.marketplace === true,
    data,
    file,
  };
}

function activeModel() {
  return state.models.find((model) => model.file === state.activeFile) ?? null;
}

function money(value) {
  return currency.format(Number(value) || 0);
}

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog.open) dialog.close();
  document.activeElement?.blur?.();
  document.body.focus?.();
}

function preferences() {
  try {
    return JSON.parse(localStorage.getItem(localKey)) ?? {};
  } catch {
    return {};
  }
}


function productQuantity(item) {
  return Math.max(0, Math.floor(Number(item.quantite ?? 1) || 1));
}

function productStatus(item) {
  const quantity = Number(item.quantite ?? 1);
  if (item.etat === true || quantity <= 0) return "Vendu";
  if (quantity >= 2 && quantity <= 3) return "Bientôt épuisé";
  return "En stock";
}

function aggregate(model) {
  const items = model.data.products.items.map((item) => ({
    ...item,
    kind: "items",
    value: (Number(item.montant) || 0) * productQuantity(item),
    status: productStatus(item),
  }));
  const expenses = model.data.expenses.items.map((item) => ({
    ...item,
    kind: "depenses",
    type: "market-expense",
  }));
  const profits = model.data.profits.items.map((item) => ({
    ...item,
    kind: "revenus",
  }));
  const all = [...items, ...expenses, ...profits].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
  const productIncome = productsFor(model).reduce(
    (sum, item) =>
      sum +
      (Number(item.montant) || 0) *
        Math.max(0, Number(item.quantiteVendu) || 0),
    0,
  );
  const income =
    profits.reduce((sum, item) => sum + (Number(item.montant) || 0), 0) +
    productIncome;
  const expense = expenses.reduce(
    (sum, item) => sum + (Number(item.montant) || 0),
    0,
  );
  const products = model.data.products.items;
  const realized = products.reduce(
    (sum, item) =>
      sum +
      (Number(item.montant) || 0) *
        Math.max(
          0,
          Number(item.quantiteVendu) ||
            (item.etat === true ? Number(item.quantiteInitiale ?? 1) : 0),
        ),
    0,
  );
  const estimate = products.reduce(
    (sum, item) =>
      sum +
      (Number(item.montant) || 0) *
        Math.max(1, Number(item.quantiteInitiale ?? item.quantite ?? 1) || 1),
    0,
  );
  const soldValue = realized;
  return {
    all,
    income,
    expense,
    products,
    realized,
    estimate,
    soldValue,
    valueAfterExpenses: estimate - expense,
    balance: model.marketplace ? soldValue - expense : income - expense,
  };
}

function productsFor(model) {
  return model.data.products.items;
}

function aggregateAll() {
  const all = state.models
    .flatMap((model) => [
      ...model.data.products.items.map((item) => ({
        ...item,
        kind: "produits",
        modelName: model.name,
        file: model.file,
        marketplace: true,
      })),
      ...model.data.expenses.items.map((item) => ({
        ...item,
        kind: model.marketplace ? "depenses" : "achats",
        modelName: model.name,
        file: model.file,
        marketplace: model.marketplace,
      })),
      ...model.data.profits.items.map((item) => ({
        ...item,
        kind: "revenus",
        modelName: model.name,
        file: model.file,
        marketplace: false,
      })),
    ])
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  const income = all
    .filter(
      (item) =>
        item.kind === "revenus" ||
        (item.kind === "produits" && Number(item.quantiteVendu) > 0),
    )
    .reduce(
      (sum, item) =>
        sum +
        (Number(item.montant) || 0) *
          (item.kind === "produits"
            ? Math.max(0, Number(item.quantiteVendu) || 0)
            : 1),
      0,
    );
  const expense = all
    .filter((item) => item.kind === "achats" || item.kind === "depenses")
    .reduce((sum, item) => sum + (Number(item.montant) || 0), 0);
  const products = all.filter((item) => item.kind === "produits");
  const realized = products.reduce(
    (sum, item) =>
      sum +
      (Number(item.montant) || 0) *
        Math.max(
          0,
          Number(item.quantiteVendu) ||
            (item.etat === true ? Number(item.quantiteInitiale ?? 1) : 0),
        ),
    0,
  );
  const estimate = products.reduce(
    (sum, item) =>
      sum +
      (Number(item.montant) || 0) *
        Math.max(1, Number(item.quantiteInitiale ?? item.quantite ?? 1) || 1),
    0,
  );
  const unsoldValue = products
    .filter((item) => item.etat !== true && Number(item.quantite) > 0)
    .reduce(
      (sum, item) =>
        sum + (Number(item.montant) || 0) * productQuantity(item),
      0,
    );
  return {
    all,
    income,
    expense,
    products,
    realized,
    estimate,
    unsoldValue,
    balance: income - expense,
  };
}


function getApi() {
  return window.asfAPI ?? window.electronAPI;
}

async function loadModels() {
  const api = getApi();
  if (api?.listModels && api?.readModel) {
    try {
      const files = await api.listModels();
      state.models = (
        await Promise.all(
          files.map(async (file) =>
            normalizeModel(await api.readModel(file), file),
          ),
        )
      ).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    } catch (error) {
      console.error(error);
      showToast(`Impossible de charger les fichiers JSON : ${error.message}`);
    }
  } else {
    const fallback = ["collection.json", "entreprise.json"];
    state.models = [];
    for (const file of fallback) {
      try {
        const response = await fetch(`../model/${file}`);
        if (response.ok)
          state.models.push(normalizeModel(await response.json(), file));
      } catch {}
    }
    showToast("Mode aperçu : la sauvegarde des fichiers nécessite Electron.");
  }
  if (
    !state.activeFile ||
    !state.models.some((model) => model.file === state.activeFile)
  )
    state.activeFile =
      preferences().activeFile &&
      state.models.some((model) => model.file === preferences().activeFile)
        ? preferences().activeFile
        : (state.models[0]?.file ?? null);
}

async function persistModel(
  model,
  success = "Modifications enregistrées",
  create = false,
) {
  const api = getApi();
  if (!api?.saveModel) {
    localStorage.setItem(`asf-model-${model.file}`, JSON.stringify(model));
    showToast("Modifications conservées sur cet appareil.");
    return;
  }
  try {
    const { file, ...serializable } = model;
    if (create && api.createModel) await api.createModel(file, serializable);
    else await api.saveModel(file, serializable);
    showToast(success);
  } catch (error) {
    console.error(error);
    showToast(`Échec de la sauvegarde : ${error.message}`);
    throw error;
  }
}


function applyTheme(theme) {
  const valid = ["light", "dark", "vintage"].includes(theme) ? theme : "light";
  document.documentElement.dataset.theme = valid;
  $$(".theme-option").forEach((button) =>
    button.classList.toggle("selected", button.dataset.theme === valid),
  );
  const icon = $("#themeQuick i");
  if (icon)
    icon.className =
      valid === "dark"
        ? "fa-regular fa-lightbulb"
        : valid === "vintage"
          ? "fa-solid fa-mug-hot"
          : "fa-regular fa-moon";
  document.dispatchEvent(new CustomEvent("asf-theme-changed"));
}

function savePreference(key, value) {
  const next = { ...preferences(), [key]: value };
  localStorage.setItem(localKey, JSON.stringify(next));
}


function renderModelList() {
  const list = $("#modelList");
  list.replaceChildren();
  for (const model of state.models) {
    const button = document.createElement("button");
    button.className = `model-link${model.file === state.activeFile ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `<span class="model-icon ${model.marketplace ? "market" : ""}"><i class="fa-solid ${model.marketplace ? "fa-bag-shopping" : "fa-layer-group"}"></i></span><span class="model-copy"><strong>${escapeHtml(model.name)}</strong><small>${escapeHtml(model.description || (model.marketplace ? "Marketplace" : "Espace financier"))}</small></span><i class="fa-solid fa-chevron-right model-chevron"></i>`;
    button.addEventListener("click", () => {
      state.activeFile = model.file;
      savePreference("activeFile", model.file);
      setView("model");
      render();
      $("#sidebar").classList.remove("open");
    });
    list.append(button);
  }

  const quick = $("#createModelShortcut");
  quick.setAttribute("aria-label", "Créer un nouvel espace");
}


function renderStats(model, totals) {
  const grid = $("#statsGrid");
  if (model.marketplace) {
    const soldValue = totals.soldValue;
    const itemsExpenseValue = totals.products
      .filter((item) => item.etat !== true && Number(item.quantite) > 0)
      .reduce(
        (sum, item) =>
          sum + (Number(item.montant) || 0) * productQuantity(item),
        0,
      );
    const netAssets = itemsExpenseValue - totals.expense;
    const rows = [
      ["Solde", soldValue - totals.expense],
      ["Total Dépenses", -totals.expense],
      ["Total Revenus", soldValue],
      ["Valeur Totale des Articles", totals.estimate],
      ["Valeur Totale des Articles Invendus", itemsExpenseValue],
      ["Valeur Totale des Articles (Dépenses Soustraites)", netAssets],
    ];
    const cards = rows.map(([label, value], index) => ({
      label,
      value: money(value),
      icon: [
        "fa-wallet",
        "fa-arrow-trend-down",
        "fa-arrow-trend-up",
        "fa-gem",
        "fa-box-open",
        "fa-calculator",
      ][index],
      tone: ["violet", "orange", "green", "blue", "blue", "violet"][index],
      note: [
        "Ventes moins dépenses",
        "Dépenses enregistrées",
        "Produits vendus",
        "Produits en stock et vendus",
        "Valeur encore en stock",
        "Valeur en stock après dépenses",
      ][index],
    }));
    grid.innerHTML = cards
      .map(
        (card) =>
          `<article class="stat-card"><span class="stat-icon ${card.tone}"><i class="fa-solid ${card.icon}"></i></span><div class="stat-copy"><span>${card.label}</span><strong>${card.value}</strong><small>${card.note}</small></div></article>`,
      )
      .join("");
    return;
  }

  const cards = [
    {
      label: "Solde",
      value: money(totals.balance),
      icon: "fa-wallet",
      tone: "violet",
      note: "Revenus moins dépenses",
    },
    {
      label: "Revenus",
      value: money(totals.income),
      icon: "fa-arrow-trend-up",
      tone: "green",
      note: `${model.data.profits.items.length} opération${model.data.profits.items.length === 1 ? "" : "s"}`,
    },
    {
      label: "Dépenses",
      value: money(totals.expense),
      icon: "fa-arrow-trend-down",
      tone: "orange",
      note: `${model.data.expenses.items.length} opération${model.data.expenses.items.length === 1 ? "" : "s"}`,
    },
    {
      label: "Opérations",
      value: String(
        model.data.profits.items.length + model.data.expenses.items.length,
      ),
      icon: "fa-receipt",
      tone: "blue",
      note: "Dans cet espace",
    },
  ];
  grid.innerHTML = cards
    .map(
      (card) =>
        `<article class="stat-card"><span class="stat-icon ${card.tone}"><i class="fa-solid ${card.icon}"></i></span><div class="stat-copy"><span>${card.label}</span><strong>${card.value}</strong><small>${card.note}</small></div></article>`,
    )
    .join("");
}

function kindLabel(kind) {
  return (
    {
      revenus: "Revenu",
      depenses: "Achat",
      achats: "Achat",
      items: "Produit",
      produits: "Produit",
    }[kind] || kind
  );
}

function formatDate(date) {
  if (!date) return "Sans date";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : dateFormat.format(parsed);
}

function kindIcon(kind) {
  return (
    {
      revenus: "fa-arrow-down",
      depenses: "fa-arrow-up",
      achats: "fa-arrow-up",
      items: "fa-cube",
      produits: "fa-cube",
    }[kind] || "fa-circle"
  );
}

function renderLists(model, totals) {
  const history = $("#historyList");
  const historyRows = totals.all.slice(0, 6);
  history.innerHTML = historyRows.length
    ? historyRows
        .map(
          (item) =>
            `<div class="history-row"><span class="history-icon ${item.kind}"><i class="fa-solid ${kindIcon(item.kind)}"></i></span><span class="history-name"><strong>${escapeHtml(item.nom || "Sans nom")}</strong><small>${kindLabel(item.kind)} · ${escapeHtml(item.modelName || model.name)} · ${formatDate(item.date)}</small></span><strong class="history-amount ${item.kind}">${["depenses", "achats"].includes(item.kind) ? "−" : ["revenus"].includes(item.kind) ? "+" : ""}${money(item.montant)}</strong></div>`,
        )
        .join("")
    : `<div class="empty-state"><span class="empty-icon"><i class="fa-solid fa-receipt"></i></span><strong>Aucune opération pour le moment</strong><small>Ajoutez un produit, un achat ou un revenu pour commencer.</small><button class="button button-quiet empty-add">Ajouter une opération</button></div>`;
  $(".empty-add")?.addEventListener("click", () => openItemDialog());
  const entries = model.marketplace
    ? [
        ...totals.products.map((item) => ({ ...item, kind: "items" })),
        ...model.data.expenses.items.map((item) => ({
          ...item,
          kind: "depenses",
        })),
      ].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
    : totals.all;
  $("#itemsTitle").textContent = model.marketplace
    ? "Produits et dépenses"
    : "Achats et revenus";
  const items = $("#itemsList");
  items.innerHTML = entries.length
    ? entries
        .slice(0, 6)
        .map((item) => {
          const isProduct =
            (model.marketplace && item.kind === "items") ||
            item.kind === "produits";
          const kind =
            item.kind === "achats"
              ? "depenses"
              : item.kind === "produits"
                ? "items"
                : item.kind;
          const actionKind = model.marketplace
            ? (isProduct ? "items" : "depenses")
            : item.kind === "achats" || item.kind === "depenses"
              ? "expenses"
              : item.kind === "revenus"
                ? "profits"
              : item.kind;
          const productSold =
            isProduct && (item.etat === true || Number(item.quantite) === 0);
          const expense = ["depenses", "achats"].includes(item.kind);
          const status = isProduct ? productStatus(item) : "";
          return `<div class="item-row"><span class="item-thumb ${isProduct ? (productSold ? "product-sold" : "product-thumb") : expense ? "expense-thumb" : kind}"><i class="fa-solid ${expense ? "fa-arrow-trend-down" : isProduct ? (productSold ? "fa-circle-check" : "fa-cube") : kindIcon(kind)}"></i></span><span class="item-info"><strong>${escapeHtml(item.nom || "Sans nom")}</strong><small>${escapeHtml(item.modelName ? `${item.modelName} · ` : "")}${formatDate(item.date)}${isProduct ? ` · ${status} · Qté ${productSold ? 0 : productQuantity(item)}` : ` · ${kindLabel(item.kind)}`}</small></span><span class="item-value">${money(isProduct ? (Number(item.montant) || 0) * (productSold ? Math.max(1, Number(item.quantiteVendu ?? item.quantiteInitiale ?? 1) || 1) : productQuantity(item)) : item.kind === "revenus" ? Math.abs(Number(item.montant) || 0) : -Math.abs(Number(item.montant) || 0))}</span>${item.file ? "" : `<button class="icon-button item-edit" data-kind="${actionKind}" data-date="${escapeHtml(item.date || "")}" data-name="${escapeHtml(item.nom || "")}" data-amount="${Number(item.montant) || 0}" title="Modifier"><i class="fa-regular fa-pen-to-square"></i></button><button class="icon-button item-delete" data-kind="${actionKind}" data-date="${escapeHtml(item.date || "")}" data-name="${escapeHtml(item.nom || "")}" data-amount="${Number(item.montant) || 0}" title="Supprimer"><i class="fa-regular fa-trash-can"></i></button>`}</div>`;
        })
        .join("")
    : `<div class="empty-state compact"><span class="empty-icon"><i class="fa-solid ${model.marketplace ? "fa-cube" : "fa-chart-line"}"></i></span><strong>${model.marketplace ? "Votre collection commence ici" : "Rien à afficher"}</strong><small>Ajoutez vos produits, achats ou revenus.</small></div>`;
  $$(".item-delete", items).forEach((button) =>
    button.addEventListener("click", () => removeItem(button.dataset)),
  );
  $$(".item-edit", items).forEach((button) =>
    button.addEventListener("click", () => editItem(button.dataset)),
  );
}


document.addEventListener("asf-theme-changed", () => {
  if (state.chart) updateChartTheme();
});

function chartColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    text: style.getPropertyValue("--muted").trim(),
    grid: style.getPropertyValue("--chart-grid").trim(),
  };
}

function updateChartTheme() {
  if (!state.chart) return;

  const colors = chartColors();
  const labels = state.chart.options.plugins.legend.labels;

  if (labels) labels.color = colors.text;

  state.chart.options.plugins.tooltip.backgroundColor = getComputedStyle(
    document.documentElement,
  )
    .getPropertyValue("--card")
    .trim();
  state.chart.options.plugins.tooltip.titleColor = getComputedStyle(
    document.documentElement,
  )
    .getPropertyValue("--text")
    .trim();
  state.chart.options.plugins.tooltip.bodyColor = getComputedStyle(
    document.documentElement,
  )
    .getPropertyValue("--text")
    .trim();
  state.chart.options.scales.x.ticks.color = colors.text;
  state.chart.options.scales.y.ticks.color = colors.text;
  state.chart.options.scales.x.grid.color = colors.grid;
  state.chart.options.scales.y.grid.color = colors.grid;
  state.chart.update();
}

function makeChart(model) {
  const canvas = $("#budgetChart");
  if (typeof Chart === "undefined") {
    canvas.parentElement.innerHTML =
      '<div class="chart-fallback">Le graphique est indisponible. Vérifiez votre connexion.</div>';
    return;
  }

  const entries = aggregate(model).all;
  const timeSeries = buildTimeSeries(entries);
  const sumByDay = (kind) =>
    timeSeries.keys.map((key) =>
      entries
        .filter(
          (item) =>
            item.kind === kind && String(item.date || "").slice(0, 10) === key,
        )
        .reduce((sum, item) => sum + (Number(item.montant) || 0), 0),
    );

  const expenses = sumByDay("depenses");
  const soldProducts = timeSeries.keys.map((key) =>
    entries
      .filter(
        (item) =>
          item.kind === "items" && String(item.date || "").slice(0, 10) === key,
      )
      .reduce(
        (sum, item) =>
          sum +
          (Number(item.montant) || 0) *
            Math.max(0, Number(item.quantiteVendu) || 0),
        0,
      ),
  );
  const profits = sumByDay("revenus").map(
    (amount, index) => amount + soldProducts[index],
  );
  const balances = cumulativeBalances(profits, expenses);
  const products = timeSeries.keys.map((key) =>
    entries
      .filter(
        (item) =>
          item.kind === "items" && String(item.date || "").slice(0, 10) === key,
      )
      .reduce(
        (sum, item) =>
          sum +
          (Number(item.montant) || 0) *
            Math.max(
              1,
              Number(item.quantiteInitiale ?? item.quantite ?? 1) || 1,
            ),
        0,
      ),
  );

  renderChart(
    canvas,
    timeSeries.labels,
    makeDatasets({
      profits,
      expenses: expenses.map((value) => -value),
      balances,
      products,
      marketplace: model.marketplace,
      hasExpenses: entries.some((item) => item.kind === "depenses"),
      hasProfits: entries.some(
        (item) => item.kind === "revenus" || Number(item.quantiteVendu) > 0,
      ),
      hasProducts: entries.some((item) => item.kind === "items"),
    }),
  );
}

function makeGeneralChart() {
  const canvas = $("#budgetChart");
  if (typeof Chart === "undefined") {
    canvas.parentElement.innerHTML =
      '<div class="chart-fallback">Le graphique est indisponible. Vérifiez votre connexion.</div>';
    return;
  }

  const entries = aggregateAll().all;
  const timeSeries = buildTimeSeries(entries);
  const sumByDay = (kind) =>
    timeSeries.keys.map((key) =>
      entries
        .filter(
          (item) =>
            item.kind === kind && String(item.date || "").slice(0, 10) === key,
        )
        .reduce((sum, item) => sum + (Number(item.montant) || 0), 0),
    );

  const expenses = timeSeries.keys.map((key) =>
    entries
      .filter(
        (item) =>
          ["achats", "depenses"].includes(item.kind) &&
          String(item.date || "").slice(0, 10) === key,
      )
      .reduce((sum, item) => sum + (Number(item.montant) || 0), 0),
  );
  const soldProducts = timeSeries.keys.map((key) =>
    entries
      .filter(
        (item) =>
          item.kind === "produits" &&
          String(item.date || "").slice(0, 10) === key,
      )
      .reduce(
        (sum, item) =>
          sum +
          (Number(item.montant) || 0) *
            Math.max(0, Number(item.quantiteVendu) || 0),
        0,
      ),
  );
  const profits = sumByDay("revenus").map(
    (amount, index) => amount + soldProducts[index],
  );
  const balances = cumulativeBalances(profits, expenses);
  const products = timeSeries.keys.map((key) =>
    entries
      .filter(
        (item) =>
          item.kind === "produits" &&
          String(item.date || "").slice(0, 10) === key,
      )
      .reduce(
        (sum, item) =>
          sum +
          (Number(item.montant) || 0) *
            Math.max(
              1,
              Number(item.quantiteInitiale ?? item.quantite ?? 1) || 1,
            ),
        0,
      ),
  );

  renderChart(
    canvas,
    timeSeries.labels,
    makeDatasets({
      profits,
      expenses: expenses.map((value) => -value),
      balances,
      products,
      marketplace: true,
      hasExpenses: entries.some((item) =>
        ["achats", "depenses"].includes(item.kind),
      ),
      hasProfits: entries.some(
        (item) => item.kind === "revenus" || Number(item.quantiteVendu) > 0,
      ),
      hasProducts: entries.some((item) => item.kind === "produits"),
    }),
  );
}

function buildTimeSeries(entries) {
  const dates = entries
    .map((item) => String(item.date || "").slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();

  const now = new Date();
  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const startKey = dates[0] || todayKey;
  const endKey =
    dates.length && dates[dates.length - 1] > todayKey
      ? dates[dates.length - 1]
      : todayKey;

  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  const keys = [];
  const labels = [];
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
  });

  $("#budgetChart").dataset.startDate = startKey;

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = [
      cursor.getFullYear(),
      String(cursor.getMonth() + 1).padStart(2, "0"),
      String(cursor.getDate()).padStart(2, "0"),
    ].join("-");

    keys.push(key);
    labels.push(formatter.format(cursor));
  }

  return { keys, labels };
}

function cumulativeBalances(incomes, expenses) {
  let total = 0;

  return incomes.map((income, index) => {
    total += income - expenses[index];
    return total;
  });
}

function makeDatasets({
  profits,
  expenses,
  balances,
  products,
  marketplace,
  hasExpenses,
  hasProfits,
  hasProducts,
}) {
  return [
    {
      label: "Revenus",
      data: profits,
      borderColor: "#31b981",
      backgroundColor: "rgba(49,185,129,.11)",
      pointBackgroundColor: "#31b981",
      fill: true,
      cubicInterpolationMode: "monotone",
      borderWidth: 2.5,
      pointRadius: 3,
      hidden: !hasProfits,
    },
    {
      label: "Dépenses",
      data: expenses,
      borderColor: "#f17a67",
      backgroundColor: "rgba(241,122,103,.08)",
      pointBackgroundColor: "#f17a67",
      fill: true,
      cubicInterpolationMode: "monotone",
      borderWidth: 2.5,
      pointRadius: 3,
      hidden: !hasExpenses,
    },
    {
      label: "Solde cumulé",
      data: balances,
      borderColor: "#6861eb",
      backgroundColor: "transparent",
      pointBackgroundColor: "#6861eb",
      cubicInterpolationMode: "monotone",
      borderWidth: 2.5,
      pointRadius: 3,
      hidden: false,
    },
    {
      label: "Produits marketplace",
      data: products,
      borderColor: "#eeae48",
      backgroundColor: "rgba(238,174,72,.12)",
      pointBackgroundColor: "#eeae48",
      fill: true,
      cubicInterpolationMode: "monotone",
      borderWidth: 2.5,
      pointRadius: 3,
      hidden: !marketplace || !hasProducts,
    },
  ];
}

function renderChart(canvas, labels, datasets) {
  if (state.chart) state.chart.destroy();

  const colors = chartColors();
  const textColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--text")
    .trim();
  state.chart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getComputedStyle(document.documentElement)
            .getPropertyValue("--card")
            .trim(),
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: colors.grid,
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (context) =>
              `${context.dataset.label} : ${money(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: colors.text,
            font: { family: "DM Sans, sans-serif", size: 10 },
          },
          border: { display: false },
        },
        y: {
          beginAtZero: false,
          grid: { color: colors.grid },
          ticks: {
            color: colors.text,
            callback: (value) =>
              new Intl.NumberFormat("fr-FR", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(value),
            font: { family: "DM Sans, sans-serif", size: 10 },
          },
          border: { display: false },
        },
      },
    },
  });

  const indexes = { revenus: 0, depenses: 1, solde: 2, items: 3 };
  const savedFilters = preferences().filters ?? {};
  $$("[data-series]").forEach((input) => {
    const index = indexes[input.dataset.series];
    const available = !state.chart.data.datasets[index].hidden;
    input.checked = Object.hasOwn(savedFilters, input.dataset.series)
      ? savedFilters[input.dataset.series]
      : available;
    state.chart.setDatasetVisibility(index, input.checked && available);
  });

  updateChartTheme();
}


function openAllEntries() {
  const all = aggregateAll().all;
  const productsOnly = activeModel()?.marketplace && state.view !== "general";
  const visible = productsOnly
    ? all.filter(
        (item) =>
          item.file === state.activeFile &&
          ["produits", "depenses"].includes(item.kind),
      )
    : state.view === "general"
      ? all
      : all.filter((item) => item.file === state.activeFile);
  const model = activeModel();
  const heading =
    state.view === "general"
      ? "Toutes les opérations"
      : model?.marketplace
        ? "Produits et dépenses"
        : "Historique complet";
  $("#allEntriesTitle").textContent = heading;
  const list = $("#allEntriesList");
  list.innerHTML = visible.length
    ? visible
        .map((item) => {
          const product = item.kind === "produits";
          const expense = ["achats", "depenses"].includes(item.kind);
          const sold = item.etat === true || Number(item.quantite) === 0;
          const status = product ? productStatus(item) : "";
          const amount = product
            ? (Number(item.montant) || 0) *
              (sold
                ? Math.max(
                    1,
                    Number(item.quantiteVendu ?? item.quantiteInitiale ?? 1) ||
                      1,
                  )
                : productQuantity(item))
            : Number(item.montant) || 0;
          return `<div class="all-entry"><span class="history-icon ${product ? (sold ? "sold" : "items") : expense ? "depenses" : item.kind}"><i class="fa-solid ${product ? (sold ? "fa-circle-check" : "fa-cube") : expense ? "fa-arrow-trend-down" : kindIcon(item.kind)}"></i></span><span class="history-name"><strong>${escapeHtml(item.nom || "Sans nom")}</strong><small>${escapeHtml(item.modelName)} · ${kindLabel(item.kind)} · ${formatDate(item.date)}${product ? ` · ${status} · Qté ${sold ? 0 : productQuantity(item)}` : ""}</small></span><strong class="history-amount ${expense ? "depenses" : product && sold ? "sold" : item.kind}">${expense ? "−" : item.kind === "revenus" || (product && sold) ? "+" : ""}${money(amount)}</strong></div>`;
        })
        .join("")
    : '<div class="empty-state compact"><strong>Aucune donnée enregistrée</strong><small>Les données de vos fichiers JSON apparaîtront ici.</small></div>';
  $("#allEntriesDialog").showModal();
}

function openMarketSummary() {
  const model = activeModel();
  if (!model?.marketplace) return;
  const totals = aggregate(model);
  const soldValue = totals.soldValue;
  const unsoldValue = totals.products
    .filter((item) => !item.etat && Number(item.quantite) > 0)
    .reduce(
      (sum, item) => sum + (Number(item.montant) || 0) * productQuantity(item),
      0,
    );
  const rows = [
    ["Solde", soldValue - totals.expense],
    ["Total Dépenses", -totals.expense],
    ["Total Revenus", soldValue],
    ["Valeur Totale des Articles", totals.estimate],
    ["Valeur Totale des Articles Invendus", unsoldValue],
    [
      "Valeur Totale des Articles (Dépenses Soustraites)",
      unsoldValue - totals.expense,
    ],
  ];
  $("#marketSummaryRows").innerHTML = rows
    .map(
      ([label, value], index) =>
        `<article class="summary-stat-card ${index === 0 ? "account-stat" : ""}"><span class="summary-stat-icon ${index === 1 ? "expense-stat" : index === 2 ? "income-stat" : ""}"><i class="fa-solid ${["fa-wallet", "fa-arrow-trend-down", "fa-arrow-trend-up", "fa-gem", "fa-box-open", "fa-calculator"][index]}"></i></span><span class="summary-stat-copy"><small>${label}</small><strong>${money(value)}</strong></span></article>`,
    )
    .join("");
  $("#marketSummaryDialog").showModal();
}


function render() {
  renderModelList();

  if (state.view === "settings") {
    $("#marketSummaryButton").hidden = true;
    $("#deleteModelButton").hidden = true;
    $("#editModelButton").hidden = true;
    return;
  }

  const model = activeModel();
  const general = state.view === "general" || !model;
  const deleteButton = $("#deleteModelButton");
  const summaryButton = $("#marketSummaryButton");

  deleteButton.hidden = general;
  deleteButton.style.display = general ? "none" : "";
  const editButton = $("#editModelButton");
  editButton.hidden = general;
  editButton.style.display = general ? "none" : "";
  summaryButton.hidden = !model?.marketplace || general;
  summaryButton.style.display = !general && model?.marketplace ? "" : "none";

  $("#settingsDataStatus").textContent =
    `${state.models.length} espace${state.models.length === 1 ? "" : "s"} · dernière sauvegarde automatique active`;
  $("#breadcrumbTitle").textContent = general
    ? "Vue générale"
    : model.name;

  if (general) {
    const totals = aggregateAll();
    $("#pageTitle").textContent = "Vue générale";
    $("#pageSubtitle").textContent =
      "Votre solde et toute l’activité de vos espaces, réunis ici.";
    $("#viewEyebrow").textContent = "TOUS VOS ESPACES, EN UN COUP D’ŒIL";
    $("#addItemTop").hidden = false;
    $("#addItemTop span").textContent = "Ajouter un espace";
    $("#filterToggle").hidden = false;

    const cards = [
      {
        label: "Solde global",
        value: money(totals.balance),
        icon: "fa-wallet",
        tone: "violet",
        note: `Sur ${state.models.length} espace${state.models.length === 1 ? "" : "s"}`,
      },
      {
        label: "Revenus",
        value: money(totals.income),
        icon: "fa-arrow-trend-up",
        tone: "green",
        note: "Tous les espaces réunis",
      },
      {
        label: "Achats",
        value: money(-totals.expense),
        icon: "fa-arrow-trend-down",
        tone: "orange",
        note: "Tous les espaces réunis",
      },
      {
        label: "Valeur des produits Invendus",
        value: money(totals.unsoldValue),
        icon: "fa-gem",
        tone: "blue",
        note: `${totals.products.length} produit${totals.products.length === 1 ? "" : "s"} marketplace`,
      },
    ];

    $("#statsGrid").innerHTML = cards
      .map(
        (card) =>
          `<article class="stat-card"><span class="stat-icon ${card.tone}"><i class="fa-solid ${card.icon}"></i></span><div class="stat-copy"><span>${card.label}</span><strong>${card.value}</strong><small>${card.note}</small></div></article>`,
      )
      .join("");
    $("#itemsTitle").textContent = "Activité récente, tous espaces";
    $("#insightTitle").textContent =
      totals.balance >= 0
        ? "Votre solde global est positif"
        : "Votre solde global est négatif";
    $("#insightText").textContent = totals.all.length
      ? `${totals.all.length} opérations et produits, provenant directement de vos fichiers JSON.`
      : "Ajoutez des produits, achats et revenus dans vos espaces pour les voir apparaître ici.";

    renderLists({ name: "Tous les espaces", marketplace: false }, totals);
    makeGeneralChart();
    $("#showAllItems").textContent = "Voir toutes les opérations";
    return;
  }

  const totals = aggregate(model);
  $("#pageTitle").textContent = model.name;
  $("#pageSubtitle").textContent =
    model.description ||
    (model.marketplace
      ? "Suivez vos produits, estimations et ventes."
      : "Une vue claire de vos achats et revenus.");
  $("#viewEyebrow").textContent = model.marketplace
    ? "VOTRE COLLECTION EN UN COUP D’ŒIL"
    : "VOTRE ACTIVITÉ FINANCIÈRE";
  $("#addItemTop").hidden = false;
  $("#addItemTop span").textContent = model.marketplace
    ? "Ajouter produit / dépense"
    : "Ajouter achat / revenu";
  $("#itemsTitle").textContent = model.marketplace
    ? "Produits et dépenses"
    : "Achats et revenus";
  $("#deleteModelButton").dataset.file = model.file;
  $("#insightTitle").textContent = model.marketplace
    ? "Votre collection prend forme"
    : totals.balance >= 0
      ? "Votre solde est positif"
      : "Votre solde est négatif";
  $("#insightText").textContent = model.marketplace
    ? `${totals.products.length} produits suivis, pour une estimation de ${money(totals.estimate)}.`
    : totals.all.length
      ? `Vous avez enregistré ${totals.all.length} opérations avec un solde net de ${money(totals.balance)}.`
      : "Ajoutez vos achats et revenus pour suivre votre solde au fil du temps.";

  renderStats(model, totals);
  renderLists(model, totals);
  makeChart(model);
}
function setView(view) {
  state.view = view;
  const settings = view === "settings";
  $("#dashboardView").classList.toggle("active-view", !settings);
  $("#settingsView").classList.toggle("active-view", settings);
  $$(".side-link[data-view]").forEach((button) =>
    button.classList.toggle(
      "active",
      button.dataset.view === (view === "general" ? "dashboard" : view),
    ),
  );
  if (view === "general") state.activeFile = null;
  $("#breadcrumbTitle").textContent = settings
    ? "Paramètres"
    : view === "general"
      ? "Vue générale"
      : activeModel()?.name || "Vue générale";
}


function openModelDialog() {
  $("#modelForm").reset();
  $("#modelDialog").showModal();
}

function openEditModelDialog() {
  const model = activeModel();
  if (!model) return;
  const form = $("#editModelForm");
  form.elements.name.value = model.name;
  form.elements.description.value = model.description || "";
  $("#editModelDialog").showModal();
}

async function updateModel(event) {
  event.preventDefault();
  const model = activeModel();
  if (!model) return;
  const formData = new FormData(event.currentTarget);
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const updated = {
    ...model,
    name,
    description: String(formData.get("description") || "").trim(),
  };
  try {
    await persistModel(updated);
    state.models = state.models
      .map((entry) => entry.file === model.file ? updated : entry)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    closeDialog($("#editModelDialog"));
    render();
  } catch {}
}

function openItemDialog(kind = null, item = null, index = null) {
  const model = activeModel();
  if (!model) {
    openModelDialog();
    return;
  }
  state.itemType = kind ?? (model.marketplace ? "items" : "expenses");
  state.editingIndex = index;
  const type = $("#itemType");
  const choices = model.marketplace
    ? [
        ["products", "Produit"],
        ["expenses", "Dépense"],
      ]
    : [
        ["expenses", "Achat"],
        ["profits", "Revenu"],
      ];
  type.innerHTML = choices
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  type.value = state.itemType;

  $("#itemDialogTitle").textContent = item
    ? kind === "products"
      ? "Modifier un produit"
      : kind === "profits"
        ? "Modifier un revenu"
        : model.marketplace
          ? "Modifier une dépense"
          : "Modifier un achat"
    : model.marketplace
      ? "Ajouter un produit ou une dépense"
      : "Ajouter un achat / revenu";
  $("#itemDialogEyebrow").textContent = item
    ? "MODIFICATION"
    : model.marketplace
      ? "MARKETPLACE"
      : "NOUVELLE OPÉRATION";
  $("#stateField").hidden = !model.marketplace || type.value !== "products";
  $("#quantityField").hidden = !model.marketplace || type.value !== "products";
  const form = $("#itemForm");
  form.reset();
  form.elements.nom.value = item?.nom ?? "";
  form.elements.montant.value = item?.montant ?? "";
  form.elements.date.value =
    item?.date || new Date().toISOString().slice(0, 10);
  form.elements.etat.checked = item?.etat === true;
  form.elements.quantite.value = item
    ? item.etat === true
      ? ""
      : (item.quantite ?? 1)
    : "";
  type.value = state.itemType;
  $("#stateField").hidden = !model.marketplace || type.value !== "products";
  $("#quantityField").hidden = !model.marketplace || type.value !== "products";
  $("#itemDialog").showModal();
}

async function addModel(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "espace";
  let file = `${base}.json`;
  let n = 2;
  while (
    state.models.some(
      (model) => model.file.toLowerCase() === file.toLowerCase(),
    )
  )
    file = `${base}-${n++}.json`;
  const marketplace = form.elements.marketplace.checked;
  const model = normalizeModel(
    {
      name,
      description: String(formData.get("description") || "").trim(),
      marketplace,
      data: {
        products: { items: [] },
        expenses: { prefix: "-", items: [] },
        profits: { prefix: "+", items: [] },
      },
    },
    file,
  );
  try {
    await persistModel(model, "Espace créé et enregistré", true);
    state.models.push(model);
    state.models.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    state.activeFile = file;
    savePreference("activeFile", file);
    closeDialog($("#modelDialog"));
    setView("dashboard");
    setView("model");
    render();
  } catch {}
}

async function saveItem(event) {
  event.preventDefault();
  const model = activeModel();
  if (!model) return;
  const form = event.currentTarget;
  const formData = new FormData(form);
  const kind = String(formData.get("type"));
  const list = model.data[kind].items;
  const item = {
    nom: String(formData.get("nom") || "").trim(),
    montant: Number(formData.get("montant")),
    date: String(formData.get("date")),
  };
  if (model.marketplace && kind === "products") {
    const previous =
      state.editingIndex !== null ? list[state.editingIndex] : null;
    const requestedQuantity = Math.max(
      1,
      Math.floor(Number(form.elements.quantite.value) || 1),
    );
    item.quantiteInitiale =
      previous?.quantiteInitiale ?? previous?.quantite ?? requestedQuantity;
    item.quantiteVendu = previous?.quantiteVendu ?? 0;
    item.etat = form.elements.etat.checked || requestedQuantity === 0;
    if (item.etat) {
      item.quantiteVendu = Math.max(
        1,
        item.quantiteVendu + (previous?.quantite ?? item.quantiteInitiale),
      );
      item.quantite = 0;
    } else {
      item.quantite = Math.min(requestedQuantity, item.quantiteInitiale);
      item.quantiteVendu = Math.max(0, item.quantiteInitiale - item.quantite);
      item.etat = item.quantite === 0;
    }
  }
  if (
    !item.nom ||
    !Number.isFinite(item.montant) ||
    item.montant <= 0 ||
    !item.date
  )
    return;
  if (state.editingIndex !== null) list[state.editingIndex] = { ...list[state.editingIndex], ...item };
  else list.push(item);
  try {
    await persistModel(model);
    closeDialog($("#itemDialog"));
    state.editingIndex = null;
    setView("model");
    render();
  } catch {}
}

async function editItem(data) {
  const model = activeModel();
  if (!model) return;
  const kind =
    model.marketplace && data.kind !== "depenses"
      ? "products"
      : model.marketplace
        ? "expenses"
        : data.kind === "depenses" || data.kind === "achats"
          ? "expenses"
          : data.kind;
  const list = model.data[kind].items;
  const index = list.findIndex(
    (item) =>
      item.nom === data.name &&
      String(item.date || "") === data.date &&
      Number(item.montant) === Number(data.amount),
  );
  const item = list[index];
  if (item) openItemDialog(kind, item, index);
}

async function removeItem(data) {
  const model = activeModel();
  const kind =
    model.marketplace && data.kind !== "depenses"
      ? "products"
      : model.marketplace
        ? "expenses"
        : data.kind === "depenses" || data.kind === "achats"
          ? "expenses"
          : data.kind;
  const list = model?.data[kind]?.items;
  const index = list?.findIndex(
    (item) =>
      item.nom === data.name &&
      String(item.date || "") === data.date &&
      Number(item.montant) === Number(data.amount),
  );
  if (!list || index < 0) return;
  const confirmed = await confirmDelete(`« ${data.name} »`);
  if (!confirmed) {
    await loadModels();
    render();
    return;
  }
  list.splice(index, 1);
  try {
    await persistModel(model, "Entrée supprimée");
    await loadModels();
    setView("model");
    render();
  } catch {}
}

function confirmDelete(message) {
  const dialog = $("#confirmDeleteDialog");
  $("#confirmDeleteMessage").textContent = message;
  dialog.showModal();
  return new Promise((resolve) => {
    const finish = (confirmed) => {
      dialog.removeEventListener("close", onClose);
      if (dialog.open) closeDialog(dialog);
      resolve(confirmed);
    };
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      resolve(dialog.returnValue === "confirm");
    };
    dialog.addEventListener("close", onClose, { once: true });
    $("#cancelDeleteButton").onclick = () => finish(false);
    $("#cancelDeleteClose").onclick = () => finish(false);
  });
}


async function deleteActiveModel() {
  const model = activeModel();
  if (!model || !window.confirm(`Supprimer « ${model.name} » ? Une copie sera conservée dans vos archives.`)) return;
  const api = getApi();
  if (!api?.deleteAndArchiveModel) {
    showToast("La suppression est disponible dans l’application Electron.");
    return;
  }
  try {
    await api.deleteAndArchiveModel(model.file);
    state.models = state.models.filter((entry) => entry.file !== model.file);
    state.activeFile = null;
    setView("general");
    await loadModels();
    setView("general");
    render();
    showToast("L’espace a été archivé puis supprimé.");
  } catch (error) {
    showToast(`Suppression interrompue : ${error.message}`);
  }
}
document.addEventListener("DOMContentLoaded", async () => {
  const prefs = preferences();
  applyTheme(prefs.theme || "light");
  await loadModels();
  setView("general");
  render();
  $("#createModelShortcut").addEventListener("click", openModelDialog);
  window.addEventListener("asf-open-model", (event) => {
    state.activeFile = event.detail;
    savePreference("activeFile", event.detail);
    setView("model");
    render();
    $("#sidebar").classList.remove("open");
  });

  $(".empty-create")?.addEventListener("click", openModelDialog);
  $("#modelForm").addEventListener("submit", addModel);
  $("#editModelForm").addEventListener("submit", updateModel);
  $("#itemForm").addEventListener("submit", saveItem);
  $$(".close-dialog").forEach((button) =>
    button.addEventListener("click", () => {
      const dialog = button.closest("dialog");
      closeDialog(dialog);
      if (dialog?.id === "itemDialog") state.editingIndex = null;
    }),
  );
  $("#itemType").addEventListener("change", () => {
    const model = activeModel();
    $("#stateField").hidden = !model?.marketplace || $("#itemType").value !== "products";
    $("#quantityField").hidden = !model?.marketplace || $("#itemType").value !== "products";
  });
  $("#addItemTop").addEventListener("click", () => {
    if (state.view === "general") {
      openModelDialog();
      return;
    }

    openItemDialog();
  });
  $("#addItemHistory").addEventListener("click", () => openItemDialog());
  $("#addItemInline").addEventListener("click", () => openItemDialog());
  $("#showAllItems").addEventListener("click", openAllEntries);
  $("#marketSummaryButton").addEventListener("click", openMarketSummary);
  $("#deleteModelButton").addEventListener("click", deleteActiveModel);
  $("#confirmDeleteDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog($("#confirmDeleteDialog"));
  });
  $("#editModelButton").addEventListener("click", openEditModelDialog);
  $("#filterToggle").addEventListener("click", () => {
    const panel = $("#filterPanel");
    panel.hidden = !panel.hidden;
  });
  $$("[data-series]").forEach((input) =>
    input.addEventListener("change", () => {
      if (!state.chart) return;
      const index = { revenus: 0, depenses: 1, solde: 2, items: 3 }[
        input.dataset.series
      ];
      state.chart.setDatasetVisibility(index, input.checked);
      state.chart.update();
      savePreference("filters", {
        ...preferences().filters,
        [input.dataset.series]: input.checked,
      });
    }),
  );
  $("#itemType").addEventListener("change", (event) => {
    const model = activeModel();
    $("#stateField").hidden =
      !model?.marketplace || event.target.value !== "products";
    $("#quantityField").hidden =
      !model?.marketplace || event.target.value !== "products";
  });
  $$(".side-link[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      setView(
        button.dataset.view === "dashboard" ? "general" : button.dataset.view,
      );
      render();
      $("#sidebar").classList.remove("open");
    }),
  );
  $("#brandHome").addEventListener("click", (event) => {
    event.preventDefault();
    setView("general");
    render();
    $("#sidebar").classList.remove("open");
  });
  $("#generalHome").addEventListener("click", () => {
    setView("general");
    render();
  });
  $("#profileMenuButton").addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = $("#profileMenu");
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".profile-chip")) $("#profileMenu").hidden = true;
  });
  $("#openModelsFolder").addEventListener("click", async () => {
    try {
      const api = getApi();
      if (api?.openModelsFolder) await api.openModelsFolder();
      else showToast("Le dossier est accessible depuis model/.");
    } catch (error) {
      showToast(`Impossible d’ouvrir le dossier : ${error.message}`);
    }
    $("#profileMenu").hidden = true;
  });
  $("#openArchiveFolder").addEventListener("click", async () => {
    try {
      const api = getApi();
      if (api?.openArchiveFolder) await api.openArchiveFolder();
      else showToast("Les archives sont accessibles depuis model/archive/.");
    } catch (error) {
      showToast(`Impossible d’ouvrir les archives : ${error.message}`);
    }
    $("#profileMenu").hidden = true;
  });
  $$(".theme-option").forEach((button) =>
    button.addEventListener("click", () => {
      savePreference("theme", button.dataset.theme);
      applyTheme(button.dataset.theme);
    }),
  );
  $("#themeQuick").addEventListener("click", () => {
    const current = document.documentElement.dataset.theme || "light";
    const next =
      current === "light" ? "dark" : current === "dark" ? "vintage" : "light";
    savePreference("theme", next);
    applyTheme(next);
  });
  $("#mobileMenu").addEventListener("click", () =>
    $("#sidebar").classList.toggle("open"),
  );
});




