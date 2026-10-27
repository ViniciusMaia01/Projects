"""Conexão PostgreSQL e isolamento por usuário."""
import contextvars
import re

import psycopg
from psycopg.pq import TransactionStatus
from psycopg_pool import ConnectionPool

from app.config import PG_DB, PG_HOST, PG_PASSWORD, PG_PORT, PG_USER
from app.erros import ErroValidacao

_usuario = contextvars.ContextVar("usuario_id", default=None)
_pool = None

_TABELAS = (
    "CARDS",
    "CATEGORIAS_USUARIO",
    "CONTABILIDADE_GERAL",
    "EMPRESTIMOS",
    "HISTORICO",
    "LANCAMENTOS",
    "OBSERVACOES",
)
_ESCOPO = re.compile(
    r"(?i)\b(?:FROM|INTO|UPDATE|DELETE\s+FROM)\s+(" + "|".join(_TABELAS) + r")\b"
)
_BIND = re.compile(r"(?<!:):([A-Za-z_][A-Za-z0-9_]*)")
_TRUNC = re.compile(r"(?i)\bTRUNC\(\s*([^,]+?)\s*,\s*'MM'\s*\)")
_NVL = re.compile(r"(?i)\bNVL\s*\(")


def definir_usuario(usuario_id):
    return _usuario.set(usuario_id)


def limpar_usuario(token):
    _usuario.reset(token)


def usuario_atual():
    return _usuario.get()


def exigir_usuario():
    valor = _usuario.get()
    if not valor:
        raise ErroValidacao("Faça login.")
    return valor


def _injetar(sql):
    if re.match(r"(?i)\s*INSERT\b", sql):
        sql = re.sub(
            r"(?i)(INSERT\s+INTO\s+[A-Za-z_]+\s*\()",
            r"\1usuario_id, ",
            sql,
            count=1,
        )
        return re.sub(r"(?i)VALUES\s*\(", "VALUES (:usuario_id, ", sql, count=1)
    if re.search(r"(?i)\bWHERE\b", sql):
        return re.sub(
            r"(?i)\bWHERE\b",
            "WHERE usuario_id = :usuario_id AND",
            sql,
            count=1,
        )
    ponto = re.search(r"(?i)\b(ORDER\s+BY|GROUP\s+BY|LIMIT)\b", sql)
    if ponto:
        return sql[:ponto.start()] + " WHERE usuario_id = :usuario_id " + sql[ponto.start():]
    return sql.rstrip() + " WHERE usuario_id = :usuario_id"


def adaptar(sql, escopo=True):
    sql = _NVL.sub("COALESCE(", sql)
    sql = _TRUNC.sub(r"date_trunc('month', \1)", sql)
    if escopo and _ESCOPO.search(sql) and not re.search(r"(?i)\busuario_id\b", sql):
        if usuario_atual() is None:
            raise RuntimeError("Consulta de dados sem usuário logado.")
        sql = _injetar(sql)
    return _BIND.sub(r"%(\1)s", sql)


class Cursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, sql, *args, escopo=True, **kwargs):
        params = dict(kwargs)
        if len(args) == 1 and isinstance(args[0], dict):
            params.update(args[0])
        elif args:
            raise TypeError("Use parâmetros nomeados.")
        sql = adaptar(sql, escopo=escopo)
        if "%(usuario_id)s" in sql and "usuario_id" not in params:
            params["usuario_id"] = exigir_usuario()
        self._cursor.execute(sql, params or None)
        return self

    def executemany(self, sql, seq, escopo=True):
        sql = adaptar(sql, escopo=escopo)
        linhas = []
        for item in seq:
            params = dict(item)
            if "%(usuario_id)s" in sql and "usuario_id" not in params:
                params["usuario_id"] = exigir_usuario()
            linhas.append(params)
        if linhas:
            self._cursor.executemany(sql, linhas)
        return self

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def __iter__(self):
        return iter(self._cursor)

    @property
    def rowcount(self):
        return self._cursor.rowcount


class Conexao:
    def __init__(self, pool, bruta):
        self._pool = pool
        self._bruta = bruta
        self._fechada = False

    def cursor(self):
        return Cursor(self._bruta.cursor())

    def commit(self):
        self._bruta.commit()

    def rollback(self):
        self._bruta.rollback()

    def close(self):
        if self._fechada:
            return
        if self._bruta.info.transaction_status != TransactionStatus.IDLE:
            self._bruta.rollback()
        self._pool.putconn(self._bruta)
        self._fechada = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc:
            self.rollback()
        self.close()
        return False


class Pool:
    def __init__(self, pool):
        self._pool = pool

    def acquire(self):
        return Conexao(self._pool, self._pool.getconn())


def iniciar():
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=psycopg.conninfo.make_conninfo(
                host=PG_HOST,
                port=PG_PORT,
                dbname=PG_DB,
                user=PG_USER,
                password=PG_PASSWORD,
            ),
            min_size=1,
            max_size=4,
            kwargs={"autocommit": False},
            open=True,
        )
    return Pool(_pool)
