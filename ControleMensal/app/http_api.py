"""API local do controle mensal."""
import json
import mimetypes
from datetime import datetime
from decimal import Decimal
from http.server import SimpleHTTPRequestHandler
from urllib.parse import urlparse

from app.banco import (
    ErroValidacao,
    atualizar_card,
    buscar_tudo,
    criar_card,
    excluir_card,
    excluir_emprestimo,
    excluir_observacao,
    exportar_mes,
    repetir_valor,
    salvar_contabilidade,
    salvar_contabilidade_lote,
    salvar_emprestimo,
    salvar_emprestimos_lote,
    salvar_observacao,
    quitar_emprestimo,
)
from app.config import WEB_DIR
from app import pg
from app import sessao

mimetypes.add_type("text/css", ".css")
mimetypes.add_type("text/javascript", ".js")


def _json_default(valor):
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, datetime):
        return valor.isoformat()
    raise TypeError(type(valor))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

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
        for cabecalho in ("If-Modified-Since", "If-None-Match"):
            if cabecalho in self.headers:
                del self.headers[cabecalho]
        caminho = urlparse(self.path).path
        if caminho == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        if caminho == "/api/sessao":
            usuario = sessao.carregar(sessao.ler_cookie(self.headers.get("Cookie")))
            if not usuario:
                self._send_json({"ok": False, "erro": "Faça login."}, status=401)
                return
            self._send_json({"ok": True, **usuario})
            return
        if caminho.startswith("/api/"):
            if not self._entrar():
                return
            try:
                self._get_api(caminho)
            finally:
                self._sair()
            return
        if caminho in ("/", "/index.html", "/Controle_Financeiro.html"):
            self.path = "/index.html"
        super().do_GET()

    def _get_api(self, caminho):
        try:
            if caminho in ("/api/dados", "/api/mes"):
                self._send_json(buscar_tudo())
                return
            if caminho.startswith("/api/exportar/"):
                mes = caminho.rstrip("/").rsplit("/", 1)[-1]
                conteudo, nome = exportar_mes(mes)
                self.send_response(200)
                self.send_header(
                    "Content-Type",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
                self.send_header("Content-Disposition", f'attachment; filename="{nome}"')
                self.send_header("Content-Length", str(len(conteudo)))
                self.end_headers()
                self.wfile.write(conteudo)
                return
            self.send_error(404)
        except ErroValidacao as exc:
            self._send_json({"ok": False, "erro": str(exc)}, status=400)
        except Exception as exc:
            self._send_json({"ok": False, "erro": str(exc)}, status=500)

    def do_POST(self):
        caminho = urlparse(self.path).path
        if caminho == "/api/login":
            self._login()
            return
        if caminho == "/api/sair":
            sessao.sair(sessao.ler_cookie(self.headers.get("Cookie")))
            self._cookie = sessao.cookie_vazio()
            self._send_json({"ok": True})
            return
        if not self._entrar():
            return
        try:
            self._post_api(caminho)
        finally:
            self._sair()

    def _login(self):
        try:
            payload = self._read_json()
            resultado = sessao.entrar(payload.get("login"), payload.get("senha"))
        except json.JSONDecodeError:
            self._send_json({"ok": False, "erro": "JSON inválido"}, status=400)
            return
        except ErroValidacao as exc:
            self._send_json({"ok": False, "erro": str(exc)}, status=401)
            return
        except Exception as exc:
            self._send_json({"ok": False, "erro": str(exc)}, status=500)
            return
        self._cookie = sessao.cookie(resultado["token"])
        self._send_json({
            "ok": True,
            "id": resultado["id"],
            "usuario": resultado["usuario"],
            "email": resultado["email"],
        })

    def _post_api(self, caminho):
        try:
            payload = self._read_json()
        except json.JSONDecodeError:
            self._send_json({"ok": False, "erro": "JSON inválido"}, status=400)
            return
        rotas = {
            "/api/contabilidade": salvar_contabilidade,
            "/api/contabilidade/lote": salvar_contabilidade_lote,
            "/api/contabilidade/repetir": repetir_valor,
            "/api/emprestimo": salvar_emprestimo,
            "/api/emprestimo/quitar": quitar_emprestimo,
            "/api/emprestimos/lote": salvar_emprestimos_lote,
            "/api/cards": criar_card,
            "/api/cards/atualizar": atualizar_card,
            "/api/observacao": salvar_observacao,
        }
        try:
            if caminho == "/api/conta":
                self._send_json(sessao.atualizar(
                    pg.exigir_usuario(),
                    payload.get("usuario"),
                    payload.get("email"),
                    payload.get("senha_atual") or "",
                    payload.get("senha_nova") or "",
                ))
                return
            if caminho in rotas:
                self._send_json(rotas[caminho](payload))
                return
            if caminho == "/api/emprestimo/excluir":
                self._send_json(excluir_emprestimo(payload["id"]))
                return
            if caminho == "/api/cards/excluir":
                self._send_json(excluir_card(payload))
                return
            if caminho == "/api/observacao/excluir":
                self._send_json(excluir_observacao(payload))
                return
            self.send_error(404)
        except ErroValidacao as exc:
            self._send_json({"ok": False, "erro": str(exc)}, status=400)
        except Exception as exc:
            self._send_json({"ok": False, "erro": str(exc)}, status=500)

    def _entrar(self):
        usuario = sessao.carregar(sessao.ler_cookie(self.headers.get("Cookie")))
        if not usuario:
            self._send_json({"ok": False, "erro": "Faça login."}, status=401)
            return False
        self._ctx = pg.definir_usuario(usuario["id"])
        return True

    def _sair(self):
        ctx = getattr(self, "_ctx", None)
        if ctx is not None:
            pg.limpar_usuario(ctx)
            self._ctx = None

    def _read_json(self):
        tamanho = int(self.headers.get("Content-Length") or 0)
        corpo = self.rfile.read(tamanho) if tamanho else b"{}"
        return json.loads(corpo.decode("utf-8"))

    def _send_json(self, dados, status=200):
        payload = json.dumps(dados, ensure_ascii=False, default=_json_default).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        if getattr(self, "_cookie", None):
            self.send_header("Set-Cookie", self._cookie)
            self._cookie = None
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, formato, *args):
        mensagem = str(args[0]) if args else ""
        if "/api/" not in mensagem and "favicon" not in mensagem:
            super().log_message(formato, *args)
