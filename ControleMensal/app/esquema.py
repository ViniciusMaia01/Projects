"""Tabelas compartilhadas, com um id de usuário em cada linha."""
import json
import secrets
from pathlib import Path

from app.config import DADOS_DIR
from app.sessao import hash_senha

_DADOS = (
    "cards",
    "categorias_usuario",
    "contabilidade_geral",
    "emprestimos",
    "historico",
    "lancamentos",
    "observacoes",
)


def _colunas(cur, tabela):
    cur.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :tabela
        """,
        tabela=tabela,
        escopo=False,
    )
    return {linha[0] for linha in cur.fetchall()}


def _pk(cur, tabela):
    cur.execute(
        """
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
        WHERE i.indrelid = (:tabela)::regclass AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)
        """,
        tabela=tabela,
        escopo=False,
    )
    return [linha[0] for linha in cur.fetchall()]


def _contas_iniciais():
    destino = Path(DADOS_DIR) / "acessos.json"
    if not destino.exists():
        return []
    dados = json.loads(destino.read_text(encoding="utf-8"))
    contas = []
    for conta in dados.get("site", {}).get("contas", []):
        usuario = " ".join(str(conta.get("usuario") or "").split())
        email = " ".join(str(conta.get("email") or "").split())
        senha = str(conta.get("senha") or "")
        if usuario and email and senha:
            contas.append({"usuario": usuario, "email": email, "senha": senha})
    return contas


def _criar_usuario_inicial(cur):
    cur.execute("SELECT COUNT(*) FROM usuarios", escopo=False)
    if cur.fetchone()[0]:
        cur.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1", escopo=False)
        return cur.fetchone()[0]
    contas = _contas_iniciais()
    if not contas:
        senha = secrets.token_urlsafe(9)
        contas = [{"usuario": "master", "email": "master@localhost", "senha": senha}]
        _guardar_acesso("master", "master@localhost", senha)
    primeiro = None
    for conta in contas:
        cur.execute(
            """
            INSERT INTO usuarios (usuario, email, senha_hash)
            VALUES (:usuario, :email, :senha)
            RETURNING id
            """,
            usuario=conta["usuario"],
            email=conta["email"],
            senha=hash_senha(conta["senha"]),
            escopo=False,
        )
        novo = cur.fetchone()[0]
        if primeiro is None:
            primeiro = novo
    return primeiro


def _guardar_acesso(usuario, email, senha):
    destino = Path(DADOS_DIR) / "acessos.json"
    dados = {}
    if destino.exists():
        dados = json.loads(destino.read_text(encoding="utf-8"))
    site = dados.setdefault("site", {})
    site.setdefault("url", "http://localhost:8765")
    contas = site.setdefault("contas", [])
    for conta in contas:
        if conta.get("usuario") == usuario:
            conta["email"] = email
            conta["senha"] = senha
            break
    else:
        contas.insert(0, {"usuario": usuario, "email": email, "senha": senha})
    destino.write_text(
        json.dumps(dados, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _dono(cur, tabela, usuario_id):
    if "usuario_id" not in _colunas(cur, tabela):
        cur.execute(
            f"ALTER TABLE {tabela} ADD COLUMN usuario_id bigint",
            escopo=False,
        )
    cur.execute(
        f"UPDATE {tabela} SET usuario_id = :usuario WHERE usuario_id IS NULL",
        usuario=usuario_id,
        escopo=False,
    )
    cur.execute(
        f"ALTER TABLE {tabela} ALTER COLUMN usuario_id SET NOT NULL",
        escopo=False,
    )
    cur.execute(
        """
        SELECT 1 FROM pg_constraint
        WHERE conname = :nome
        """,
        nome=f"{tabela}_usuario_fk",
        escopo=False,
    )
    if cur.fetchone() is None:
        cur.execute(
            f"""
            ALTER TABLE {tabela}
            ADD CONSTRAINT {tabela}_usuario_fk
            FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
            """,
            escopo=False,
        )
    cur.execute(
        f"CREATE INDEX IF NOT EXISTS {tabela}_usuario_idx ON {tabela} (usuario_id)",
        escopo=False,
    )


def _trocar_pk(cur, tabela, colunas):
    atual = _pk(cur, tabela)
    if atual == colunas:
        return
    cur.execute(
        """
        SELECT conname FROM pg_constraint
        WHERE conrelid = (:tabela)::regclass AND contype = 'p'
        """,
        tabela=tabela,
        escopo=False,
    )
    nome = cur.fetchone()
    if nome:
        cur.execute(f"ALTER TABLE {tabela} DROP CONSTRAINT {nome[0]}", escopo=False)
    lista = ", ".join(colunas)
    cur.execute(f"ALTER TABLE {tabela} ADD PRIMARY KEY ({lista})", escopo=False)


def _criar_tabelas(cur):
    comandos = (
        """
        CREATE TABLE IF NOT EXISTS cards (
            id varchar NOT NULL PRIMARY KEY,
            label varchar NOT NULL,
            categoria varchar NOT NULL,
            vencimento smallint,
            entra_padrao smallint NOT NULL DEFAULT 0,
            ordem smallint NOT NULL DEFAULT 0,
            ativo smallint NOT NULL DEFAULT 1,
            sistema smallint NOT NULL DEFAULT 0,
            dica varchar,
            cartao varchar
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS categorias_usuario (
            id varchar NOT NULL PRIMARY KEY,
            label varchar NOT NULL,
            ordem smallint NOT NULL DEFAULT 0
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS contabilidade_geral (
            id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            mes timestamp NOT NULL,
            salario numeric NOT NULL DEFAULT 0,
            valor_pago numeric NOT NULL DEFAULT 0,
            das numeric NOT NULL DEFAULT 0,
            maximo numeric NOT NULL DEFAULT 0,
            oliveira numeric NOT NULL DEFAULT 0,
            gabriel numeric NOT NULL DEFAULT 0,
            aluguel numeric NOT NULL DEFAULT 0,
            variaveis numeric NOT NULL DEFAULT 0,
            internet numeric NOT NULL DEFAULT 0,
            netflix numeric NOT NULL DEFAULT 0,
            spotify numeric NOT NULL DEFAULT 0,
            youtube numeric NOT NULL DEFAULT 0,
            bradesco numeric NOT NULL DEFAULT 0,
            mercado_pago numeric NOT NULL DEFAULT 0,
            nubank numeric NOT NULL DEFAULT 0,
            emprestimo_nu numeric NOT NULL DEFAULT 0,
            gasolina numeric NOT NULL DEFAULT 0,
            investimento numeric NOT NULL DEFAULT 0,
            itens_pagos varchar,
            hbo numeric NOT NULL DEFAULT 0,
            itens_no_total varchar,
            detalhes varchar,
            total_a_pagar numeric NOT NULL DEFAULT 0,
            sobra numeric NOT NULL DEFAULT 0,
            valor_faltante numeric NOT NULL DEFAULT 0,
            formulas varchar
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS emprestimos (
            id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            mes timestamp NOT NULL,
            emprestimo smallint NOT NULL,
            saldo_inicio numeric NOT NULL DEFAULT 0,
            juros numeric NOT NULL DEFAULT 0,
            pagamento numeric NOT NULL DEFAULT 0,
            pagamento_com_juros numeric NOT NULL DEFAULT 0,
            pago smallint NOT NULL DEFAULT 0,
            pagamento_previsto numeric,
            saldo_fim numeric,
            total_pago_mes numeric
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS historico (
            id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            mes timestamp NOT NULL,
            emprestimo smallint NOT NULL,
            valor numeric NOT NULL DEFAULT 0,
            saldo numeric NOT NULL DEFAULT 0,
            texto varchar NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS lancamentos (
            mes timestamp NOT NULL,
            card_id varchar NOT NULL,
            valor numeric NOT NULL DEFAULT 0
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS observacoes (
            id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            mes timestamp NOT NULL,
            valor numeric NOT NULL DEFAULT 0,
            texto varchar NOT NULL,
            tipo varchar NOT NULL,
            apelido varchar
        )
        """,
    )
    for comando in comandos:
        cur.execute(comando, escopo=False)


def garantir(conn):
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS usuarios (
            id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            usuario varchar(40) NOT NULL,
            email varchar(120) NOT NULL,
            senha_hash text NOT NULL,
            criado_em timestamptz NOT NULL DEFAULT now()
        )
        """,
        escopo=False,
    )
    cur.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS usuarios_usuario_lower
        ON usuarios (lower(usuario))
        """,
        escopo=False,
    )
    cur.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_lower
        ON usuarios (lower(email))
        """,
        escopo=False,
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessoes (
            token text PRIMARY KEY,
            usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
            expira timestamptz NOT NULL
        )
        """,
        escopo=False,
    )
    _criar_tabelas(cur)
    usuario_id = _criar_usuario_inicial(cur)
    for tabela in _DADOS:
        _dono(cur, tabela, usuario_id)
        cur.execute(
            f"UPDATE {tabela} SET mes = date_trunc('month', mes) WHERE mes IS NOT NULL",
            escopo=False,
        ) if "mes" in _colunas(cur, tabela) else None
    _trocar_pk(cur, "cards", ["usuario_id", "id"])
    _trocar_pk(cur, "categorias_usuario", ["usuario_id", "id"])
    _trocar_pk(cur, "lancamentos", ["usuario_id", "mes", "card_id"])
    cur.execute(
        """
        SELECT 1 FROM pg_constraint
        WHERE conname = 'contabilidade_usuario_mes'
        """,
        escopo=False,
    )
    if cur.fetchone() is None:
        cur.execute(
            """
            SELECT usuario_id, mes, COUNT(*)
            FROM contabilidade_geral
            GROUP BY usuario_id, mes
            HAVING COUNT(*) > 1
            """,
            escopo=False,
        )
        if cur.fetchone():
            raise RuntimeError("Há mais de um lançamento no mesmo mês para o mesmo usuário.")
        cur.execute(
            """
            ALTER TABLE contabilidade_geral
            ADD CONSTRAINT contabilidade_usuario_mes UNIQUE (usuario_id, mes)
            """,
            escopo=False,
        )
    cur.execute(
        """
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename ~ '^usuario_[0-9]+$'
        """,
        escopo=False,
    )
    extras = [linha[0] for linha in cur.fetchall()]
    for nome in extras:
        cur.execute(f"DROP TABLE {nome}", escopo=False)
    conn.commit()
    return extras
