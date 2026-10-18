const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
let CAMPOS = [];
let CATEGORIAS = [];
let dados = { contabilidade: [], emprestimos: [], observacoes: [], alertas: [] };
let view = "painel";
let rascunho = null;
let sujo = false;
let mesAntes = "";
let historico = [];
let revelados = new Set();
const CARTOES = [
    ["", "Sem cartão"],
    ["bradesco", "Bradesco"],
    ["nubank", "Nubank"],
    ["mercado_pago", "Mercado Pago"]
];
const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2zm-2 6h10l-.8 12H7.8L7 9zm3.1 2.2v7.2h1.6v-7.2H10.1zm4.2 0v7.2h1.6v-7.2h-1.6z"/></svg>';
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
    const corpo = await resposta.json();
    if (!resposta.ok) throw new Error(corpo.erro || "Falha na operação");
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
function formatarDetalhe(formula) {
    if (!formula || /[^0-9.+-]/.test(formula)) return formula || "";
    return formula.split("+").map(parte => {
        const valor = Number(parte);
        return Number.isFinite(valor) ? fmtBrl(valor) : parte;
    }).join(" + ");
}
function prazoTexto(campo, pago, mes) {
    if (!campo.vencimento) return "";
    const dia = new Date().getDate();
    if (!pago && mes === hojeYm() && dia > campo.vencimento) return { cls: "tag late", texto: `Atrasado · dia ${campo.vencimento}` };
    if (!pago && mes === hojeYm()) return { cls: "tag due", texto: `Vence dia ${campo.vencimento}` };
    return { cls: "tag", texto: `Dia ${campo.vencimento}` };
}
function brlInput(id, valor, extra) {
    return `<div class="brl-wrap"><span>R$</span><input id="${id}" class="brl ${extra || ""}" inputmode="decimal" value="${fmtBrl(valor)}"></div>`;
}
function brlCampo(classe, valor) {
    return `<div class="brl-wrap"><span>R$</span><input class="brl ${classe}" inputmode="decimal" value="${fmtBrl(valor)}"></div>`;
}
function pagoBtn(ativo, attrs) {
    return `<button type="button" class="pago-btn ${ativo ? "on" : ""}" aria-pressed="${ativo}" ${attrs || ""}>${ativo ? "Pago" : "Em aberto"}</button>`;
}

function podeDescartar() {
    return !sujo || confirm("Há alterações não salvas neste mês. Deseja descartar?");
}
const TITULOS = {
    painel: ["Principal", "Salário, total a pagar, o que já foi pago, o faltante e a sobra do mês."],
    contabilidade: ["Lançamentos", "Pessoas, variáveis, assinaturas, cartões, custo fixo e taxas. O Nu fica em Empréstimos."],
    emprestimos: ["Empréstimos", "Dois empréstimos, com a parcela do mês, o que ainda falta e o saldo do mês seguinte. O Nu entra aqui."]
};
function ajustarAcoes() {
    document.getElementById("btnCopiar").classList.toggle("hidden", view !== "contabilidade");
    document.getElementById("btnDesfazer").classList.toggle("hidden", view !== "contabilidade");
    document.getElementById("soAbertosCampo").classList.toggle("hidden", view !== "contabilidade");
    document.getElementById("campoCat").classList.toggle("hidden", view === "painel");
    document.getElementById("btnSalvar").classList.toggle("hidden", view === "painel");
}
function setView(next) {
    if (next === view) return;
    if (!podeDescartar()) return;
    sujo = false;
    rascunho = null;
    historico = [];
    revelados = new Set();
    view = next;
    document.querySelectorAll(".nav button").forEach(botao => botao.classList.toggle("active", botao.dataset.view === next));
    const [titulo, sub] = TITULOS[next];
    document.getElementById("pageTitle").textContent = titulo;
    document.getElementById("pageSub").textContent = sub;
    document.getElementById("viewPainel").classList.toggle("hidden", next !== "painel");
    document.getElementById("viewContabilidade").classList.toggle("hidden", next !== "contabilidade");
    document.getElementById("viewEmprestimos").classList.toggle("hidden", next !== "emprestimos");
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
    const manter = mesSel.value || (meses.includes(hojeYm()) ? hojeYm() : (meses[0] || ""));
    mesSel.innerHTML = meses.map(mes => `<option value="${mes}">${mesFull(mes)}</option>`).join("");
    if (meses.includes(manter)) mesSel.value = manter;
    mesAntes = mesSel.value;
    const catManter = catSel.value || "todas";
    if (view === "emprestimos") {
        catSel.innerHTML = '<option value="todas">Total dos empréstimos</option><option value="1">Empréstimo 1</option><option value="2">Empréstimo 2</option>';
    } else {
        catSel.innerHTML = '<option value="todas">Todas as categorias</option>' + CATEGORIAS.map(cat => `<option value="${cat.id}">${cat.label}</option>`).join("");
    }
    if ([...catSel.options].some(opcao => opcao.value === catManter)) catSel.value = catManter;
}
function render() {
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
    const anterior = JSON.parse(JSON.stringify(rascunho || linhaSalva()));
    const proximo = coletarMes();
    if (assinatura(anterior) !== assinatura(proximo)) {
        historico.push(anterior);
        if (historico.length > 40) historico.shift();
    }
    rascunho = proximo;
    sujo = assinatura(proximo) !== assinatura(linhaSalva());
    atualizarTotais();
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
const LINHAS_TOTAL = ["das", "maximo", "oliveira", "gabriel", "aluguel", "variaveis", "internet", "emprestimo_nu", "gasolina", "investimento"];
function listaCartoes() {
    const lista = [["bradesco", "Bradesco"], ["nubank", "Nubank"], ["mercado_pago", "Mercado Pago"]];
    CAMPOS.filter(campo => campo.categoria === "cartoes").forEach(campo => {
        if (!lista.some(([id]) => id === campo.id)) lista.push([campo.id, campo.label]);
    });
    return lista;
}
function naFatura(campo) {
    return Boolean(campo && campo.categoria === "assinaturas" && campo.cartao);
}
function assinaturasDaFatura(cardId) {
    return CAMPOS.filter(campo => campo.categoria === "assinaturas" && campo.cartao === cardId);
}
function valorLinha(row, id) {
    const campo = document.getElementById("c_" + id);
    return campo ? num(campo.value) : num(row[id]);
}
function itensFatura(cardId, mes) {
    return (dados.observacoes || []).filter(nota => nota.mes === mes && nota.tipo === "fatura" && nota.apelido === cardId && num(nota.valor) > 0);
}
function acrescimoFatura(cardId, mes) {
    return round2(itensFatura(cardId, mes).reduce((acc, nota) => acc + num(nota.valor), 0));
}
function valorFatura(row, cardId) {
    const extra = assinaturasDaFatura(cardId).reduce((acc, campo) => acc + valorLinha(row, campo.id), 0);
    return round2(valorLinha(row, cardId) + extra + acrescimoFatura(cardId, row.mes));
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
    CAMPOS.filter(campo => ["pessoas", "variaveis", "custo_fixo", "taxas"].includes(campo.categoria) && !LINHAS_TOTAL.includes(campo.id)).forEach(campo => {
        itens.push({ id: campo.id, label: campo.label, valor: valorLinha(row, campo.id), pago: pagos.has(campo.id) });
    });
    return itens;
}
function textoInvestimento(valor) {
    const numero = num(valor);
    if (!Number.isFinite(numero) || numero <= 0) return "Nenhum valor";
    return money(numero);
}
function somas(row) {
    const itens = componentes(row);
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

function renderContab() {
    const row = rascunho || linhaSalva();
    const cat = document.getElementById("filtroCat").value;
    const grupos = CATEGORIAS.filter(grupo => cat === "todas" || grupo.id === cat);
    const pagos = new Set(row.itens_pagos || []);
    const entra = new Set(idsEntra(row));
    document.getElementById("viewContabilidade").innerHTML = `
        <div class="card cat cat-receita">
            <div class="card-head"><h3>Receita</h3></div>
            <div class="card-body">
                <div class="row simple"><div><label>Salário</label></div>${brlInput("cSalario", row.salario)}</div>
            </div>
        </div>
        <div class="cats">${grupos.map(grupo => cardCategoria(grupo, row, entra, pagos)).join("")}</div>
        ${renderNotas(row.mes)}
        ${renderNovoCard()}
        ${renderOcultos()}
        <div class="card cat cat-totais"><div class="totals" id="totais"></div></div>`;
    document.querySelectorAll("#viewContabilidade input.brl").forEach(ligarBrl);
    document.querySelectorAll("#viewContabilidade .pago-btn").forEach(botao => {
        botao.addEventListener("click", () => {
            alternarPago(botao);
            lembrar();
        });
    });
    ligarAcoesLinha();
    document.querySelectorAll("[data-mostrar-btn]").forEach(botao => botao.addEventListener("click", () => {
        const select = document.querySelector(`[data-mostrar="${botao.dataset.mostrarBtn}"]`);
        if (!select || !select.value) return;
        revelados.add(select.value);
        render();
    }));
    document.querySelectorAll(".form-linha-card").forEach(form => form.addEventListener("submit", criarLinha));
    const formNota = document.getElementById("formNota");
    if (formNota) formNota.addEventListener("submit", salvarNota);
    const formCard = document.getElementById("formCard");
    if (formCard) formCard.addEventListener("submit", criarCard);
    atualizarTotais();
}
function opcoesCartao(atual) {
    const opcoes = [["", "Não somar"], ...listaCartoes()];
    return opcoes.map(([id, nome]) => `<option value="${id}" ${id === (atual || "") ? "selected" : ""}>${nome}</option>`).join("");
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
    const visiveis = campos.filter(campo => sempre || num(row[campo.id]) !== 0 || revelados.has(campo.id));
    const escondidos = sempre ? [] : campos.filter(campo => num(row[campo.id]) === 0 && !revelados.has(campo.id));
    const somaDentro = round2(campos.filter(campo => entra.has(campo.id)).reduce((acc, campo) => acc + num(row[campo.id]), 0));
    const somaFora = round2(campos.filter(campo => !entra.has(campo.id)).reduce((acc, campo) => acc + num(row[campo.id]), 0));
    const tudoFora = campos.length > 0 && campos.every(campo => !entra.has(campo.id));
    let meta = money(tudoFora ? somaFora : somaDentro);
    if (grupo.id === "cartoes") meta = money(round2(campos.reduce((acc, campo) => acc + valorFatura(row, campo.id), 0)));
    else if (!tudoFora && somaFora) meta += ` · fora ${money(somaFora)}`;
    const subtotal = grupo.id === "taxas"
        ? `<div class="subtotal"><span>Subtotal do investimento</span><strong>${textoInvestimento(row.investimento)}</strong><small>Sai do salário e entra no total a pagar.</small></div>`
        : "";
    const adicionar = escondidos.length
        ? `<div class="adicionar"><select data-mostrar="${grupo.id}">${escondidos.map(campo => `<option value="${campo.id}">${esc(campo.label)}</option>`).join("")}</select><button type="button" class="btn ghost" data-mostrar-btn="${grupo.id}">Adicionar linha</button></div>`
        : "";
    return `<section class="card cat cat-${grupo.id}" data-cat="${grupo.id}">
        <div class="card-head"><h3>${icone(grupo.icone)}${esc(grupo.label)}</h3><span class="meta">${meta}</span></div>
        <div class="card-body">
            ${visiveis.map(campo => linhaCampo(campo, row, entra, pagos)).join("") || "<p class=\"meta\">Nada a pagar neste mês.</p>"}
            ${subtotal}
            ${adicionar}
            ${formDoCard(grupo)}
        </div>
    </section>`;
}
function formDoCard(grupo) {
    if (grupo.id === "cartoes") {
        const opcoes = listaCartoes().map(([id, nome]) => `<option value="${id}">${esc(nome)}</option>`).join("");
        return `<form class="form-linha form-linha-card" data-modo="fatura">
                <label class="field"><span>Descrição</span><input name="label" required maxlength="80" placeholder="O que entrou na fatura"></label>
                <label class="field"><span>Valor</span><input name="valor" class="brl" inputmode="decimal" value="0,00"></label>
                <label class="field"><span>Fatura</span><select name="cartao">${opcoes}</select></label>
                <button class="btn" type="submit">Adicionar na fatura</button>
            </form>
            <form class="form-linha form-linha-card">
                <label class="field"><span>Novo cartão</span><input name="label" required maxlength="60" placeholder="Nome do cartão"></label>
                <button class="btn" type="submit">Adicionar cartão</button>
            </form>`;
    }
    if (!["pessoas", "variaveis", "assinaturas", "custo_fixo", "taxas"].includes(grupo.id)) return "";
    const dia = grupo.id === "assinaturas"
        ? `<label class="field"><span>Vence dia</span><input name="vencimento" inputmode="numeric" placeholder="opcional"></label>`
        : "";
    const cartao = grupo.id === "assinaturas"
        ? `<label class="field"><span>Somar na fatura</span><select name="cartao">${opcoesCartao("")}</select></label>`
        : "";
    return `<form class="form-linha form-linha-card">
        <label class="field"><span>Nome</span><input name="label" required maxlength="60" placeholder="Nome"></label>
        <label class="field"><span>Valor deste mês</span><input name="valor" class="brl" inputmode="decimal" value="0,00"></label>
        ${dia}
        ${cartao}
        <button class="btn" type="submit">Adicionar</button>
    </form>`;
}
function linhaCampo(campo, row, entra, pagos) {
    const ativo = pagos.has(campo.id);
    const sempreTotal = LINHAS_TOTAL.includes(campo.id) || ["cartoes", "custo_fixo", "pessoas", "variaveis", "taxas"].includes(campo.categoria);
    const fora = !sempreTotal && !naFatura(campo) && !entra.has(campo.id);
    const prazo = prazoTexto(campo, ativo, row.mes);
    const atrasado = prazo && prazo.cls.includes("late");
    const tags = [];
    if (fora) tags.push('<span class="tag out">Fora do total</span>');
    if (campo.categoria === "assinaturas") {
        tags.push(tagCartao(campo.cartao) || '<span class="tag">Fora da fatura</span>');
    }
    if (naFatura(campo)) tags.push('<span class="tag">Somada na fatura</span>');
    if (campo.id === "oliveira" && row.oliveira_calculado) tags.push('<span class="tag calc">Calculado</span>');
    if (prazo) tags.push(`<span class="${prazo.cls}">${esc(prazo.texto)}</span>`);
    const detalhe = formatarDetalhe((row.detalhes || {})[campo.id]);
    const dica = [campo.dica, detalhe].filter(Boolean).join(" · ");
    const bloqueado = campo.id === "oliveira" && row.oliveira_calculado ? "readonly" : "";
    const noTotal = entra.has(campo.id);
    const contaFatura = campo.categoria === "cartoes"
        ? itensFatura(campo.id, row.mes).map(nota => `<p class="fatura-item"><span>${esc(nota.texto)}</span><strong>${money(nota.valor)}</strong><button type="button" class="lixo-inline" title="Apagar" aria-label="Apagar ${esc(nota.texto)}" data-nota-x="${nota.id}">${ICONE_LIXEIRA}</button></p>`).join("")
        : "";
    return `<div class="row ${fora ? "fora" : ""} ${ativo ? "is-pago" : ""} ${atrasado ? "atrasado" : ""}">
        <div class="linha-nome">
            <label>${esc(campo.label)}</label>
            ${tags.length || dica ? `<div class="tags">${tags.join("")}${dica ? `<span>${esc(dica)}</span>` : ""}</div>` : ""}
            ${contaFatura}
        </div>
        ${pagoBtn(ativo, `data-campo="${campo.id}"`)}
        <div class="brl-wrap"><span>R$</span><input id="c_${campo.id}" class="brl" inputmode="decimal" ${bloqueado} value="${fmtBrl(row[campo.id])}"></div>
        <div class="linha-acoes">
            ${campo.categoria === "assinaturas"
                ? ""
                : sempreTotal
                    ? `<span class="tag">Entra no total</span>`
                    : `<button type="button" class="mini ${noTotal ? "on" : ""}" data-entra="${campo.id}">${noTotal ? "No total" : "Fora do total"}</button>`}
            <button type="button" class="mini" data-repetir="${campo.id}">Repetir até dezembro</button>
            <button type="button" class="mini" data-renomear="${campo.id}">Renomear</button>
            ${campo.categoria === "assinaturas" ? `<label class="mini-cartao">Somar na fatura<select data-cartao="${campo.id}">${opcoesCartao(campo.cartao)}</select></label>` : ""}
            <button type="button" class="mini icone-btn" title="Apagar" aria-label="Apagar ${esc(campo.label)}" ${campo.sistema ? `data-ocultar="${campo.id}"` : `data-excluir="${campo.id}"`}>${ICONE_LIXEIRA}</button>
        </div>
    </div>`;
}
function renderNotas(mes) {
    const notas = (dados.observacoes || []).filter(nota => nota.mes === mes && nota.tipo !== "nubank_total" && nota.tipo !== "fatura");
    const tipos = { nubank: "Cartão", pix: "Pix", ajuste: "Ajuste", nota: "Nota" };
    const linhas = notas.map(nota => `<div class="nota">
        <div><span class="tag">${esc(tipos[nota.tipo] || nota.tipo)}</span>${nota.apelido ? ` <span class="tag">${esc(nota.apelido)}</span>` : ""} ${esc(nota.texto)}</div>
        <div class="tags">
            <strong>${money(nota.valor)}</strong>
            <button type="button" class="mini" data-nota="${nota.id}">Editar</button>
            <button type="button" class="mini" data-nota-x="${nota.id}">Excluir</button>
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
    return `<section class="card cat cat-notas"><div class="card-head"><h3>Anotações</h3><span class="meta">${notas.length ? money(totalNotas) : ""}</span></div><div class="card-body">${resumoNotas}${linhas}
        <form id="formNota" class="form-linha">
            <input type="hidden" name="notaId" value="">
            <label class="field"><span>Texto</span><input name="texto" required maxlength="400"></label>
            <label class="field"><span>Apelido do total</span><input name="apelido" maxlength="80" placeholder="Ex.: Nubank"></label>
            <label class="field"><span>Valor</span><input name="valor" class="brl" inputmode="decimal" value="0,00"></label>
            <button class="btn ghost" type="submit">Salvar anotação</button>
        </form>
    </div></section>`;
}
function renderNovoCard() {
    const opcoes = CATEGORIAS.map(cat => `<option value="${cat.id}">${esc(cat.label)}</option>`).join("");
    return `<section class="card cat cat-novo"><div class="card-head"><h3>Novo card</h3></div><div class="card-body">
        <form id="formCard" class="form-linha">
            <label class="field"><span>Nome</span><input name="label" required maxlength="60"></label>
            <label class="field"><span>Categoria</span><select name="categoria">${opcoes}</select></label>
            <label class="field"><span>Vence dia</span><input name="vencimento" inputmode="numeric" placeholder="opcional"></label>
            <label class="field"><span>Cartão</span><select name="cartao">${opcoesCartao("")}</select></label>
            <label class="check"><input type="checkbox" name="entra" checked> Entra no total</label>
            <button class="btn" type="submit">Adicionar</button>
        </form>
    </div></section>`;
}
function renderOcultos() {
    const ocultos = dados.ocultos || [];
    if (!ocultos.length) return "";
    return `<section class="card cat cat-ocultos"><div class="card-head"><h3>Ocultos</h3></div><div class="card-body">${ocultos.map(card =>
        `<div class="nota"><span>${esc(card.label)}</span><button type="button" class="mini" data-restaurar="${card.id}">Restaurar</button></div>`
    ).join("")}</div></section>`;
}
function atualizarTotais() {
    const row = coletarMes();
    const conta = somas(row);
    const faltante = conta.faltante;
    const sobra = conta.sobra;
    document.getElementById("kpis").innerHTML = [
        ["Salário", money(conta.salario), ""],
        ["Total a pagar", money(conta.total), ""],
        ["Valor já pago", money(conta.pago), "pos"],
        ["Faltante", money(faltante), faltante > 0 ? "warn" : ""],
        ["Sobra", money(sobra), sobra >= 0 ? "pos" : "neg"]
    ].map(([rotulo, valor, classe]) => `<article class="kpi"><label>${rotulo}</label><strong class="${classe}">${valor}</strong></article>`).join("");
    const chip = document.getElementById("chipFora");
    const htmlChip = conta.fora > 0 ? `<div class="chip" id="chipFora">Fora do total, ainda em aberto: <strong>${money(conta.fora)}</strong></div>` : "";
    if (chip) chip.outerHTML = htmlChip;
    else if (htmlChip) document.getElementById("kpis").insertAdjacentHTML("afterend", htmlChip);
    const caixa = document.getElementById("totais");
    if (caixa) {
        caixa.innerHTML = `
            <div>Já pago no total<strong class="pos">${money(conta.pago)}</strong></div>
            <div>Faltante do total<strong class="${faltante > 0 ? "warn" : ""}">${money(faltante)}</strong></div>
            <div>Sobra do salário<strong class="${sobra >= 0 ? "pos" : "neg"}">${money(sobra)}</strong></div>
            <p class="conta-regra">O total a pagar é o que sai do salário. A sobra é o que resta. O que está ligado a um cartão entra na fatura.</p>`;
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
        if (!tudoFora && somaFora) meta += ` · fora ${money(somaFora)}`;
        if (grupo.id === "cartoes") meta = money(round2(campos.reduce((acc, campo) => acc + valorFatura(row, campo.id), 0)));
        const destino = card.querySelector(".card-head .meta");
        if (destino) destino.textContent = meta;
        const sub = card.querySelector(".subtotal strong");
        if (sub) sub.textContent = textoInvestimento(document.getElementById("c_investimento")?.value);
    });
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
        else if (input.closest("[data-emp]")) {
            recalcularEmp(input.closest("[data-emp]"));
            sujo = true;
        } else if (view === "emprestimos") {
            sujo = true;
        }
    });
}
function alternarPago(botao) {
    const ativo = !botao.classList.contains("on");
    botao.classList.toggle("on", ativo);
    botao.setAttribute("aria-pressed", String(ativo));
    botao.textContent = ativo ? "Pago" : "Em aberto";
    const linha = botao.closest(".row") || botao.closest("tr");
    if (linha) linha.classList.toggle("is-pago", ativo);
}

function renderEmp() {
    const mes = mesAtual();
    const cat = document.getElementById("filtroCat").value;
    const numeros = cat === "todas" ? [1, 2] : [Number(cat)];
    document.getElementById("viewEmprestimos").innerHTML = `<p class="conta-regra">Estes dois empréstimos já formam o valor de Oliveira em Lançamentos. Eles não entram de novo no total a pagar. Empréstimo Nu entra à parte.</p>`
        + numeros.map(numero => cardEmp(numero, mes)).join("")
        + cardNu(mes)
        + renderHistorico()
        || '<p class="banner show">Nenhum empréstimo neste filtro.</p>';
    document.querySelectorAll("#viewEmprestimos input.brl").forEach(ligarBrl);
    document.querySelectorAll("#viewEmprestimos .card[data-emp]").forEach(ligarCardEmp);
    document.querySelectorAll("[data-quitar]").forEach(botao => botao.addEventListener("click", () => quitarEmp(Number(botao.dataset.quitar))));
    const nuPago = document.querySelector('[data-role="nu-pago"]');
    if (nuPago) nuPago.addEventListener("click", () => {
        alternarPago(nuPago);
        sujo = true;
    });
    atualizarKpiEmp();
}
function cardEmp(numero, mes) {
    const lista = (dados.emprestimos || []).filter(item => Number(item.emprestimo) === numero).sort((a, b) => a.mes.localeCompare(b.mes));
    const original = lista.length ? Number(lista[0].saldo_inicio) || 0 : 0;
    const atual = lista.find(item => item.mes === mes);
    const saldo = atual ? Number(atual.saldo_inicio) || 0 : 0;
    const pagamento = atual ? Number(atual.pagamento) || 0 : 0;
    const previsto = atual ? Number(atual.pagamento_previsto ?? atual.pagamento) || 0 : 0;
    const pago = atual ? Boolean(atual.pago) : false;
    const juros = round2(saldo * 0.02);
    const seguinte = lista.find(item => item.mes > mes);
    const referencia = seguinte
        ? `Em ${mesFull(seguinte.mes)} o saldo começa em ${money(seguinte.saldo_inicio)}.`
        : "Última parcela deste empréstimo.";
    return `<section class="card cat cat-emp${numero}" data-emp="${numero}" data-original="${original}" data-pagamento="${pagamento}" data-previsto="${previsto}" data-saldo="${saldo}">
        <div class="card-head"><h3>Empréstimo ${numero}</h3><span class="meta">Começou em ${money(original)}</span></div>
        <div class="card-body">
            <div class="resumo-emp">
                <div><span>Saldo deste mês</span><strong>${money(saldo)}</strong></div>
                <div><span>Parcela que paga</span><strong>${money(previsto)}</strong></div>
                <div><span>Juros 2%</span><strong class="juros">${money(juros)}</strong></div>
                <div><span>Ainda fica para pagar</span><strong class="fim">${money(round2(Math.max(0, saldo - pagamento)))}</strong></div>
            </div>
            <p class="meta ref-mes">${referencia}</p>
            <div class="row simple">
                <div>
                    <label>Valor pago neste mês</label>
                    <div class="meta">A parcela definida é ${money(previsto)}. Se pagar outro valor, o que fica e o mês seguinte são recalculados.</div>
                    <p class="aviso-parcela" hidden>Ao salvar, o saldo dos próximos meses acompanha este pagamento.</p>
                </div>
                ${brlCampo("pag", pagamento)}
            </div>
            <div class="row simple ${pago ? "is-pago" : ""}"><div><label>Situação</label></div>${pagoBtn(pago, 'data-role="card-pago"')}</div>
            ${saldo > 0 ? `<button type="button" class="btn" data-quitar="${numero}">Quitar empréstimo</button>` : '<p class="meta">Quitado. Os meses seguintes ficam com saldo zerado.</p>'}
            <input type="hidden" class="saldo" value="${fmtBrl(saldo)}">
        </div>
        <div class="evo"><table>
            <thead><tr><th>Mês</th><th class="num">Saldo</th><th class="num">Juros</th><th class="num">Parcela</th><th class="num">Saldo fim</th><th>Status</th></tr></thead>
            <tbody>${lista.map(item => `<tr class="${item.mes === mes ? "atual" : ""} ${item.pago ? "is-pago" : ""}" data-id="${item.id || ""}" data-mes="${item.mes}" data-emp="${numero}">
                <td>${mesFull(item.mes)}</td><td class="num">${money(item.saldo_inicio)}</td><td class="num">${money(item.juros)}</td>
                <td class="num">${money(item.pagamento)}</td><td class="num">${money(item.saldo_fim)}</td>
                <td>${pagoBtn(Boolean(item.pago), 'data-role="row-pago"')}</td>
            </tr>`).join("")}</tbody>
        </table></div>
        <input type="hidden" class="emp-id" value="${atual && atual.id ? atual.id : ""}">
        <input type="hidden" class="emp-n" value="${numero}">
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
    return `<section class="card cat cat-nu">
        <div class="card-head"><h3>Empréstimo Nu</h3><span class="meta">Parcela do mês</span></div>
        <div class="card-body">
            <p class="meta">Parcela do Nu. Entra no total a pagar e fica separada dos dois empréstimos.</p>
            <div class="row simple"><div><label>Valor deste mês</label></div>${brlInput("c_emprestimo_nu", info.row.emprestimo_nu)}</div>
            <div class="row simple"><div><label>Situação</label></div>${pagoBtn(false, 'data-role="nu-pago"')}</div>
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
        sujo = true;
        atualizarKpiEmp();
    });
    card.querySelectorAll('[data-role="row-pago"]').forEach(botao => {
        botao.addEventListener("click", () => {
            alternarPago(botao);
            const linha = botao.closest("tr");
            if (linha && linha.dataset.mes === mesAtual() && pagoCard && pagoCard.classList.contains("on") !== botao.classList.contains("on")) {
                alternarPago(pagoCard);
            }
            sujo = true;
            atualizarKpiEmp();
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
    atualizarKpiEmp();
}
function atualizarKpiEmp() {
    if (view !== "emprestimos") return;
    const cards = [...document.querySelectorAll("#viewEmprestimos .card[data-emp]")];
    const pagamento = cards.reduce((acc, card) => acc + num(card.querySelector(".pag")?.value), 0);
    const juros = cards.reduce((acc, card) => acc + round2(num(card.querySelector(".saldo")?.value) * 0.02), 0);
    const campoNu = document.getElementById("c_emprestimo_nu");
    const nu = campoNu ? num(campoNu.value) : num(nuSemPendencia(mesAtual()).valor);
    const totalMes = round2(pagamento + juros + nu);
    document.getElementById("kpis").innerHTML = [
        ["Total a pagar no mês", money(totalMes), ""],
        ["Parcelas", money(pagamento), ""],
        ["Juros", money(juros), ""],
        ["Empréstimos", money(round2(pagamento + juros)), ""],
        ["Empréstimo Nu", money(nu), ""]
    ].map(([rotulo, valor, classe]) => `<article class="kpi"><label>${rotulo}</label><strong class="${classe}">${valor}</strong></article>`).join("");
    const chip = document.getElementById("chipFora");
    if (chip) chip.remove();
}
function renderHistorico() {
    const info = nuSemPendencia(mesAtual());
    const lista = [...(dados.historico || [])];
    if (!info.pendente && info.valor > 0) {
        lista.push({ texto: `Empréstimo Nu de ${mesFull(mesAtual())} pago.`, valor: info.valor });
    }
    if (!lista.length) return "";
    return `<section class="card cat cat-historico"><div class="card-head"><h3>Histórico</h3></div><div class="card-body">${lista.map(item =>
        `<div class="nota"><div>${esc(item.texto)}</div><strong>${money(item.valor)}</strong></div>`
    ).join("")}</div></section>`;
}
async function quitarEmp(numero) {
    if (sujo) {
        showBanner("Salve o mês antes de quitar o empréstimo.");
        return;
    }
    if (!confirm(`Quitar o empréstimo ${numero} em ${mesFull(mesAtual())}? O saldo restante entra como pago e os meses seguintes ficam zerados.`)) return;
    setStatus("load", "Quitando...");
    try {
        dados = await post("/api/emprestimo/quitar", { mes: mesAtual(), emprestimo: numero });
        CAMPOS = dados.campos || CAMPOS;
        rascunho = null;
        sujo = false;
        historico = [];
        setStatus("ok", "Empréstimo quitado");
        showBanner((dados.avisos || []).join(" "));
        render();
    } catch (erro) {
        setStatus("err", "Falha ao quitar");
        showBanner(erro.message);
    }
}
function marcarOliveira() {
    const mes = mesAtual();
    document.querySelectorAll("#viewEmprestimos .card[data-emp]").forEach(card => {
        const numero = Number(card.querySelector(".emp-n").value);
        const item = (dados.emprestimos || []).find(linha => linha.mes === mes && Number(linha.emprestimo) === numero);
        if (item) item.pago = card.querySelector('[data-role="card-pago"]')?.classList.contains("on");
    });
    document.querySelectorAll('#viewEmprestimos tr[data-id]').forEach(linha => {
        const item = (dados.emprestimos || []).find(emp => String(emp.id) === linha.dataset.id);
        if (item) item.pago = linha.querySelector('[data-role="row-pago"]')?.classList.contains("on");
    });
    const doMes = (dados.emprestimos || []).filter(item => item.mes === mes && num(item.pagamento) > 0);
    const row = (dados.contabilidade || []).find(item => item.mes === mes);
    if (!row || !doMes.length) return;
    const pagos = new Set(listaPagos(row));
    if (doMes.every(item => item.pago)) pagos.add("oliveira");
    else pagos.delete("oliveira");
    row.itens_pagos = [...pagos];
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

async function salvarAtual() {
    const erro = validarAntesDeSalvar();
    if (erro) {
        showBanner(erro);
        return;
    }
    const botao = document.getElementById("btnSalvar");
    botao.disabled = true;
    setStatus("load", "Salvando...");
    try {
        let avisos = [];
        if (view === "contabilidade") {
            dados = await api("/api/contabilidade", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(coletarMes())
            });
        } else {
            marcarOliveira();
            const mes = mesAtual();
            const linhaLocal = (dados.contabilidade || []).find(item => item.mes === mes);
            const nuBotao = document.querySelector('[data-role="nu-pago"]');
            const nuInput = document.getElementById("c_emprestimo_nu");
            if (linhaLocal && nuBotao) {
                const pagosNu = new Set(listaPagos(linhaLocal));
                if (nuBotao.classList.contains("on")) pagosNu.add("emprestimo_nu");
                else pagosNu.delete("emprestimo_nu");
                linhaLocal.itens_pagos = [...pagosNu];
            }
            const pagosDesejados = listaPagos(linhaLocal || {});
            dados = await api("/api/emprestimos/lote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emprestimos: coletarEmprestimos() })
            });
            avisos = dados.avisos || [];
            const row = (dados.contabilidade || []).find(item => item.mes === mes) || {};
            const payload = { mes, salario: num(row.salario), itens_pagos: pagosDesejados };
            CAMPOS.forEach(campo => { payload[campo.id] = num(row[campo.id]); });
            if (nuInput) payload.emprestimo_nu = num(nuInput.value);
            dados = await api("/api/contabilidade", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }
        sujo = false;
        rascunho = null;
        setStatus("ok", "Alterações salvas");
        showBanner(avisos.join(" "), avisos.length ? "warn" : "");
        preencherFiltros();
        render();
    } catch (erroSalvar) {
        setStatus("err", "Falha ao salvar");
        showBanner(erroSalvar.message);
    } finally {
        botao.disabled = false;
    }
}

async function recarregar(manterRascunho) {
    const guardar = manterRascunho ? rascunho : null;
    const estavaSujo = manterRascunho && sujo;
    dados = await api("/api/dados");
    CAMPOS = dados.campos || [];
    CATEGORIAS = dados.categorias || [];
    rascunho = estavaSujo ? guardar : null;
    sujo = Boolean(estavaSujo);
    if (!estavaSujo) historico = [];
    preencherFiltros();
    render();
}
function ligarAcoesLinha() {
    document.querySelectorAll("[data-entra]").forEach(botao => botao.addEventListener("click", () => alternarEntra(botao.dataset.entra)));
    document.querySelectorAll("[data-repetir]").forEach(botao => botao.addEventListener("click", () => repetirCampo(botao.dataset.repetir)));
    document.querySelectorAll("[data-renomear]").forEach(botao => botao.addEventListener("click", () => renomearCampo(botao.dataset.renomear)));
    document.querySelectorAll("[data-ocultar]").forEach(botao => botao.addEventListener("click", () => mudarCard(botao.dataset.ocultar, { ativo: false })));
    document.querySelectorAll("[data-excluir]").forEach(botao => botao.addEventListener("click", () => excluirCampo(botao.dataset.excluir)));
    document.querySelectorAll("[data-restaurar]").forEach(botao => botao.addEventListener("click", () => mudarCard(botao.dataset.restaurar, { ativo: true })));
    document.querySelectorAll("[data-cartao]").forEach(select => select.addEventListener("change", () => mudarCard(select.dataset.cartao, { cartao: select.value })));
    document.querySelectorAll("[data-nota]").forEach(botao => botao.addEventListener("click", () => editarNota(botao.dataset.nota)));
    document.querySelectorAll("[data-nota-x]").forEach(botao => botao.addEventListener("click", () => excluirNota(botao.dataset.notaX)));
}
function alternarEntra(id) {
    const anterior = JSON.parse(JSON.stringify(rascunho || linhaSalva()));
    const row = coletarMes();
    const conjunto = new Set(row.entra || []);
    if (conjunto.has(id)) conjunto.delete(id);
    else conjunto.add(id);
    row.entra = CAMPOS.map(campo => campo.id).filter(item => conjunto.has(item));
    historico.push(anterior);
    rascunho = row;
    sujo = true;
    render();
}
async function repetirCampo(id) {
    if (sujo) {
        showBanner("Salve o mês antes de repetir o valor até dezembro.");
        return;
    }
    const campo = CAMPOS.find(item => item.id === id);
    const valor = num(document.getElementById("c_" + id)?.value);
    if (!confirm(`Repetir ${money(valor)} de ${campo.label} até dezembro deste ano?`)) return;
    setStatus("load", "Repetindo...");
    try {
        dados = await post("/api/contabilidade/repetir", { mes: mesAtual(), campo: id, valor });
        CAMPOS = dados.campos || CAMPOS;
        rascunho = null;
        sujo = false;
        historico = [];
        setStatus("ok", "Valor repetido até dezembro");
        showBanner("");
        render();
    } catch (erro) {
        setStatus("err", "Falha ao repetir");
        showBanner(erro.message);
    }
}
async function renomearCampo(id) {
    const campo = CAMPOS.find(item => item.id === id) || (dados.ocultos || []).find(item => item.id === id);
    const nome = prompt("Nome do card", campo ? campo.label : "");
    if (!nome || !nome.trim() || nome.trim() === campo.label) return;
    await mudarCard(id, { label: nome.trim() });
}
async function mudarCard(id, mudanças) {
    const campo = CAMPOS.find(item => item.id === id) || (dados.ocultos || []).find(item => item.id === id);
    if (mudanças.ativo === false && !confirm(`Apagar ${campo.label} da tela? O valor continua guardado.`)) return;
    if (mudanças.ativo === true && campo) { /* restaura */ }
    setStatus("load", "Atualizando card...");
    try {
        dados = await post("/api/cards/atualizar", { id, ...mudanças });
        await recarregar(true);
        setStatus("ok", "Card atualizado");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Falha no card");
        showBanner(erro.message);
    }
}
async function excluirCampo(id) {
    const campo = CAMPOS.find(item => item.id === id);
    if (!confirm(`Excluir ${campo.label} e os valores dele em todos os meses?`)) return;
    setStatus("load", "Excluindo...");
    try {
        dados = await post("/api/cards/excluir", { id });
        await recarregar(false);
        setStatus("ok", "Card excluído");
    } catch (erro) {
        setStatus("err", "Falha ao excluir");
        showBanner(erro.message);
    }
}
async function criarLinha(evento) {
    evento.preventDefault();
    const form = evento.target;
    if (form.dataset.modo === "fatura") {
        const valor = num(form.valor.value);
        if (valor <= 0) {
            showBanner("Informe um valor para somar na fatura.");
            return;
        }
        setStatus("load", "Somando na fatura...");
        try {
            dados = await post("/api/observacao", {
                mes: mesAtual(),
                texto: form.label.value,
                apelido: form.cartao.value,
                valor,
                tipo: "fatura"
            });
            await recarregar(true);
            setStatus("ok", "Valor somado na fatura");
            showBanner("");
        } catch (erro) {
            setStatus("err", "Falha ao somar");
            showBanner(erro.message);
        }
        return;
    }
    const categoria = form.closest(".card")?.dataset.cat;
    setStatus("load", "Criando linha...");
    try {
        dados = await post("/api/cards", {
            label: form.label.value,
            categoria,
            cartao: form.cartao ? form.cartao.value : "",
            vencimento: form.vencimento ? form.vencimento.value : "",
            valor: form.valor ? num(form.valor.value) : 0,
            mes: mesAtual(),
            entra_padrao: true
        });
        await recarregar(true);
        setStatus("ok", "Linha adicionada");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Falha ao criar");
        showBanner(erro.message);
    }
}
async function criarCard(evento) {
    evento.preventDefault();
    const form = evento.target;
    setStatus("load", "Criando card...");
    try {
        dados = await post("/api/cards", {
            label: form.label.value,
            categoria: form.categoria.value,
            vencimento: form.vencimento.value,
            entra_padrao: form.entra.checked,
            cartao: form.cartao.value
        });
        await recarregar(true);
        setStatus("ok", "Card adicionado");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Falha ao criar");
        showBanner(erro.message);
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
    form.texto.focus();
}
async function salvarNota(evento) {
    evento.preventDefault();
    const form = evento.target;
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
        setStatus("ok", "Anotação salva");
        showBanner("");
    } catch (erro) {
        setStatus("err", "Falha na anotação");
        showBanner(erro.message);
    }
}
async function excluirNota(id) {
    if (!confirm("Excluir este item?")) return;
    try {
        dados = await post("/api/observacao/excluir", { id: Number(id) });
        await recarregar(true);
        setStatus("ok", "Anotação excluída");
    } catch (erro) {
        showBanner(erro.message);
    }
}
function copiarAnterior() {
    const [ano, mes] = mesAtual().split("-").map(Number);
    const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
    const origem = (dados.contabilidade || []).find(item => item.mes === anterior);
    if (!origem) {
        showBanner("Não há mês anterior para copiar.");
        return;
    }
    historico.push(JSON.parse(JSON.stringify(rascunho || linhaSalva())));
    const base = linhaSalva();
    CAMPOS.forEach(campo => {
        if (campo.id === "oliveira" && base.oliveira_calculado) return;
        base[campo.id] = origem[campo.id] || 0;
    });
    rascunho = base;
    sujo = true;
    showBanner(`Valores de ${mesFull(anterior)} copiados. Salve para gravar.`, "warn");
    render();
}
function desfazer() {
    const anterior = historico.pop();
    if (!anterior) {
        showBanner("Nada para desfazer.", "warn");
        return;
    }
    rascunho = anterior;
    sujo = assinatura(rascunho) !== assinatura(linhaSalva());
    render();
}
function pendentes(row) {
    return componentes(row).filter(item => item.valor > 0 && !item.pago);
}
function renderPainel() {
    const mes = mesAtual();
    const ano = (mes || hojeYm()).slice(0, 4);
    const meses = (dados.contabilidade || []).filter(item => item.mes.startsWith(ano));
    const topo = Math.max(1, ...meses.map(item => Math.max(num(item.salario), num(item.total_a_pagar))));
    const atual = (dados.contabilidade || []).find(item => item.mes === mes) || {};
    const total = num(atual.total_a_pagar);
    const pagos = new Set(listaPagos(atual));
    const faltante = num(atual.valor_faltante);
    const sobra = num(atual.sobra);
    const abertos = pendentes(atual);
    const entra = new Set(atual.entra || []);
    document.getElementById("kpis").innerHTML = [
        ["Total a pagar", money(total), ""],
        ["Valor já pago", money(atual.valor_pago), "pos"],
        ["Faltante", money(faltante), faltante > 0 ? "warn" : ""],
        ["Sobra", money(sobra), sobra >= 0 ? "pos" : "neg"]
    ].map(([rotulo, valor, classe]) => `<article class="kpi"><label>${rotulo}</label><strong class="${classe}">${valor}</strong></article>`).join("");
    const chip = document.getElementById("chipFora");
    if (chip) chip.remove();
    const listaAberta = abertos.map(item => `<div class="nota"><div>${esc(item.label)}</div><strong>${money(item.valor)}</strong></div>`).join("");
    const vencimentos = CAMPOS.filter(campo => campo.vencimento).map(campo => {
        const pago = pagos.has(campo.id);
        const prazo = prazoTexto(campo, pago, mes);
        return `<div class="nota"><div>${esc(campo.label)} <span class="${prazo ? prazo.cls : "tag"}">${esc(prazo ? prazo.texto : "Dia " + campo.vencimento)}</span></div><strong>${money(atual[campo.id])}</strong></div>`;
    }).join("");
    document.getElementById("viewPainel").innerHTML = `
        <section class="hero">
            <span>Salário</span>
            <strong>${money(atual.salario)}</strong>
            <p>Valor principal de ${esc(mesFull(mes))}.</p>
        </section>
        <section class="card cat cat-vencimentos"><div class="card-head"><h3>Vencimentos de ${esc(mesFull(mes))}</h3><button class="mini" id="abrirMes" type="button">Abrir lançamentos</button></div><div class="card-body">${vencimentos || "<p class=\"meta\">Nenhum card com dia de vencimento.</p>"}</div></section>
        <p class="conta-regra">O total a pagar é o que sai do salário. A sobra é o que resta.</p>
        <section class="card cat cat-pendente">
            <div class="card-head"><h3>Ainda devo pagar</h3><span class="meta">${abertos.length ? money(round2(abertos.reduce((acc, item) => acc + item.valor, 0))) : "Nada em aberto"}</span></div>
            <div class="card-body">${listaAberta || "<p class=\"meta\">Nada pendente neste mês.</p>"}</div>
        </section>
        <div class="legenda"><span><i class="b-sal"></i>Salário</span><span><i class="b-tot"></i>Total a pagar</span><span><i class="b-sobra"></i>Sobra, o valor embaixo de cada mês</span></div>
        <div class="ano">${meses.map(item => {
            const parte = Number(item.mes.slice(5));
            const sobraMes = num(item.sobra);
            return `<button type="button" class="mes-barra ${item.mes === mes ? "ativo" : ""}" data-ir="${item.mes}">
                <strong>${MONTHS[parte - 1].slice(0, 3)}</strong>
                <span class="trilha"><i class="b-sal" style="width:${Math.max(2, num(item.salario) / topo * 100)}%"></i><i class="b-tot" style="width:${Math.max(2, num(item.total_a_pagar) / topo * 100)}%"></i></span>
                <small class="${sobraMes >= 0 ? "pos" : "neg"}">${money(sobraMes)}</small>
            </button>`;
        }).join("")}</div>`;
    document.querySelectorAll("[data-ir]").forEach(botao => botao.addEventListener("click", () => {
        document.getElementById("filtroMes").value = botao.dataset.ir;
        mesAntes = botao.dataset.ir;
        render();
    }));
    const abrir = document.getElementById("abrirMes");
    if (abrir) abrir.addEventListener("click", () => setView("contabilidade"));
}

async function carregar() {
    if (location.protocol === "file:") {
        showBanner("Abra pelo Iniciar.bat, em http://localhost:8765.");
        setStatus("err", "Servidor não detectado");
        return;
    }
    try {
        dados = await api("/api/dados");
        CAMPOS = dados.campos || [];
        CATEGORIAS = dados.categorias || [];
        setStatus("ok", "Pronto para editar");
        aplicarTema(localStorage.getItem("controle-aparencia") === "escuro");
        ajustarAcoes();
        preencherFiltros();
        render();
    } catch (erro) {
        showBanner("Não foi possível carregar. Execute o Iniciar.bat. " + erro.message);
        setStatus("err", "Falha ao carregar");
    }
}

document.querySelectorAll(".nav button").forEach(botao => botao.addEventListener("click", () => setView(botao.dataset.view)));
document.getElementById("filtroMes").addEventListener("change", () => {
    const seletor = document.getElementById("filtroMes");
    if (!podeDescartar()) {
        seletor.value = mesAntes;
        return;
    }
    sujo = false;
    rascunho = null;
    historico = [];
    revelados = new Set();
    mesAntes = seletor.value;
    render();
});
document.getElementById("filtroCat").addEventListener("change", render);
document.getElementById("btnSalvar").addEventListener("click", salvarAtual);
document.getElementById("btnCopiar").addEventListener("click", copiarAnterior);
document.getElementById("btnDesfazer").addEventListener("click", desfazer);
document.getElementById("btnExportar").addEventListener("click", () => { window.location = "/api/exportar/" + mesAtual(); });
document.getElementById("soAbertos").addEventListener("change", render);
document.getElementById("btnTema").addEventListener("click", () => aplicarTema(!document.body.classList.contains("escuro")));
function aplicarTema(escuro) {
    document.body.classList.toggle("escuro", escuro);
    document.getElementById("btnTema").textContent = escuro ? "Tema claro" : "Tema escuro";
    localStorage.setItem("controle-aparencia", escuro ? "escuro" : "claro");
}
carregar();
