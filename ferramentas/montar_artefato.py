"""Monta o site numa página única para publicar como artefato do Claude.

O artefato recebe o HTML sem <html>/<head>/<body> (a plataforma coloca esse
esqueleto) e não carrega folhas de estilo nem scripts próprios por arquivo,
então CSS e JavaScript entram embutidos. Dados e lâminas vão como arquivos
ao lado da página.

Uso:
    python ferramentas/montar_artefato.py site/ saida/ --endereco https://claude.ai/artifact/...
Imprime a lista de arquivos publicados (JSON), para o envio.
"""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path


def montar(pasta_site, saida, endereco=""):
    site = Path(pasta_site)
    saida = Path(saida)
    html = (site / "index.html").read_text(encoding="utf-8")

    def estilo(m):
        return "<style>\n" + (site / m.group(1)).read_text(encoding="utf-8") + "\n</style>"

    def script(m):
        # "</script" dentro do código fecharia a tag antes da hora.
        codigo = (site / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
        return "<script>\n" + codigo + "\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="([\w.-]+\.css)" />', estilo, html)
    html = re.sub(r'<script src="([\w.-]+\.js)"></script>', script, html)
    for tag in ("<!doctype html>", "</html>", "<head>", "</head>", "<body>", "</body>"):
        html = html.replace(tag, "")
    html = re.sub(r'<html lang="pt-BR" data-endereco="">', "", html)
    html = re.sub(r'\s*<meta charset="utf-8" />', "", html)
    html = re.sub(r'\s*<meta name="viewport"[^>]*/>', "", html)
    # Sem <html> próprio, o endereço público vai num script que marca o elemento raiz da página.
    marca = f"<script>document.documentElement.dataset.endereco = {json.dumps(endereco)};</script>\n"
    html = html.strip()
    if not html.startswith("<title>"):
        raise ValueError("O <title> precisa ser o primeiro elemento da página.")
    fim_titulo = html.index("</title>") + len("</title>")
    html = html[:fim_titulo] + "\n" + marca + html[fim_titulo:] + "\n"

    if saida.exists():
        shutil.rmtree(saida)
    saida.mkdir(parents=True)
    (saida / "index.html").write_text(html, encoding="utf-8")
    arquivos = []
    for pasta in ("dados", "laminas"):
        if (site / pasta).exists():
            shutil.copytree(site / pasta, saida / pasta)
            for f in sorted((saida / pasta).rglob("*")):
                if f.is_file():
                    caminho = f.relative_to(saida).as_posix()
                    arquivos.append({"path": caminho, "contentType": "application/xml"} if caminho.endswith(".dzi") else {"path": caminho})
    return arquivos


def principal(argv=None):
    ap = argparse.ArgumentParser(description="Monta o site numa página única para publicar como artefato.")
    ap.add_argument("site")
    ap.add_argument("saida")
    ap.add_argument("--endereco", default="", help="endereço público do artefato, para os links de vista")
    args = ap.parse_args(argv)
    print(json.dumps(montar(args.site, args.saida, args.endereco), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(principal())
