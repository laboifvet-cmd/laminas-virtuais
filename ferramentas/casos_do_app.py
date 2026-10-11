"""Gera o catálogo do site (site/dados/casos.json) a partir das fichas
preenchidas no aplicativo "Fichas das lâminas".

O aplicativo guarda cada caso como um documento JSON. O Claude baixa esses
documentos para uma pasta (um arquivo por caso) e este script junta tudo,
deixando de fora o que é só de uso interno (nome do arquivo do Microview,
miniatura, quem revisou) e os itens em branco.

Só entram os casos com situação "pronta", a não ser que se use --todos.

Uso:
    python ferramentas/casos_do_app.py pasta_dos_documentos site/dados/casos.json
"""

import argparse
import json
import sys
from pathlib import Path

CAMPOS_TEXTO = ("especie", "raca", "idade", "sexo", "historico", "orgao", "categoria", "coloracao", "dificuldade", "diagnostico", "comentario")


def limpar_lista(itens):
    return [str(i).strip() for i in itens or [] if str(i).strip()]


def numero(valor):
    try:
        n = float(str(valor if valor is not None else "").replace(",", "."))
    except ValueError:
        return None
    return n if n > 0 else None


def numero_valido(valor):
    return isinstance(valor, (int, float)) and not isinstance(valor, bool)


def caso_para_site(doc):
    # O download pode trazer o documento puro ou envelopado em {"id", "data", "version"}.
    dados = doc.get("data", doc) if isinstance(doc.get("data"), dict) else doc
    caso = {"codigo": dados["codigo"]}
    for campo in CAMPOS_TEXTO:
        caso[campo] = str(dados.get(campo) or "").strip()
    caso["diferenciais"] = limpar_lista(dados.get("diferenciais"))
    caso["achados"] = limpar_lista(dados.get("achados"))
    caso["objetiva"] = numero(dados.get("objetiva"))
    caso["umPorPixel"] = numero(dados.get("umPorPixel"))
    # Mesma regra de fichaParaCaso em site/comum.js.
    caso["quiz"] = []
    for q in dados.get("quiz") or []:
        pergunta = str(q.get("pergunta") or "").strip()
        resposta = str(q.get("resposta") or "").strip()
        tipo = q.get("tipo") if q.get("tipo") in ("aberta", "regiao") else "multipla"
        if not pergunta:
            continue
        item = {"tipo": tipo, "pergunta": pergunta, "resposta": resposta, "alternativas": [], "explicacao": str(q.get("explicacao") or "").strip()}
        if tipo == "regiao":
            r = q.get("regiao") or {}
            if not all(numero_valido(r.get(k)) for k in "xywh") or r["w"] <= 0 or r["h"] <= 0:
                continue
            item["regiao"] = {k: r[k] for k in "xywh"}
        else:
            if not resposta:
                continue
            if tipo == "multipla":
                item["alternativas"] = limpar_lista(q.get("alternativas"))
                if not item["alternativas"]:
                    item["tipo"] = "aberta"
        caso["quiz"].append(item)
    # Cada ponto do tour guarda o centro e o aumento (zoom); a largura da vista fica como reserva.
    caso["tour"] = [
        {"x": p["x"], "y": p["y"], "zoom": p.get("zoom") or 0, "largura": p.get("largura") or 0, "texto": str(p.get("texto") or "").strip()}
        for p in dados.get("tour") or []
        if numero_valido(p.get("x")) and numero_valido(p.get("y")) and any(numero_valido(p.get(k)) and p[k] > 0 for k in ("zoom", "largura"))
    ]
    return caso, dados.get("situacao", "rascunho")


def ler_pasta(pasta, todos=False):
    casos = []
    for arquivo in sorted(Path(pasta).rglob("*.json")):
        doc = json.loads(arquivo.read_text(encoding="utf-8"))
        caso, situacao = caso_para_site(doc)
        if todos or situacao == "pronta":
            casos.append(caso)
    casos.sort(key=lambda c: c["codigo"])
    return casos


def principal(argv=None):
    ap = argparse.ArgumentParser(description="Gera o catálogo do site a partir das fichas do aplicativo.")
    ap.add_argument("pasta", help="pasta com um JSON por caso, baixados do aplicativo")
    ap.add_argument("saida", help="arquivo JSON do catálogo (ex.: site/dados/casos.json)")
    ap.add_argument("--todos", action="store_true", help="inclui também rascunhos e casos em revisão")
    args = ap.parse_args(argv)
    casos = ler_pasta(args.pasta, args.todos)
    Path(args.saida).write_text(json.dumps(casos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(casos)} caso(s) gravado(s) em {args.saida}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
