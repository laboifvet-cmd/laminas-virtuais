"""Converte a lâmina virtual gerada pelo IFVET Microview (um único .html com a
pirâmide de blocos embutida) para o formato Deep Zoom (DZI) usado pela
plataforma: um arquivo .dzi, uma pasta com os blocos JPEG e um .json com os
dados do caso.

Os blocos do Microview já seguem a mesma divisão do Deep Zoom (512 px, sem
sobreposição, cada nível com metade do anterior), então são copiados byte a
byte, sem recompressão e sem perda de qualidade. Só os níveis muito pequenos,
que o Microview não gera, são produzidos aqui a partir do menor nível.

Com --bloco 1024 ou 2048 a lâmina é recortada de novo em blocos maiores
(com recompressão JPEG de alta qualidade). São bem menos arquivos, o que
facilita enviar e guardar; a contrapartida é baixar um pouco mais de imagem
de cada vez no zoom máximo.

Também é gravada uma miniatura (<código>_miniatura.jpeg) para o catálogo.

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
BLOCOS_PERMITIDOS = (512, 1024, 2048)
LADO_MINIATURA = 480
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


def gravar_blocos(img, destino, bloco, qualidade):
    destino.mkdir()
    w, h = img.size
    for c in range(math.ceil(w / bloco)):
        for r in range(math.ceil(h / bloco)):
            recorte = img.crop((c * bloco, r * bloco, min(w, c * bloco + bloco), min(h, r * bloco + bloco)))
            recorte.save(destino / f"{c}_{r}.jpeg", "JPEG", quality=qualidade)


def recortar_de_novo(niveis, largura, altura, maximo, pasta_blocos, bloco, qualidade):
    """Monta a imagem em resolução total e refaz a pirâmide com blocos maiores."""
    img = montar_nivel(niveis[0])
    for n in range(maximo, -1, -1):
        tamanho = dimensoes_dzi(largura, altura, n, maximo)
        if img.size != tamanho:
            img = img.resize(tamanho, Image.LANCZOS)
        gravar_blocos(img, pasta_blocos / str(n), bloco, qualidade)


def gravar_miniatura(niveis, destino):
    # Menor nível que ainda tenha o lado maior da miniatura, para não ampliar.
    nivel = next((nv for nv in reversed(niveis) if max(nv["w"], nv["h"]) >= LADO_MINIATURA), niveis[0])
    img = montar_nivel(nivel)
    img.thumbnail((LADO_MINIATURA, LADO_MINIATURA), Image.LANCZOS)
    img.save(destino, "JPEG", quality=85)


def converter(caminho_html, pasta_saida, codigo, titulo="", um_por_pixel=None, objetiva=None, qualidade=88, bloco=BLOCO_DZI):
    if not CODIGO_VALIDO.match(codigo):
        raise ErroConversao("Código inválido: use só letras, números, hífen e sublinhado (ex.: CASO-001).")
    if bloco not in BLOCOS_PERMITIDOS:
        raise ErroConversao(f"Tamanho de bloco deve ser um destes: {', '.join(map(str, BLOCOS_PERMITIDOS))}.")
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
        esperado = dimensoes_dzi(largura, altura, maximo - i, maximo)
        if (nivel["w"], nivel["h"]) != esperado:
            raise ErroConversao(f"Nível {i} com {nivel['w']}×{nivel['h']}, esperado {esperado[0]}×{esperado[1]}.")
        if len(nivel["b"]) != nivel["c"] * nivel["r"]:
            raise ErroConversao(f"Nível {i} com número de blocos incoerente.")

    if bloco != BLOCO_DZI:
        recortar_de_novo(niveis, largura, altura, maximo, pasta_blocos, bloco, qualidade=90)
    else:
        copiar_blocos(niveis, maximo, pasta_blocos, largura, altura, qualidade)
    gravar_miniatura(niveis, saida / f"{codigo}_miniatura.jpeg")

    (saida / f"{codigo}.dzi").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" TileSize="{bloco}" Overlap="0" Format="jpeg">\n'
        f'  <Size Width="{largura}" Height="{altura}"/>\n'
        "</Image>\n",
        encoding="utf-8",
    )
    return gravar_ficha(dados, saida, codigo, titulo, um_por_pixel, objetiva)


def copiar_blocos(niveis, maximo, pasta_blocos, largura, altura, qualidade):
    for i, nivel in enumerate(niveis):
        n = maximo - i
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


def gravar_ficha(dados, saida, codigo, titulo, um_por_pixel, objetiva):
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
        "largura": dados["largura"],
        "altura": dados["altura"],
        "umPorPixel": um_por_pixel if um_por_pixel is not None else dados.get("umPorPixel"),
        "objetiva": objetiva if objetiva is not None else (dados.get("objetiva") or ""),
        "dzi": f"{codigo}.dzi",
        "miniatura": f"{codigo}_miniatura.jpeg",
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
    ap.add_argument("--bloco", type=int, default=BLOCO_DZI, choices=BLOCOS_PERMITIDOS, help="tamanho dos blocos em px (padrão 512, sem recompressão)")
    args = ap.parse_args(argv)
    try:
        ficha = converter(args.html, args.saida, args.codigo, args.titulo, args.um_por_pixel, args.objetiva, bloco=args.bloco)
    except ErroConversao as e:
        print(f"Erro: {e}", file=sys.stderr)
        return 1
    print(f"Lâmina {ficha['codigo']} convertida: {ficha['largura']}×{ficha['altura']} px em {args.saida}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
