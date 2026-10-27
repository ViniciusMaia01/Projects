"""Login por usuário ou e-mail e sessão no PostgreSQL."""
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from app.erros import ErroValidacao
from app.pg import iniciar

_COOKIE = "sessao"
_DIAS = 30


def hash_senha(senha, sal=None):
    if sal is None:
        sal = secrets.token_bytes(16)
    chave = hashlib.scrypt(senha.encode("utf-8"), salt=sal, n=2**14, r=8, p=1, dklen=32)
    return f"{sal.hex()}${chave.hex()}"


def verificar_senha(senha, armazenada):
    sal_hex, chave_hex = armazenada.split("$", 1)
    sal = bytes.fromhex(sal_hex)
    conferida = hashlib.scrypt(senha.encode("utf-8"), salt=sal, n=2**14, r=8, p=1, dklen=32)
    return secrets.compare_digest(conferida.hex(), chave_hex)


def cookie(token):
    return f"{_COOKIE}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={_DIAS * 24 * 3600}"


def cookie_vazio():
    return f"{_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"


def ler_cookie(cabecalho):
    if not cabecalho:
        return ""
    for parte in cabecalho.split(";"):
        if "=" not in parte:
            continue
        chave, valor = parte.strip().split("=", 1)
        if chave == _COOKIE:
            return valor
    return ""


def _agora():
    return datetime.now(timezone.utc)


def entrar(login, senha):
    texto = " ".join(str(login or "").split())
    if not texto or not senha:
        raise ErroValidacao("Informe usuário ou e-mail e a senha.")
    with iniciar().acquire() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, usuario, email, senha_hash
            FROM usuarios
            WHERE lower(usuario) = lower(:login)
            """,
            login=texto,
            escopo=False,
        )
        achado = cur.fetchone()
        if not achado:
            cur.execute(
                """
                SELECT id, usuario, email, senha_hash
                FROM usuarios
                WHERE lower(email) = lower(:login)
                """,
                login=texto,
                escopo=False,
            )
            achado = cur.fetchone()
        if not achado or not verificar_senha(str(senha), achado[3]):
            raise ErroValidacao("Usuário ou senha inválidos.")
        token = secrets.token_urlsafe(32)
        cur.execute(
            """
            INSERT INTO sessoes (token, usuario_id, expira)
            VALUES (:token, :usuario, :expira)
            """,
            token=token,
            usuario=achado[0],
            expira=_agora() + timedelta(days=_DIAS),
            escopo=False,
        )
        conn.commit()
    return {"token": token, "id": int(achado[0]), "usuario": achado[1], "email": achado[2]}


def carregar(token):
    if not token:
        return None
    with iniciar().acquire() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT u.id, u.usuario, u.email
            FROM sessoes s
            JOIN usuarios u ON u.id = s.usuario_id
            WHERE s.token = :token AND s.expira > :agora
            """,
            token=token,
            agora=_agora(),
            escopo=False,
        )
        linha = cur.fetchone()
    if not linha:
        return None
    return {"id": int(linha[0]), "usuario": linha[1], "email": linha[2]}


def atualizar(usuario_id, usuario, email, senha_atual, senha_nova):
    usuario = " ".join(str(usuario or "").split())
    email = str(email or "").strip().lower()
    senha_nova = str(senha_nova or "")
    if not re.fullmatch(r"[A-Za-z0-9._-]{3,40}", usuario):
        raise ErroValidacao("O usuário precisa ter de 3 a 40 caracteres, sem espaço.")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+", email) or len(email) > 120:
        raise ErroValidacao("Informe um e-mail válido.")
    if not str(senha_atual or ""):
        raise ErroValidacao("Informe a senha atual.")
    if senha_nova and len(senha_nova) < 6:
        raise ErroValidacao("A nova senha precisa ter pelo menos 6 caracteres.")
    with iniciar().acquire() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT senha_hash FROM usuarios WHERE id = :id",
            id=usuario_id,
            escopo=False,
        )
        achado = cur.fetchone()
        if not achado or not verificar_senha(senha_atual, achado[0]):
            raise ErroValidacao("A senha atual não confere.")
        cur.execute(
            """
            SELECT id FROM usuarios
            WHERE id <> :id AND (lower(usuario) = lower(:usuario) OR lower(email) = lower(:email))
            """,
            id=usuario_id,
            usuario=usuario,
            email=email,
            escopo=False,
        )
        if cur.fetchone():
            raise ErroValidacao("Esse usuário ou e-mail já está em uso.")
        if senha_nova:
            cur.execute(
                """
                UPDATE usuarios
                SET usuario = :usuario, email = :email, senha_hash = :senha
                WHERE id = :id
                """,
                usuario=usuario,
                email=email,
                senha=hash_senha(senha_nova),
                id=usuario_id,
                escopo=False,
            )
        else:
            cur.execute(
                "UPDATE usuarios SET usuario = :usuario, email = :email WHERE id = :id",
                usuario=usuario,
                email=email,
                id=usuario_id,
                escopo=False,
            )
        conn.commit()
    return {"ok": True, "id": usuario_id, "usuario": usuario, "email": email}


def sair(token):
    if not token:
        return
    with iniciar().acquire() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM sessoes WHERE token = :token", token=token, escopo=False)
        conn.commit()
