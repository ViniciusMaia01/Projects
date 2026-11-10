"""Caminhos, conexão e definição dos cards da planilha."""
import json
import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
WEB_DIR = RAIZ / "web"
DADOS_DIR = RAIZ / "dados"
PORT = 8765


def _postgres():
    arquivo = DADOS_DIR / "postgres.json"
    dados = {}
    if arquivo.exists():
        dados = json.loads(arquivo.read_text(encoding="utf-8"))
    senha = os.environ.get("CONTROLE_PG_PASSWORD") or dados.get("senha") or ""
    if not senha:
        raise RuntimeError(
            "Defina a senha do PostgreSQL em dados/postgres.json ou na variável CONTROLE_PG_PASSWORD."
        )
    return (
        os.environ.get("CONTROLE_PG_HOST") or dados.get("host") or "localhost",
        int(os.environ.get("CONTROLE_PG_PORT") or dados.get("porta") or 5432),
        os.environ.get("CONTROLE_PG_DB") or dados.get("banco") or "controle_mensal",
        os.environ.get("CONTROLE_PG_USER") or dados.get("usuario") or "postgres",
        senha,
    )


PG_HOST, PG_PORT, PG_DB, PG_USER, PG_PASSWORD = _postgres()

# Itens com no_total ficam fora do "Total de despesas" na maior parte dos meses.
# Alguns meses da planilha incluem ou tiram um item; essa lista mensal é lida da fórmula.
CATEGORIAS = [
    ("pessoas", "Pessoas", "pessoa"),
    ("variaveis", "Variáveis", "variavel"),
    ("assinaturas", "Assinaturas", "assinatura"),
    ("cartoes", "Cartões", "cartao"),
    ("custo_fixo", "Custo fixo", "custo"),
    ("taxas", "Taxas e investimento", "taxas"),
]

CAMPOS = [
    {"id": "das", "coluna": "DAS", "label": "Taxas", "categoria": "taxas", "excel": 4, "no_total": False,
     "dica": "Guia DAS (imposto)"},
    {"id": "maximo", "coluna": "MAXIMO", "label": "Max", "categoria": "pessoas", "excel": 5, "no_total": False},
    {"id": "oliveira", "coluna": "OLIVEIRA", "label": "Oliveira", "categoria": "pessoas", "excel": 6, "no_total": False,
     "dica": "Soma das parcelas, com juros, dos empréstimos 1 e 2"},
    {"id": "gabriel", "coluna": "GABRIEL", "label": "Gabriel", "categoria": "pessoas", "excel": 7, "no_total": False},
    {"id": "aluguel", "coluna": "ALUGUEL", "label": "Pessoa", "categoria": "pessoas", "excel": 8, "no_total": False,
     "dica": "Item sem descrição. Use Editar para identificá-lo."},
    {"id": "variaveis", "coluna": "VARIAVEIS", "label": "Variáveis", "categoria": "variaveis", "excel": 9, "no_total": False},
    {"id": "internet", "coluna": "INTERNET", "label": "Internet", "categoria": "assinaturas", "excel": 10, "no_total": False},
    {"id": "netflix", "coluna": "NETFLIX", "label": "Netflix", "categoria": "assinaturas", "excel": 11, "no_total": True, "vencimento": 18},
    {"id": "spotify", "coluna": "SPOTIFY", "label": "Spotify", "categoria": "assinaturas", "excel": 12, "no_total": True, "vencimento": 3},
    {"id": "youtube", "coluna": "YOUTUBE", "label": "YouTube", "categoria": "assinaturas", "excel": 13, "no_total": True, "vencimento": 28},
    {"id": "hbo", "coluna": "HBO", "label": "HBO", "categoria": "assinaturas", "excel": 14, "no_total": True, "vencimento": 9},
    {"id": "bradesco", "coluna": "BRADESCO", "label": "Bradesco - Fatura", "categoria": "cartoes", "excel": 15, "no_total": False},
    {"id": "mercado_pago", "coluna": "MERCADO_PAGO", "label": "Mercado Pago", "categoria": "cartoes", "excel": 16, "no_total": False},
    {"id": "nubank", "coluna": "NUBANK", "label": "Nubank - Fatura", "categoria": "cartoes", "excel": 17, "no_total": False},
    {"id": "emprestimo_nu", "coluna": "EMPRESTIMO_NU", "label": "Empréstimo Nu", "categoria": "emprestimos", "excel": 18, "no_total": False,
     "dica": "Parcela do empréstimo Nu, incluída no total de despesas e detalhada na aba Empréstimos."},
    {"id": "gasolina", "coluna": "GASOLINA", "label": "Gasolina", "categoria": "custo_fixo", "excel": 19, "no_total": True},
    {"id": "investimento", "coluna": "INVESTIMENTO", "label": "Investimento", "categoria": "taxas", "excel": 20, "no_total": False,
     "dica": "Deduzido do salário e incluído no total de despesas"},
]

LINHA_POR_ID = {campo["id"]: campo["excel"] for campo in CAMPOS}
ID_POR_LINHA = {campo["excel"]: campo["id"] for campo in CAMPOS}
PADRAO_ENTRA = [campo["id"] for campo in CAMPOS if not campo["no_total"]]
JUROS_EMPRESTIMO = "0.02"


def caminho_planilha():
    pastas = [DADOS_DIR, RAIZ]
    candidatos = []
    for pasta in pastas:
        if not pasta.exists():
            continue
        candidatos.extend(
            arquivo for arquivo in pasta.glob("*.xlsx")
            if not arquivo.name.startswith("~$")
        )
        if candidatos and pasta == DADOS_DIR:
            break
    if not candidatos:
        return None
    return max(candidatos, key=lambda arquivo: arquivo.stat().st_mtime)
