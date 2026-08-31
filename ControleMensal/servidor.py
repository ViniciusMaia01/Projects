"""Servidor local — CONTABILIDADE_GERAL e EMPRESTIMOS no Oracle."""
import json
import os
import webbrowser
import zipfile
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import oracledb

DIR = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(DIR, "ControleFinanceiro29-08.xlsx")
PORT = 8765
DSN = "localhost:1521/xepdb1"
DB_USER = "system"
DB_PASSWORD = "redepp"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

pool = None

CATEGORIAS = [
    ("pessoas", "Pessoas"),
    ("cartoes", "Cartões"),
    ("assinaturas", "Assinaturas"),
    ("variaveis", "Variáveis"),
    ("investimentos", "Investimentos"),
    ("outros", "Outros"),
]

CAMPOS = [
    {"id": "das", "coluna": "DAS", "label": "Das", "categoria": "outros", "excel": 4, "no_total": False},
    {"id": "maximo", "coluna": "MAXIMO", "label": "Max", "categoria": "pessoas", "excel": 5, "no_total": False},
    {"id": "oliveira", "coluna": "OLIVEIRA", "label": "Oliveira", "categoria": "pessoas", "excel": 6, "no_total": False},
    {"id": "gabriel", "coluna": "GABRIEL", "label": "Gabriel", "categoria": "pessoas", "excel": 7, "no_total": False},
    {"id": "aluguel", "coluna": "ALUGUEL", "label": "Aluguel", "categoria": "outros", "excel": 8, "no_total": False},
    {"id": "variaveis", "coluna": "VARIAVEIS", "label": "Variáveis", "categoria": "variaveis", "excel": 9, "no_total": False},
    {"id": "internet", "coluna": "INTERNET", "label": "Internet", "categoria": "assinaturas", "excel": 10, "no_total": False},
    {"id": "netflix", "coluna": "NETFLIX", "label": "Netflix", "categoria": "assinaturas", "excel": 11, "no_total": True},
    {"id": "spotify", "coluna": "SPOTIFY", "label": "Spotify", "categoria": "assinaturas", "excel": 12, "no_total": True},
    {"id": "youtube", "coluna": "YOUTUBE", "label": "YouTube", "categoria": "assinaturas", "excel": 13, "no_total": True},
    {"id": "bradesco", "coluna": "BRADESCO", "label": "Bradesco - Fatura", "categoria": "cartoes", "excel": 14, "no_total": False},
    {"id": "mercado_pago", "coluna": "MERCADO_PAGO", "label": "Mercado Pago", "categoria": "cartoes", "excel": 15, "no_total": False},
    {"id": "nubank", "coluna": "NUBANK", "label": "Nubank - Fatura", "categoria": "cartoes", "excel": 16, "no_total": False},
    {"id": "emprestimo_nu", "coluna": "EMPRESTIMO_NU", "label": "Empréstimo Nu", "categoria": "outros", "excel": 17, "no_total": False},
    {"id": "gasolina", "coluna": "GASOLINA", "label": "Gasolina", "categoria": "variaveis", "excel": 18, "no_total": True},
    {"id": "investimento", "coluna": "INVESTIMENTO", "label": "Investimento", "categoria": "investimentos", "excel": 19, "no_total": True},
]

COLUNAS_DESPESA = [c["coluna"] for c in CAMPOS]
SOMA_DESPESAS = " + ".join(f"NVL({c['coluna']},0)" for c in CAMPOS if not c["no_total"])


def _num(value):
    if value is None:
        return 0.0
    return float(value)


def _iso_month(value):
    if isinstance(value, datetime):
        return value.strftime("%Y-%m")
    return str(value)[:7]


def _month_date(mes):
    return datetime.strptime(mes, "%Y-%m")


def _json_default(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(type(value))


def _money(value):
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _existing_columns(cur):
    cur.execute(
        """
        SELECT column_name FROM user_tab_cols
        WHERE table_name = 'CONTABILIDADE_GERAL' AND hidden_column = 'NO'
        """
    )
    return {row[0] for row in cur}


def ensure_schema(conn=None):
    own = conn is None
    if own:
        conn = pool.acquire()
    cur = conn.cursor()
    cols = _existing_columns(cur)
    for calc in ("SOBRA", "VALOR_FALTANTE", "TOTAL_A_PAGAR"):
        if calc in cols:
            cur.execute(f"ALTER TABLE CONTABILIDADE_GERAL DROP COLUMN {calc}")
    cols = _existing_columns(cur)
    for campo in CAMPOS:
        if campo["coluna"] not in cols:
            cur.execute(
                f"ALTER TABLE CONTABILIDADE_GERAL ADD ({campo['coluna']} NUMBER(12,2) DEFAULT 0 NOT NULL)"
            )

    cols = _existing_columns(cur)
    if "TOTAL_A_PAGAR" not in cols:
        cur.execute(
            f"""
            ALTER TABLE CONTABILIDADE_GERAL ADD (
                TOTAL_A_PAGAR NUMBER(12,2) GENERATED ALWAYS AS ({SOMA_DESPESAS}) VIRTUAL
            )
            """
        )
    if "SOBRA" not in cols:
        cur.execute(
            f"""
            ALTER TABLE CONTABILIDADE_GERAL ADD (
                SOBRA NUMBER(12,2) GENERATED ALWAYS AS (NVL(SALARIO,0) - ({SOMA_DESPESAS})) VIRTUAL
            )
            """
        )
    if "VALOR_FALTANTE" not in cols:
        cur.execute(
            f"""
            ALTER TABLE CONTABILIDADE_GERAL ADD (
                VALOR_FALTANTE NUMBER(12,2) GENERATED ALWAYS AS (({SOMA_DESPESAS}) - NVL(VALOR_PAGO,0)) VIRTUAL
            )
            """
        )
    _ensure_emprestimos(cur)
    conn.commit()
    if own:
        conn.close()


def _ensure_emprestimos(cur):
    cur.execute(
        """
        SELECT column_name FROM user_tab_cols
        WHERE table_name = 'EMPRESTIMOS' AND hidden_column = 'NO'
        """
    )
    cols = {row[0] for row in cur}
    for calc in ("SALDO_FIM", "TOTAL_PAGO_MES"):
        if calc in cols:
            cur.execute(f"ALTER TABLE EMPRESTIMOS DROP COLUMN {calc}")
    cur.execute(
        """
        ALTER TABLE EMPRESTIMOS ADD (
            SALDO_FIM NUMBER(12,2) GENERATED ALWAYS AS (NVL(SALDO_INICIO,0) - NVL(PAGAMENTO,0)) VIRTUAL,
            TOTAL_PAGO_MES NUMBER(12,2) GENERATED ALWAYS AS (NVL(PAGAMENTO,0) + NVL(JUROS,0)) VIRTUAL
        )
        """
    )


def _parse_sheet(name):
    with zipfile.ZipFile(XLSX) as zf:
        root = ET.fromstring(zf.read(name))
    return {c.get("r"): c for c in root.findall(f".//{NS}c") if c.get("r")}


def _raw_number(cell):
    if cell is None:
        return None
    value = cell.find(f"{NS}v")
    if value is None or not value.text:
        return None
    try:
        return Decimal(value.text)
    except Exception:
        return None


def _formula(cell):
    if cell is None:
        return None
    node = cell.find(f"{NS}f")
    return node.text if node is not None else None


def _eval_arith(expr):
    total = Decimal("0")
    sign = 1
    token = ""
    for ch in expr + "+":
        if ch in "+-" and token:
            total += sign * Decimal(token)
            token = ""
            sign = 1 if ch == "+" else -1
        elif ch in "+-":
            sign = 1 if ch == "+" else -1
        elif ch not in " ":
            token += ch
    return total


def _loan_totals():
    cells = _parse_sheet("xl/worksheets/sheet2.xml")
    saldo1 = Decimal("0")
    saldo2 = Decimal("0")
    totals = {}
    for row in range(2, 22):
        ini1 = _raw_number(cells.get(f"B{row}"))
        ini2 = _raw_number(cells.get(f"G{row}"))
        pag1 = _raw_number(cells.get(f"D{row}"))
        pag2 = _raw_number(cells.get(f"I{row}"))
        if ini1 is not None:
            saldo1 = ini1
        if ini2 is not None:
            saldo2 = ini2
        total = Decimal("0")
        if pag1 is not None and saldo1 > 0:
            total += pag1 + _money(saldo1 * Decimal("0.02"))
            saldo1 = _money(saldo1 - pag1)
        if pag2 is not None and saldo2 > 0:
            total += pag2 + _money(saldo2 * Decimal("0.02"))
            saldo2 = _money(saldo2 - pag2)
        totals[row] = _money(total)
    return totals


def _expense_value(col, row, cells, loans):
    cell = cells.get(f"{col}{row}")
    formula = _formula(cell) or ""
    if formula.startswith("Empres!L"):
        return loans.get(int(formula.replace("Empres!L", "")), Decimal("0"))
    if formula and all(ch in "0123456789.+- " for ch in formula):
        return _money(_eval_arith(formula))
    number = _raw_number(cell)
    return _money(number) if number is not None else Decimal("0")


def seed_from_xlsx(conn=None):
    if not os.path.exists(XLSX):
        return
    own = conn is None
    if own:
        conn = pool.acquire()
    cur = conn.cursor()
    cur.execute(f"SELECT NVL(SUM({SOMA_DESPESAS}),0) FROM CONTABILIDADE_GERAL")
    if _num(cur.fetchone()[0]) > 0:
        if own:
            conn.close()
        return

    cells = _parse_sheet("xl/worksheets/sheet1.xml")
    loans = _loan_totals()
    cols = [chr(c) for c in range(ord("B"), ord("Y") + 1)]
    months = [datetime(y, m, 1) for y in (2026, 2027) for m in range(1, 13)]
    set_sql = ", ".join(f"{c['coluna']} = :{c['id']}" for c in CAMPOS)
    for col, mes in zip(cols, months):
        binds = {"mes": mes, "salario": float(_expense_value(col, 3, cells, loans))}
        total = Decimal("0")
        for campo in CAMPOS:
            value = _expense_value(col, campo["excel"], cells, loans)
            binds[campo["id"]] = float(value)
            total += value
        binds["valor_pago"] = float(_money(total) if mes <= datetime(2026, 8, 1) else Decimal("0"))
        cur.execute(
            f"""
            UPDATE CONTABILIDADE_GERAL
            SET SALARIO = :salario, VALOR_PAGO = :valor_pago, {set_sql}
            WHERE TRUNC(MES, 'MM') = TRUNC(:mes, 'MM')
            """,
            **binds,
        )
    conn.commit()
    if own:
        conn.close()


def _row_to_contab(row):
    data = {
        "id": int(row[0]),
        "mes": _iso_month(row[1]),
        "salario": _num(row[2]),
        "valor_pago": _num(row[3]),
        "total_a_pagar": _num(row[4]),
        "sobra": _num(row[5]),
        "valor_faltante": _num(row[6]),
    }
    for idx, campo in enumerate(CAMPOS, start=7):
        data[campo["id"]] = _num(row[idx])
    return data


def db_fetch_all():
    despesa_select = ", ".join(c["coluna"] for c in CAMPOS)
    with pool.acquire() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT ID, MES, SALARIO, VALOR_PAGO, TOTAL_A_PAGAR, SOBRA, VALOR_FALTANTE, {despesa_select}
            FROM CONTABILIDADE_GERAL
            ORDER BY MES, ID
            """
        )
        contabilidade = [_row_to_contab(row) for row in cur]

        cur.execute(
            """
            SELECT ID, MES, EMPRESTIMO, SALDO_INICIO, JUROS, PAGAMENTO,
                   PAGAMENTO_COM_JUROS, SALDO_FIM, TOTAL_PAGO_MES
            FROM EMPRESTIMOS
            ORDER BY MES, EMPRESTIMO, ID
            """
        )
        emprestimos = []
        for row in cur:
            numero = int(row[2])
            emprestimos.append(
                {
                    "id": int(row[0]),
                    "mes": _iso_month(row[1]),
                    "emprestimo": numero,
                    "saldo_inicio": _num(row[3]),
                    "juros": _num(row[4]),
                    "pagamento": _num(row[5]),
                    "pagamento_com_juros": _num(row[6]),
                    "saldo_fim": _num(row[7]),
                    "total_pago_mes": _num(row[8]),
                    "categoria": f"Empréstimo {numero}",
                }
            )

    return {
        "contabilidade": contabilidade,
        "emprestimos": emprestimos,
        "campos": [
            {
                "id": c["id"],
                "label": c["label"],
                "categoria": c["categoria"],
                "no_total": c["no_total"],
            }
            for c in CAMPOS
        ],
        "categorias": [{"id": i, "label": l} for i, l in CATEGORIAS],
    }


def db_save_contabilidade(payload):
    dt = _month_date(payload["mes"])
    binds = {
        "mes": dt,
        "salario": float(payload.get("salario") or 0),
        "valor_pago": float(payload.get("valor_pago") or 0),
    }
    for campo in CAMPOS:
        binds[campo["id"]] = float(payload.get(campo["id"]) or 0)
    set_sql = ", ".join(f"{c['coluna']} = :{c['id']}" for c in CAMPOS)
    ins_cols = ", ".join(["MES", "SALARIO", "VALOR_PAGO"] + [c["coluna"] for c in CAMPOS])
    ins_vals = ", ".join([":mes", ":salario", ":valor_pago"] + [f":{c['id']}" for c in CAMPOS])
    with pool.acquire() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            MERGE INTO CONTABILIDADE_GERAL t
            USING (SELECT TRUNC(:mes, 'MM') AS mes FROM dual) s
            ON (TRUNC(t.MES, 'MM') = s.mes)
            WHEN MATCHED THEN UPDATE SET
                SALARIO = :salario,
                VALOR_PAGO = :valor_pago,
                {set_sql}
            WHEN NOT MATCHED THEN INSERT ({ins_cols})
                VALUES ({ins_vals})
            """,
            **binds,
        )
        conn.commit()
    return db_fetch_all()


def db_save_emprestimo(payload):
    dt = _month_date(payload["mes"])
    row_id = payload.get("id")
    saldo = float(payload.get("saldo_inicio") or 0)
    pagamento = float(payload.get("pagamento") or 0)
    juros = round(saldo * 0.02, 2)
    data = dict(
        mes=dt,
        emprestimo=int(payload.get("emprestimo") or 1),
        saldo_inicio=saldo,
        juros=juros,
        pagamento=pagamento,
        pagamento_com_juros=round(pagamento + juros, 2),
    )
    with pool.acquire() as conn:
        cur = conn.cursor()
        if row_id:
            cur.execute(
                """
                UPDATE EMPRESTIMOS
                SET MES = :mes,
                    EMPRESTIMO = :emprestimo,
                    SALDO_INICIO = :saldo_inicio,
                    JUROS = :juros,
                    PAGAMENTO = :pagamento,
                    PAGAMENTO_COM_JUROS = :pagamento_com_juros
                WHERE ID = :id
                """,
                **data,
                id=int(row_id),
            )
        else:
            cur.execute(
                """
                INSERT INTO EMPRESTIMOS (
                    MES, EMPRESTIMO, SALDO_INICIO, JUROS, PAGAMENTO, PAGAMENTO_COM_JUROS
                ) VALUES (
                    :mes, :emprestimo, :saldo_inicio, :juros, :pagamento, :pagamento_com_juros
                )
                """,
                **data,
            )
        conn.commit()
    return db_fetch_all()


def db_save_contabilidade_lote(payload):
    for item in payload.get("meses") or []:
        db_save_contabilidade(item)
    return db_fetch_all()


def db_save_emprestimos_lote(payload):
    for item in payload.get("emprestimos") or []:
        db_save_emprestimo(item)
    return db_fetch_all()
    dt = _month_date(payload["mes"])
    row_id = payload.get("id")
    data = dict(
        mes=dt,
        emprestimo=int(payload.get("emprestimo") or 1),
        saldo_inicio=float(payload.get("saldo_inicio") or 0),
        juros=float(payload.get("juros") or 0),
        pagamento=float(payload.get("pagamento") or 0),
        pagamento_com_juros=float(payload.get("pagamento_com_juros") or 0),
    )
    with pool.acquire() as conn:
        cur = conn.cursor()
        if row_id:
            cur.execute(
                """
                UPDATE EMPRESTIMOS
                SET MES = :mes,
                    EMPRESTIMO = :emprestimo,
                    SALDO_INICIO = :saldo_inicio,
                    JUROS = :juros,
                    PAGAMENTO = :pagamento,
                    PAGAMENTO_COM_JUROS = :pagamento_com_juros
                WHERE ID = :id
                """,
                **data,
                id=int(row_id),
            )
        else:
            cur.execute(
                """
                INSERT INTO EMPRESTIMOS (
                    MES, EMPRESTIMO, SALDO_INICIO, JUROS, PAGAMENTO, PAGAMENTO_COM_JUROS
                ) VALUES (
                    :mes, :emprestimo, :saldo_inicio, :juros, :pagamento, :pagamento_com_juros
                )
                """,
                **data,
            )
        conn.commit()
    return db_fetch_all()


def db_delete_emprestimo(row_id):
    with pool.acquire() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM EMPRESTIMOS WHERE ID = :id", id=int(row_id))
        conn.commit()
    return db_fetch_all()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        if "If-None-Match" in self.headers:
            del self.headers["If-None-Match"]
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path in ("/", "/index.html"):
                self.path = "/Controle_Financeiro.html"
                return super().do_GET()
            if path in ("/api/dados", "/api/mes"):
                self._send_json(db_fetch_all())
                return
        except Exception as exc:
            self._send_json({"ok": False, "erro": str(exc)}, status=500)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            payload = self._read_json()
        except json.JSONDecodeError:
            self.send_error(400, "JSON inválido")
            return
        try:
            if path == "/api/contabilidade":
                self._send_json(db_save_contabilidade(payload))
                return
            if path == "/api/contabilidade/lote":
                self._send_json(db_save_contabilidade_lote(payload))
                return
            if path == "/api/emprestimo":
                self._send_json(db_save_emprestimo(payload))
                return
            if path == "/api/emprestimos/lote":
                self._send_json(db_save_emprestimos_lote(payload))
                return
            if path == "/api/emprestimo/excluir":
                self._send_json(db_delete_emprestimo(payload["id"]))
                return
        except Exception as exc:
            self._send_json({"ok": False, "erro": str(exc)}, status=500)
            return
        self.send_error(404)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b"{}"
        return json.loads(body.decode("utf-8"))

    def _send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False, default=_json_default).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        msg = str(args[0]) if args else ""
        if "/api/" not in msg and "favicon" not in msg:
            super().log_message(format, *args)


if __name__ == "__main__":
    pool = oracledb.create_pool(
        user=DB_USER,
        password=DB_PASSWORD,
        dsn=DSN,
        min=1,
        max=4,
        increment=1,
    )
    with pool.acquire() as conn:
        ensure_schema(conn)
        seed_from_xlsx(conn)
    url = f"http://localhost:{PORT}/"
    print(f"Controle Financeiro rodando em {url}")
    print("Pressione Ctrl+C para encerrar.\n")
    webbrowser.open(url)
    ThreadingHTTPServer(("localhost", PORT), Handler).serve_forever()
