import base64
import io
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ferramentas"))
import converter_lamina as cv  # noqa: E402


def jpeg_b64(img):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()


def lamina_falsa(largura=1100, altura=700, pinos=None, titulo="P3841-26 · panorama"):
    """Monta um .html no mesmo formato do Microview, com uma imagem em degradê."""
    base = Image.new("RGB", (largura, altura))
    base.putdata([((x * 7) % 256, (y * 5) % 256, 180) for y in range(altura) for x in range(largura)])
    niveis, img = [], base
    while True:
        w, h = img.size
        c, r = math.ceil(w / 512), math.ceil(h / 512)
        blocos = [jpeg_b64(img.crop((i * 512, j * 512, min(w, i * 512 + 512), min(h, j * 512 + 512)))) for j in range(r) for i in range(c)]
        niveis.append({"w": w, "h": h, "c": c, "r": r, "b": blocos})
        if c == 1 and r == 1:
            break
        img = img.resize((math.ceil(w / 2), math.ceil(h / 2)))
    dados = {
        "formato": 1,
        "titulo": titulo,
        "objetiva": "",
        "data": "09/10/2026",
        "umPorPixel": None,
        "largura": largura,
        "altura": altura,
        "bloco": 512,
        "niveis": niveis,
        "pinos": pinos or [],
    }
    return f'<html><body><script id="dados" type="application/json">{json.dumps(dados)}</script></body></html>', dados


class ConverterLaminaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def gravar(self, html):
        caminho = self.dir / "lamina.html"
        caminho.write_text(html, encoding="utf-8")
        return caminho

    def test_gera_todos_os_niveis_do_deep_zoom(self):
        html, _ = lamina_falsa()
        cv.converter(self.gravar(html), self.dir / "saida", "CASO-001")
        pasta = self.dir / "saida" / "CASO-001_files"
        maximo = math.ceil(math.log2(1100))
        self.assertEqual(sorted(int(p.name) for p in pasta.iterdir()), list(range(maximo + 1)))
        for n in range(maximo + 1):
            w, h = cv.dimensoes_dzi(1100, 700, n, maximo)
            for c in range(math.ceil(w / 512)):
                for r in range(math.ceil(h / 512)):
                    with Image.open(pasta / str(n) / f"{c}_{r}.jpeg") as img:
                        self.assertEqual(img.size, (min(512, w - c * 512), min(512, h - r * 512)))

    def test_copia_blocos_sem_recomprimir(self):
        html, dados = lamina_falsa()
        cv.converter(self.gravar(html), self.dir / "saida", "CASO-001")
        maximo = math.ceil(math.log2(1100))
        original = base64.b64decode(dados["niveis"][0]["b"][1])
        self.assertEqual((self.dir / "saida" / "CASO-001_files" / str(maximo) / "1_0.jpeg").read_bytes(), original)

    def test_dzi_e_ficha(self):
        html, _ = lamina_falsa()
        cv.converter(self.gravar(html), self.dir / "saida", "CASO-001", titulo="Papiloma, pele, cão", um_por_pixel=0.65)
        dzi = (self.dir / "saida" / "CASO-001.dzi").read_text()
        self.assertIn('TileSize="512" Overlap="0" Format="jpeg"', dzi)
        self.assertIn('<Size Width="1100" Height="700"/>', dzi)
        ficha = json.loads((self.dir / "saida" / "CASO-001.json").read_text())
        self.assertEqual(ficha["titulo"], "Papiloma, pele, cão")
        self.assertEqual(ficha["umPorPixel"], 0.65)
        self.assertEqual(ficha["dzi"], "CASO-001.dzi")

    def test_nao_leva_numero_do_caso_nem_data(self):
        html, _ = lamina_falsa(titulo="P3841-26 · panorama")
        cv.converter(self.gravar(html), self.dir / "saida", "CASO-001")
        for arq in (self.dir / "saida").glob("*.*"):
            texto = arq.read_text(encoding="utf-8")
            self.assertNotIn("P3841", texto)
            self.assertNotIn("09/10/2026", texto)

    def test_pinos_viram_arquivos(self):
        foto = jpeg_b64(Image.new("RGB", (64, 64), "red"))
        html, _ = lamina_falsa(pinos=[{"x": 100, "y": 200, "rotulo": "1", "texto": "Pérolas córneas", "imagem": foto}])
        ficha = cv.converter(self.gravar(html), self.dir / "saida", "CASO-001")
        self.assertEqual(ficha["pinos"][0]["imagem"], "CASO-001_pinos/1.jpeg")
        self.assertEqual(ficha["pinos"][0]["texto"], "Pérolas córneas")
        self.assertTrue((self.dir / "saida" / "CASO-001_pinos" / "1.jpeg").exists())

    def test_recusa_codigo_com_caracteres_perigosos(self):
        html, _ = lamina_falsa()
        with self.assertRaises(cv.ErroConversao):
            cv.converter(self.gravar(html), self.dir / "saida", "../fora")

    def test_recusa_arquivo_que_nao_e_lamina(self):
        with self.assertRaises(cv.ErroConversao):
            cv.converter(self.gravar("<html>nada</html>"), self.dir / "saida", "CASO-001")


if __name__ == "__main__":
    unittest.main()
