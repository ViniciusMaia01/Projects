"""Planilha do mês, gerada sem biblioteca externa."""
from io import BytesIO
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


def _celula(ref, valor):
    if isinstance(valor, (int, float)):
        return f'<c r="{ref}"><v>{valor}</v></c>'
    texto = escape(str(valor if valor is not None else ""))
    return f'<c r="{ref}" t="inlineStr"><is><t>{texto}</t></is></c>'


def _coluna(numero):
    texto = ""
    while numero:
        numero, resto = divmod(numero - 1, 26)
        texto = chr(65 + resto) + texto
    return texto


def _planilha(linhas):
    corpo = []
    for indice, linha in enumerate(linhas, start=1):
        celulas = "".join(
            _celula(f"{_coluna(col)}{indice}", valor) for col, valor in enumerate(linha, start=1)
        )
        corpo.append(f'<row r="{indice}">{celulas}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<sheetData>{''.join(corpo)}</sheetData></worksheet>"
    )


def montar_xlsx(abas):
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as arquivo:
        tipos = "".join(
            "<Override "
            f'PartName="/xl/worksheets/sheet{numero}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for numero in range(1, len(abas) + 1)
        )
        arquivo.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            f"{tipos}</Types>",
        )
        arquivo.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        folhas = []
        relacoes = []
        for numero, (nome, linhas) in enumerate(abas, start=1):
            folhas.append(f'<sheet name="{escape(nome)}" sheetId="{numero}" r:id="rId{numero}"/>')
            relacoes.append(
                f'<Relationship Id="rId{numero}" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
                f'Target="worksheets/sheet{numero}.xml"/>'
            )
            arquivo.writestr(f"xl/worksheets/sheet{numero}.xml", _planilha(linhas))
        arquivo.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f"<sheets>{''.join(folhas)}</sheets></workbook>",
        )
        arquivo.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f"{''.join(relacoes)}</Relationships>",
        )
    return buffer.getvalue()


def _sim_nao(valor):
    return "Sim" if valor else "Não"


def linhas_do_mes(dados, mes):
    linha = next((item for item in dados["contabilidade"] if item["mes"] == mes), None)
    if not linha:
        return None
    categorias = {item["id"]: item["label"] for item in dados["categorias"]}
    entra = set(linha.get("entra") or [])
    pagos = set(linha.get("itens_pagos") or [])
    contas = [["Categoria", "Card", "Valor", "Incluído no total", "Pago", "Vencimento"]]
    for campo in dados["campos"]:
        contas.append([
            categorias.get(campo["categoria"], campo["categoria"]),
            campo["label"],
            float(linha.get(campo["id"]) or 0),
            _sim_nao(campo["id"] in entra),
            _sim_nao(campo["id"] in pagos),
            campo.get("vencimento") or "",
        ])
    contas.extend([
        [],
        ["Salário", float(linha.get("salario") or 0)],
        ["Total de despesas", float(linha.get("total_a_pagar") or 0)],
        ["Total pago", float(linha.get("valor_pago") or 0)],
        ["Pendente", float(linha.get("valor_faltante") or 0)],
        ["Saldo do mês", float(linha.get("sobra") or 0)],
        ["Pendente fora do total", float(linha.get("fora_aberto") or 0)],
    ])
    emprestimos = [["Empréstimo", "Saldo inicial", "Juros", "Pagamento", "Saldo final", "Pago"]]
    for item in dados["emprestimos"]:
        if item["mes"] != mes:
            continue
        emprestimos.append([
            item["emprestimo"],
            float(item["saldo_inicio"]),
            float(item["juros"]),
            float(item["pagamento"]),
            float(item["saldo_fim"]),
            _sim_nao(item["pago"]),
        ])
    notas = [["Tipo", "Texto", "Valor"]]
    for nota in dados["observacoes"]:
        if nota["mes"] != mes:
            continue
        notas.append([nota.get("tipo") or "", nota.get("texto") or "", float(nota.get("valor") or 0)])
    return [("Contabilidade", contas), ("Emprestimos", emprestimos), ("Anotacoes", notas)]
