"""Sobe o controle mensal em http://localhost:8765."""
from http.server import ThreadingHTTPServer

from app.banco import preparar
from app.config import PORT
from app.http_api import Handler


def main():
    resultado = preparar(importar=False)
    if resultado:
        print(
            f"Planilha {resultado['arquivo']} importada: "
            f"{resultado['meses']} meses, {resultado['emprestimos']} parcelas."
        )
    url = f"http://localhost:{PORT}/"
    print(f"Controle mensal em {url}")
    print("Pressione Ctrl+C para encerrar.\n")
    ThreadingHTTPServer(("localhost", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
