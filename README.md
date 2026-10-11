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
| `site/` | O site: início, catálogo, página da lâmina (quiz, anotações, tour guiado) e a área do patologista (`#fichas`) |
| `prototipo/` | Primeiro visualizador de teste (substituído pelo `site/`) |
| `paginas/` | Página avulsa de envio das lâminas (artefato do Claude) |
| `tests/` | Testes automáticos |
| `docs/` | Plano e decisões do projeto |
| `amostras/`, `site/laminas/` | Lâminas convertidas para teste local (fora do Git) |

## Converter uma lâmina

Precisa de Python 3.10 ou mais novo e do Pillow (`pip install -r requirements.txt`).

```bash
python ferramentas/converter_lamina.py "P3841-26_..._lamina_virtual.html" amostras \
  --codigo CASO-001 --titulo "Carcinoma de células escamosas, pele, cão"
```

Opções úteis: `--um-por-pixel 0.65` (calibração, liga a barra de escala),
`--objetiva 10` e `--bloco 1024` ou `--bloco 2048` (blocos maiores, com bem
menos arquivos; o padrão 512 copia os blocos do Microview sem recomprimir).

O conversor gera `amostras/CASO-001.dzi`, a pasta `CASO-001_files/` com os
blocos, `CASO-001.json` com a ficha do caso e `CASO-001_miniatura.jpeg` para o
catálogo. O título original e a data não são
copiados, para não expor o número do caso no laboratório.

## Ver o site de demonstração

Cada lâmina vai para `site/laminas/<código>/`, e o catálogo fica em
`site/dados/casos.json`:

```bash
python ferramentas/converter_lamina.py lamina.html site/laminas/CASO-001 --codigo CASO-001 --bloco 1024
python ferramentas/casos_do_app.py fichas/ site/dados/casos.json
cd site && python -m http.server 8000
```

Abra <http://localhost:8000/>. O catálogo vem do aplicativo "Fichas das
lâminas" (`ferramentas/casos_do_app.py pasta_das_fichas site/dados/casos.json`)
ou, no formato antigo, da planilha exportada em CSV (`casos_da_planilha.py`).
Só entram os casos marcados como prontos (use `--todos` para ver todos).

## Publicar como artefato do Claude

O site também roda como artefato do Claude, com o banco de dados das fichas.
Para isso, CSS e JavaScript precisam ir embutidos numa página só:

```bash
python ferramentas/montar_artefato.py site saida --endereco https://claude.ai/artifact/<id>
```

O comando imprime a lista de arquivos (dados e lâminas) que acompanham a página.

## Ver o protótipo antigo

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
