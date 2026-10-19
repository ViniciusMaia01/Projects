/* Gráfico da tela Principal: o salário aparece como sombra de referência; os demais indicadores são filtros. */
(function () {
    const CHAVE = "controle-grafico-v2";
    const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const SERIES = [
        { id: "total", label: "Total de despesas", cor: "#c97b00", valor: row => n(row.total_a_pagar) },
        { id: "pago", label: "Total pago", cor: "#1b7a45", valor: row => n(row.valor_pago) },
        { id: "falta", label: "Pendente", cor: "#c0392b", valor: row => n(row.valor_faltante) },
        { id: "sobra", label: "Saldo do mês", cor: "#6d4ea8", valor: row => n(row.sobra) }
    ];
    const PADRAO = { series: SERIES.map(serie => serie.id), visao: "mes", tipo: "barras", ano: "todos", modo: "valor" };

    function n(valor) { return Number(valor) || 0; }
    const arredondar = valor => Math.round(valor * 100) / 100;
    const brl = valor => n(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const pct = valor => `${n(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    const esc = texto => String(texto ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function curto(valor, modo) {
        if (modo === "pct") return `${Math.round(valor)}%`;
        const abs = Math.abs(valor);
        const sinal = valor < 0 ? "-" : "";
        if (abs >= 1000) return `${sinal}${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1).replace(".", ",")} mil`;
        return `${sinal}${Math.round(abs)}`;
    }
    function lerEstado() {
        try {
            const salvo = JSON.parse(localStorage.getItem(CHAVE) || "null") || {};
            const estado = { ...PADRAO, ...salvo };
            estado.series = (estado.series || []).filter(id => SERIES.some(serie => serie.id === id));
            return estado;
        } catch (erro) {
            return { ...PADRAO };
        }
    }

    function escala(minimo, maximo) {
        if (maximo <= minimo) maximo = minimo + 1;
        const bruto = (maximo - minimo) / 4;
        const grandeza = Math.pow(10, Math.floor(Math.log10(bruto)));
        const passo = [1, 2, 2.5, 5, 10].map(m => m * grandeza).find(valor => valor >= bruto) || grandeza * 10;
        const piso = Math.floor(minimo / passo) * passo;
        const teto = Math.ceil(maximo / passo) * passo;
        const marcas = [];
        for (let v = piso; v <= teto + passo / 2; v += passo) marcas.push(arredondar(v));
        return { min: piso, max: teto, marcas };
    }

    function desenhar(meses, series, estado, mesAtual) {
        const W = 920;
        const H = 340;
        const margem = { e: 60, d: 16, t: 14, b: 44 };
        const larg = W - margem.e - margem.d;
        const alt = H - margem.t - margem.b;
        const fatia = larg / meses.length;
        let minimo = 0;
        let maximo = 0;
        series.forEach(serie => serie.valores.forEach(valor => {
            maximo = Math.max(maximo, valor);
            minimo = Math.min(minimo, valor);
        }));
        const base = row => (estado.modo === "pct" ? 100 : n(row.salario));
        meses.forEach(row => { maximo = Math.max(maximo, base(row)); });
        const eixo = escala(minimo, maximo);
        const y = valor => margem.t + alt * (1 - (valor - eixo.min) / (eixo.max - eixo.min));
        const centro = i => margem.e + fatia * (i + 0.5);
        const partes = [];
        eixo.marcas.forEach(marca => {
            const posY = y(marca);
            partes.push(`<line class="graf-grade ${marca === 0 ? "zero" : ""}" x1="${margem.e}" x2="${W - margem.d}" y1="${posY}" y2="${posY}"/>`);
            partes.push(`<text class="graf-eixo" x="${margem.e - 8}" y="${posY + 4}" text-anchor="end">${curto(marca, estado.modo)}</text>`);
        });
        meses.forEach((item, i) => {
            const mes = Number(item.mes.slice(5));
            const topoSombra = y(base(item));
            partes.push(`<rect class="graf-sombra" x="${(margem.e + fatia * i + fatia * 0.05).toFixed(1)}" y="${topoSombra.toFixed(1)}" width="${(fatia * 0.9).toFixed(1)}" height="${Math.max(0, y(0) - topoSombra).toFixed(1)}" rx="4"/>`);
            if (item.mes === mesAtual) {
                partes.push(`<rect class="graf-atual" x="${margem.e + fatia * i}" y="${margem.t}" width="${fatia}" height="${alt}"/>`);
            }
            partes.push(`<text class="graf-eixo" x="${centro(i)}" y="${H - margem.b + 16}" text-anchor="middle">${MESES[mes - 1]}</text>`);
            if (mes === 1 || i === 0) {
                partes.push(`<text class="graf-eixo ano" x="${centro(i)}" y="${H - margem.b + 31}" text-anchor="middle">${item.mes.slice(0, 4)}</text>`);
            }
        });
        if (estado.tipo === "linhas") {
            series.forEach(serie => {
                const caminho = serie.valores.map((valor, i) => `${i ? "L" : "M"}${centro(i).toFixed(1)} ${y(valor).toFixed(1)}`).join(" ");
                partes.push(`<path class="graf-linha" d="${caminho}" stroke="${serie.cor}"/>`);
                serie.valores.forEach((valor, i) => {
                    partes.push(`<circle class="graf-ponto" cx="${centro(i).toFixed(1)}" cy="${y(valor).toFixed(1)}" r="${meses.length > 14 ? 3 : 4}" fill="${serie.cor}"/>`);
                });
            });
        } else {
            const grupo = fatia * 0.8;
            const largura = grupo / series.length;
            series.forEach((serie, s) => {
                serie.valores.forEach((valor, i) => {
                    const x = centro(i) - grupo / 2 + s * largura;
                    const topo = Math.min(y(valor), y(0));
                    const altura = Math.max(1, Math.abs(y(valor) - y(0)));
                    partes.push(`<rect class="graf-barra" x="${x.toFixed(1)}" y="${topo.toFixed(1)}" width="${Math.max(1, largura - 1.5).toFixed(1)}" height="${altura.toFixed(1)}" rx="2" fill="${serie.cor}"/>`);
                });
            });
        }
        meses.forEach((item, i) => {
            partes.push(`<rect class="graf-coluna" data-i="${i}" x="${margem.e + fatia * i}" y="${margem.t}" width="${fatia}" height="${alt + margem.b}"/>`);
        });
        return `<svg class="graf-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico mensal">${partes.join("")}</svg>`;
    }

    function desenharMes(row, series) {
        const salario = n(row.salario);
        const valores = series.map(serie => serie.valor(row));
        const maximo = Math.max(salario, ...valores.map(Math.abs), 1);
        const ref = (salario / maximo) * 100;
        return `<div class="graf-mes"><p class="graf-base">Salário do mês: <strong>${brl(salario)}</strong> · as barras mostram a proporção sobre esse valor</p>${series.map((serie, i) => {
            const valor = valores[i];
            const largura = Math.max(valor ? 0.8 : 0, Math.abs(valor) / maximo * 100);
            const percentual = salario ? pct(valor / salario * 100) : "-";
            return `<div class="graf-hlinha"><span class="graf-hnome"><i style="background:${serie.cor}"></i>${esc(serie.label)}</span><div class="graf-htrilha" style="--ref:${ref.toFixed(2)}%"><i class="graf-hbarra" style="width:${largura.toFixed(2)}%;background:${serie.cor}"></i></div><div class="graf-hvalor"><strong class="${valor < 0 ? "neg" : ""}">${brl(valor)}</strong><small>${percentual} do salário</small></div></div>`;
        }).join("")}</div>`;
    }

    function resumo(meses, series, estado) {
        const emPct = estado.modo === "pct";
        const fmt = valor => (emPct ? pct(valor) : brl(valor));
        return `<div class="graf-resumo"><table>
            <thead><tr><th>Indicador</th><th class="num">Total no período</th><th class="num">Média por mês</th><th class="num">Maior mês</th></tr></thead>
            <tbody>${series.map(serie => {
                const lista = emPct ? serie.valores : serie.brutos;
                const soma = arredondar(serie.brutos.reduce((acc, valor) => acc + valor, 0));
                const salarios = meses.reduce((acc, row) => acc + n(row.salario), 0);
                const total = emPct ? (salarios ? arredondar(soma / salarios * 100) : 0) : soma;
                const media = arredondar(lista.reduce((acc, valor) => acc + valor, 0) / (meses.length || 1));
                let melhor = 0;
                lista.forEach((valor, i) => { if (valor > lista[melhor]) melhor = i; });
                const mes = meses[melhor];
                const nome = mes ? `${MESES[Number(mes.mes.slice(5)) - 1]}/${mes.mes.slice(2, 4)}` : "";
                return `<tr><td><span class="graf-ponto-leg" style="background:${serie.cor}"></span>${esc(serie.label)}</td><td class="num">${fmt(total)}</td><td class="num">${fmt(media)}</td><td class="num">${fmt(lista[melhor])} <small>${nome}</small></td></tr>`;
            }).join("")}</tbody>
        </table></div>`;
    }

    function montarGrafico(raiz, ctx) {
        const estado = lerEstado();
        const todos = (ctx.dados.contabilidade || []).slice().sort((a, b) => a.mes.localeCompare(b.mes));
        const anos = [...new Set(todos.map(item => item.mes.slice(0, 4)))];
        if (estado.ano !== "todos" && !anos.includes(estado.ano)) estado.ano = "todos";

        function pintar() {
            localStorage.setItem(CHAVE, JSON.stringify(estado));
            const meses = todos.filter(item => estado.ano === "todos" || item.mes.startsWith(estado.ano));
            const series = SERIES.filter(serie => estado.series.includes(serie.id)).map(serie => {
                const brutos = meses.map(row => serie.valor(row));
                const valores = estado.modo === "pct"
                    ? meses.map((row, i) => (n(row.salario) ? arredondar(brutos[i] / n(row.salario) * 100) : 0))
                    : brutos;
                return { ...serie, brutos, valores };
            });
            const chips = SERIES.map(serie => {
                const ativo = estado.series.includes(serie.id);
                return `<button type="button" class="graf-chip ${ativo ? "on" : ""}" data-serie="${serie.id}" aria-pressed="${ativo}" style="--c:${serie.cor}"><i></i>${esc(serie.label)}</button>`;
            }).join("");
            const doMes = todos.find(item => item.mes === ctx.mes);
            const emMes = estado.visao === "mes";
            const corpo = !series.length
                ? '<p class="meta graf-vazio">Selecione ao menos um indicador para visualizar o gráfico.</p>'
                : emMes
                    ? (doMes ? desenharMes(doMes, series) : '<p class="meta graf-vazio">Sem lançamentos neste mês.</p>')
                    : !meses.length
                        ? '<p class="meta">Sem meses para mostrar.</p>'
                        : `<div class="graf-area">${desenhar(meses, series, estado, ctx.mes)}<div class="graf-dica" hidden></div></div>${resumo(meses, series, estado)}`;
            const [anoMes, parteMes] = String(ctx.mes || "-").split("-");
            const titulo = emMes ? `Indicadores de ${MESES_LONGOS[Number(parteMes) - 1] || ""} de ${anoMes}` : "Evolução mensal";
            const filtrosEvolucao = emMes ? "" : `
                        <label class="field"><span>Período</span><select data-g="ano"><option value="todos">Todos os meses</option>${anos.map(ano => `<option value="${ano}" ${ano === estado.ano ? "selected" : ""}>${ano}</option>`).join("")}</select></label>
                        <label class="field"><span>Medida</span><select data-g="modo"><option value="valor" ${estado.modo === "valor" ? "selected" : ""}>Valor em R$</option><option value="pct" ${estado.modo === "pct" ? "selected" : ""}>% do salário</option></select></label>
                        <label class="field"><span>Tipo</span><select data-g="tipo"><option value="barras" ${estado.tipo === "barras" ? "selected" : ""}>Barras</option><option value="linhas" ${estado.tipo === "linhas" ? "selected" : ""}>Linhas</option></select></label>`;
            raiz.innerHTML = `<section class="card cat cat-grafico">
                <div class="card-head"><h3>${titulo}</h3><span class="meta"><i class="graf-leg-sombra"></i>Base de cálculo: salário</span></div>
                <div class="card-body">
                    <div class="graf-chips">${chips}</div>
                    <div class="graf-filtros">
                        <label class="field"><span>Visão</span><select data-g="visao"><option value="mes" ${emMes ? "selected" : ""}>Mês selecionado</option><option value="evolucao" ${emMes ? "" : "selected"}>Evolução mensal</option></select></label>${filtrosEvolucao}
                    </div>
                    ${corpo}
                </div>
            </section>`;
            ligar(meses, series);
        }

        function ligar(meses, series) {
            raiz.querySelectorAll("[data-serie]").forEach(botao => botao.addEventListener("click", () => {
                const id = botao.dataset.serie;
                estado.series = estado.series.includes(id) ? estado.series.filter(item => item !== id) : [...estado.series, id];
                pintar();
            }));
            ["visao", "ano", "tipo", "modo"].forEach(campo => {
                const seletor = raiz.querySelector(`[data-g="${campo}"]`);
                if (seletor) seletor.addEventListener("change", evento => { estado[campo] = evento.target.value; pintar(); });
            });
            const area = raiz.querySelector(".graf-area");
            if (!area) return;
            const dica = area.querySelector(".graf-dica");
            const mostrar = (evento, i) => {
                const [ano, parte] = meses[i].mes.split("-");
                const salario = n(meses[i].salario);
                dica.innerHTML = `<strong>${MESES_LONGOS[Number(parte) - 1]} de ${ano}</strong><div class="graf-dica-base"><span>Salário (base)</span><b>${brl(salario)}</b></div>${series.map(serie => {
                    const percentual = salario ? pct(serie.brutos[i] / salario * 100) : "-";
                    return `<div><i style="background:${serie.cor}"></i><span>${esc(serie.label)}</span><b>${brl(serie.brutos[i])}</b><em>${percentual}</em></div>`;
                }).join("")}`;
                dica.hidden = false;
                const caixa = area.getBoundingClientRect();
                let x = evento.clientX - caixa.left + 14;
                if (x + dica.offsetWidth > caixa.width - 4) x = evento.clientX - caixa.left - dica.offsetWidth - 14;
                const topo = Math.max(4, Math.min(evento.clientY - caixa.top - 10, caixa.height - dica.offsetHeight - 4));
                dica.style.left = `${Math.max(4, x)}px`;
                dica.style.top = `${topo}px`;
            };
            area.querySelectorAll(".graf-coluna").forEach(coluna => {
                const i = Number(coluna.dataset.i);
                coluna.addEventListener("mousemove", evento => mostrar(evento, i));
                coluna.addEventListener("mouseleave", () => { dica.hidden = true; });
                coluna.addEventListener("click", () => ctx.irMes(meses[i].mes));
            });
        }

        pintar();
    }

    window.montarGrafico = montarGrafico;
})();
