const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
let CAMPOS = [];
let CATEGORIAS = [];
let dados = { contabilidade: [], emprestimos: [], observacoes: [], alertas: [] };
let view = "painel";
let rascunho = null;
let sujo = false;
let mesAntes = "";
let revelados = new Set();
let rascunhoEmp = {};
let rascunhoNu = null;
const CARTOES = [
    ["", "Sem cartão"],
    ["bradesco", "Bradesco"],
    ["nubank", "Nubank"],
    ["mercado_pago", "Mercado Pago"]
];
const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2zm-2 6h10l-.8 12H7.8L7 9zm3.1 2.2v7.2h1.6v-7.2H10.1zm4.2 0v7.2h1.6v-7.2h-1.6z"/></svg>';
const ICONE_EDITAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.3V20h2.7L18 8.7 15.3 6 4 17.3zM20.7 6.3a1 1 0 0 0 0-1.4l-1.6-1.6a1 1 0 0 0-1.4 0l-1.3 1.3 3 3 1.3-1.3z"/></svg>';
const ICONE_OCULTAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75C21.27 7.61 17 4.5 12 4.5c-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>';
const ICONES = {
    pessoa: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M6 19c1.4-3 3.4-4.5 6-4.5S16.6 16 18 19"/></svg>',
    cartao: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>',
    assinatura: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/></svg>',
    variavel: '<svg viewBox="0 0 24 24"><path d="M4 16l4.5-8 3 5 2.2-3.2L20 16"/></svg>',
    taxas: '<svg viewBox="0 0 24 24"><path d="M4 18V6M4 18h16"/><path d="M8 14l3.2-4 2.8 2.2L18 8"/></svg>',
    custo: '<svg viewBox="0 0 24 24"><path d="M4 16h16M7 16v2M17 16v2"/><path d="M6 16l2-6h8l2 6"/><circle cx="8" cy="16" r="1.4"/><circle cx="16" cy="16" r="1.4"/></svg>',
    outro: '<svg viewBox="0 0 24 24"><path d="M4 11l8-6 8 6"/><path d="M7 10.5V19h10v-8.5"/></svg>'
};

const money = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mesFull = ym => {
    const [ano, mes] = (ym || "").split("-");
    return `${MONTHS[Number(mes) - 1] || ""} de ${ano}`;
};
const num = valor => {
    if (valor == null || valor === "") return 0;
    let texto = String(valor).replace(/R\$\s?/gi, "").trim();
    if (!texto) return 0;
    if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".");
    const convertido = parseFloat(texto);
    return Number.isFinite(convertido) ? Math.round(convertido * 100) / 100 : 0;
};
const round2 = valor => Math.round(Number(valor || 0) * 100) / 100;
const fmtBrl = valor => Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hojeYm = () => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
};
function setStatus(tipo, texto) {
    document.getElementById("dot").className = "dot " + tipo;
    document.getElementById("statusText").textContent = texto;
}
function showBanner(texto, tipo) {
    const el = document.getElementById("banner");
    el.textContent = texto || "";
    el.className = "banner" + (texto ? " show " + (tipo || "err") : "");
}
async function api(path, options) {
    const resposta = await fetch(path, options);
    const tipo = resposta.headers.get("content-type") || "";
    const corpo = tipo.includes("json") ? await resposta.json() : {};
    if (resposta.status === 401 && path !== "/api/login") {
        mostrarLogin();
        throw new Error(corpo.erro || "Faça login para continuar.");
    }
    if (!resposta.ok) throw new Error(corpo.erro || "Não foi possível concluir a operação.");
    return corpo;
}
function esc(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, caractere => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[caractere]));
}
function icone(nome) {
    return `<span class="ico">${ICONES[nome] || ""}</span>`;
}
function post(path, corpo) {
    return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
function mesAtual() {
    return document.getElementById("filtroMes").value || ((dados.contabilidade[0] || {}).mes || "");
}
function listaPagos(row) {
    const bruto = row && row.itens_pagos;
    return Array.isArray(bruto) ? bruto.filter(Boolean) : String(bruto || "").split(",").filter(Boolean);
}
function linhaSalva() {
    const mes = mesAtual();
    const row = (dados.contabilidade || []).find(item => item.mes === mes) || {};
    const saida = {
        mes,
        salario: row.salario || 0,
        entra: row.entra || [],
        detalhes: row.detalhes || {},
        oliveira_calculado: !!row.oliveira_calculado,
        itens_pagos: listaPagos(row)
    };
    CAMPOS.forEach(campo => { saida[campo.id] = row[campo.id] != null ? row[campo.id] : 0; });
    return saida;
}
function idsEntra(row) {
    return row.entra && row.entra.length ? row.entra : CAMPOS.filter(campo => !campo.no_total).map(campo => campo.id);
}
function prazoTexto(campo, pago, mes) {
    if (!campo.vencimento) return "";
    const dia = new Date().getDate();
    if (!pago && mes === hojeYm() && dia > campo.vencimento) return { cls: "tag late", texto: `Em atraso desde o dia ${campo.vencimento}` };
    return { cls: "tag due", texto: `Cobrança no dia ${campo.vencimento}` };
}
function brlInput(id, valor, extra) {
    return `<div class="brl-wrap"><span>R$</span><input id="${id}" class="brl ${extra || ""}" inputmode="decimal" value="${fmtBrl(valor)}"></div>`;
}
function brlCampo(classe, valor) {
    return `<div class="brl-wrap"><span>R$</span><input class="brl ${classe}" inputmode="decimal" value="${fmtBrl(valor)}"></div>`;
}
function pagoBtn(ativo, attrs) {
    return `<button type="button" class="pago-btn ${ativo ? "on" : ""}" aria-pressed="${ativo}" ${attrs || ""}>${ativo ? "Pago" : "Pendente"}</button>`;
}

function temPendente() {
    if (Object.keys(rascunhoEmp).length || rascunhoNu) return true;
    if (rascunho && assinatura(rascunho) !== assinatura(linhaSalva())) return true;
    return false;
}
function podeDescartar() {
    return !temPendente() || confirm("Há alterações não salvas. Deseja descartá-las?");
}
function limparRascunhos() {
    sujo = false;
    rascunho = null;
    revelados = new Set();
    rascunhoEmp = {};
    rascunhoNu = null;
}
const TITULOS = {
    painel: ["Principal", "Visão geral do mês: salário, despesas, valores pagos, pendências e saldo."],
    contabilidade: ["Lançamentos", "Registre e acompanhe as despesas do mês por categoria. O empréstimo Nu é detalhado na aba Empréstimos."],
    emprestimos: ["Empréstimos", "Acompanhe a parcela do mês, o saldo devedor e a projeção dos meses seguintes, incluindo o empréstimo Nu."],
    config: ["Configuração", "Gerencie o usuário, o e-mail e a senha da sua conta."]
};
const REGRA_SALDO = "O saldo do mês é o salário menos o total de despesas. Assinaturas vinculadas a um cartão já estão na fatura e não são somadas novamente.";
let contaAtual = null;
function ajustarAcoes() {
    document.getElementById("soAbertosCampo").classList.toggle("hidden", view !== "contabilidade");
    document.getElementById("campoCat").classList.toggle("hidden", view === "painel" || view === "config");
    document.getElementById("filtroMes").closest(".field").classList.toggle("hidden", view === "config");
    document.getElementById("btnExportar").classList.toggle("hidden", view === "config");
    document.getElementById("kpis").classList.toggle("hidden", view === "config");
    document.getElementById("avisos").classList.toggle("hidden", view === "config");
}
function setView(next) {
    if (next === view) return;
    if (!podeDescartar()) return;
    limparRascunhos();
    view = next;
    document.querySelectorAll(".nav button").forEach(botao => botao.classList.toggle("active", botao.dataset.view === next));
    const [titulo, sub] = TITULOS[next];
    document.getElementById("pageTitle").textContent = titulo;
    document.getElementById("pageSub").textContent = sub;
    document.getElementById("viewPainel").classList.toggle("hidden", next !== "painel");
    document.getElementById("viewContabilidade").classList.toggle("hidden", next !== "contabilidade");
    document.getElementById("viewEmprestimos").classList.toggle("hidden", next !== "emprestimos");
    document.getElementById("viewConfig").classList.toggle("hidden", next !== "config");
    ajustarAcoes();
    preencherFiltros();
    render();
}
function preencherFiltros() {
    const mesSel = document.getElementById("filtroMes");
    const catSel = document.getElementById("filtroCat");
    const meses = [...new Set([
        ...(dados.contabilidade || []).map(item => item.mes),
        ...(dados.emprestimos || []).map(item => item.mes)
    ])].sort();
    const anos = [...new Set(meses.map(mes => mes.slice(0, 4)))];
    document.getElementById("brandSub").textContent = !anos.length ? "Gestão financeira"
        : anos.length === 1 ? anos[0]
            : anos.length === 2 ? `${anos[0]} e ${anos[1]}` : `${anos[0]} a ${anos[anos.length - 1]}`;
    const manter = mesSel.value || (meses.includes(hojeYm()) ? hojeYm() : (meses[0] || ""));
    mesSel.innerHTML = meses.map(mes => `<option value="${mes}">${mesFull(mes)}</option>`).join("");
    if (meses.includes(manter)) mesSel.value = manter;
    mesAntes = mesSel.value;
    const catManter = catSel.value || "todas";
    if (view === "emprestimos") {
        const opcoes = numerosEmprestimo().map(numero => `<option value="${numero}">Empréstimo ${numero}</option>`).join("");
        catSel.innerHTML = `<option value="todas">Total dos empréstimos</option>${opcoes}`;
    } else {
        catSel.innerHTML = '<option value="todas">Todas as categorias</option>' + CATEGORIAS.map(cat => `<option value="${cat.id}">${cat.label}</option>`).join("");
    }
    if ([...catSel.options].some(opcao => opcao.value === catManter)) catSel.value = catManter;
}
function render() {
    if (view === "config") return;
    if (view === "contabilidade") renderContab();
    else if (view === "emprestimos") renderEmp();
    else renderPainel();
}

function coletarMes() {
    const base = rascunho || linhaSalva();
    const salario = document.getElementById("cSalario");
    const payload = {
        mes: mesAtual(),
        salario: salario ? num(salario.value) : num(base.salario),
        entra: base.entra || [],
        detalhes: base.detalhes || {},
        formulas: base.formulas || {},
        oliveira_calculado: !!base.oliveira_calculado
    };
    CAMPOS.forEach(campo => {
        const campoEl = document.getElementById("c_" + campo.id);
        payload[campo.id] = campoEl ? num(campoEl.value) : num(base[campo.id]);
    });
    const visiveis = new Set(CAMPOS.filter(campo => document.getElementById("c_" + campo.id)).map(campo => campo.id));
    const pagos = new Set((base.itens_pagos || []).filter(id => !visiveis.has(id)));
    document.querySelectorAll("#viewContabilidade .pago-btn.on").forEach(botao => {
        if (botao.dataset.campo) pagos.add(botao.dataset.campo);
    });
    payload.itens_pagos = [...pagos];
    return payload;
}
function assinatura(row) {
    return JSON.stringify({
        salario: num(row.salario),
        itens: [...(row.itens_pagos || [])].sort(),
        entra: [...(row.entra || [])].sort(),
        valores: Object.fromEntries(CAMPOS.map(campo => [campo.id, num(row[campo.id])]))
    });
}
function lembrar() {
    const proximo = coletarMes();
    rascunho = proximo;
    sujo = temPendente();
    atualizarTotais();
    atualizarRodapes();
}
function avaliarSpec(spec, contexto) {
    if (!spec || spec.tipo === "fixo") return round2((spec && spec.valor) || 0);
    if (spec.tipo === "soma") {
        const linhas = (spec.linhas || []).reduce((acc, linha) => acc + num(contexto[linha]), 0);
        const extra = (spec.extra || []).reduce((acc, valor) => acc + num(valor), 0);
        return round2(linhas + extra);
    }
    return round2((spec.termos || []).reduce((acc, termo) => {
        const sinal = Number(termo.sinal || 1) < 0 ? -1 : 1;
        const base = termo.numero != null ? num(termo.numero) : num(contexto[termo.linha]);
        return acc + sinal * base;
    }, 0));
}
const CATEGORIAS_FIXAS = ["pessoas", "variaveis", "assinaturas", "cartoes", "custo_fixo", "taxas", "emprestimos"];
const LINHAS_TOTAL = ["das", "maximo", "oliveira", "gabriel", "aluguel", "variaveis", "internet", "emprestimo_nu", "gasolina", "investimento"];
function listaCartoes() {
    const lista = [["bradesco", "Bradesco"], ["nubank", "Nubank"], ["mercado_pago", "Mercado Pago"]];
    CAMPOS.filter(campo => campo.categoria === "cartoes").forEach(campo => {
        if (!lista.some(([id]) => id === campo.id)) lista.push([campo.id, campo.label]);
    });
    return lista;
}
function embutidoNaFatura(campo) {
    return Boolean(campo && campo.sistema && campo.categoria === "assinaturas" && campo.cartao);
}
function naFatura(campo) {
    return Boolean(campo && campo.cartao && campo.categoria !== "cartoes");
}
function valorLinha(row, id) {
    if (view === "contabilidade") {
        const campo = document.getElementById("c_" + id);
        if (campo) return num(campo.value);
    }
    return num(row[id]);
}
function itensFatura(cardId, mes) {
    return (dados.observacoes || []).filter(nota => nota.mes === mes && nota.tipo === "fatura" && nota.apelido === cardId && num(nota.valor) > 0);
}
function acrescimoFatura(cardId, mes) {
    return round2(itensFatura(cardId, mes).reduce((acc, nota) => acc + num(nota.valor), 0));
}
function valorFatura(row, cardId) {
    const somar = CAMPOS.filter(campo => campo.cartao === cardId && campo.categoria !== "cartoes" && !embutidoNaFatura(campo))
        .reduce((acc, campo) => acc + valorLinha(row, campo.id), 0);
    return round2(valorLinha(row, cardId) + somar + acrescimoFatura(cardId, row.mes));
}
function linhasDaFormula(spec) {
    if (!spec) return null;
    if (spec.tipo === "soma") {
        const linhas = new Set((spec.linhas || []).map(Number));
        if (!linhas.has(20)) linhas.add(20);
        return linhas;
    }
    if (spec.tipo === "expr") {
        const linhas = new Set();
        (spec.termos || []).forEach(termo => {
            if (termo.linha != null && Number(termo.sinal || 1) > 0) linhas.add(Number(termo.linha));
        });
        return linhas;
    }
    return null;
}
function totalPelaFormula(row) {
    const spec = (row.formulas || {}).total;
    const linhas = linhasDaFormula(spec);
    if (!linhas) return null;
    const ctx = { 3: num(row.salario) };
    CAMPOS.forEach(campo => {
        if (campo.excel) ctx[Number(campo.excel)] = valorLinha(row, campo.id);
    });
    let total = avaliarSpec(spec, ctx);
    if (spec.tipo === "soma" && !(spec.linhas || []).map(Number).includes(20)) total = round2(total + num(ctx[20]));
    return { total, linhas };
}
function itensDoMes(row) {
    const formula = totalPelaFormula(row);
    if (!formula) return componentes(row);
    const pagos = new Set(row.itens_pagos || []);
    const itens = [];
    CAMPOS.forEach(campo => {
        if (!formula.linhas.has(Number(campo.excel)) || naFatura(campo)) return;
        const valor = campo.categoria === "cartoes" ? valorFatura(row, campo.id) : valorLinha(row, campo.id);
        itens.push({ id: campo.id, label: campo.label, valor, pago: pagos.has(campo.id) });
    });
    return itens;
}
function componentes(row) {
    const pagos = new Set(row.itens_pagos || []);
    const itens = [];
    LINHAS_TOTAL.forEach(id => {
        const campo = CAMPOS.find(item => item.id === id);
        if (!campo || naFatura(campo)) return;
        itens.push({ id, label: campo.label, valor: valorLinha(row, id), pago: pagos.has(id) });
    });
    CAMPOS.filter(campo => campo.categoria === "cartoes").forEach(campo => {
        itens.push({ id: campo.id, label: campo.label, valor: valorFatura(row, campo.id), pago: pagos.has(campo.id) });
    });
    CAMPOS.filter(campo => ["pessoas", "variaveis", "custo_fixo", "taxas"].includes(campo.categoria) && !LINHAS_TOTAL.includes(campo.id) && !naFatura(campo)).forEach(campo => {
        itens.push({ id: campo.id, label: campo.label, valor: valorLinha(row, campo.id), pago: pagos.has(campo.id) });
    });
    const incluidos = new Set(idsEntra(row));
    CAMPOS.filter(campo => !CATEGORIAS_FIXAS.includes(campo.categoria) && !LINHAS_TOTAL.includes(campo.id) && incluidos.has(campo.id) && !naFatura(campo)).forEach(campo => {
        itens.push({ id: campo.id, label: campo.label, valor: valorLinha(row, campo.id), pago: pagos.has(campo.id) });
    });
    return itens;
}
function textoInvestimento(valor) {
    const numero = num(valor);
    if (!Number.isFinite(numero) || numero <= 0) return "Sem aporte";
    return money(numero);
}
function somas(row) {
    const itens = itensDoMes(row);
    const total = round2(itens.reduce((acc, item) => acc + item.valor, 0));
    const pago = round2(itens.filter(item => item.pago).reduce((acc, item) => acc + item.valor, 0));
    const salario = num(row.salario);
    return {
        total,
        pago,
        faltante: round2(total - pago),
        sobra: round2(salario - total),
        fora: 0,
        salario
    };
}

function idsDoCard(catId) {
    if (catId === "receita") return [];
    return CAMPOS.filter(campo => campo.categoria === catId).map(campo => campo.id);
}
function cardDifere(catId, atual, salvo) {
    atual = atual || rascunho || linhaSalva();
    salvo = salvo || linhaSalva();
    if (catId === "receita") return num(atual.salario) !== num(salvo.salario);
    const ids = idsDoCard(catId);
    if (ids.some(id => num(atual[id]) !== num(salvo[id]))) return true;
    const pagosA = new Set(atual.itens_pagos || []);
    const pagosS = new Set(salvo.itens_pagos || []);
    if (ids.some(id => pagosA.has(id) !== pagosS.has(id))) return true;
    const entraA = new Set(atual.entra && atual.entra.length ? atual.entra : idsEntra(atual));
    const entraS = new Set(idsEntra(salvo));
    return ids.some(id => entraA.has(id) !== entraS.has(id));
}
function rodapeLancamento(catId) {
    const alterado = cardDifere(catId);
    return `<div class="card-foot"><span class="card-foot-aviso ${alterado ? "" : "hidden"}">Alterações não salvas</span><button type="button" class="btn ghost ${alterado ? "" : "hidden"}" data-desfazer-cat="${catId}">Desfazer</button><button type="button" class="btn" data-salvar-cat="${catId}" ${alterado ? "" : "disabled"}>Salvar</button></div>`;
}
function atualizarRodapes() {
    document.querySelectorAll("[data-salvar-cat]").forEach(botao => {
        const id = botao.dataset.salvarCat;
        const alterado = cardDifere(id, coletarMes(), linhaSalva());
        if (!botao.classList.contains("is-busy")) botao.disabled = !alterado;
        const aviso = botao.parentElement.querySelector(".card-foot-aviso");
        if (aviso) aviso.classList.toggle("hidden", !alterado);
        const desfazer = botao.parentElement.querySelector("[data-desfazer-cat]");
        if (desfazer) desfazer.classList.toggle("hidden", !alterado);
    });
    sujo = temPendente();
}
function extrairParte(row, catId) {
    if (catId === "receita") return { salario: num(row.salario) };
    const ids = idsDoCard(catId);
    return {
        valores: Object.fromEntries(ids.map(id => [id, num(row[id])])),
        pagos: ids.filter(id => (row.itens_pagos || []).includes(id)),
        entra: ids.filter(id => new Set(row.entra || []).has(id))
    };
}
function aplicarParte(base, catId, parte) {
    if (catId === "receita") {
        base.salario = num(parte.salario);
        return base;
    }
    Object.entries(parte.valores).forEach(([id, valor]) => { base[id] = valor; });
    const ids = new Set(Object.keys(parte.valores));
    const pagos = new Set(base.itens_pagos || []);
    ids.forEach(id => { if (parte.pagos.includes(id)) pagos.add(id); else pagos.delete(id); });
    base.itens_pagos = [...pagos];
    const entra = new Set(idsEntra(base));
    ids.forEach(id => { if (parte.entra.includes(id)) entra.add(id); else entra.delete(id); });
    base.entra = CAMPOS.map(campo => campo.id).filter(id => entra.has(id));
    return base;
}
function snapshotOutros(catId) {
    const atual = coletarMes();
    const salvo = linhaSalva();
    const manter = {};
    ["receita", ...CATEGORIAS.map(grupo => grupo.id)].filter(id => id !== catId).forEach(id => {
        if (cardDifere(id, atual, salvo)) manter[id] = extrairParte(atual, id);
    });
    return manter;
}
function reaplicarOutros(manter) {
    const ids = Object.keys(manter);
    if (!ids.length) {
        rascunho = null;
        sujo = temPendente();
        return;
    }
    const base = linhaSalva();
    ids.forEach(id => aplicarParte(base, id, manter[id]));
    rascunho = base;
    sujo = true;
}
function payloadDoCard(catId) {
    const atual = coletarMes();
    const salvo = linhaSalva();
    const payload = { mes: atual.mes };
    if (catId === "receita") {
        payload.salario = num(atual.salario);
        return payload;
    }
    const ids = idsDoCard(catId);
    ids.forEach(id => {
        if (id === "oliveira" && atual.oliveira_calculado) return;
        payload[id] = num(atual[id]);
    });
    const pagos = new Set(salvo.itens_pagos || []);
    const pagosAtuais = new Set(atual.itens_pagos || []);
    ids.forEach(id => { if (pagosAtuais.has(id)) pagos.add(id); else pagos.delete(id); });
    payload.itens_pagos = [...pagos];
    const entra = new Set(idsEntra(salvo));
    const entraAtual = new Set(atual.entra && atual.entra.length ? atual.entra : idsEntra(atual));
    ids.forEach(id => { if (entraAtual.has(id)) entra.add(id); else entra.delete(id); });
    payload.entra = CAMPOS.map(campo => campo.id).filter(id => entra.has(id));
    return payload;
}
function ocupar(botao, ocupado) {
    if (!botao) return;
    botao.disabled = ocupado;
    botao.classList.toggle("is-busy", ocupado);
}
function normalizarRascunho(row) {
    const salvo = linhaSalva();
    const algum = ["receita", ...CATEGORIAS.map(grupo => grupo.id)].some(id => cardDifere(id, row, salvo));
    if (!algum) {
        rascunho = null;
        sujo = temPendente();
    } else {
        rascunho = row;
        sujo = true;
    }
}

function renderContab() {
    const row = rascunho || linhaSalva();
    const cat = document.getElementById("filtroCat").value;
    const grupos = CATEGORIAS.filter(grupo => cat === "todas" || grupo.id === cat);
    const pagos = new Set(row.itens_pagos || []);
    const entra = new Set(idsEntra(row));
    document.getElementById("viewContabilidade").innerHTML = `
        <div class="card cat cat-receita" data-cat="receita">
            <div class="card-head"><h3>Receita</h3></div>
            <div class="card-body">
                <div class="row simple"><div><label>Salário</label></div>${brlInput("cSalario", row.salario)}</div>
            </div>
            ${rodapeLancamento("receita")}
        </div>
        <div class="cats">${grupos.map(grupo => cardCategoria(grupo, row, entra, pagos)).join("")}</div>
        ${renderNotas(row.mes)}
        ${renderNovoCard()}
        ${renderOcultos(row)}
        <div class="card cat cat-totais"><div class="totals" id="totais"></div></div>`;
    document.querySelectorAll("#viewContabilidade input.brl").forEach(input => {
        if (input.form) ligarBrlForm(input);
        else ligarBrl(input);
    });
    document.querySelectorAll("#viewContabilidade .pago-btn").forEach(botao => {
        botao.addEventListener("click", () => gravarPago(botao));
    });
    ligarAcoesLinha();
    document.querySelectorAll(".form-adicionar").forEach(form => form.addEventListener("submit", criarLinha));
    ligarRodapes();
    atualizarRodapes();
    const formNota = document.getElementById("formNota");
    if (formNota) {
        formNota.addEventListener("submit", salvarNota);
        const cancelar = formNota.querySelector("[data-cancelar-nota]");
        if (cancelar) cancelar.addEventListener("click", () => render());
    }
    const formCard = document.getElementById("formCard");
    if (formCard) {
        formCard.addEventListener("submit", criarCard);
        const seletor = formCard.elements.categoria;
        const trocar = () => {
            const nova = seletor.value === "__nova__";
            formCard.querySelector("[data-nova-categoria]").classList.toggle("hidden", !nova);
            formCard.elements.nova_categoria.required = nova;
            if (nova) formCard.elements.nova_categoria.focus();
        };
        seletor.addEventListener("change", trocar);
    }
    atualizarTotais();
}
function opcoesCartao(atual) {
    const opcoes = [["", "Não vincular"], ...listaCartoes()];
    return opcoes.map(([id, nome]) => `<option value="${esc(id)}" ${id === (atual || "") ? "selected" : ""}>${esc(nome)}</option>`).join("");
}
function tagCartao(codigo) {
    const nome = (listaCartoes().find(([id]) => id === codigo) || [])[1];
    if (!nome) return "";
    return `<span class="tag cartao-${codigo}">${esc(nome)}</span>`;
}
function cardCategoria(grupo, row, entra, pagos) {
    const soAbertos = document.getElementById("soAbertos").checked;
    const campos = CAMPOS.filter(campo => campo.categoria === grupo.id && !(soAbertos && pagos.has(campo.id)));
    const sempre = grupo.id === "taxas";
    const visiveis = campos.filter(campo => sempre || !campo.sistema || num(row[campo.id]) !== 0 || revelados.has(campo.id));
    const somaDentro = round2(campos.filter(campo => entra.has(campo.id)).reduce((acc, campo) => acc + num(row[campo.id]), 0));
    const somaFora = round2(campos.filter(campo => !entra.has(campo.id)).reduce((acc, campo) => acc + num(row[campo.id]), 0));
    const tudoFora = campos.length > 0 && campos.every(campo => !entra.has(campo.id));
    let meta = money(tudoFora ? somaFora : somaDentro);
    if (grupo.id === "cartoes") meta = money(round2(campos.reduce((acc, campo) => acc + valorFatura(row, campo.id), 0)));
    else if (!tudoFora && somaFora) meta += ` · excluído ${money(somaFora)}`;
    const subtotal = grupo.id === "taxas"
        ? `<div class="subtotal"><span>Subtotal do investimento</span><strong>${textoInvestimento(row.investimento)}</strong><small>Deduzido do salário e incluído no total de despesas.</small></div>`
        : "";
    const acoesCategoria = grupo.personalizada
        ? `<span class="icones-cabecalho">
            <button type="button" class="icone-acao" data-renomear-cat="${esc(grupo.id)}" title="Renomear categoria" aria-label="Renomear categoria ${esc(grupo.label)}">${ICONE_EDITAR}</button>
            <button type="button" class="icone-acao perigo" data-excluir-cat="${esc(grupo.id)}" title="Excluir categoria" aria-label="Excluir categoria ${esc(grupo.label)}">${ICONE_LIXEIRA}</button>
        </span>`
        : "";
    const formCategoria = grupo.personalizada
        ? `<form class="form-linha editar-categoria hidden" data-form-cat="${esc(grupo.id)}">
            <label class="field"><span>Nome da categoria</span><input name="label" required maxlength="40" value="${esc(grupo.label)}"></label>
            <div class="form-acoes">
                <button type="button" class="btn ghost" data-cancelar-cat>Cancelar</button>
                <button type="submit" class="btn">Salvar nome</button>
            </div>
        </form>`
        : "";
    const vazio = visiveis.length ? ""
        : `<p class="meta vazio">${soAbertos && campos.length !== CAMPOS.filter(campo => campo.categoria === grupo.id).length ? "Nenhum item pendente nesta categoria." : "Nenhum item nesta categoria ainda."}</p>`;
    return `<section class="card cat cat-${esc(grupo.id)}" data-cat="${esc(grupo.id)}">
        <div class="card-head"><h3>${icone(grupo.icone)}${esc(grupo.label)}</h3><div class="head-direita"><span class="meta">${meta}</span>${acoesCategoria}</div></div>
        <div class="card-body">
            ${formCategoria}
            ${visiveis.map(campo => linhaCampo(campo, row, entra, pagos)).join("")}
            ${vazio}
            ${subtotal}
            ${formDoCard(grupo)}
        </div>
        ${rodapeLancamento(grupo.id)}
    </section>`;
}
function normalizarNome(texto) {
    return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
function campoZerado(categoria, nome) {
    const alvo = normalizarNome(nome);
    if (!alvo) return null;
    const row = rascunho || linhaSalva();
    return CAMPOS.find(campo => campo.categoria === categoria && normalizarNome(campo.label) === alvo && num(row[campo.id]) === 0) || null;
}
function formDoCard(grupo) {
    const acoes = rotulo => `<div class="form-acoes">
                <button type="button" class="btn ghost" data-fechar-form>Cancelar</button>
                <button class="btn" type="submit">${rotulo}</button>
            </div>`;
    if (grupo.id === "cartoes") {
        const opcoes = listaCartoes().map(([id, nome]) => `<option value="${esc(id)}">${esc(nome)}</option>`).join("");
        return `<div class="adicionar-item">
            <div class="adicionar-botoes">
                <button type="button" class="btn ghost" data-abrir-form="cartoes-fatura" aria-expanded="false">+ Lançar na fatura</button>
                <button type="button" class="btn ghost" data-abrir-form="cartoes-novo" aria-expanded="false">+ Novo cartão</button>
            </div>
            <form class="form-linha form-adicionar hidden" data-form="cartoes-fatura" data-modo="fatura">
                <label class="field"><span>Descrição</span><input name="label" required maxlength="80" placeholder="Ex.: Compra parcelada" autocomplete="off"></label>
                <label class="field"><span>Valor</span><input name="valor" class="brl" inputmode="decimal" value="0,00"></label>
                <label class="field"><span>Fatura</span><select name="cartao">${opcoes}</select></label>
                ${acoes("Lançar na fatura")}
            </form>
            <form class="form-linha form-adicionar hidden" data-form="cartoes-novo">
                <label class="field"><span>Nome do cartão</span><input name="label" required maxlength="60" placeholder="Ex.: Inter" autocomplete="off"></label>
                ${acoes("Adicionar cartão")}
            </form>
        </div>`;
    }
    const dia = `<label class="field"><span>Dia da cobrança (opcional)</span><input name="vencimento" type="number" min="1" max="31" inputmode="numeric" placeholder="1 a 31"></label>`;
    return `<div class="adicionar-item">
        <div class="adicionar-botoes">
            <button type="button" class="btn ghost" data-abrir-form="${esc(grupo.id)}-novo" aria-expanded="false">+ Adicionar item</button>
        </div>
        <form class="form-linha form-adicionar hidden" data-form="${esc(grupo.id)}-novo">
            <label class="field"><span>Nome</span><input name="label" required maxlength="60" placeholder="Nome do item" autocomplete="off"></label>
            <label class="field"><span>Valor do mês</span><input name="valor" class="brl" inputmode="decimal" value="0,00"></label>
            ${dia}
            <label class="field"><span>Incluir na fatura do cartão</span><select name="cartao">${opcoesCartao("")}</select></label>
            ${acoes("Adicionar item")}
        </form>
    </div>`;
}
function painelEdicao(campo) {
    const ehCartao = campo.categoria === "cartoes";
    const cartao = ehCartao ? "" : `<label class="field"><span>Incluir na fatura do cartão</span><select name="cartao">${opcoesCartao(campo.cartao)}</select></label>`;
    const podeMover = !campo.sistema && !ehCartao;
    const categoria = podeMover
        ? `<label class="field"><span>Categoria</span><select name="categoria">${CATEGORIAS.filter(grupo => grupo.id !== "cartoes").map(grupo =>
            `<option value="${esc(grupo.id)}" ${grupo.id === campo.categoria ? "selected" : ""}>${esc(grupo.label)}</option>`).join("")}</select></label>`
        : "";
    return `<form class="form-linha editar-item hidden" data-form-item="${esc(campo.id)}">
        <label class="field"><span>Nome</span><input name="nome" required maxlength="60" value="${esc(campo.label)}" autocomplete="off"></label>
        <label class="field"><span>Descrição (opcional)</span><input name="dica" maxlength="160" value="${esc(campo.dica || "")}" placeholder="Informação adicional" autocomplete="off"></label>
        <label class="field"><span>Dia da cobrança (opcional)</span><input name="vencimento" type="number" min="1" max="31" inputmode="numeric" value="${campo.vencimento || ""}" placeholder="1 a 31"></label>
        ${cartao}
        ${categoria}
        <div class="form-acoes">
            <button type="button" class="btn ghost" data-cancelar-edicao>Cancelar</button>
            <button type="submit" class="btn">Salvar alterações</button>
        </div>
    </form>`;
}
function linhaCampo(campo, row, entra, pagos) {
    const ativo = pagos.has(campo.id);
    const sempreTotal = LINHAS_TOTAL.includes(campo.id) || ["cartoes", "custo_fixo", "pessoas", "variaveis", "taxas"].includes(campo.categoria);
    const fora = !sempreTotal && !naFatura(campo) && !entra.has(campo.id);
    const prazo = prazoTexto(campo, ativo, row.mes);
    const atrasado = prazo && prazo.cls.includes("late");
    const tags = [];
    if (fora) tags.push('<span class="tag out">Excluído do total</span>');
    if (naFatura(campo)) {
        tags.push(tagCartao(campo.cartao) || '<span class="tag">Sem cartão</span>');
        tags.push('<span class="tag">Já incluído na fatura</span>');
    }
    if (campo.id === "oliveira" && row.oliveira_calculado) tags.push('<span class="tag calc">Calculado</span>');
    if (prazo) tags.push(`<span class="${prazo.cls}">${esc(prazo.texto)}</span>`);
    const dica = campo.dica || "";
    const bloqueado = campo.id === "oliveira" && row.oliveira_calculado ? "readonly" : "";
    const noTotal = entra.has(campo.id);
    const contaFatura = campo.categoria === "cartoes"
        ? itensFatura(campo.id, row.mes).map(nota => `<p class="fatura-item"><span>${esc(nota.texto)}</span><strong>${money(nota.valor)}</strong><button type="button" class="lixo-inline" title="Excluir lançamento" aria-label="Excluir ${esc(nota.texto)}" data-nota-x="${nota.id}">${ICONE_LIXEIRA}</button></p>`).join("")
        : "";
    const corCartao = campo.categoria === "cartoes" ? ` cartao-${campo.id}` : "";
    const nomeSeguro = esc(campo.label);
    const acaoRemover = campo.sistema
        ? `<button type="button" class="icone-acao" title="Ocultar item" aria-label="Ocultar ${nomeSeguro}" data-ocultar="${campo.id}">${ICONE_OCULTAR}</button>`
        : `<button type="button" class="icone-acao perigo" title="Excluir item" aria-label="Excluir ${nomeSeguro}" data-excluir="${campo.id}">${ICONE_LIXEIRA}</button>`;
    return `<div class="row${corCartao} ${fora ? "fora" : ""} ${ativo ? "is-pago" : ""} ${atrasado ? "atrasado" : ""}" data-item="${campo.id}">
        <div class="linha-nome">
            <label>${esc(campo.label)}</label>
            ${tags.length || dica ? `<div class="tags">${tags.join("")}${dica ? `<span class="subtitulo">${esc(dica)}</span>` : ""}</div>` : ""}
            ${contaFatura}
        </div>
        ${pagoBtn(ativo, `data-campo="${campo.id}"`)}
        <div class="brl-wrap"><span>R$</span><input id="c_${campo.id}" class="brl" inputmode="decimal" ${bloqueado} value="${fmtBrl(row[campo.id])}"></div>
        <div class="linha-acoes">
            ${campo.categoria === "assinaturas"
                ? ""
                : sempreTotal
                    ? `<span class="tag ok" title="Este valor compõe o total de despesas do mês.">Incluído no total</span>`
                    : `<button type="button" class="mini ${noTotal ? "on" : ""}" data-entra="${campo.id}" aria-pressed="${noTotal}" title="Alterna se este valor entra no total de despesas do mês.">${noTotal ? "Incluído no total" : "Excluído do total"}</button>`}
            <span class="acoes-icone">
                <button type="button" class="icone-acao" title="Editar item" aria-label="Editar ${nomeSeguro}" aria-expanded="false" data-editar="${campo.id}">${ICONE_EDITAR}</button>
                ${acaoRemover}
            </span>
        </div>
        ${painelEdicao(campo)}
    </div>`;
}
function renderNotas(mes) {
    const notas = (dados.observacoes || []).filter(nota => nota.mes === mes && nota.tipo !== "nubank_total" && nota.tipo !== "fatura");
    const tipos = { nubank: "Cartão", pix: "Pix", ajuste: "Ajuste", nota: "Nota" };
    const linhas = notas.map(nota => `<div class="nota">
        <div><span class="tag">${esc(tipos[nota.tipo] || nota.tipo)}</span>${nota.apelido ? ` <span class="tag">${esc(nota.apelido)}</span>` : ""} ${esc(nota.texto)}</div>
        <div class="tags">
            <strong>${money(nota.valor)}</strong>
            <button type="button" class="icone-acao" title="Editar anotação" aria-label="Editar anotação ${esc(nota.texto)}" data-nota="${nota.id}">${ICONE_EDITAR}</button>
            <button type="button" class="icone-acao perigo" title="Excluir anotação" aria-label="Excluir anotação ${esc(nota.texto)}" data-nota-x="${nota.id}">${ICONE_LIXEIRA}</button>
        </div>
    </div>`).join("");
    const grupos = new Map();
    notas.forEach(nota => {
        const nome = (nota.apelido || "").trim();
        if (!nome) return;
        grupos.set(nome, round2((grupos.get(nome) || 0) + num(nota.valor)));
    });
    const totalNotas = round2(notas.reduce((acc, nota) => acc + num(nota.valor), 0));
    const resumoNotas = grupos.size ? `<div class="totais-notas">${
        [...grupos].map(([nome, valor]) => `<div><span>${esc(nome)}</span><strong>${money(valor)}</strong></div>`).join("")
    }</div>` : "";
    const vazio = notas.length ? "" : '<p class="meta vazio">Nenhuma anotação neste mês.</p>';
    return `<section class="card cat cat-notas" id="cardNotas"><div class="card-head"><h3>Anotações</h3><span class="meta">${notas.length ? money(totalNotas) : ""}</span></div><div class="card-body">${resumoNotas}${linhas}${vazio}
        <form id="formNota" class="form-linha">
            <p class="form-titulo" id="notaTitulo">Nova anotação</p>
            <input type="hidden" name="notaId" value="">
            <label class="field"><span>Descrição</span><input name="texto" required maxlength="400" autocomplete="off"></label>
            <label class="field"><span>Grupo (opcional)</span><input name="apelido" maxlength="80" placeholder="Ex.: Nubank" autocomplete="off"></label>
            <label class="field"><span>Valor</span><input name="valor" class="brl" inputmode="decimal" value="0,00"></label>
            <div class="form-acoes">
                <button type="button" class="btn ghost hidden" data-cancelar-nota>Cancelar edição</button>
                <button class="btn" type="submit" id="notaSalvar">Adicionar anotação</button>
            </div>
        </form>
    </div></section>`;
}
function renderNovoCard() {
    const opcoes = CATEGORIAS.map(cat => `<option value="${esc(cat.id)}">${esc(cat.label)}</option>`).join("")
        + '<option value="__nova__">+ Nova categoria…</option>';
    return `<section class="card cat cat-novo"><div class="card-head"><h3>Novo item</h3><span class="meta">Inclua uma despesa em qualquer categoria</span></div><div class="card-body">
        <form id="formCard" class="form-linha">
            <label class="field"><span>Nome</span><input name="label" required maxlength="60" placeholder="Nome do item" autocomplete="off"></label>
            <label class="field"><span>Categoria</span><select name="categoria">${opcoes}</select></label>
            <label class="field hidden" data-nova-categoria><span>Nome da nova categoria</span><input name="nova_categoria" maxlength="40" placeholder="Ex.: Educação" autocomplete="off"></label>
            <label class="field"><span>Valor do mês</span><input name="valor" class="brl" inputmode="decimal" value="0,00"></label>
            <details class="mais-opcoes">
                <summary>Mais opções</summary>
                <div class="form-linha">
                    <label class="field"><span>Dia da cobrança (opcional)</span><input name="vencimento" type="number" min="1" max="31" inputmode="numeric" placeholder="1 a 31"></label>
                    <label class="field"><span>Incluir na fatura do cartão</span><select name="cartao">${opcoesCartao("")}</select></label>
                    <label class="check"><input type="checkbox" name="entra" checked> Incluir no total de despesas</label>
                </div>
            </details>
            <div class="form-acoes"><button class="btn" type="submit">Adicionar item</button></div>
        </form>
    </div></section>`;
}
function renderOcultos(row) {
    const ocultos = (dados.ocultos || []).filter(card => card && card.id);
    if (!ocultos.length || !row) return "";
    const salvo = (dados.contabilidade || []).find(item => item.mes === row.mes) || {};
    return `<section class="card cat cat-ocultos"><div class="card-head"><h3>Itens ocultos</h3><span class="meta">Os valores continuam salvos</span></div><div class="card-body">${ocultos.map(card =>
        `<div class="nota"><span>${esc(card.label)}</span><div class="tags"><strong>${money(num(salvo[card.id]))}</strong><button type="button" class="mini" data-restaurar="${esc(card.id)}">Restaurar</button></div></div>`
    ).join("")}</div></section>`;
}
function pintarKpis(blocos) {
    document.getElementById("kpis").innerHTML = blocos.map(([rotulo, valor, classe]) =>
        `<article class="kpi"><label>${rotulo}</label><strong class="${classe}">${valor}</strong></article>`
    ).join("");
}
function nomeAtalho(alvo) {
    if (alvo.classList.contains("hero")) return "Salário";
    const titulo = alvo.querySelector(":scope > .card-head h3");
    if (titulo) return titulo.textContent.replace(/\s+/g, " ").trim();
    if (alvo.classList.contains("cat-totais")) return "Totais";
    return "Seção";
}
function valorAtalho(alvo) {
    if (alvo.classList.contains("hero")) return alvo.querySelector("strong")?.textContent.trim() || "";
    const meta = alvo.querySelector(":scope > .card-head .meta");
    if (!meta) return "";
    const dinheiro = meta.textContent.match(/R\$\s*[\d.,]+/);
    return dinheiro ? dinheiro[0] : "";
}
function montarAtalhos() {
    const vista = document.getElementById(view === "contabilidade" ? "viewContabilidade" : view === "emprestimos" ? "viewEmprestimos" : "viewPainel");
    const caixa = document.getElementById("kpisMini");
    if (!vista || !caixa) return;
    const alvos = [...vista.querySelectorAll(":scope > .hero, :scope > .card, :scope > .cats > .card, :scope > #graficoPainel .card")];
    caixa.innerHTML = alvos.map((alvo, indice) => {
        const id = view + "-" + indice;
        alvo.dataset.atalho = id;
        const valor = valorAtalho(alvo);
        const cat = alvo.classList.contains("hero") ? "cat-hero" : ([...alvo.classList].find(nome => nome.startsWith("cat-")) || "");
        return `<button type="button" class="kpi atalho ${cat}" data-alvo="${id}"><label>${esc(nomeAtalho(alvo))}</label>${valor ? `<strong>${esc(valor)}</strong>` : ""}</button>`;
    }).join("");
}
function irParaCard(id) {
    const vista = document.getElementById(view === "contabilidade" ? "viewContabilidade" : view === "emprestimos" ? "viewEmprestimos" : "viewPainel");
    const alvo = vista?.querySelector(`[data-atalho="${id}"]`);
    const main = document.querySelector(".main");
    if (!alvo || !main) return;
    const topo = alvo.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 16;
    main.scrollTo({ top: Math.max(0, topo), behavior: "smooth" });
    document.querySelectorAll(".card-foco").forEach(item => item.classList.remove("card-foco"));
    alvo.classList.add("card-foco");
    document.querySelectorAll("#kpisMini [data-alvo]").forEach(botao => botao.classList.toggle("on", botao.dataset.alvo === id));
}
function colocarChip(html) {
    const atual = document.getElementById("chipFora");
    if (!html) {
        if (atual) atual.remove();
        return;
    }
    if (atual) atual.outerHTML = html;
    else document.getElementById("avisos").insertAdjacentHTML("beforeend", html);
}
function atualizarTotais() {
    const row = coletarMes();
    const conta = somas(row);
    const faltante = conta.faltante;
    const sobra = conta.sobra;
    pintarKpis([
        ["Salário", money(conta.salario), ""],
        ["Total de despesas", money(conta.total), ""],
        ["Total pago", money(conta.pago), "pos"],
        ["Pendente", money(faltante), faltante > 0 ? "warn" : ""],
        ["Saldo do mês", money(sobra), sobra >= 0 ? "pos" : "neg"]
    ]);
    colocarChip(conta.fora > 0 ? `<div class="chip" id="chipFora">Excluído do total e pendente: <strong>${money(conta.fora)}</strong></div>` : "");
    const caixa = document.getElementById("totais");
    if (caixa) {
        caixa.innerHTML = `
            <div>Total pago<strong class="pos">${money(conta.pago)}</strong></div>
            <div>Total pendente<strong class="${faltante > 0 ? "warn" : ""}">${money(faltante)}</strong></div>
            <div>Saldo do mês<strong class="${sobra >= 0 ? "pos" : "neg"}">${money(sobra)}</strong></div>
            <p class="conta-regra">${REGRA_SALDO}</p>`;
    }
    CATEGORIAS.forEach(grupo => {
        const card = document.querySelector(`#viewContabilidade .card[data-cat="${grupo.id}"]`);
        if (!card) return;
        const entra = new Set(idsEntra(row));
        const campos = CAMPOS.filter(campo => campo.categoria === grupo.id);
        const somaDentro = round2(campos.filter(campo => entra.has(campo.id)).reduce((acc, campo) => acc + num(document.getElementById("c_" + campo.id)?.value), 0));
        const somaFora = round2(campos.filter(campo => !entra.has(campo.id)).reduce((acc, campo) => acc + num(document.getElementById("c_" + campo.id)?.value), 0));
        const tudoFora = campos.every(campo => !entra.has(campo.id));
        let meta = money(tudoFora ? somaFora : somaDentro);
        if (!tudoFora && somaFora) meta += ` · excluído ${money(somaFora)}`;
        if (grupo.id === "cartoes") meta = money(round2(campos.reduce((acc, campo) => acc + valorFatura(row, campo.id), 0)));
        const destino = card.querySelector(".card-head .meta");
        if (destino) destino.textContent = meta;
        const sub = card.querySelector(".subtotal strong");
        if (sub) sub.textContent = textoInvestimento(document.getElementById("c_investimento")?.value);
    });
    if (view === "contabilidade") montarAtalhos();
}

function ligarBrl(input) {
    input.addEventListener("focus", () => {
        if (input.readOnly) return;
        const valor = num(input.value);
        input.value = valor ? String(valor).replace(".", ",") : "";
    });
    input.addEventListener("blur", () => {
        input.value = fmtBrl(num(input.value));
        if (view === "contabilidade") lembrar();
    });
    input.addEventListener("input", () => {
        if (view === "contabilidade") lembrar();
        else if (input.id === "c_emprestimo_nu") guardarNu();
        else if (input.closest("[data-emp]")) recalcularEmp(input.closest("[data-emp]"));
    });
}
function ligarBrlForm(input) {
    input.addEventListener("focus", () => {
        const valor = num(input.value);
        input.value = valor ? String(valor).replace(".", ",") : "";
    });
    input.addEventListener("blur", () => {
        input.value = fmtBrl(num(input.value));
    });
}
function assinaturasDoCartao(cardId) {
    return CAMPOS.filter(campo => naFatura(campo) && campo.cartao === cardId);
}
function valoresPendentes() {
    const atual = coletarMes();
    const salvo = linhaSalva();
    const valores = {};
    if (num(atual.salario) !== num(salvo.salario)) valores.salario = num(atual.salario);
    CAMPOS.forEach(campo => {
        if (num(atual[campo.id]) !== num(salvo[campo.id])) valores[campo.id] = num(atual[campo.id]);
    });
    return valores;
}
function reaplicarValores(valores) {
    const chaves = Object.keys(valores);
    if (!chaves.length) {
        rascunho = null;
        sujo = temPendente();
        return;
    }
    const base = linhaSalva();
    if (valores.salario != null) base.salario = num(valores.salario);
    CAMPOS.forEach(campo => {
        if (valores[campo.id] != null) base[campo.id] = num(valores[campo.id]);
    });
    rascunho = base;
    sujo = true;
}
async function gravarPago(botao) {
    if (botao.dataset.ocupado === "1") return;
    const id = botao.dataset.campo;
    const ativo = !botao.classList.contains("on");
    const campo = CAMPOS.find(item => item.id === id);
    const ligados = campo && campo.categoria === "cartoes" ? assinaturasDoCartao(id) : [];
    alternarPago(botao);
    ligados.forEach(assinatura => {
        const outro = document.querySelector(`#viewContabilidade .pago-btn[data-campo="${assinatura.id}"]`);
        if (outro && outro.classList.contains("on") !== ativo) alternarPago(outro);
    });
    lembrar();
    const row = coletarMes();
    const pagos = new Set(row.itens_pagos || []);
    ligados.forEach(assinatura => {
        if (ativo) pagos.add(assinatura.id);
        else pagos.delete(assinatura.id);
    });
    const pendentes = valoresPendentes();
    botao.dataset.ocupado = "1";
    setStatus("load", "Salvando situação...");
    try {
        dados = await post("/api/contabilidade", { mes: row.mes, itens_pagos: [...pagos] });
        CAMPOS = dados.campos || CAMPOS;
        CATEGORIAS = dados.categorias || CATEGORIAS;
        reaplicarValores(pendentes);
        setStatus("ok", ativo ? "Marcado como pago" : "Marcado como pendente");
        showBanner("");
        render();
    } catch (erro) {
        setStatus("err", "Não foi possível salvar");
        showBanner(erro.message);
        alternarPago(botao);
        ligados.forEach(assinatura => {
            const outro = document.querySelector(`#viewContabilidade .pago-btn[data-campo="${assinatura.id}"]`);
            if (outro && outro.classList.contains("on") === ativo) alternarPago(outro);
        });
        lembrar();
        delete botao.dataset.ocupado;
    }
}
function alternarPago(botao) {
    const ativo = !botao.classList.contains("on");
    botao.classList.toggle("on", ativo);
    botao.setAttribute("aria-pressed", String(ativo));
    botao.textContent = ativo ? "Pago" : "Pendente";
    const linha = botao.closest(".row") || botao.closest("tr");
    if (linha) linha.classList.toggle("is-pago", ativo);
}

function emprestimoComValor(numero) {
    return (dados.emprestimos || []).some(item =>
        Number(item.emprestimo) === numero &&
        (num(item.saldo_inicio) > 0 || num(item.pagamento) > 0 || num(item.juros) > 0)
    );
}
function numerosEmprestimo() {
    return [1, 2].filter(emprestimoComValor);
}
function vagaEmprestimo() {
    return [1, 2].find(numero => !emprestimoComValor(numero)) || null;
}
function renderNovoEmp() {
    if (!vagaEmprestimo()) return "";
    return `<section class="card cat cat-novo"><div class="card-head"><h3>Novo empréstimo</h3></div><div class="card-body">
        <form id="formEmp" class="form-linha">
            <label class="field"><span>Saldo inicial</span><input name="saldo" class="brl" inputmode="decimal" value="0,00" required></label>
            <label class="field"><span>Parcela do mês</span><input name="pagamento" class="brl" inputmode="decimal" value="0,00"></label>
            <button class="btn" type="submit">Adicionar</button>
        </form>
    </div></section>`;
}
function renderEmp() {
    const mes = mesAtual();
    const cat = document.getElementById("filtroCat").value;
    const existentes = numerosEmprestimo();
    const numeros = cat === "todas" ? existentes : existentes.filter(numero => numero === Number(cat));
    document.getElementById("viewEmprestimos").innerHTML = `<p class="conta-regra">As parcelas dos empréstimos 1 e 2 compõem o valor de “Oliveira” em Lançamentos e não são somadas novamente ao total de despesas. O empréstimo Nu é somado separadamente.</p>`
        + numeros.map(numero => cardEmp(numero, mes)).join("")
        + renderNovoEmp()
        + cardNu(mes)
        + renderHistorico();
    document.querySelectorAll("#viewEmprestimos input.brl").forEach(ligarBrl);
    const formEmp = document.getElementById("formEmp");
    if (formEmp) formEmp.addEventListener("submit", criarEmprestimo);
    document.querySelectorAll("#viewEmprestimos .card[data-emp]").forEach(ligarCardEmp);
    document.querySelectorAll("[data-quitar]").forEach(botao => botao.addEventListener("click", () => quitarEmp(Number(botao.dataset.quitar))));
    document.querySelectorAll("[data-salvar-emp]").forEach(botao => botao.addEventListener("click", () => salvarEmpCard(botao.dataset.salvarEmp, botao)));
    document.querySelectorAll("[data-desfazer-emp]").forEach(botao => botao.addEventListener("click", () => desfazerEmp(botao.dataset.desfazerEmp)));
    const nuPago = document.querySelector('[data-role="nu-pago"]');
    if (nuPago) nuPago.addEventListener("click", () => {
        alternarPago(nuPago);
        guardarNu();
    });
    const salvarNuBtn = document.querySelector("[data-salvar-nu]");
    if (salvarNuBtn) salvarNuBtn.addEventListener("click", () => salvarNu(salvarNuBtn));
    const desfazerNuBtn = document.querySelector("[data-desfazer-nu]");
    if (desfazerNuBtn) desfazerNuBtn.addEventListener("click", desfazerNu);
    atualizarKpiEmp();
    atualizarBotoesEmp();
    montarAtalhos();
}
function cardEmp(numero, mes) {
    const lista = (dados.emprestimos || []).filter(item => Number(item.emprestimo) === numero).sort((a, b) => a.mes.localeCompare(b.mes));
    const original = lista.length ? Number(lista[0].saldo_inicio) || 0 : 0;
    const atual = lista.find(item => item.mes === mes);
    const saldo = atual ? Number(atual.saldo_inicio) || 0 : 0;
    const pagamentoSalvo = atual ? Number(atual.pagamento) || 0 : 0;
    const draft = rascunhoEmp[String(numero)];
    const pagamento = draft ? num(draft.pagamento) : pagamentoSalvo;
    const previsto = atual ? Number(atual.pagamento_previsto ?? atual.pagamento) || 0 : 0;
    const pago = draft ? Boolean(draft.pago) : (atual ? Boolean(atual.pago) : false);
    const juros = round2(saldo * 0.02);
    const seguinte = lista.find(item => item.mes > mes);
    const referencia = seguinte
        ? `Saldo inicial em ${mesFull(seguinte.mes)}: ${money(seguinte.saldo_inicio)}.`
        : "Última parcela deste empréstimo.";
    return `<section class="card cat cat-emp${numero}" data-emp="${numero}" data-original="${original}" data-pagamento="${pagamentoSalvo}" data-previsto="${previsto}" data-saldo="${saldo}">
        <div class="card-head"><h3>Empréstimo ${numero}</h3><span class="meta">Valor inicial: ${money(original)}</span></div>
        <div class="card-body">
            <div class="resumo-emp">
                <div><span>Saldo devedor</span><strong>${money(saldo)}</strong></div>
                <div><span>Parcela prevista</span><strong>${money(previsto)}</strong></div>
                <div><span>Juros (2%)</span><strong class="juros">${money(juros)}</strong></div>
                <div><span>Saldo após o pagamento</span><strong class="fim">${money(round2(Math.max(0, saldo - pagamento)))}</strong></div>
            </div>
            <p class="meta ref-mes">${referencia}</p>
            <div class="row simple">
                <div>
                    <label>Valor pago no mês</label>
                    <div class="meta">Parcela prevista: ${money(previsto)}. Ao informar outro valor, o saldo e os meses seguintes são recalculados.</div>
                    <p class="aviso-parcela" hidden>Ao salvar, os saldos dos meses seguintes serão recalculados.</p>
                </div>
                ${brlCampo("pag", pagamento)}
            </div>
            <div class="row simple ${pago ? "is-pago" : ""}"><div><label>Situação</label></div>${pagoBtn(pago, 'data-role="card-pago"')}</div>
            ${saldo > 0 ? `<button type="button" class="btn" data-quitar="${numero}">Quitar empréstimo</button>` : '<p class="meta">Empréstimo quitado. Os meses seguintes permanecem com saldo zerado.</p>'}
            <input type="hidden" class="saldo" value="${fmtBrl(saldo)}">
        </div>
        <div class="evo"><table>
            <thead><tr><th>Mês</th><th class="num">Saldo inicial</th><th class="num">Juros</th><th class="num">Parcela</th><th class="num">Saldo final</th><th>Situação</th></tr></thead>
            <tbody>${lista.map(item => {
                const pagoLinha = draft && draft.linhas && Object.prototype.hasOwnProperty.call(draft.linhas, String(item.id))
                    ? draft.linhas[String(item.id)]
                    : Boolean(item.pago);
                return `<tr class="${item.mes === mes ? "atual" : ""} ${pagoLinha ? "is-pago" : ""}" data-id="${item.id || ""}" data-mes="${item.mes}" data-emp="${numero}">
                <td>${mesFull(item.mes)}</td><td class="num">${money(item.saldo_inicio)}</td><td class="num">${money(item.juros)}</td>
                <td class="num">${money(item.pagamento)}</td><td class="num">${money(item.saldo_fim)}</td>
                <td>${pagoBtn(pagoLinha, 'data-role="row-pago"')}</td>
            </tr>`;
            }).join("")}</tbody>
        </table></div>
        <input type="hidden" class="emp-id" value="${atual && atual.id ? atual.id : ""}">
        <input type="hidden" class="emp-n" value="${numero}">
        <div class="card-foot">
            <button type="button" class="btn ghost ${draft ? "" : "hidden"}" data-desfazer-emp="${numero}">Desfazer</button>
            <button type="button" class="btn" data-salvar-emp="${numero}" ${draft ? "" : "disabled"}>Salvar</button>
        </div>
    </section>`;
}
function nuSemPendencia(mes) {
    const row = (dados.contabilidade || []).find(item => item.mes === mes) || {};
    const valor = num(row.emprestimo_nu);
    const pago = listaPagos(row).includes("emprestimo_nu");
    return { row, valor, pago, pendente: valor > 0 && !pago };
}
function cardNu(mes) {
    const campo = CAMPOS.find(item => item.id === "emprestimo_nu");
    const info = nuSemPendencia(mes);
    if (!campo || !info.pendente) return "";
    const valor = rascunhoNu ? rascunhoNu.valor : info.row.emprestimo_nu;
    const pago = rascunhoNu ? rascunhoNu.pago : false;
    return `<section class="card cat cat-nu">
        <div class="card-head"><h3>Empréstimo Nu</h3><span class="meta">Parcela do mês</span></div>
        <div class="card-body">
            <p class="meta">Parcela do empréstimo Nu, incluída no total de despesas e separada dos empréstimos 1 e 2.</p>
            <div class="row simple"><div><label>Valor do mês</label></div>${brlInput("c_emprestimo_nu", valor)}</div>
            <div class="row simple ${pago ? "is-pago" : ""}"><div><label>Situação</label></div>${pagoBtn(pago, 'data-role="nu-pago"')}</div>
        </div>
        <div class="card-foot">
            <button type="button" class="btn ghost ${rascunhoNu ? "" : "hidden"}" data-desfazer-nu="1">Desfazer</button>
            <button type="button" class="btn" data-salvar-nu="1" ${rascunhoNu ? "" : "disabled"}>Salvar</button>
        </div>
    </section>`;
}
function ligarCardEmp(card) {
    const pagoCard = card.querySelector('[data-role="card-pago"]');
    if (pagoCard) pagoCard.addEventListener("click", () => {
        alternarPago(pagoCard);
        const linha = card.querySelector(`tr[data-mes="${mesAtual()}"]`);
        const botao = linha && linha.querySelector('[data-role="row-pago"]');
        if (botao && botao.classList.contains("on") !== pagoCard.classList.contains("on")) alternarPago(botao);
        guardarEmpEditados();
    });
    card.querySelectorAll('[data-role="row-pago"]').forEach(botao => {
        botao.addEventListener("click", () => {
            alternarPago(botao);
            const linha = botao.closest("tr");
            if (linha && linha.dataset.mes === mesAtual() && pagoCard && pagoCard.classList.contains("on") !== botao.classList.contains("on")) {
                alternarPago(pagoCard);
            }
            guardarEmpEditados();
        });
    });
    recalcularEmp(card);
}
function recalcularEmp(card) {
    const saldo = num(card.querySelector(".saldo").value);
    const pagamento = num(card.querySelector(".pag").value);
    const juros = round2(saldo * 0.02);
    card.querySelector(".juros").textContent = money(juros);
    card.querySelector(".fim").textContent = money(round2(Math.max(0, saldo - pagamento)));
    const aviso = card.querySelector(".aviso-parcela");
    if (aviso) aviso.hidden = Math.abs(pagamento - num(card.dataset.previsto)) < 0.01;
    guardarEmpEditados();
    atualizarKpiEmp();
}
function empAlteradoNumero(numero) {
    const draft = rascunhoEmp[String(numero)];
    if (!draft) return false;
    const atual = (dados.emprestimos || []).find(item => item.mes === mesAtual() && Number(item.emprestimo) === Number(numero));
    if (!atual) return true;
    if (Math.abs(num(draft.pagamento) - num(atual.pagamento)) > 0.009) return true;
    if (Boolean(draft.pago) !== Boolean(atual.pago)) return true;
    return Object.entries(draft.linhas || {}).some(([id, pago]) => {
        const item = (dados.emprestimos || []).find(emp => String(emp.id) === String(id));
        return item && Boolean(item.pago) !== Boolean(pago);
    });
}
function guardarEmpEditados() {
    document.querySelectorAll("#viewEmprestimos .card[data-emp]").forEach(card => {
        const numero = String(card.dataset.emp);
        rascunhoEmp[numero] = {
            pagamento: num(card.querySelector(".pag")?.value),
            pago: Boolean(card.querySelector('[data-role="card-pago"]')?.classList.contains("on")),
            linhas: Object.fromEntries([...card.querySelectorAll("tr[data-id]")].map(linha => [
                linha.dataset.id,
                Boolean(linha.querySelector('[data-role="row-pago"]')?.classList.contains("on"))
            ]))
        };
        if (!empAlteradoNumero(numero)) delete rascunhoEmp[numero];
    });
    sujo = temPendente();
    atualizarBotoesEmp();
}
function guardarNu() {
    const campo = document.getElementById("c_emprestimo_nu");
    const botao = document.querySelector('[data-role="nu-pago"]');
    if (!campo || !botao) return;
    const info = nuSemPendencia(mesAtual());
    const valor = num(campo.value);
    const pago = botao.classList.contains("on");
    if (Math.abs(valor - num(info.valor)) > 0.009 || pago !== Boolean(info.pago)) rascunhoNu = { valor, pago };
    else rascunhoNu = null;
    sujo = temPendente();
    atualizarBotoesEmp();
    atualizarKpiEmp();
}
function atualizarBotoesEmp() {
    document.querySelectorAll("[data-salvar-emp]").forEach(botao => {
        const alterado = empAlteradoNumero(botao.dataset.salvarEmp);
        if (!botao.classList.contains("is-busy")) botao.disabled = !alterado;
        const desfazer = botao.parentElement.querySelector("[data-desfazer-emp]");
        if (desfazer) desfazer.classList.toggle("hidden", !alterado);
    });
    const salvarNuBtn = document.querySelector("[data-salvar-nu]");
    if (salvarNuBtn && !salvarNuBtn.classList.contains("is-busy")) salvarNuBtn.disabled = !rascunhoNu;
    const desfazerNuBtn = document.querySelector("[data-desfazer-nu]");
    if (desfazerNuBtn) desfazerNuBtn.classList.toggle("hidden", !rascunhoNu);
}
function atualizarKpiEmp() {
    if (view !== "emprestimos") return;
    const cards = [...document.querySelectorAll("#viewEmprestimos .card[data-emp]")];
    const pagamento = cards.reduce((acc, card) => acc + num(card.querySelector(".pag")?.value), 0);
    const juros = cards.reduce((acc, card) => acc + round2(num(card.querySelector(".saldo")?.value) * 0.02), 0);
    const infoNu = nuSemPendencia(mesAtual());
    const campoNu = document.getElementById("c_emprestimo_nu");
    const nu = infoNu.pendente ? (campoNu ? num(campoNu.value) : num(infoNu.valor)) : 0;
    const blocos = [
        ["Total do mês", money(round2(pagamento + juros + nu)), ""],
        ["Parcelas", money(pagamento), ""],
        ["Juros", money(juros), ""],
        ["Empréstimos", money(round2(pagamento + juros)), ""]
    ];
    if (infoNu.pendente) blocos.push(["Empréstimo Nu", money(nu), ""]);
    pintarKpis(blocos);
    colocarChip("");
}
function renderHistorico() {
    const info = nuSemPendencia(mesAtual());
    const lista = [...(dados.historico || [])];
    if (!info.pendente && info.valor > 0) {
        lista.push({ texto: `Parcela do empréstimo Nu de ${mesFull(mesAtual())} paga.`, valor: info.valor });
    }
    if (!lista.length) return "";
    return `<section class="card cat cat-historico"><div class="card-head"><h3>Histórico</h3></div><div class="card-body">${lista.map(item =>
        `<div class="nota"><div>${esc(item.texto)}</div><strong>${money(item.valor)}</strong></div>`
    ).join("")}</div></section>`;
}
async function quitarEmp(numero) {
    if (temPendente()) {
        showBanner("Salve as alterações deste empréstimo antes de quitar.");
        return;
    }
    if (!confirm(`Quitar o empréstimo ${numero} em ${mesFull(mesAtual())}? O saldo restante será registrado como pago e os meses seguintes ficarão zerados.`)) return;
    setStatus("load", "Quitando...");
    try {
        dados = await post("/api/emprestimo/quitar", { mes: mesAtual(), emprestimo: numero });
        CAMPOS = dados.campos || CAMPOS;
        limparRascunhos();
        setStatus("ok", "Empréstimo quitado");
        showBanner((dados.avisos || []).join(" "));
        render();
    } catch (erro) {
        setStatus("err", "Não foi possível quitar");
        showBanner(erro.message);
    }
}
function coletarEmprestimos() {
    const mes = mesAtual();
    const lista = [];
    document.querySelectorAll("#viewEmprestimos tr[data-id]").forEach(linha => {
        if (!linha.dataset.id || linha.dataset.mes === mes) return;
        lista.push({
            id: Number(linha.dataset.id),
            mes: linha.dataset.mes,
            emprestimo: Number(linha.dataset.emp),
            pago: linha.querySelector('[data-role="row-pago"]')?.classList.contains("on"),
            alterar_valores: false
        });
    });
    document.querySelectorAll("#viewEmprestimos .card[data-emp]").forEach(card => {
        const id = card.querySelector(".emp-id").value;
        lista.push({
            id: id ? Number(id) : null,
            mes,
            emprestimo: Number(card.querySelector(".emp-n").value),
            saldo_inicio: num(card.dataset.saldo),
            pagamento: num(card.querySelector(".pag").value),
            pago: card.querySelector('[data-role="card-pago"]')?.classList.contains("on"),
            alterar_valores: Math.abs(num(card.querySelector(".pag").value) - num(card.dataset.pagamento)) > 0.009
        });
    });
    return lista;
}
function validarAntesDeSalvar() {
    if (view === "contabilidade") {
        const row = coletarMes();
        const nomes = [["Salário", row.salario], ...CAMPOS.map(campo => [campo.label, row[campo.id]])];
        const invalido = nomes.find(([, valor]) => valor < 0);
        if (invalido) return `${invalido[0]} não pode ser negativo.`;
        return "";
    }
    const nu = document.getElementById("c_emprestimo_nu");
    if (nu && num(nu.value) < 0) return "Empréstimo Nu não pode ser negativo.";
    const estourado = [...document.querySelectorAll("#viewEmprestimos .card[data-emp]")].find(card => {
        return num(card.querySelector(".pag").value) > num(card.querySelector(".saldo").value);
    });
    if (estourado) return `No empréstimo ${estourado.dataset.emp}, o pagamento não pode passar do saldo.`;
    return "";
}

function ligarRodapes() {
    document.querySelectorAll("[data-desfazer-cat]").forEach(botao => {
        botao.addEventListener("click", () => desfazerCard(botao.dataset.desfazerCat));
    });
    document.querySelectorAll("[data-salvar-cat]").forEach(botao => {
        botao.addEventListener("click", () => salvarCard(botao.dataset.salvarCat, botao));
    });
}
function desfazerCard(catId) {
    const salvo = linhaSalva();
    const row = coletarMes();
    if (catId === "receita") row.salario = num(salvo.salario);
    else {
        const ids = idsDoCard(catId);
        ids.forEach(id => { row[id] = num(salvo[id]); });
        const pagos = new Set(row.itens_pagos || []);
        const pagosSalvos = new Set(salvo.itens_pagos || []);
        ids.forEach(id => { if (pagosSalvos.has(id)) pagos.add(id); else pagos.delete(id); });
        row.itens_pagos = [...pagos];
        const entra = new Set(row.entra && row.entra.length ? row.entra : idsEntra(row));
        const entraSalva = new Set(idsEntra(salvo));
        ids.forEach(id => { if (entraSalva.has(id)) entra.add(id); else entra.delete(id); });
        row.entra = CAMPOS.map(campo => campo.id).filter(id => entra.has(id));
    }
    normalizarRascunho(row);
    render();
}
async function salvarCard(catId, botao) {
    const atual = coletarMes();
    if (catId === "receita" && num(atual.salario) < 0) {
        showBanner("Salário não pode ser negativo.");
        return;
    }
    const invalido = CAMPOS.find(campo => idsDoCard(catId).includes(campo.id) && num(atual[campo.id]) < 0);
    if (invalido) {
        showBanner(`${invalido.label} não pode ser negativo.`);
        return;
    }
    if (!cardDifere(catId, atual, linhaSalva())) return;
    ocupar(botao, true);
    setStatus("load", "Salvando...");
    try {
        const payload = payloadDoCard(catId);
        const manter = snapshotOutros(catId);
        dados = await post("/api/contabilidade", payload);
        CAMPOS = dados.campos || CAMPOS;
        CATEGORIAS = dados.categorias || CATEGORIAS;
        reaplicarOutros(manter);
        setStatus("ok", "Alterações salvas");
        showBanner("");
        preencherFiltros();
        render();
    } catch (erroSalvar) {
        setStatus("err", "Não foi possível salvar");
        showBanner(erroSalvar.message);
        ocupar(botao, false);
        atualizarRodapes();
    }
}
function oliveiraPagoPayload(base) {
    const mes = mesAtual();
    const doMes = (base.emprestimos || []).filter(item => item.mes === mes && num(item.pagamento) > 0);
    const row = (base.contabilidade || []).find(item => item.mes === mes);
    if (!row || !doMes.length) return null;
    const pagos = new Set(listaPagos(row));
    const deve = doMes.every(item => item.pago);
    if (deve === pagos.has("oliveira")) return null;
    if (deve) pagos.add("oliveira");
    else pagos.delete("oliveira");
    return { mes, itens_pagos: [...pagos] };
}
async function criarEmprestimo(evento) {
    evento.preventDefault();
    const numero = vagaEmprestimo();
    const form = evento.target;
    const saldo = num(form.saldo.value);
    const pagamento = num(form.pagamento.value);
    if (!numero) {
        showBanner("Os dois empréstimos já estão em uso.");
        return;
    }
    if (saldo <= 0) {
        showBanner("Informe o saldo inicial.");
        return;
    }
    if (pagamento < 0) {
        showBanner("A parcela não pode ser negativa.");
        return;
    }
    if (pagamento > saldo) {
        showBanner("A parcela não pode passar do saldo.");
        return;
    }
    const botao = form.querySelector("button");
    ocupar(botao, true);
    setStatus("load", "Criando empréstimo...");
    try {
        const existente = (dados.emprestimos || []).find(item => item.mes === mesAtual() && Number(item.emprestimo) === numero);
        dados = await post("/api/emprestimo", {
            id: existente ? existente.id : null,
            mes: mesAtual(),
            emprestimo: numero,
            saldo_inicio: saldo,
            pagamento,
            pago: false,
            alterar_valores: true
        });
        limparRascunhos();
        setStatus("ok", "Empréstimo adicionado");
        showBanner("");
        preencherFiltros();
        render();
    } catch (erro) {
        setStatus("err", "Não foi possível criar");
        showBanner(erro.message);
        ocupar(botao, false);
    }
}
async function salvarEmpCard(numero, botao) {
    const card = document.querySelector(`#viewEmprestimos .card[data-emp="${numero}"]`);
    if (!card) return;
    const pagamento = num(card.querySelector(".pag").value);
    const saldo = num(card.querySelector(".saldo").value);
    if (pagamento < 0) {
        showBanner("O pagamento não pode ser negativo.");
        return;
    }
    if (pagamento > saldo) {
        showBanner(`No empréstimo ${numero}, o pagamento não pode passar do saldo.`);
        return;
    }
    ocupar(botao, true);
    setStatus("load", "Salvando...");
    try {
        guardarEmpEditados();
        const lista = coletarEmprestimos().filter(item => item.emprestimo === Number(numero));
        dados = await api("/api/emprestimos/lote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emprestimos: lista })
        });
        const avisos = dados.avisos || [];
        const ajuste = oliveiraPagoPayload(dados);
        if (ajuste) {
            dados = await api("/api/contabilidade", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(ajuste)
            });
        }
        delete rascunhoEmp[String(numero)];
        sujo = temPendente();
        setStatus("ok", "Alterações salvas");
        showBanner(avisos.join(" "), avisos.length ? "warn" : "");
        render();
    } catch (erroSalvar) {
        setStatus("err", "Não foi possível salvar");
        showBanner(erroSalvar.message);
        ocupar(botao, false);
        atualizarBotoesEmp();
    }
}
async function salvarNu(botao) {
    const campo = document.getElementById("c_emprestimo_nu");
    if (!campo) return;
    if (num(campo.value) < 0) {
        showBanner("Empréstimo Nu não pode ser negativo.");
        return;
    }
    ocupar(botao, true);
    setStatus("load", "Salvando...");
    try {
        const info = nuSemPendencia(mesAtual());
        const pagos = new Set(listaPagos(info.row));
        if (document.querySelector('[data-role="nu-pago"]')?.classList.contains("on")) pagos.add("emprestimo_nu");
        else pagos.delete("emprestimo_nu");
        dados = await api("/api/contabilidade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mes: mesAtual(), emprestimo_nu: num(campo.value), itens_pagos: [...pagos] })
        });
        rascunhoNu = null;
        sujo = temPendente();
        setStatus("ok", "Alterações salvas");
        showBanner("");
        render();
    } catch (erroSalvar) {
        setStatus("err", "Não foi possível salvar");
        showBanner(erroSalvar.message);
        ocupar(botao, false);
        atualizarBotoesEmp();
    }
}
function desfazerEmp(numero) {
    delete rascunhoEmp[String(numero)];
    sujo = temPendente();
    render();
}
function desfazerNu() {
    rascunhoNu = null;
    sujo = temPendente();
    render();
}

async function recarregar(manterRascunho) {
    const guardar = manterRascunho && rascunho ? JSON.parse(JSON.stringify(rascunho)) : null;
    const estavaSujo = Boolean(manterRascunho && guardar);
    dados = await api("/api/dados");
    CAMPOS = dados.campos || [];
    CATEGORIAS = dados.categorias || [];
    if (estavaSujo) {
        const salva = linhaSalva();
        if (guardar.salario == null) guardar.salario = salva.salario;
        CAMPOS.forEach(campo => {
            if (guardar[campo.id] == null) guardar[campo.id] = salva[campo.id];
        });
        rascunho = guardar;
        sujo = true;
    } else {
        rascunho = null;
        sujo = temPendente();
    }
    preencherFiltros();
    render();
}
function ligarAcoesLinha() {
    const todos = seletor => document.querySelectorAll(seletor);
    todos("[data-entra]").forEach(botao => botao.addEventListener("click", () => alternarEntra(botao.dataset.entra)));
    todos("[data-editar]").forEach(botao => botao.addEventListener("click", () => alternarEdicao(botao.dataset.editar)));
    todos("form[data-form-item]").forEach(form => {
        form.addEventListener("submit", evento => salvarEdicao(evento, form.dataset.formItem));
        form.querySelector("[data-cancelar-edicao]").addEventListener("click", () => fecharEdicao(form));
        form.addEventListener("keydown", evento => { if (evento.key === "Escape") fecharEdicao(form); });
    });
    todos("[data-abrir-form]").forEach(botao => botao.addEventListener("click", () => alternarFormAdicao(botao)));
    todos("[data-fechar-form]").forEach(botao => botao.addEventListener("click", () => fecharFormAdicao(botao.closest("form"))));
    todos(".form-adicionar").forEach(form => form.addEventListener("keydown", evento => { if (evento.key === "Escape") fecharFormAdicao(form); }));
    todos("[data-renomear-cat]").forEach(botao => botao.addEventListener("click", () => alternarEdicaoCategoria(botao.dataset.renomearCat)));
    todos("[data-excluir-cat]").forEach(botao => botao.addEventListener("click", () => excluirCategoria(botao.dataset.excluirCat)));
    todos("form[data-form-cat]").forEach(form => {
        form.addEventListener("submit", evento => salvarCategoria(evento, form.dataset.formCat));
        form.querySelector("[data-cancelar-cat]").addEventListener("click", () => alternarEdicaoCategoria(form.dataset.formCat));
    });
    todos("[data-ocultar]").forEach(botao => botao.addEventListener("click", () => mudarCard(botao.dataset.ocultar, { ativo: false })));
    todos("[data-excluir]").forEach(botao => botao.addEventListener("click", () => excluirCampo(botao.dataset.excluir)));
    todos("[data-restaurar]").forEach(botao => botao.addEventListener("click", () => mudarCard(botao.dataset.restaurar, { ativo: true })));
    todos("[data-nota]").forEach(botao => botao.addEventListener("click", () => editarNota(botao.dataset.nota)));
    todos("[data-nota-x]").forEach(botao => botao.addEventListener("click", () => excluirNota(botao.dataset.notaX)));
}
function fecharEdicao(form) {
    form.reset();
    form.classList.add("hidden");
    const botao = document.querySelector(`[data-editar="${form.dataset.formItem}"]`);
    if (botao) {
        botao.setAttribute("aria-expanded", "false");
        botao.focus();
    }
}
function alternarEdicao(id) {
    const form = document.querySelector(`form[data-form-item="${id}"]`);
    if (!form) return;
    const abrir = form.classList.contains("hidden");
    document.querySelectorAll("form[data-form-item]:not(.hidden)").forEach(outro => {
        if (outro === form) return;
        outro.reset();
        outro.classList.add("hidden");
        const botaoOutro = document.querySelector(`[data-editar="${outro.dataset.formItem}"]`);
        if (botaoOutro) botaoOutro.setAttribute("aria-expanded", "false");
    });
    if (!abrir) {
        fecharEdicao(form);
        return;
    }
    form.classList.remove("hidden");
    document.querySelector(`[data-editar="${id}"]`).setAttribute("aria-expanded", "true");
    form.elements.nome.focus();
    form.elements.nome.select();
}
function alternarFormAdicao(botao) {
    const bloco = botao.closest(".adicionar-item");
    const alvo = bloco && bloco.querySelector(`form[data-form="${botao.dataset.abrirForm}"]`);
    if (!alvo) return;
    const abrir = alvo.classList.contains("hidden");
    bloco.querySelectorAll("form").forEach(form => { form.reset(); form.classList.add("hidden"); });
    bloco.querySelectorAll("[data-abrir-form]").forEach(item => item.setAttribute("aria-expanded", "false"));
    if (!abrir) return;
    alvo.classList.remove("hidden");
    botao.setAttribute("aria-expanded", "true");
    alvo.elements.label.focus();
}
function fecharFormAdicao(form) {
    if (!form) return;
    const bloco = form.closest(".adicionar-item");
    form.reset();
    form.classList.add("hidden");
    if (!bloco) return;
    const botao = bloco.querySelector(`[data-abrir-form="${form.dataset.form}"]`);
    if (botao) {
        botao.setAttribute("aria-expanded", "false");
        botao.focus();
    }
}
function alternarEdicaoCategoria(id) {
    const form = document.querySelector(`form[data-form-cat="${id}"]`);
    if (!form) return;
    const abrir = form.classList.contains("hidden");
    form.reset();
    form.classList.toggle("hidden", !abrir);
    if (abrir) {
        form.elements.label.focus();
        form.elements.label.select();
    }
}
function alternarEntra(id) {
    const row = coletarMes();
    const conjunto = new Set(row.entra || []);
    if (conjunto.has(id)) conjunto.delete(id);
    else conjunto.add(id);
    row.entra = CAMPOS.map(campo => campo.id).filter(item => conjunto.has(item));
    rascunho = row;
    sujo = true;
    render();
}
function nomeJaExiste(categoria, nome, ignorarId) {
    const alvo = normalizarNome(nome);
    return CAMPOS.some(campo => campo.id !== ignorarId && campo.categoria === categoria && normalizarNome(campo.label) === alvo);
}
async function salvarEdicao(evento, id) {
    evento.preventDefault();
    const form = evento.target;
    const campo = CAMPOS.find(item => item.id === id);
    if (!campo) return;
    const nome = form.elements.nome.value.replace(/\s+/g, " ").trim();
    const dica = form.elements.dica.value.replace(/\s+/g, " ").trim();
    const vencimento = form.elements.vencimento.value.trim();
    const categoria = form.elements.categoria ? form.elements.categoria.value : campo.categoria;
    if (nome.length < 2) {
        showBanner("O nome precisa ter ao menos 2 caracteres.");
        form.elements.nome.focus();
        return;
    }
    if (nome !== campo.label && nomeJaExiste(categoria, nome, id)) {
        showBanner("Já existe um item com esse nome nesta categoria.");
        form.elements.nome.focus();
        return;
    }
    const mudancas = {};
    if (nome !== campo.label) mudancas.label = nome;
    if (dica !== (campo.dica || "")) mudancas.dica = dica;
    if (vencimento !== String(campo.vencimento || "")) mudancas.vencimento = vencimento;
    if (form.elements.cartao && form.elements.cartao.value !== (campo.cartao || "")) mudancas.cartao = form.elements.cartao.value;
    if (categoria !== campo.categoria) mudancas.categoria = categoria;
    if (!Object.keys(mudancas).length) {
        fecharEdicao(form);
        return;
    }
    await mudarCard(id, mudancas);
}
async function mudarCard(id, mudancas) {
    const campo = CAMPOS.find(item => item.id === id) || (dados.ocultos || []).find(item => item.id === id);
    if (!campo) return;
    if (mudancas.ativo === false && !confirm(`Ocultar “${campo.label}” desta tela?\n\nOs valores continuam salvos e o item pode ser restaurado na seção Itens ocultos.`)) return;
    setStatus("load", "Atualizando item...");
    try {
        dados = await post("/api/cards/atualizar", { id, ...mudancas });
        if (mudancas.ativo === true) revelados.add(id);
        await recarregar(true);
        setStatus("ok", mudancas.ativo === true ? "Item restaurado" : mudancas.ativo === false ? "Item ocultado" : "Item atualizado");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Não foi possível atualizar");
        showBanner(erro.message);
    }
}
async function excluirCampo(id) {
    const campo = CAMPOS.find(item => item.id === id);
    if (!campo) return;
    if (!confirm(`Excluir “${campo.label}”?\n\nO item e os valores dele em todos os meses serão removidos. Esta ação não pode ser desfeita.`)) return;
    setStatus("load", "Excluindo item...");
    try {
        dados = await post("/api/cards/excluir", { id });
        await recarregar(true);
        setStatus("ok", "Item excluído");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Não foi possível excluir");
        showBanner(erro.message);
    }
}
async function salvarCategoria(evento, id) {
    evento.preventDefault();
    const form = evento.target;
    const nome = form.elements.label.value.replace(/\s+/g, " ").trim();
    const atual = CATEGORIAS.find(item => item.id === id);
    if (!atual) return;
    if (nome === atual.label) {
        alternarEdicaoCategoria(id);
        return;
    }
    setStatus("load", "Atualizando categoria...");
    try {
        dados = await post("/api/categorias/atualizar", { id, label: nome });
        await recarregar(true);
        preencherFiltros();
        setStatus("ok", "Categoria atualizada");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Não foi possível atualizar");
        showBanner(erro.message);
    }
}
async function excluirCategoria(id) {
    const grupo = CATEGORIAS.find(item => item.id === id);
    if (!grupo) return;
    const temItens = CAMPOS.some(campo => campo.categoria === id) || (dados.ocultos || []).some(campo => campo.categoria === id);
    if (temItens) {
        showBanner("Exclua ou mova os itens desta categoria antes de removê-la.");
        return;
    }
    if (!confirm(`Excluir a categoria “${grupo.label}”?`)) return;
    setStatus("load", "Excluindo categoria...");
    try {
        dados = await post("/api/categorias/excluir", { id });
        await recarregar(true);
        setStatus("ok", "Categoria excluída");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Não foi possível excluir");
        showBanner(erro.message);
    }
}
async function criarLinha(evento) {
    evento.preventDefault();
    const form = evento.target;
    const botao = form.querySelector('button[type="submit"]');
    ocupar(botao, true);
    try {
        if (form.dataset.modo === "fatura") {
            const valor = num(form.valor.value);
            if (valor <= 0) throw new Error("Informe um valor maior que zero para lançar na fatura.");
            setStatus("load", "Lançando na fatura...");
            dados = await post("/api/observacao", {
                mes: mesAtual(),
                texto: form.label.value,
                apelido: form.cartao.value,
                valor,
                tipo: "fatura"
            });
            await recarregar(true);
            setStatus("ok", "Lançamento adicionado à fatura");
            showBanner("");
            return;
        }
        const categoria = form.closest(".card")?.dataset.cat;
        const valorNovo = form.valor ? num(form.valor.value) : 0;
        setStatus("load", "Adicionando item...");
        const existente = campoZerado(categoria, form.label.value);
        if (existente && form.valor) {
            if (valorNovo <= 0) throw new Error(`“${existente.label}” já existe e está sem valor neste mês. Informe um valor maior que zero para atualizá-lo.`);
            dados = await post("/api/contabilidade", { mes: mesAtual(), [existente.id]: valorNovo });
            revelados.add(existente.id);
        } else {
            if (nomeJaExiste(categoria, form.label.value)) throw new Error("Já existe um item com esse nome nesta categoria.");
            dados = await post("/api/cards", {
                label: form.label.value,
                categoria,
                cartao: form.cartao ? form.cartao.value : "",
                vencimento: form.vencimento ? form.vencimento.value : "",
                valor: valorNovo,
                mes: mesAtual(),
                entra_padrao: true
            });
        }
        await recarregar(true);
        setStatus("ok", "Item adicionado");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Não foi possível adicionar");
        showBanner(erro.message);
    } finally {
        ocupar(botao, false);
    }
}
async function criarCard(evento) {
    evento.preventDefault();
    const form = evento.target;
    const botao = form.querySelector('button[type="submit"]');
    ocupar(botao, true);
    setStatus("load", "Adicionando item...");
    try {
        const nova = form.categoria.value === "__nova__";
        if (nova && !form.nova_categoria.value.trim()) throw new Error("Informe o nome da nova categoria.");
        if (!nova && nomeJaExiste(form.categoria.value, form.label.value)) throw new Error("Já existe um item com esse nome nesta categoria.");
        dados = await post("/api/cards", {
            label: form.label.value,
            categoria: nova ? "" : form.categoria.value,
            nova_categoria: nova ? form.nova_categoria.value : "",
            vencimento: form.vencimento.value,
            entra_padrao: form.entra.checked,
            cartao: form.cartao.value,
            valor: num(form.valor.value),
            mes: mesAtual()
        });
        await recarregar(true);
        setStatus("ok", "Item adicionado");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Não foi possível adicionar");
        showBanner(erro.message);
    } finally {
        ocupar(botao, false);
    }
}
function editarNota(id) {
    const nota = (dados.observacoes || []).find(item => String(item.id) === String(id));
    const form = document.getElementById("formNota");
    if (!nota || !form) return;
    form.notaId.value = nota.id;
    form.dataset.tipo = nota.tipo || "nota";
    form.texto.value = nota.texto;
    form.apelido.value = nota.apelido || "";
    form.valor.value = fmtBrl(nota.valor);
    document.getElementById("notaTitulo").textContent = "Editar anotação";
    document.getElementById("notaSalvar").textContent = "Salvar alterações";
    form.querySelector("[data-cancelar-nota]").classList.remove("hidden");
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    form.texto.focus();
}
async function salvarNota(evento) {
    evento.preventDefault();
    const form = evento.target;
    const botao = document.getElementById("notaSalvar");
    const edicao = Boolean(form.notaId.value);
    ocupar(botao, true);
    setStatus("load", "Salvando anotação...");
    try {
        dados = await post("/api/observacao", {
            id: form.notaId.value || null,
            mes: mesAtual(),
            texto: form.texto.value,
            apelido: form.apelido.value,
            valor: num(form.valor.value),
            tipo: form.dataset.tipo || "nota"
        });
        await recarregar(true);
        setStatus("ok", edicao ? "Anotação atualizada" : "Anotação adicionada");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Não foi possível salvar a anotação");
        showBanner(erro.message);
        ocupar(botao, false);
    }
}
async function excluirNota(id) {
    if (!confirm("Excluir este item?\n\nEsta ação não pode ser desfeita.")) return;
    try {
        dados = await post("/api/observacao/excluir", { id: Number(id) });
        await recarregar(true);
        setStatus("ok", "Item excluído");
        showBanner("");
    } catch (erro) {
        showBanner(erro.message);
    }
}
function pendentes(row) {
    return itensDoMes(row).filter(item => item.valor > 0 && !item.pago);
}
function corDoItem(id) {
    const campo = CAMPOS.find(item => item.id === id);
    if (!campo) return "";
    if (campo.categoria === "cartoes") return ` cartao-${campo.id}`;
    if (naFatura(campo)) return ` cartao-${campo.cartao}`;
    return "";
}
function comTotais(row) {
    const conta = somas(row);
    return { ...row, total_a_pagar: conta.total, valor_pago: conta.pago, valor_faltante: conta.faltante, sobra: conta.sobra };
}
function renderPainel() {
    const mes = mesAtual();
    const atual = (dados.contabilidade || []).find(item => item.mes === mes) || {};
    const conta = somas(atual);
    const pagos = new Set(listaPagos(atual));
    const abertos = pendentes(atual);
    pintarKpis([
        ["Total de despesas", money(conta.total), ""],
        ["Total pago", money(conta.pago), "pos"],
        ["Pendente", money(conta.faltante), conta.faltante > 0 ? "warn" : ""],
        ["Saldo do mês", money(conta.sobra), conta.sobra >= 0 ? "pos" : "neg"]
    ]);
    colocarChip("");
    const listaAberta = abertos.map(item => `<div class="nota${corDoItem(item.id)}"><div>${esc(item.label)}</div><strong>${money(item.valor)}</strong></div>`).join("");
    const cobrancas = CAMPOS.filter(campo => campo.vencimento).map(campo => {
        const pago = pagos.has(campo.id);
        const prazo = prazoTexto(campo, pago, mes);
        const naFaturaDoCartao = naFatura(campo);
        const vinculo = naFaturaDoCartao ? `${tagCartao(campo.cartao)}<span class="tag">Já entra na fatura</span>` : "";
        return `<div class="nota${corDoItem(campo.id)}"><div>${esc(campo.label)} <span class="${prazo ? prazo.cls : "tag"}">${esc(prazo ? prazo.texto : "Cobrança no dia " + campo.vencimento)}</span> ${vinculo}</div><strong>${money(atual[campo.id])}</strong></div>`;
    }).join("");
    document.getElementById("viewPainel").innerHTML = `
        <section class="hero">
            <span>Salário</span>
            <strong>${money(atual.salario)}</strong>
            <p>Valor principal de ${esc(mesFull(mes))}.</p>
        </section>
        <div id="graficoPainel"></div>
        <section class="card cat cat-vencimentos"><div class="card-head"><h3>Cobranças de ${esc(mesFull(mes))}</h3><button class="mini" id="abrirMes" type="button">Abrir lançamentos</button></div><div class="card-body">${cobrancas || "<p class=\"meta\">Nenhum item com dia de cobrança cadastrado.</p>"}<p class="conta-regra">Itens vinculados a um cartão já estão incluídos na fatura e não são somados novamente ao total.</p></div></section>
        <p class="conta-regra">${REGRA_SALDO}</p>
        <section class="card cat cat-pendente">
            <div class="card-head"><h3>Pendências do mês</h3><span class="meta">${abertos.length ? money(round2(abertos.reduce((acc, item) => acc + item.valor, 0))) : "Sem pendências"}</span></div>
            <div class="card-body">${listaAberta || "<p class=\"meta\">Nenhuma pendência neste mês.</p>"}</div>
        </section>
        `;
    montarGrafico(document.getElementById("graficoPainel"), {
        dados: { ...dados, contabilidade: (dados.contabilidade || []).map(comTotais) },
        campos: CAMPOS,
        categorias: CATEGORIAS,
        mes,
        irMes(destino) {
            document.getElementById("filtroMes").value = destino;
            mesAntes = destino;
            render();
        }
    });
    const abrir = document.getElementById("abrirMes");
    if (abrir) abrir.addEventListener("click", () => setView("contabilidade"));
    montarAtalhos();
}

function mostrarLogin() {
    document.getElementById("telaLogin").classList.remove("hidden");
    document.getElementById("quem").textContent = "";
}
function mostrarQuem(usuario) {
    contaAtual = usuario;
    document.getElementById("telaLogin").classList.add("hidden");
    document.getElementById("quem").textContent = usuario.usuario || usuario.email || "";
    document.getElementById("cfgUsuario").value = usuario.usuario || "";
    document.getElementById("cfgEmail").value = usuario.email || "";
}
async function carregar() {
    if (location.protocol === "file:") {
        showBanner("Abra o sistema pelo Iniciar.bat e acesse http://localhost:8765.");
        setStatus("err", "Servidor não detectado");
        return;
    }
    aplicarTema(localStorage.getItem("controle-aparencia") === "escuro");
    try {
        const sessao = await fetch("/api/sessao");
        if (!sessao.ok) {
            mostrarLogin();
            setStatus("err", "Faça login");
            return;
        }
        mostrarQuem(await sessao.json());
        dados = await api("/api/dados");
        CAMPOS = dados.campos || [];
        CATEGORIAS = dados.categorias || [];
        setStatus("ok", "Dados carregados");
        ajustarAcoes();
        preencherFiltros();
        render();
    } catch (erro) {
        showBanner("Não foi possível carregar os dados. Verifique se o servidor está em execução (Iniciar.bat). " + erro.message);
        setStatus("err", "Não foi possível carregar");
    }
}

document.querySelectorAll(".nav button").forEach(botao => botao.addEventListener("click", () => setView(botao.dataset.view)));
document.getElementById("filtroMes").addEventListener("change", () => {
    const seletor = document.getElementById("filtroMes");
    if (!podeDescartar()) {
        seletor.value = mesAntes;
        return;
    }
    limparRascunhos();
    mesAntes = seletor.value;
    render();
});
document.getElementById("filtroCat").addEventListener("change", render);
document.getElementById("btnExportar").addEventListener("click", () => { window.location = "/api/exportar/" + mesAtual(); });
document.getElementById("soAbertos").addEventListener("change", render);
document.getElementById("btnTema").addEventListener("click", () => aplicarTema(!document.body.classList.contains("escuro")));
document.getElementById("formLogin").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const erro = document.getElementById("loginErro");
    erro.textContent = "";
    try {
        const quem = await post("/api/login", {
            login: document.getElementById("loginCampo").value,
            senha: document.getElementById("senhaCampo").value
        });
        document.getElementById("senhaCampo").value = "";
        mostrarQuem(quem);
        await carregar();
    } catch (falha) {
        erro.textContent = falha.message;
    }
});
document.getElementById("formConta").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const erro = document.getElementById("cfgErro");
    const ok = document.getElementById("cfgOk");
    erro.textContent = "";
    ok.textContent = "";
    try {
        const quem = await post("/api/conta", {
            usuario: document.getElementById("cfgUsuario").value,
            email: document.getElementById("cfgEmail").value,
            senha_atual: document.getElementById("cfgSenhaAtual").value,
            senha_nova: document.getElementById("cfgSenhaNova").value
        });
        document.getElementById("cfgSenhaAtual").value = "";
        document.getElementById("cfgSenhaNova").value = "";
        mostrarQuem(quem);
        ok.textContent = "Dados atualizados.";
    } catch (falha) {
        erro.textContent = falha.message;
    }
});
document.getElementById("btnSair").addEventListener("click", async () => {
    await post("/api/sair", {});
    dados = { contabilidade: [], emprestimos: [], observacoes: [], alertas: [] };
    mostrarLogin();
    setStatus("err", "Faça login");
});
function destinoRolagem() {
    const main = document.querySelector(".main");
    return main.scrollHeight > main.clientHeight + 4 ? main : document.scrollingElement;
}
document.getElementById("btnTopo").addEventListener("click", () => {
    destinoRolagem().scrollTo({ top: 0, behavior: "smooth" });
});
document.getElementById("btnFim").addEventListener("click", () => {
    const alvo = destinoRolagem();
    alvo.scrollTo({ top: alvo.scrollHeight, behavior: "smooth" });
});
document.getElementById("kpisMini").addEventListener("click", evento => {
    const botao = evento.target.closest("[data-alvo]");
    if (botao) irParaCard(botao.dataset.alvo);
});
function aplicarTema(escuro) {
    document.body.classList.toggle("escuro", escuro);
    const texto = escuro ? "Tema claro" : "Tema escuro";
    const botao = document.getElementById("btnTema");
    botao.setAttribute("aria-label", texto);
    document.getElementById("rotuloTema").textContent = texto;
    localStorage.setItem("controle-aparencia", escuro ? "escuro" : "claro");
}
carregar();
