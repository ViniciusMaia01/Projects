"""Lê a planilha e traduz as fórmulas de total, pago e faltante."""
import re
import zipfile
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from xml.etree import ElementTree as ET

from app.config import CAMPOS, ID_POR_LINHA, PADRAO_ENTRA, caminho_planilha

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
CENTAVO = Decimal("0.01")
VERMELHO = "FFFF0000"
# Até setembro de 2026 o controle trata o mês como encerrado.
# Depois disso, célula vermelha na planilha é o que já foi pago.
QUITADO_ATE = "2026-09"

_NOTAS = {
    "no cartao que eu tenho q pagar": ("No cartão que eu tenho que pagar", "nubank"),
    "empresrei no cartao p marcelo": ("Emprestei no cartão para Marcelo", "nubank"),
    "emprestei no pix": ("Emprestei no Pix", "pix"),
    "emprestei no cartao tio": ("Emprestei no cartão do tio", "nubank"),
    "total nubank(out)": ("Total Nubank de outubro", "nubank_total"),
}


def dinheiro(valor):
    if isinstance(valor, Decimal):
        dec = valor
    elif valor is None or valor == "":
        dec = Decimal("0")
    elif isinstance(valor, float):
        dec = Decimal(str(round(valor, 2)))
    else:
        texto = str(valor).strip().replace("R$", "").replace(" ", "")
        if "," in texto:
            texto = texto.replace(".", "").replace(",", ".")
        dec = Decimal(texto or "0")
    return dec.quantize(CENTAVO, rounding=ROUND_HALF_UP)


def _coluna(numero):
    texto = ""
    while numero:
        numero, resto = divmod(numero - 1, 26)
        texto = chr(65 + resto) + texto
    return texto


def _colunas_meses():
    ano, mes = 2026, 1
    for indice in range(2, 26):
        yield _coluna(indice), f"{ano}-{mes:02d}"
        mes += 1
        if mes == 13:
            ano, mes = 2027, 1


def _data_excel(serial):
    return datetime(1899, 12, 30) + timedelta(days=int(serial))


def _estilos(arquivo):
    if "xl/styles.xml" not in arquivo.namelist():
        return []
    raiz = ET.fromstring(arquivo.read("xl/styles.xml"))
    fills = list(raiz.find(f"{NS}fills"))
    cores = []
    for xf in raiz.find(f"{NS}cellXfs"):
        padrao = fills[int(xf.get("fillId") or 0)].find(f"{NS}patternFill")
        fg = padrao.find(f"{NS}fgColor") if padrao is not None else None
        rgb = fg.get("rgb") if fg is not None and padrao.get("patternType") == "solid" else None
        cores.append((rgb or "").upper())
    return cores


def _planilha_celulas(arquivo, nome, textos, estilos):
    raiz = ET.fromstring(arquivo.read(nome))
    celulas = {}
    for celula in raiz.findall(f".//{NS}c"):
        ref = celula.get("r")
        tipo = celula.get("t")
        valor = celula.find(f"{NS}v")
        formula = celula.find(f"{NS}f")
        bruto = valor.text if valor is not None else None
        if tipo == "s" and bruto is not None:
            bruto = textos[int(bruto)]
        estilo = int(celula.get("s") or 0)
        cor = estilos[estilo] if estilo < len(estilos) else ""
        celulas[ref] = (bruto, formula.text if formula is not None else None, cor)
    return celulas


def _numero(celulas, ref):
    celula = celulas.get(ref)
    if not celula or celula[0] is None:
        return None
    try:
        return dinheiro(celula[0])
    except Exception:
        return None


def _formula(celulas, ref):
    celula = celulas.get(ref)
    return celula[1] if celula else None


def _valor(celulas, ref):
    numero = _numero(celulas, ref)
    return numero if numero is not None else Decimal("0.00")


def _referencias(formula, coluna):
    if not formula:
        return set(), []
    texto = formula[1:] if formula.startswith("=") else formula
    texto = texto.replace("$", "")
    linhas = set()
    for inicio, fim in re.findall(rf"{coluna}(\d+)\s*:\s*{coluna}(\d+)", texto, flags=re.I):
        linhas.update(range(int(inicio), int(fim) + 1))
    sem_intervalo = re.sub(rf"{coluna}\d+\s*:\s*{coluna}\d+", " ", texto, flags=re.I)
    for numero in re.findall(rf"{coluna}(\d+)", sem_intervalo, flags=re.I):
        linhas.add(int(numero))
    sobra = re.sub(rf"{coluna}\d+", " ", sem_intervalo, flags=re.I)
    sobra = re.sub(r"SUM", " ", sobra, flags=re.I)
    extras = [dinheiro(numero) for numero in re.findall(r"\d+(?:\.\d+)?", sobra)]
    return linhas, extras


def _ids_das_linhas(linhas):
    return [ID_POR_LINHA[linha] for linha in sorted(linhas) if linha in ID_POR_LINHA]


def spec_formula(formula, coluna, valor_cache):
    """Traduz a fórmula do Excel para uma conta que o site consegue refazer."""
    if not formula:
        return {"tipo": "fixo", "valor": float(dinheiro(valor_cache or 0))}
    texto = formula[1:] if str(formula).startswith("=") else str(formula)
    texto = texto.replace("$", "").replace(" ", "")

    def expandir(match):
        inicio, fim = int(match.group(1)), int(match.group(2))
        passo = 1 if inicio <= fim else -1
        return "+".join(f"{coluna}{numero}" for numero in range(inicio, fim + passo, passo))

    texto = re.sub(rf"(?i)SUM\({coluna}(\d+):{coluna}(\d+)\)", expandir, texto)
    tokens = re.findall(rf"(?i)[+-]|{coluna}\d+|\d+(?:\.\d+)?", texto)
    termos = []
    linhas = []
    extra = []
    sinal = 1
    so_soma = True
    for token in tokens:
        if token == "+":
            sinal = 1
            continue
        if token == "-":
            sinal = -1
            so_soma = False
            continue
        if re.fullmatch(rf"(?i){coluna}\d+", token):
            linha = int(token[len(coluna):])
            if sinal < 0 or linha in (3, 21, 22, 23, 24):
                so_soma = False
            termos.append({"linha": linha, "sinal": sinal})
            if sinal > 0 and linha not in (3, 21, 22, 23, 24):
                linhas.append(linha)
        else:
            numero = float(dinheiro(token))
            if sinal < 0:
                so_soma = False
            termos.append({"numero": numero, "sinal": sinal})
            if sinal > 0:
                extra.append(numero)
        sinal = 1
    if so_soma:
        return {"tipo": "soma", "linhas": linhas, "extra": extra}
    return {"tipo": "expr", "termos": termos}


def avaliar_spec(spec, contexto):
    if not spec or spec.get("tipo") == "fixo":
        return dinheiro((spec or {}).get("valor") or 0)
    if spec.get("tipo") == "soma":
        total = sum((dinheiro(contexto.get(linha, 0)) for linha in spec.get("linhas") or []), Decimal("0.00"))
        total += sum((dinheiro(numero) for numero in spec.get("extra") or []), Decimal("0.00"))
        return dinheiro(total)
    total = Decimal("0.00")
    for termo in spec.get("termos") or []:
        sinal = Decimal("-1") if int(termo.get("sinal") or 1) < 0 else Decimal("1")
        if "numero" in termo:
            total += sinal * dinheiro(termo["numero"])
        else:
            total += sinal * dinheiro(contexto.get(termo.get("linha"), 0))
    return dinheiro(total)


def avaliar_resumo(formulas, salario, valores, ignorar=()):
    """Total, já pago, faltante e sobra na ordem em que o Excel calcula.

    Linhas em ignorar já estão dentro da fatura de um cartão e não entram de novo.
    """
    ignorados = set(ignorar)
    contexto = {3: dinheiro(salario)}
    for campo in CAMPOS:
        linha = campo["excel"]
        contexto[linha] = Decimal("0.00") if linha in ignorados else dinheiro(valores.get(campo["id"], 0))
    resultado = {}
    for chave, linha in (("total", 21), ("pago", 22), ("faltante", 23), ("sobra", 24)):
        valor = avaliar_spec((formulas or {}).get(chave), contexto)
        contexto[linha] = valor
        resultado[chave] = valor
    spec_total = (formulas or {}).get("total") or {}
    if spec_total.get("tipo") == "soma" and 20 not in (spec_total.get("linhas") or []) and 20 not in ignorados:
        resultado["total"] = dinheiro(resultado["total"] + contexto.get(20, 0))
    return resultado["total"], resultado["pago"], resultado["faltante"], resultado["sobra"]


def _soma_manual(formula):
    if not formula or "!" in formula or "SUM" in formula.upper():
        return False
    return all(caractere in "0123456789.+- " for caractere in formula) and any(op in formula for op in "+-")


def _nota(texto):
    chave = " ".join(texto.split()).lower()
    if chave in _NOTAS:
        return _NOTAS[chave]
    return " ".join(texto.split()), "nota"


def _pagos_do_mes(celulas, coluna, mes, valores):
    _, extras = _referencias(_formula(celulas, f"{coluna}22"), coluna)
    if mes <= QUITADO_ATE:
        pagos = [campo_id for campo_id, valor in valores.items() if valor > 0]
        return pagos, extras
    pagos = []
    for campo in CAMPOS:
        celula = celulas.get(f"{coluna}{campo['excel']}")
        cor = celula[2] if celula else ""
        if cor == VERMELHO and valores[campo["id"]] > 0:
            pagos.append(campo["id"])
    return pagos, extras


def ler_planilha(caminho=None):
    origem = caminho or caminho_planilha()
    if origem is None or not origem.exists():
        raise FileNotFoundError("Nenhuma planilha .xlsx encontrada em dados/ ou na pasta do projeto.")

    with zipfile.ZipFile(origem) as arquivo:
        textos = []
        if "xl/sharedStrings.xml" in arquivo.namelist():
            raiz = ET.fromstring(arquivo.read("xl/sharedStrings.xml"))
            for item in raiz.findall(f"{NS}si"):
                textos.append("".join(no.text or "" for no in item.iter(f"{NS}t")))
        estilos = _estilos(arquivo)
        geral = _planilha_celulas(arquivo, "xl/worksheets/sheet1.xml", textos, estilos)
        emprestimos_xml = _planilha_celulas(arquivo, "xl/worksheets/sheet2.xml", textos, estilos)
    meses = {}
    for coluna, mes in _colunas_meses():
        valores = {campo["id"]: _valor(geral, f"{coluna}{campo['excel']}") for campo in CAMPOS}
        formula_total = _formula(geral, f"{coluna}21")
        linhas_total, _ = _referencias(formula_total, coluna)
        itens_total = _ids_das_linhas(linhas_total)
        entra = itens_total or list(PADRAO_ENTRA)
        pagos, extras = _pagos_do_mes(geral, coluna, mes, valores)
        formulas = {
            "total": spec_formula(formula_total, coluna, _numero(geral, f"{coluna}21")),
            "pago": spec_formula(_formula(geral, f"{coluna}22"), coluna, _numero(geral, f"{coluna}22")),
            "faltante": spec_formula(_formula(geral, f"{coluna}23"), coluna, _numero(geral, f"{coluna}23")),
            "sobra": spec_formula(_formula(geral, f"{coluna}24"), coluna, _numero(geral, f"{coluna}24")),
        }
        detalhes = {}
        for campo in CAMPOS:
            formula = _formula(geral, f"{coluna}{campo['excel']}")
            if _soma_manual(formula):
                detalhes[campo["id"]] = formula.replace(" ", "")
        meses[mes] = {
            "salario": _valor(geral, f"{coluna}3"),
            "valores": valores,
            "entra": entra,
            "pagos": pagos,
            "detalhes": detalhes,
            "extras_pago": extras,
            "formulas": formulas,
            "total_planilha": _numero(geral, f"{coluna}21"),
            "pago_planilha": _numero(geral, f"{coluna}22"),
            "faltante_planilha": _numero(geral, f"{coluna}23"),
            "sobra_planilha": _numero(geral, f"{coluna}24"),
        }

    emprestimos = []
    for linha in range(2, 40):
        serial = _numero(emprestimos_xml, f"A{linha}")
        if serial is None:
            continue
        mes = _data_excel(serial).strftime("%Y-%m")
        for numero, saldo_col, juros_col, pag_col, pagj_col in (
            (1, "B", "C", "D", "E"),
            (2, "G", "H", "I", "J"),
        ):
            saldo = _numero(emprestimos_xml, f"{saldo_col}{linha}")
            if saldo is None:
                continue
            pagamento = _valor(emprestimos_xml, f"{pag_col}{linha}")
            juros = _numero(emprestimos_xml, f"{juros_col}{linha}")
            if juros is None:
                juros = dinheiro(saldo * Decimal("0.02"))
            pagj = _numero(emprestimos_xml, f"{pagj_col}{linha}")
            if pagj is None:
                pagj = dinheiro(pagamento + juros)
            emprestimos.append({
                "mes": mes,
                "emprestimo": numero,
                "saldo_inicio": saldo,
                "juros": juros,
                "pagamento": pagamento,
                "pagamento_com_juros": pagj,
                "pagamento_previsto": pagamento,
                "pago": mes <= QUITADO_ATE,
            })

    observacoes = []
    for linha in range(26, 45):
        valor = _numero(geral, f"K{linha}")
        texto = geral.get(f"L{linha}", (None, None))[0]
        if valor is None or not texto or not isinstance(texto, str):
            continue
        limpo, tipo = _nota(texto)
        observacoes.append({"mes": "2026-10", "valor": valor, "texto": limpo, "tipo": tipo})

    extras_outubro = meses.get("2026-10", {}).get("extras_pago") or []
    if extras_outubro:
        observacoes.append({
            "mes": "2026-10",
            "valor": dinheiro(sum(extras_outubro, Decimal("0"))),
            "texto": "Ajuste manual somado no valor já pago, sem linha própria na planilha",
            "tipo": "ajuste",
        })

    return {"arquivo": origem.name, "meses": meses, "emprestimos": emprestimos, "observacoes": observacoes}
