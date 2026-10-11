# Plano do banco de lâminas virtuais

Plataforma por assinatura (mensal ou anual) com lâminas de anatomopatologia
veterinária escaneadas no IFVET Microview. O foco é **treinar o olho**: o aluno
navega pela lâmina, faz suas anotações e testa o diagnóstico em questões curtas.
Teoria e vídeos ficam para depois, se fizer sentido.

## Fases

### Fase 0: protótipo (este repositório, agora)

- [x] Conversor da lâmina do Microview para Deep Zoom (`ferramentas/converter_lamina.py`)
- [x] Visualizador com zoom, minimapa, pinos de maior aumento e anotações do aluno (`prototipo/`)
- [x] Site de demonstração com início, catálogo, quiz (múltipla escolha ou resposta aberta) e ficha do caso (`site/`)
- [x] Planilha "Fichas dos casos" no Google Drive e gerador do catálogo a partir dela (`ferramentas/casos_da_planilha.py`)
- [x] Aplicativo "Fichas das lâminas", que substitui a planilha, e gerador do catálogo a partir dele (`paginas/fichas.html`, `ferramentas/casos_do_app.py`)
- [x] Página de envio das lâminas grandes, em partes (`paginas/envio.html`)
- [ ] Converter 3 a 5 lâminas reais, preencher as fichas e mostrar ao colega patologista

### Fase 1: lançamento de teste (30 a 40 lâminas)

- Site com catálogo das lâminas (filtro por espécie, órgão e categoria de lesão)
- Cadastro e login do aluno
- Assinatura mensal e anual com Pix e cartão
- Anotações salvas na conta do aluno (hoje ficam só no navegador)
- Quiz por lâmina: "qual o diagnóstico?" e "o que é a estrutura marcada?", com explicação depois da resposta
- Página do administrador para publicar uma lâmina nova (envio dos blocos e ficha do caso)
- Termos de uso e política de privacidade (LGPD)

### Fase 2: depois do teste

- Estatísticas de acerto por aluno e por tema
- Modo "sem diagnóstico" para treinar como numa rotina
- Planos para turmas e faculdades
- Vídeos curtos de alguns casos, se houver procura

## Arquitetura proposta

| Parte | Escolha | Por quê |
| --- | --- | --- |
| Formato da lâmina | Deep Zoom (DZI), blocos JPEG de 512 px | Padrão aberto; os blocos do Microview já servem sem recomprimir |
| Visualizador | OpenSeadragon | Gratuito, maduro, funciona bem no celular |
| Armazenamento dos blocos | Cloudflare R2 | Barato e sem cobrança por tráfego, que é o maior custo de imagem |
| Site | Next.js hospedado no Cloudflare Pages ou Vercel | Plano gratuito suficiente no começo |
| Login e banco de dados | Supabase | Login por e-mail e Google, banco Postgres, plano gratuito |
| Pagamento | Mercado Pago (assinaturas) | Pix e cartão, conhecido no Brasil; Stripe é alternativa |
| Domínio | registro.br | Mesma conta do `ifvet.com.br` |

### Acesso só para assinantes

Os blocos ficam num armazenamento privado. Quando o aluno abre uma lâmina, o
site confere a assinatura e libera os blocos por links temporários. Isso não
impede print de tela, mas impede baixar o banco inteiro. Uma marca d'água
discreta com o e-mail do aluno desestimula o compartilhamento.

## Custos estimados (lançamento)

| Item | Custo |
| --- | --- |
| Domínio `.com.br` | cerca de R$ 40 por ano |
| Blocos de 40 lâminas (~25 MB cada, ~1 GB no total) | dentro da cota gratuita do R2 (10 GB) |
| Hospedagem do site e Supabase | gratuito nos limites iniciais |
| Mercado Pago | taxa por venda (confira a tabela atual) |

## Qualidade das imagens

Observações da primeira lâmina de teste (panorama, 9441 × 11780 px):

- **Falta calibração (µm por pixel)**: sem ela não há barra de escala. Basta
  fotografar uma lâmina micrométrica uma vez por objetiva; o conversor aceita
  `--um-por-pixel`.
- **Brancos estourados e contraste alto**: o fundo e o colágeno perdem detalhe.
  Vale fazer o balanço de branco num campo vazio antes de escanear e conferir o
  histograma.
- **Bordas em degrau**: são campos que o escaneamento pulou ou que ficaram de
  fora. Para estudo isso não atrapalha, mas incomoda na vista geral.
- A resolução atual permite ver arquitetura e células, mas detalhe nuclear fino
  (nucléolos, mitoses) pede objetiva de 20× ou 40× nas áreas de interesse. Os
  **pinos** do Microview (fotos de maior aumento presas a um ponto) já cobrem
  isso e aparecem no visualizador.

## Envio das lâminas

Os arquivos do Microview passam de 30 MB, mais do que o envio pela conversa
aceita. Enquanto não há a página de envio da plataforma:

- **Compactar em .zip** (no Mac, botão direito > Comprimir). O base64 dos
  blocos encolhe cerca de 25%: a lâmina de teste foi de 30 MB para 22 MB.
- **Página de envio** (`paginas/envio.html`) para as maiores: divide o arquivo
  em partes de 15 MB, que o Claude baixa e junta.
- Na plataforma, o administrador enviará as lâminas direto pelo navegador para
  o armazenamento, sem esse limite. Uma opção melhor ainda é o próprio
  Microview exportar no formato Deep Zoom.

## Observação da segunda lâmina

O fundo da P3834-26 saiu lilás, e alguns campos ficaram mais claros que os
vizinhos, formando blocos visíveis no panorama. Vale corrigir o balanço de
branco e o sombreamento de campo (flat-field) no Microview antes de escanear.

## Cuidados

- **Dados de paciente e cliente**: o conversor descarta o título original (que
  traz o número do caso) e a data. A lâmina recebe um código neutro
  (`CASO-001`). Confira se nada identificável aparece na própria imagem
  (etiqueta, letra escrita no vidro).
- **Direitos sobre o material**: registrar por escrito, entre os sócios, de
  quem são os casos, como se divide a receita e quem responde pelo conteúdo.
  Se algum caso vier de instituição, confirmar a autorização de uso comercial.
- **Nota fiscal e empresa**: a venda de assinaturas pede CNPJ (pode ser o do
  IFVET, se o contador concordar) e emissão de nota de serviço.

## Decisões em aberto

- Nome e domínio da plataforma
- Preço da assinatura de teste
- Se o diagnóstico fica visível de cara ou só depois do quiz
- Quem revisa e aprova cada lâmina antes de publicar
