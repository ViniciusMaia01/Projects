"""Confere se o banco ficou igual à planilha de 17/10."""
from decimal import Decimal

from app.banco import buscar_tudo, contas_do_mes, preparar
from app.planilha import dinheiro, ler_planilha


def _falhas():
    livro = ler_planilha()
    dados = buscar_tudo()
    por_mes = {linha["mes"]: linha for linha in dados["contabilidade"]}
    falhas = []
    for mes, info in livro["meses"].items():
        linha = por_mes.get(mes)
        if not linha:
            falhas.append(f"{mes} ausente no banco")
            continue
        if dinheiro(linha["salario"]) != info["salario"]:
            falhas.append(f"{mes} salário {linha['salario']} != {info['salario']}")
        for campo, valor in info["valores"].items():
            if dinheiro(linha[campo]) != valor:
                falhas.append(f"{mes} {campo} {linha[campo]} != {valor}")
        entra_site = [item for item in linha["entra"] if item != "investimento"]
        entra_planilha = [item for item in info["entra"] if item != "investimento"]
        if entra_site != entra_planilha:
            falhas.append(f"{mes} entra {linha['entra']} != {info['entra']}")
        if "investimento" not in linha["entra"]:
            falhas.append(f"{mes} investimento ficou fora do total")
        if set(linha["itens_pagos"]) != set(info["pagos"]):
            falhas.append(f"{mes} pagos {sorted(linha['itens_pagos'])} != {sorted(info['pagos'])}")
        cards = list(dados.get("campos") or [])
        total, pago, faltante, sobra = contas_do_mes(info["valores"], info["salario"], info["pagos"], cards)
        if abs(dinheiro(linha["total_a_pagar"]) - total) > Decimal("0.02"):
            falhas.append(f"{mes} total {linha['total_a_pagar']} != {total}")
        if abs(dinheiro(linha["valor_pago"]) - pago) > Decimal("0.02"):
            falhas.append(f"{mes} pago {linha['valor_pago']} != {pago}")
        if abs(dinheiro(linha["valor_faltante"]) - faltante) > Decimal("0.02"):
            falhas.append(f"{mes} faltante {linha['valor_faltante']} != {faltante}")
        if abs(dinheiro(linha["sobra"]) - sobra) > Decimal("0.02"):
            falhas.append(f"{mes} sobra {linha['sobra']} != {sobra}")

    banco_emp = {(item["mes"], item["emprestimo"]): item for item in dados["emprestimos"]}
    if len(banco_emp) != len(livro["emprestimos"]):
        falhas.append(f"parcelas {len(banco_emp)} != {len(livro['emprestimos'])}")
    for item in livro["emprestimos"]:
        atual = banco_emp.get((item["mes"], item["emprestimo"]))
        if not atual:
            falhas.append(f"empréstimo {item['emprestimo']} {item['mes']} ausente")
            continue
        for campo in ("saldo_inicio", "juros", "pagamento"):
            if dinheiro(atual[campo]) != item[campo]:
                falhas.append(f"empréstimo {item['emprestimo']} {item['mes']} {campo} {atual[campo]} != {item[campo]}")
        if bool(atual["pago"]) != bool(item["pago"]):
            falhas.append(f"empréstimo {item['emprestimo']} {item['mes']} pago {atual['pago']} != {item['pago']}")

    outubro = por_mes.get("2026-10")
    if outubro and "bradesco" not in outubro["itens_pagos"]:
        falhas.append("outubro: Bradesco está vermelho na planilha e deveria constar como pago")
    if outubro and "netflix" in outubro["itens_pagos"]:
        falhas.append("outubro: Netflix não está vermelho e não deveria constar como pago")
    setembro = por_mes.get("2026-09")
    if setembro:
        abertos = [
            campo for campo, valor in livro["meses"]["2026-09"]["valores"].items()
            if dinheiro(valor) > 0 and campo not in setembro["itens_pagos"]
        ]
        if abertos:
            falhas.append(f"setembro ainda em aberto: {abertos}")
    outubro_emp = [item for item in dados["emprestimos"] if item["mes"] == "2026-10" and item["pago"]]
    if outubro_emp:
        falhas.append("empréstimos de outubro não devem nascer como pagos")
    if len(dados["observacoes"]) != len(livro["observacoes"]):
        falhas.append(f"anotações {len(dados['observacoes'])} != {len(livro['observacoes'])}")
    return falhas


if __name__ == "__main__":
    resumo = preparar(importar=True)
    print("importação", resumo)
    erros = _falhas()
    if erros:
        print("FALHAS", len(erros))
        for erro in erros:
            print(" -", erro)
        raise SystemExit(1)
    print("OK: banco conferido com a planilha")
