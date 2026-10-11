import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ferramentas"))
import casos_da_planilha as cp  # noqa: E402

CABECALHO = [
    "Código",
    "Arquivo do Microview",
    "Espécie",
    "Órgão ou tecido",
    "Categoria",
    "Coloração",
    "Diagnóstico",
    "Achados que o aluno deve encontrar",
    "Pergunta do quiz 1",
    "Resposta certa 1",
    "Alternativas erradas 1 (separe com ;)",
    "Pergunta do quiz 2",
    "Resposta certa 2",
    "Alternativas erradas 2 (separe com ;)",
    "Dificuldade",
    "Comentário do patologista",
    "Revisado por",
    "Pronto para publicar?",
]


def linha(**campos):
    base = dict.fromkeys(CABECALHO, "")
    base.update(campos)
    return base


class CasosDaPlanilhaTest(unittest.TestCase):
    def gravar(self, linhas):
        self.tmp = tempfile.TemporaryDirectory()
        caminho = Path(self.tmp.name) / "fichas.csv"
        with open(caminho, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=CABECALHO)
            w.writeheader()
            w.writerows(linhas)
        return caminho

    def tearDown(self):
        if hasattr(self, "tmp"):
            self.tmp.cleanup()

    def test_le_caso_completo(self):
        caminho = self.gravar(
            [
                linha(
                    **{
                        "Código": "CASO-002",
                        "Espécie": "Cão",
                        "Órgão ou tecido": "Pele",
                        "Diagnóstico": "Mastocitoma",
                        "Achados que o aluno deve encontrar": "grânulos; eosinófilos ",
                        "Pergunta do quiz 1": "Qual o diagnóstico?",
                        "Resposta certa 1": "Mastocitoma",
                        "Alternativas erradas 1 (separe com ;)": "Histiocitoma; Plasmocitoma",
                        "Pergunta do quiz 2": "Que célula predomina no infiltrado?",
                        "Resposta certa 2": "Eosinófilo",
                        "Pronto para publicar?": "Sim",
                    }
                )
            ]
        )
        [caso] = cp.ler_casos(caminho)
        self.assertEqual(caso["codigo"], "CASO-002")
        self.assertEqual(caso["achados"], ["grânulos", "eosinófilos"])
        self.assertEqual(caso["quiz"][0]["alternativas"], ["Histiocitoma", "Plasmocitoma"])
        self.assertEqual(caso["quiz"][1]["alternativas"], [])

    def test_so_publica_os_marcados(self):
        caminho = self.gravar(
            [
                linha(**{"Código": "CASO-001", "Pronto para publicar?": "Não"}),
                linha(**{"Código": "CASO-002", "Pronto para publicar?": "sim"}),
                linha(**{"Código": ""}),
            ]
        )
        self.assertEqual([c["codigo"] for c in cp.ler_casos(caminho)], ["CASO-002"])
        self.assertEqual([c["codigo"] for c in cp.ler_casos(caminho, todos=True)], ["CASO-001", "CASO-002"])

    def test_avisa_coluna_faltando(self):
        self.tmp = tempfile.TemporaryDirectory()
        caminho = Path(self.tmp.name) / "fichas.csv"
        caminho.write_text("Código,Espécie\nCASO-001,Cão\n", encoding="utf-8")
        with self.assertRaises(ValueError):
            cp.ler_casos(caminho)


if __name__ == "__main__":
    unittest.main()
