import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ferramentas"))
import casos_do_app as ca  # noqa: E402


def ficha(codigo, situacao="pronta", **campos):
    base = {
        "codigo": codigo,
        "arquivo": "P1234-26 panorama",
        "miniatura": "abc",
        "especie": "Cão",
        "historico": " Nódulo cutâneo ",
        "orgao": "Pele",
        "diagnostico": "Mastocitoma",
        "diferenciais": ["Histiocitoma", " "],
        "achados": ["Grânulos metacromáticos", ""],
        "quiz": [
            {"tipo": "multipla", "pergunta": "Qual o diagnóstico?", "resposta": "Mastocitoma", "alternativas": ["Histiocitoma", "", "Plasmocitoma"], "explicacao": ""},
            {"tipo": "aberta", "pergunta": "Que célula acompanha?", "resposta": "Eosinófilo", "alternativas": ["sobrou"], "explicacao": "Típico"},
            {"tipo": "multipla", "pergunta": "Sem resposta", "resposta": "", "alternativas": []},
        ],
        "revisadoPor": "Fulano",
        "situacao": situacao,
    }
    base.update(campos)
    return base


class CasosDoAppTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pasta = Path(self.tmp.name) / "casos"
        self.pasta.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def gravar(self, nome, doc):
        (self.pasta / f"{nome}.json").write_text(json.dumps(doc), encoding="utf-8")

    def test_limpa_e_deixa_de_fora_o_interno(self):
        self.gravar("CASO-002", ficha("CASO-002"))
        [caso] = ca.ler_pasta(self.pasta)
        self.assertNotIn("arquivo", caso)
        self.assertNotIn("miniatura", caso)
        self.assertNotIn("revisadoPor", caso)
        self.assertEqual(caso["historico"], "Nódulo cutâneo")
        self.assertEqual(caso["diferenciais"], ["Histiocitoma"])
        self.assertEqual(caso["achados"], ["Grânulos metacromáticos"])
        self.assertEqual(len(caso["quiz"]), 2)
        self.assertEqual(caso["quiz"][0]["alternativas"], ["Histiocitoma", "Plasmocitoma"])
        self.assertEqual(caso["quiz"][1]["alternativas"], [])
        self.assertEqual(caso["quiz"][1]["explicacao"], "Típico")

    def test_pergunta_de_regiao_e_tour(self):
        doc = ficha(
            "CASO-004",
            objetiva="10",
            umPorPixel="0,65",
            quiz=[
                {"tipo": "regiao", "pergunta": "Clique numa célula gigante", "resposta": "", "regiao": {"x": 10, "y": 20, "w": 300, "h": 200}},
                {"tipo": "regiao", "pergunta": "Sem área marcada", "resposta": ""},
                {"tipo": "multipla", "pergunta": "Sem erradas", "resposta": "X", "alternativas": ["", " "]},
            ],
            tour=[{"x": 100, "y": 200, "largura": 800, "zoom": 1.5, "texto": " Colagenólise "}, {"x": 1, "y": 2, "largura": 0}],
        )
        self.gravar("CASO-004", doc)
        [caso] = ca.ler_pasta(self.pasta)
        self.assertEqual(caso["objetiva"], 10)
        self.assertEqual(caso["umPorPixel"], 0.65)
        self.assertEqual([q["tipo"] for q in caso["quiz"]], ["regiao", "aberta"])
        self.assertEqual(caso["quiz"][0]["regiao"], {"x": 10, "y": 20, "w": 300, "h": 200})
        self.assertEqual(caso["tour"], [{"x": 100, "y": 200, "zoom": 1.5, "largura": 800, "texto": "Colagenólise"}])

    def test_so_publica_prontas(self):
        self.gravar("CASO-001", ficha("CASO-001", situacao="rascunho"))
        self.gravar("CASO-002", ficha("CASO-002"))
        self.assertEqual([c["codigo"] for c in ca.ler_pasta(self.pasta)], ["CASO-002"])
        self.assertEqual([c["codigo"] for c in ca.ler_pasta(self.pasta, todos=True)], ["CASO-001", "CASO-002"])

    def test_aceita_documento_envelopado(self):
        self.gravar("CASO-003", {"id": "CASO-003", "version": 4, "data": ficha("CASO-003")})
        [caso] = ca.ler_pasta(self.pasta)
        self.assertEqual(caso["codigo"], "CASO-003")


if __name__ == "__main__":
    unittest.main()
