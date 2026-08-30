"""Servidor local para o Controle Financeiro — lê/grava JSON no disco."""
import json
import os
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP = os.path.join(DIR, "finance-data-backup.json")
ATUAL = os.path.join(DIR, "finance-data-atual.json")
PORT = 8765


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/dados":
            self._send_json(self._read_atual())
        elif self.path == "/api/backup":
            self._send_json(self._read_backup())
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/dados":
            body = self.rfile.read(int(self.headers["Content-Length"]))
            try:
                data = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                self.send_error(400, "JSON inválido")
                return
            with open(ATUAL, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._send_json({"ok": True, "file": "finance-data-atual.json"})
        elif self.path == "/api/restaurar":
            backup = self._read_backup()
            with open(ATUAL, "w", encoding="utf-8") as f:
                json.dump(backup, f, ensure_ascii=False, indent=2)
            self._send_json({"ok": True, "data": backup})
        else:
            self.send_error(404)

    def _read_backup(self):
        with open(BACKUP, encoding="utf-8") as f:
            return json.load(f)

    def _read_atual(self):
        if os.path.exists(ATUAL):
            with open(ATUAL, encoding="utf-8") as f:
                return json.load(f)
        backup = self._read_backup()
        with open(ATUAL, "w", encoding="utf-8") as f:
            json.dump(backup, f, ensure_ascii=False, indent=2)
        return backup

    def _send_json(self, data):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        msg = str(args[0]) if args else ""
        if "/api/" not in msg and "favicon" not in msg:
            super().log_message(format, *args)


if __name__ == "__main__":
    if not os.path.exists(BACKUP):
        raise SystemExit(f"Arquivo não encontrado: {BACKUP}")

    url = f"http://localhost:{PORT}/Controle_Financeiro.html"
    print(f"Controle Financeiro rodando em {url}")
    print("  backup -> finance-data-backup.json  (nao alterado)")
    print("  atual  -> finance-data-atual.json   (salvo a cada mudanca)")
    print("Pressione Ctrl+C para encerrar.\n")

    webbrowser.open(url)
    ThreadingHTTPServer(("localhost", PORT), Handler).serve_forever()
