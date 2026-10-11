# Páginas de apoio (artefatos do Claude)

Estas páginas rodam como artefatos privados no claude.ai, com banco de dados e
armazenamento de arquivos do próprio artefato. O código fica aqui para
termos o histórico; a versão em uso é a publicada.

| Arquivo | Para que serve |
| --- | --- |
| `fichas.html` | Aplicativo "Fichas das lâminas": histórico, diagnóstico, achados, quiz e revisão de cada caso. Cada caso é um documento `casos/<código>`. |
| `envio.html` | "Envio de lâminas": recebe os .html grandes do Microview, divide em partes de 15 MB e registra em `envios`. |

O catálogo do site sai das fichas com `ferramentas/casos_do_app.py`, a partir
dos documentos baixados do aplicativo.
