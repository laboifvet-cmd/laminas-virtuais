"""Converte a lâmina virtual gerada pelo IFVET Microview (um único .html com a
pirâmide de blocos embutida) para o formato Deep Zoom (DZI) usado pela
plataforma: um arquivo .dzi, uma pasta com os blocos JPEG e um .json com os
dados do caso.

Os blocos do Microview já seguem a mesma divisão do Deep Zoom (512 px, sem
sobreposição, cada nível com metade do anterior), então são copiados byte a
byte, sem recompressão e sem perda de qualidade. Só os níveis muito pequenos,
que o Microview não gera, são produzidos aqui a partir do menor nível.

O título original (que traz o número do caso no laboratório) e a data NÃO são
copiados: a lâmina recebe um código neutro, para não expor dados de paciente
ou cliente na plataforma.

Uso:
    python ferramentas/converter_lamina.py lamina.html saida/ --codigo CASO-001 \
        --titulo "Carcinoma de células escamosas, pele, cão"
"""

import argparse
import base64
import io
import json
import math
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

BLOCO_DZI = 512
CODIGO_VALIDO = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


class ErroConversao(Exception):
    pass


def ler_dados(caminho_html):
    """Extrai o JSON da pirâmide de dentro do <script id="dados">."""
    texto = Path(caminho_html).read_text(encoding="utf-8")
    achado = re.search(r'<script id="dados" type="application/json">(.*?)</script>', texto, re.S)
    if not achado:
        raise ErroConversao("Este arquivo não parece ser uma lâmina virtual do Microview (bloco de dados não encontrado).")
    dados = json.loads(achado.group(1))
    if dados.get("formato") != 1:
        raise ErroConversao(f"Formato de lâmina não suportado: {dados.get('formato')!r}.")
    if dados.get("bloco") != BLOCO_DZI:
        raise ErroConversao(f"Tamanho de bloco inesperado: {dados.get('bloco')} (esperado {BLOCO_DZI}).")
    return dados


def nivel_maximo(largura, altura):
    return math.ceil(math.log2(max(largura, altura)))


def dimensoes_dzi(largura, altura, nivel, maximo):
    escala = 2 ** (maximo - nivel)
    return math.ceil(largura / escala), math.ceil(altura / escala)


def decodificar(b64):
    return base64.b64decode(b64)


def conferir_bloco(conteudo, esperado_l, esperado_a, onde):
    with Image.open(io.BytesIO(conteudo)) as img:
        if img.format != "JPEG":
            raise ErroConversao(f"Bloco {onde} não é JPEG.")
        if img.size != (esperado_l, esperado_a):
            raise ErroConversao(f"Bloco {onde} com tamanho {img.size}, esperado {(esperado_l, esperado_a)}.")


def montar_nivel(nivel):
    """Junta os blocos de um nível numa única imagem (usado só no menor nível)."""
    img = Image.new("RGB", (nivel["w"], nivel["h"]), "white")
    for r in range(nivel["r"]):
        for c in range(nivel["c"]):
            with Image.open(io.BytesIO(decodificar(nivel["b"][r * nivel["c"] + c]))) as bloco:
                img.paste(bloco.convert("RGB"), (c * BLOCO_DZI, r * BLOCO_DZI))
    return img


def converter(caminho_html, pasta_saida, codigo, titulo="", um_por_pixel=None, objetiva=None, qualidade=88):
    if not CODIGO_VALIDO.match(codigo):
        raise ErroConversao("Código inválido: use só letras, números, hífen e sublinhado (ex.: CASO-001).")
    dados = ler_dados(caminho_html)
    largura, altura = dados["largura"], dados["altura"]
    maximo = nivel_maximo(largura, altura)
    niveis = dados["niveis"]

    saida = Path(pasta_saida)
    pasta_blocos = saida / f"{codigo}_files"
    if pasta_blocos.exists():
        shutil.rmtree(pasta_blocos)
    pasta_blocos.mkdir(parents=True)

    # Níveis do Microview: índice 0 = resolução total = nível DZI máximo.
    for i, nivel in enumerate(niveis):
        n = maximo - i
        esperado = dimensoes_dzi(largura, altura, n, maximo)
        if (nivel["w"], nivel["h"]) != esperado:
            raise ErroConversao(f"Nível {i} com {nivel['w']}×{nivel['h']}, esperado {esperado[0]}×{esperado[1]}.")
        if len(nivel["b"]) != nivel["c"] * nivel["r"]:
            raise ErroConversao(f"Nível {i} com número de blocos incoerente.")
        destino = pasta_blocos / str(n)
        destino.mkdir()
        for r in range(nivel["r"]):
            for c in range(nivel["c"]):
                conteudo = decodificar(nivel["b"][r * nivel["c"] + c])
                bl = min(BLOCO_DZI, nivel["w"] - c * BLOCO_DZI)
                ba = min(BLOCO_DZI, nivel["h"] - r * BLOCO_DZI)
                conferir_bloco(conteudo, bl, ba, f"{i}/{c}_{r}")
                (destino / f"{c}_{r}.jpeg").write_bytes(conteudo)

    # Níveis menores que o Microview não gera (o Deep Zoom desce até 1 px).
    menor_dzi = maximo - (len(niveis) - 1)
    if menor_dzi > 0:
        base = montar_nivel(niveis[-1])
        for n in range(menor_dzi - 1, -1, -1):
            tamanho = dimensoes_dzi(largura, altura, n, maximo)
            reduzida = base.resize(tamanho, Image.LANCZOS)
            destino = pasta_blocos / str(n)
            destino.mkdir()
            reduzida.save(destino / "0_0.jpeg", "JPEG", quality=qualidade)

    (saida / f"{codigo}.dzi").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" TileSize="{BLOCO_DZI}" Overlap="0" Format="jpeg">\n'
        f'  <Size Width="{largura}" Height="{altura}"/>\n'
        "</Image>\n",
        encoding="utf-8",
    )

    # Pinos (fotos de maior aumento presas a um ponto da lâmina) viram arquivos à parte.
    pinos = []
    pasta_pinos = saida / f"{codigo}_pinos"
    if pasta_pinos.exists():
        shutil.rmtree(pasta_pinos)
    for k, p in enumerate(dados.get("pinos") or [], start=1):
        pino = {"x": p["x"], "y": p["y"], "rotulo": p.get("rotulo", ""), "texto": p.get("texto", "")}
        if p.get("imagem"):
            pasta_pinos.mkdir(exist_ok=True)
            nome = f"{k}.jpeg"
            (pasta_pinos / nome).write_bytes(decodificar(p["imagem"]))
            pino["imagem"] = f"{codigo}_pinos/{nome}"
        pinos.append(pino)

    ficha = {
        "codigo": codigo,
        "titulo": titulo,
        "largura": largura,
        "altura": altura,
        "umPorPixel": um_por_pixel if um_por_pixel is not None else dados.get("umPorPixel"),
        "objetiva": objetiva if objetiva is not None else (dados.get("objetiva") or ""),
        "dzi": f"{codigo}.dzi",
        "pinos": pinos,
    }
    (saida / f"{codigo}.json").write_text(json.dumps(ficha, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return ficha


def principal(argv=None):
    ap = argparse.ArgumentParser(description="Converte uma lâmina virtual do Microview para Deep Zoom (DZI).")
    ap.add_argument("html", help="arquivo .html gerado pelo Microview")
    ap.add_argument("saida", help="pasta onde gravar o .dzi, os blocos e o .json")
    ap.add_argument("--codigo", required=True, help="código neutro da lâmina na plataforma (ex.: CASO-001)")
    ap.add_argument("--titulo", default="", help="título exibido ao aluno (sem dados do paciente)")
    ap.add_argument("--um-por-pixel", type=float, help="calibração em µm por pixel da resolução total")
    ap.add_argument("--objetiva", help="aumento da objetiva usada na captura (ex.: 10)")
    args = ap.parse_args(argv)
    try:
        ficha = converter(args.html, args.saida, args.codigo, args.titulo, args.um_por_pixel, args.objetiva)
    except ErroConversao as e:
        print(f"Erro: {e}", file=sys.stderr)
        return 1
    print(f"Lâmina {ficha['codigo']} convertida: {ficha['largura']}×{ficha['altura']} px em {args.saida}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
