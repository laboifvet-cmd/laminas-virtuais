"""Gera o catálogo do site (site/dados/casos.json) a partir da planilha
"Fichas dos casos", exportada do Google Sheets como CSV
(Arquivo > Fazer download > Valores separados por vírgula).

As colunas são encontradas pelo nome do cabeçalho, então a ordem pode mudar.
Só entram as linhas com "Pronto para publicar?" = Sim, a não ser que se use
--todos (útil para conferir a demonstração antes de revisar os casos).

Uso:
    python ferramentas/casos_da_planilha.py fichas.csv site/dados/casos.json
"""

import argparse
import csv
import json
import sys
from pathlib import Path

COLUNAS = {
    "codigo": "Código",
    "especie": "Espécie",
    "orgao": "Órgão ou tecido",
    "categoria": "Categoria",
    "coloracao": "Coloração",
    "diagnostico": "Diagnóstico",
    "achados": "Achados que o aluno deve encontrar",
    "dificuldade": "Dificuldade",
    "comentario": "Comentário do patologista",
    "publicar": "Pronto para publicar?",
}


def separar(texto):
    return [parte.strip() for parte in (texto or "").split(";") if parte.strip()]


def coluna(cabecalho, inicio):
    """Acha a coluna cujo título começa com o texto dado (os títulos têm explicações entre parênteses)."""
    for nome in cabecalho:
        if nome.strip().startswith(inicio):
            return nome
    return None


def ler_casos(caminho_csv, todos=False):
    with open(caminho_csv, encoding="utf-8-sig", newline="") as f:
        leitor = csv.DictReader(f)
        cabecalho = leitor.fieldnames or []
        faltando = [titulo for titulo in COLUNAS.values() if not coluna(cabecalho, titulo)]
        if faltando:
            raise ValueError("Colunas não encontradas na planilha: " + ", ".join(faltando))
        nomes = {chave: coluna(cabecalho, titulo) for chave, titulo in COLUNAS.items()}
        casos = []
        for linha in leitor:
            valor = lambda chave: (linha.get(nomes[chave]) or "").strip()  # noqa: E731
            if not valor("codigo"):
                continue
            if not todos and valor("publicar").lower() != "sim":
                continue
            quiz = []
            for n in (1, 2, 3):
                pergunta_col = coluna(cabecalho, f"Pergunta do quiz {n}")
                if not pergunta_col or not (linha.get(pergunta_col) or "").strip():
                    continue
                resposta_col = coluna(cabecalho, f"Resposta certa {n}")
                erradas_col = coluna(cabecalho, f"Alternativas erradas {n}")
                quiz.append(
                    {
                        "pergunta": linha[pergunta_col].strip(),
                        "resposta": (linha.get(resposta_col) or "").strip(),
                        "alternativas": separar(linha.get(erradas_col)) if erradas_col else [],
                    }
                )
            casos.append(
                {
                    "codigo": valor("codigo"),
                    "especie": valor("especie"),
                    "orgao": valor("orgao"),
                    "categoria": valor("categoria"),
                    "coloracao": valor("coloracao"),
                    "dificuldade": valor("dificuldade"),
                    "diagnostico": valor("diagnostico"),
                    "achados": separar(valor("achados")),
                    "quiz": quiz,
                    "comentario": valor("comentario"),
                }
            )
    return casos


def principal(argv=None):
    ap = argparse.ArgumentParser(description="Gera o catálogo do site a partir da planilha dos casos (CSV).")
    ap.add_argument("csv", help="planilha exportada como CSV")
    ap.add_argument("saida", help="arquivo JSON do catálogo (ex.: site/dados/casos.json)")
    ap.add_argument("--todos", action="store_true", help="inclui também os casos ainda não marcados para publicar")
    args = ap.parse_args(argv)
    try:
        casos = ler_casos(args.csv, args.todos)
    except ValueError as e:
        print(f"Erro: {e}", file=sys.stderr)
        return 1
    Path(args.saida).write_text(json.dumps(casos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(casos)} caso(s) gravado(s) em {args.saida}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
