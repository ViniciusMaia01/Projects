"""Cards dinâmicos, lançamentos extras, anotações e repetição de valor."""
import re
import unicodedata
from datetime import datetime

from app.config import CAMPOS, CATEGORIAS
from app.erros import ErroValidacao
from app.planilha import dinheiro

_CATEGORIAS = {item[0] for item in CATEGORIAS}
_SISTEMA = {campo["id"]: campo for campo in CAMPOS}


def garantir_tabelas(cur):
    cur.execute("SELECT COUNT(*) FROM user_tables WHERE table_name = 'CARDS'")
    if cur.fetchone()[0] == 0:
        cur.execute(
            """
            CREATE TABLE CARDS (
                ID VARCHAR2(40) PRIMARY KEY,
                LABEL VARCHAR2(80) NOT NULL,
                CATEGORIA VARCHAR2(30) NOT NULL,
                VENCIMENTO NUMBER(2),
                ENTRA_PADRAO NUMBER(1) DEFAULT 1 NOT NULL,
                ORDEM NUMBER(4) DEFAULT 0 NOT NULL,
                ATIVO NUMBER(1) DEFAULT 1 NOT NULL,
                SISTEMA NUMBER(1) DEFAULT 0 NOT NULL,
                DICA VARCHAR2(200),
                CARTAO VARCHAR2(20)
            )
            """
        )
    cur.execute("SELECT COUNT(*) FROM user_tables WHERE table_name = 'CATEGORIAS_USUARIO'")
    if cur.fetchone()[0] == 0:
        cur.execute(
            """
            CREATE TABLE CATEGORIAS_USUARIO (
                ID VARCHAR2(40) PRIMARY KEY,
                LABEL VARCHAR2(60) NOT NULL,
                ORDEM NUMBER(4) DEFAULT 0 NOT NULL
            )
            """
        )
    cur.execute("SELECT COUNT(*) FROM user_tables WHERE table_name = 'LANCAMENTOS'")
    if cur.fetchone()[0] == 0:
        cur.execute(
            """
            CREATE TABLE LANCAMENTOS (
                MES DATE NOT NULL,
                CARD_ID VARCHAR2(40) NOT NULL,
                VALOR NUMBER(12,2) DEFAULT 0 NOT NULL,
                CONSTRAINT LANCAMENTOS_PK PRIMARY KEY (MES, CARD_ID)
            )
            """
        )
    for coluna in ("ITENS_PAGOS", "ITENS_NO_TOTAL"):
        cur.execute(
            """
            SELECT data_length FROM user_tab_cols
            WHERE table_name = 'CONTABILIDADE_GERAL' AND column_name = :nome
            """,
            nome=coluna,
        )
        achado = cur.fetchone()
        if achado and achado[0] < 4000:
            cur.execute(f"ALTER TABLE CONTABILIDADE_GERAL MODIFY ({coluna} VARCHAR2(4000))")
    cur.execute(
        """
        SELECT column_name FROM user_tab_cols
        WHERE table_name = 'CARDS' AND column_name = 'CARTAO'
        """
    )
    if cur.fetchone() is None:
        cur.execute("ALTER TABLE CARDS ADD (CARTAO VARCHAR2(20))")
    existentes = {linha[0] for linha in _selecionar_ids(cur)}
    for ordem, campo in enumerate(CAMPOS):
        dados_card = dict(
            id=campo["id"],
            label=campo["label"],
            categoria=campo["categoria"],
            vencimento=campo.get("vencimento"),
            ordem=ordem * 10,
            dica=campo.get("dica"),
        )
        if campo["id"] not in existentes:
            cur.execute(
                """
                INSERT INTO CARDS (ID, LABEL, CATEGORIA, VENCIMENTO, ENTRA_PADRAO, ORDEM, ATIVO, SISTEMA, DICA)
                VALUES (:id, :label, :categoria, :vencimento, :entra, :ordem, 1, 1, :dica)
                """,
                entra=0 if campo["no_total"] else 1,
                **dados_card,
            )
            continue
        cur.execute(
            """
            UPDATE CARDS
            SET CATEGORIA = :categoria, VENCIMENTO = :vencimento,
                ORDEM = :ordem, DICA = :dica
            WHERE ID = :id AND SISTEMA = 1
            """,
            **{chave: valor for chave, valor in dados_card.items() if chave not in ("label", "id")},
            id=dados_card["id"],
        )


def _selecionar_ids(cur):
    cur.execute("SELECT ID FROM CARDS")
    return cur.fetchall()


def listar(cur):
    cur.execute(
        """
        SELECT ID, LABEL, CATEGORIA, VENCIMENTO, ENTRA_PADRAO, ORDEM, ATIVO, SISTEMA, DICA, CARTAO
        FROM CARDS
        ORDER BY ORDEM, LABEL
        """
    )
    cards = []
    for row in cur:
        cards.append({
            "id": row[0],
            "label": row[1],
            "categoria": row[2],
            "vencimento": int(row[3]) if row[3] is not None else None,
            "entra_padrao": int(row[4] or 0) == 1,
            "ordem": int(row[5] or 0),
            "ativo": int(row[6] or 0) == 1,
            "sistema": int(row[7] or 0) == 1,
            "dica": row[8] or "",
            "cartao": row[9] or "",
        })
    return cards


def extras_por_mes(cur):
    cur.execute("SELECT TO_CHAR(MES, 'YYYY-MM'), CARD_ID, VALOR FROM LANCAMENTOS")
    mapa = {}
    for mes, card_id, valor in cur:
        if card_id in _SISTEMA:
            continue
        mapa.setdefault(mes, {})[card_id] = dinheiro(valor)
    return mapa


def gravar_extra(cur, mes, card_id, valor):
    cur.execute(
        """
        MERGE INTO LANCAMENTOS t
        USING (SELECT TRUNC(:mes, 'MM') AS mes, :card AS card FROM dual) s
        ON (TRUNC(t.MES, 'MM') = s.mes AND t.CARD_ID = s.card)
        WHEN MATCHED THEN UPDATE SET VALOR = :valor
        WHEN NOT MATCHED THEN INSERT (MES, CARD_ID, VALOR) VALUES (:mes, :card, :valor)
        """,
        mes=mes,
        card=card_id,
        valor=valor,
    )


def _slug(texto, usados):
    normal = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    base = re.sub(r"[^a-z0-9]+", "_", normal).strip("_")[:28] or "card"
    candidato = base
    numero = 2
    while candidato in usados:
        candidato = f"{base}_{numero}"
        numero += 1
    return candidato


def _exigir_label(texto):
    label = " ".join(str(texto or "").split())
    if len(label) < 2 or len(label) > 60:
        raise ErroValidacao("O nome do card precisa ter entre 2 e 60 caracteres.")
    return label


def listar_categorias(cur):
    cur.execute("SELECT ID, LABEL FROM CATEGORIAS_USUARIO ORDER BY ORDEM, ID")
    return [{"id": identificador, "label": label} for identificador, label in cur.fetchall()]


def criar_categoria(cur, texto):
    label = " ".join(str(texto or "").split())
    if len(label) < 2 or len(label) > 40:
        raise ErroValidacao("O nome da categoria precisa ter entre 2 e 40 caracteres.")
    existentes = listar_categorias(cur)
    nomes = {item[1].lower() for item in CATEGORIAS} | {item["label"].lower() for item in existentes}
    if label.lower() in nomes:
        raise ErroValidacao("Já existe uma categoria com esse nome.")
    usados = set(_CATEGORIAS) | {item["id"] for item in existentes} | {"receita", "todas", "emprestimos", "novo"}
    identificador = _slug(label, usados)
    cur.execute("SELECT NVL(MAX(ORDEM), 0) FROM CATEGORIAS_USUARIO")
    ordem = int(cur.fetchone()[0]) + 10
    cur.execute(
        "INSERT INTO CATEGORIAS_USUARIO (ID, LABEL, ORDEM) VALUES (:id, :label, :ordem)",
        id=identificador,
        label=label,
        ordem=ordem,
    )
    return identificador


def _exigir_categoria(cur, categoria):
    if categoria in _CATEGORIAS or any(item["id"] == categoria for item in listar_categorias(cur)):
        return categoria
    raise ErroValidacao("Escolha uma categoria.")


def _vencimento(valor):
    if valor in (None, "", 0, "0"):
        return None
    try:
        dia = int(valor)
    except (TypeError, ValueError) as exc:
        raise ErroValidacao("O vencimento é um dia de 1 a 31.") from exc
    if not 1 <= dia <= 31:
        raise ErroValidacao("O vencimento é um dia de 1 a 31.")
    return dia


def _cartao(valor):
    texto = str(valor or "").strip()
    if texto in ("", "nenhum"):
        return None
    if not re.fullmatch(r"[a-z0-9_]{1,40}", texto):
        raise ErroValidacao("Escolha o cartão da fatura.")
    return texto


def criar(cur, payload):
    label = _exigir_label(payload.get("label"))
    if str(payload.get("nova_categoria") or "").strip():
        categoria = criar_categoria(cur, payload.get("nova_categoria"))
    else:
        categoria = _exigir_categoria(cur, payload.get("categoria"))
    dia = _vencimento(payload.get("vencimento"))
    entra = 1 if payload.get("entra_padrao") in (1, True, "1", "true") else 0
    usados = {linha[0] for linha in _selecionar_ids(cur)}
    identificador = _slug(label, usados)
    cur.execute("SELECT NVL(MAX(ORDEM), 0) FROM CARDS")
    ordem = int(cur.fetchone()[0]) + 10
    valor_inicial = dinheiro(payload.get("valor") or 0)
    mes_alvo = str(payload.get("mes") or "").strip()[:7]
    cur.execute(
        """
        INSERT INTO CARDS (ID, LABEL, CATEGORIA, VENCIMENTO, ENTRA_PADRAO, ORDEM, ATIVO, SISTEMA, DICA, CARTAO)
        VALUES (:id, :label, :categoria, :vencimento, :entra, :ordem, 1, 0, NULL, :cartao)
        """,
        id=identificador,
        label=label,
        categoria=categoria,
        vencimento=dia,
        entra=entra,
        ordem=ordem,
        cartao=_cartao(payload.get("cartao")),
    )
    cur.execute("SELECT TO_CHAR(MES, 'YYYY-MM'), ITENS_NO_TOTAL FROM CONTABILIDADE_GERAL")
    meses = cur.fetchall()
    for mes, atual in meses:
        data = datetime(int(mes[:4]), int(mes[5:7]), 1)
        gravar_extra(
            cur,
            data,
            identificador,
            valor_inicial if mes == mes_alvo else dinheiro(0),
        )
        if not entra:
            continue
        itens = [parte for parte in str(atual or "").split(",") if parte]
        if identificador not in itens:
            itens.append(identificador)
            cur.execute(
                "UPDATE CONTABILIDADE_GERAL SET ITENS_NO_TOTAL = :itens WHERE TRUNC(MES, 'MM') = TRUNC(:mes, 'MM')",
                itens=",".join(itens),
                mes=data,
            )
    return identificador


def atualizar(cur, payload):
    identificador = str(payload.get("id") or "")
    atual = next((card for card in listar(cur) if card["id"] == identificador), None)
    if not atual:
        raise ErroValidacao("Card não encontrado.")
    label = _exigir_label(payload.get("label", atual["label"]))
    categoria = _exigir_categoria(cur, payload.get("categoria", atual["categoria"]))
    if "vencimento" in payload:
        dia = _vencimento(payload.get("vencimento"))
    else:
        dia = atual["vencimento"]
    if "entra_padrao" in payload:
        entra = 1 if payload.get("entra_padrao") in (1, True, "1", "true") else 0
    else:
        entra = 1 if atual["entra_padrao"] else 0
    if "ativo" in payload:
        ativo = 1 if payload.get("ativo") in (1, True, "1", "true") else 0
    else:
        ativo = 1 if atual["ativo"] else 0
    cartao = _cartao(payload.get("cartao")) if "cartao" in payload else (atual.get("cartao") or None)
    cur.execute(
        """
        UPDATE CARDS
        SET LABEL = :label, CATEGORIA = :categoria, VENCIMENTO = :vencimento,
            ENTRA_PADRAO = :entra, ATIVO = :ativo, CARTAO = :cartao
        WHERE ID = :id
        """,
        label=label,
        categoria=categoria,
        vencimento=dia,
        entra=entra,
        ativo=ativo,
        cartao=cartao,
        id=identificador,
    )


def excluir(cur, identificador):
    atual = next((card for card in listar(cur) if card["id"] == identificador), None)
    if not atual:
        raise ErroValidacao("Card não encontrado.")
    if atual["sistema"]:
        raise ErroValidacao("Esse card veio da planilha. Use ocultar para tirá-lo da tela.")
    cur.execute("DELETE FROM LANCAMENTOS WHERE CARD_ID = :id", id=identificador)
    cur.execute("DELETE FROM CARDS WHERE ID = :id", id=identificador)
    cur.execute("SELECT MES, ITENS_PAGOS, ITENS_NO_TOTAL FROM CONTABILIDADE_GERAL")
    for mes, pagos, entra in cur.fetchall():
        novos_pagos = ",".join(parte for parte in str(pagos or "").split(",") if parte and parte != identificador)
        novos_entra = ",".join(parte for parte in str(entra or "").split(",") if parte and parte != identificador)
        cur.execute(
            """
            UPDATE CONTABILIDADE_GERAL
            SET ITENS_PAGOS = :pagos, ITENS_NO_TOTAL = :entra
            WHERE MES = :mes
            """,
            pagos=novos_pagos or None,
            entra=novos_entra or None,
            mes=mes,
        )


def salvar_observacao(cur, payload, mes_data, valor):
    texto = " ".join(str(payload.get("texto") or "").split())
    if len(texto) < 2 or len(texto) > 400:
        raise ErroValidacao("A anotação precisa ter entre 2 e 400 caracteres.")
    tipo = str(payload.get("tipo") or "nota")[:30]
    apelido = " ".join(str(payload.get("apelido") or "").split())[:80]
    row_id = payload.get("id")
    if row_id:
        cur.execute(
            """
            UPDATE OBSERVACOES
            SET MES = :mes, VALOR = :valor, TEXTO = :texto, TIPO = :tipo, APELIDO = :apelido
            WHERE ID = :id
            """,
            mes=mes_data,
            valor=valor,
            texto=texto,
            tipo=tipo,
            apelido=apelido or None,
            id=int(row_id),
        )
        if cur.rowcount == 0:
            raise ErroValidacao("Anotação não encontrada.")
        return
    cur.execute(
        """
        INSERT INTO OBSERVACOES (MES, VALOR, TEXTO, TIPO, APELIDO)
        VALUES (:mes, :valor, :texto, :tipo, :apelido)
        """,
        mes=mes_data,
        valor=valor,
        texto=texto,
        tipo=tipo,
        apelido=apelido or None,
    )


def excluir_observacao(cur, row_id):
    cur.execute("DELETE FROM OBSERVACOES WHERE ID = :id", id=int(row_id))
    if cur.rowcount == 0:
        raise ErroValidacao("Anotação não encontrada.")


def meses_ate_dezembro(mes):
    ano = int(mes[:4])
    inicio = int(mes[5:])
    return [f"{ano}-{numero:02d}" for numero in range(inicio, 13)]


def data_mes(mes):
    return datetime.strptime(mes, "%Y-%m")
