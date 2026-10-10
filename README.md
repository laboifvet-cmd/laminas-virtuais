# Lâminas virtuais

Banco de lâminas virtuais de anatomopatologia veterinária, por assinatura, para
estudantes e médicos-veterinários. As lâminas são escaneadas com o IFVET
Microview.

O plano completo (fases, arquitetura, custos e cuidados) está em
[`docs/plano.md`](docs/plano.md).

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `ferramentas/` | Conversor da lâmina do Microview para Deep Zoom |
| `prototipo/` | Visualizador de teste, com anotações do aluno |
| `tests/` | Testes automáticos |
| `docs/` | Plano e decisões do projeto |
| `amostras/` | Lâminas convertidas para teste local (fora do Git) |

## Converter uma lâmina

Precisa de Python 3.10 ou mais novo e do Pillow (`pip install -r requirements.txt`).

```bash
python ferramentas/converter_lamina.py "P3841-26_..._lamina_virtual.html" amostras \
  --codigo CASO-001 --titulo "Carcinoma de células escamosas, pele, cão"
```

Opções úteis: `--um-por-pixel 0.65` (calibração, liga a barra de escala) e
`--objetiva 10`.

O conversor gera `amostras/CASO-001.dzi`, a pasta `CASO-001_files/` com os
blocos e `CASO-001.json` com a ficha do caso. O título original e a data não são
copiados, para não expor o número do caso no laboratório.

## Ver o protótipo

```bash
python -m http.server 8000
```

Abra <http://localhost:8000/prototipo/?lamina=CASO-001>. Use **Anotar** e toque
num ponto da lâmina para escrever uma nota. No protótipo, as notas ficam salvas
só no navegador.

## Testes

```bash
python -m unittest discover -s tests
```

As lâminas convertidas não entram no Git: na plataforma, elas ficam num
armazenamento de arquivos (Cloudflare R2), e o código fica aqui.
