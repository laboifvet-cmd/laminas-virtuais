'use strict';
// Telas do aluno: início, catálogo e página da lâmina (quiz, anotações, tour guiado e o caso).
// Nesta fase, respostas e anotações ficam no navegador; na plataforma irão para a conta do aluno.

function estadoQuiz(caso) {
  return guardar.ler('quiz:' + caso.codigo, { respostas: [], revelado: false });
}
function quizCompleto(caso, estado = estadoQuiz(caso)) {
  return caso.quiz.length > 0 && caso.quiz.every((_, i) => estado.respostas[i]?.certo != null);
}
function liberado(caso, estado = estadoQuiz(caso)) {
  return !caso.quiz.length || quizCompleto(caso, estado) || estado.revelado;
}
const miniatura = (codigo) => `${PASTA_LAMINAS}${codigo}/${codigo}_miniatura.jpeg`;

// ---------- Início ----------
function telaInicio(app, casos, irParaPlanos) {
  const destaque = casos[0];
  const vidro = destaque
    ? el(
        'div',
        { class: 'vidro', 'aria-hidden': 'true' },
        el('div', { class: 'vidro-etiqueta' }, el('strong', { text: 'IFVET' }), el('span', { text: destaque.codigo }), el('span', { text: destaque.coloracao || 'HE' })),
        el('div', { class: 'vidro-corte' }, el('img', { src: miniatura(destaque.codigo), alt: '' })),
      )
    : null;

  app.append(
    el(
      'section',
      { class: 'conteudo abertura' },
      el(
        'div',
        {},
        el('span', { class: 'rotulo', text: 'Patologia veterinária' }),
        el('h1', {}, 'Treine o olho em ', el('em', { text: 'lâminas inteiras' }), ', não em fotos recortadas.'),
        el('p', { text: 'Lâminas reais escaneadas por inteiro e selecionadas por patologistas. Navegue do panorama ao detalhe, marque o que encontrar e teste seu diagnóstico antes de ver a resposta.' }),
        el('div', { class: 'acoes' }, el('a', { class: 'botao', href: '#laminas', text: 'Ver as lâminas' }), el('a', { class: 'botao botao-contorno', href: '#planos', text: 'Planos' })),
      ),
      vidro,
    ),
    el(
      'section',
      { class: 'conteudo secao' },
      el('h2', { text: 'Como funciona' }),
      el(
        'ol',
        { class: 'passos' },
        el('li', {}, el('h3', { text: 'Leia o histórico' }), el('p', { text: 'Cada caso começa como uma requisição de exame: espécie, idade e o que o clínico viu.' })),
        el('li', {}, el('h3', { text: 'Examine e responda' }), el('p', { text: 'Do aumento menor ao maior, marque o que encontrar e responda o quiz, inclusive clicando na lesão.' })),
        el('li', {}, el('h3', { text: 'Siga o patologista' }), el('p', { text: 'Veja o diagnóstico e faça o tour guiado pelos pontos que o patologista escolheu na lâmina.' })),
      ),
    ),
    el(
      'section',
      { class: 'conteudo secao' },
      el('h2', { text: 'Para quem é' }),
      el(
        'div',
        { class: 'publico' },
        ['Estudantes de medicina veterinária', 'Residentes em patologia', 'Médicos-veterinários que querem treinar histopatologia', 'Professores que precisam de material para aula'].map((t) => el('span', { class: 'etiqueta', text: t })),
      ),
    ),
    el(
      'section',
      { class: 'conteudo secao', id: 'planos' },
      el('h2', { text: 'Planos' }),
      el(
        'div',
        { class: 'planos' },
        el(
          'div',
          { class: 'plano' },
          el('h3', { text: 'Mensal' }),
          el('div', { class: 'preco' }, 'R$ —', el('small', { text: ' por mês' })),
          el('ul', {}, el('li', { text: 'Acesso a todo o banco de lâminas' }), el('li', { text: 'Anotações e quiz em todos os casos' }), el('li', { text: 'Cancele quando quiser' })),
        ),
        el(
          'div',
          { class: 'plano destaque' },
          el('h3', { text: 'Anual' }),
          el('div', { class: 'preco' }, 'R$ —', el('small', { text: ' por ano' })),
          el('ul', {}, el('li', { text: 'Tudo do plano mensal' }), el('li', { text: 'Casos novos durante o ano' }), el('li', { text: 'Preço menor por mês' })),
        ),
      ),
      el('p', { class: 'suave', text: 'Preços de lançamento a definir. Pagamento por Pix ou cartão.' }),
    ),
  );
  if (irParaPlanos) document.getElementById('planos').scrollIntoView();
  else window.scrollTo(0, 0);
}

// ---------- Catálogo ----------
function telaCatalogo(app, casos) {
  const filtros = guardar.ler('filtros', {});
  const campos = [
    ['especie', 'Espécie'],
    ['orgao', 'Órgão'],
    ['categoria', 'Categoria'],
    ['dificuldade', 'Dificuldade'],
  ];
  const grade = el('div', { class: 'grade' });

  function desenhar() {
    grade.textContent = '';
    const filtrados = casos.filter((c) => campos.every(([k]) => !filtros[k] || c[k] === filtros[k]));
    if (!casos.length) grade.append(el('p', { class: 'vazio', text: 'Ainda não há casos publicados. Eles aparecem aqui quando a ficha é marcada como pronta.' }));
    else if (!filtrados.length) grade.append(el('p', { class: 'vazio', text: 'Nenhuma lâmina com esses filtros. Tente limpar algum deles.' }));
    for (const caso of filtrados) {
      const estado = estadoQuiz(caso);
      const acertos = estado.respostas.filter((r) => r?.certo).length;
      const img = el('img', { src: miniatura(caso.codigo), alt: '', loading: 'lazy' });
      img.addEventListener('error', () => img.remove());
      grade.append(
        el(
          'a',
          { class: 'cartao', href: '#' + caso.codigo },
          el('div', { class: 'cartao-imagem' }, img),
          el(
            'div',
            { class: 'cartao-corpo' },
            el('h3', { text: nomeDoCaso(caso) }),
            el('span', { class: 'detalhe', text: resumo(caso) }),
            el(
              'div',
              { class: 'etiquetas' },
              caso.coloracao && el('span', { class: 'etiqueta', text: caso.coloracao }),
              caso.dificuldade && el('span', { class: 'etiqueta eosina', text: caso.dificuldade }),
              caso.tour?.length ? el('span', { class: 'etiqueta', text: 'Tour guiado' }) : null,
              quizCompleto(caso, estado) ? el('span', { class: 'etiqueta certo', text: `Feito · ${acertos}/${caso.quiz.length}` }) : null,
            ),
          ),
        ),
      );
    }
  }

  const seletores = campos.map(([chave, rotulo]) => {
    const valores = [...new Set(casos.map((c) => c[chave]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const select = el('select', {
      id: 'filtro-' + chave,
      onchange: (e) => {
        filtros[chave] = e.target.value;
        guardar.gravar('filtros', filtros);
        desenhar();
      },
    });
    select.append(el('option', { value: '', text: 'Todas' }), ...valores.map((v) => el('option', { value: v, text: v })));
    select.value = valores.includes(filtros[chave]) ? filtros[chave] : '';
    filtros[chave] = select.value;
    return el('label', { for: 'filtro-' + chave }, rotulo, select);
  });

  app.append(
    el(
      'div',
      { class: 'conteudo' },
      el(
        'div',
        { class: 'catalogo-topo' },
        el('div', {}, el('h1', { text: 'Lâminas' }), el('p', { text: `${casos.length} ${casos.length === 1 ? 'caso disponível' : 'casos disponíveis'}. O diagnóstico só aparece depois do quiz.` })),
        el('div', { class: 'filtros' }, seletores),
      ),
      grade,
    ),
  );
  desenhar();
  window.scrollTo(0, 0);
}

// ---------- Lâmina ----------
// Devolve uma função que desmonta a tela (fecha o visualizador).
function telaLamina(app, caso, { vista, enderecoBase } = {}) {
  document.body.classList.add('modo-lamina');
  let visor = null;
  let fechada = false;
  let anotando = false;
  let respondendo = null; // índice da pergunta de clicar na lesão que está sendo respondida
  let notas = guardar.ler('notas:' + caso.codigo, []);
  let marcas = { notas: [], tour: [], quiz: [] };
  let passoTour = -1;

  const caixaVisor = el('div', { class: 'visor' });
  const faixa = el('div', { class: 'visor-faixa', hidden: true });
  const botaoAnotar = el('button', {
    class: 'ferramenta',
    type: 'button',
    'aria-pressed': 'false',
    title: 'Toque na lâmina para marcar um ponto e escrever uma nota',
    text: 'Anotar',
    onclick: () => {
      pararResposta();
      anotando = !anotando;
      botaoAnotar.setAttribute('aria-pressed', anotando);
      caixaVisor.classList.toggle('anotando', anotando);
      if (anotando) abrirAba('notas');
    },
  });
  const abas = { quiz: 'Quiz', notas: 'Anotações', tour: 'Tour', caso: 'O caso' };
  const corpoAba = el('div', { class: 'aba' });
  // append() escreveria "null" na tela para os itens condicionais que ficam de fora.
  const anexar = (...itens) => corpoAba.append(...itens.filter((i) => i != null && i !== false));
  const botoesAbas = Object.entries(abas).map(([id, nome]) => el('button', { type: 'button', role: 'tab', 'data-aba': id, text: nome, onclick: () => abrirAba(id) }));
  const tela = el(
    'div',
    { class: 'lamina' },
    el(
      'div',
      { class: 'lamina-barra' },
      el('a', { href: '#laminas', text: '← Lâminas' }),
      el('h1', {}, nomeDoCaso(caso), el('small', { text: [resumo(caso), caso.coloracao].filter(Boolean).join(' · ') })),
      el('div', { class: 'ferramentas' }, botaoAnotar),
    ),
    el('div', { class: 'visor-area' }, caixaVisor, faixa),
    el('aside', { class: 'painel' }, el('div', { class: 'abas', role: 'tablist' }, botoesAbas), corpoAba),
  );
  app.append(tela);

  let abaAtual = guardar.ler('aba', 'quiz');
  if (!(abaAtual in abas)) abaAtual = 'quiz';
  function abrirAba(id) {
    abaAtual = id;
    guardar.gravar('aba', id);
    for (const b of botoesAbas) b.setAttribute('aria-selected', b.dataset.aba === id);
    corpoAba.textContent = '';
    if (id === 'quiz') desenharQuiz();
    else if (id === 'notas') desenharNotas();
    else if (id === 'tour') desenharTour();
    else desenharCaso();
    desenharMarcas();
  }

  function bloqueado(mensagem) {
    const estado = estadoQuiz(caso);
    anexar(
      el(
        'div',
        { class: 'bloqueado' },
        el('p', { text: mensagem }),
        el(
          'div',
          { class: 'linha-botoes' },
          el('button', { type: 'button', class: 'ferramenta', text: 'Ir para o quiz', onclick: () => abrirAba('quiz') }),
          el('button', {
            type: 'button',
            class: 'ferramenta',
            text: 'Mostrar mesmo assim',
            onclick: () => {
              guardar.gravar('quiz:' + caso.codigo, { ...estado, revelado: true });
              abrirAba(abaAtual);
            },
          }),
        ),
      ),
    );
  }

  // ----- Marcas na lâmina (notas, tour e respostas de região) -----
  function desenharMarcas() {
    if (!visor) return;
    for (const m of [...marcas.notas, ...marcas.tour, ...marcas.quiz]) visor.remover(m);
    marcas = { notas: [], tour: [], quiz: [] };
    marcas.notas = notas.map((n, i) => visor.marcador(String(i + 1), '', n.x, n.y, () => irParaPonto(n)));
    if (abaAtual === 'tour' && liberado(caso))
      marcas.tour = caso.tour.map((p, i) => visor.marcador(String(i + 1), 'tour' + (i === passoTour ? ' atual' : ''), p.x, p.y, () => irParaPasso(i)));
    const estado = estadoQuiz(caso);
    caso.quiz.forEach((q, i) => {
      const resp = estado.respostas[i];
      if (q.tipo !== 'regiao' || !resp?.ponto) return;
      marcas.quiz.push(visor.retangulo(q.regiao, 'resposta', `P${i + 1}`));
      marcas.quiz.push(visor.marcador('×', resp.certo ? 'clique certo' : 'clique errado', resp.ponto.x, resp.ponto.y));
    });
  }
  function irParaPonto(p) {
    if (!visor) return;
    const v = visor.vistaAtual();
    visor.irPara({ x: p.x, y: p.y, largura: Math.min(v.largura, visor.ficha.largura / 6) });
  }

  // ----- Quiz -----
  function pararResposta() {
    respondendo = null;
    faixa.hidden = true;
    caixaVisor.classList.remove('respondendo');
  }
  function comecarResposta(i) {
    anotando = false;
    botaoAnotar.setAttribute('aria-pressed', 'false');
    caixaVisor.classList.remove('anotando');
    respondendo = i;
    caixaVisor.classList.add('respondendo');
    faixa.textContent = '';
    faixa.append(el('span', { text: `Pergunta ${i + 1}: clique no ponto da lâmina que responde. Use o zoom antes, se precisar.` }), el('button', { type: 'button', class: 'ferramenta', text: 'Cancelar', onclick: pararResposta }));
    faixa.hidden = false;
  }

  function desenharQuiz() {
    const estado = estadoQuiz(caso);
    const salvar = () => {
      guardar.gravar('quiz:' + caso.codigo, estado);
      desenharQuiz();
      desenharMarcas();
    };
    corpoAba.textContent = '';
    const animal = [caso.especie, caso.raca, caso.idade, caso.sexo].filter(Boolean).join(' · ');
    if (caso.historico || animal)
      anexar(el('div', { class: 'historico' }, el('span', { class: 'rotulo', text: 'Histórico' }), animal ? el('strong', { text: animal }) : null, caso.historico ? el('p', { text: caso.historico }) : null));
    if (!caso.quiz.length) {
      anexar(el('p', { class: 'suave', text: 'Este caso ainda não tem perguntas. Examine a lâmina e veja o caso na aba ao lado.' }));
      return;
    }
    caso.quiz.forEach((q, i) => {
      const resp = estado.respostas[i] || {};
      const bloco = el('div', { class: 'pergunta' }, el('h3', { text: `${i + 1}. ${q.pergunta}` }));
      if (q.tipo === 'multipla') {
        const respondido = resp.escolha != null;
        for (const op of embaralhar([q.resposta, ...q.alternativas], caso.codigo + i)) {
          const classe = respondido ? (op === q.resposta ? 'certa' : op === resp.escolha ? 'errada' : '') : '';
          bloco.append(
            el('button', {
              type: 'button',
              class: 'opcao ' + classe,
              disabled: respondido,
              text: op,
              onclick: () => {
                estado.respostas[i] = { escolha: op, certo: op === q.resposta };
                salvar();
              },
            }),
          );
        }
        if (respondido) bloco.append(el('p', { class: 'resultado ' + (resp.certo ? 'certo' : 'errado'), text: resp.certo ? 'Acertou.' : 'Não foi dessa vez. A certa está em verde.' }));
      } else if (q.tipo === 'regiao') {
        if (!resp.ponto) {
          bloco.append(
            el('div', { class: 'linha-botoes' }, el('button', { type: 'button', class: 'ferramenta destaque', text: respondendo === i ? 'Clique na lâmina…' : 'Responder clicando na lâmina', onclick: () => comecarResposta(i) })),
          );
        } else {
          bloco.append(
            el('p', { class: 'resultado ' + (resp.certo ? 'certo' : 'errado'), text: resp.certo ? 'Acertou: você clicou dentro da área.' : 'Fora da área. O retângulo mostra onde estava.' }),
            el('div', { class: 'linha-botoes' }, el('button', { type: 'button', class: 'ferramenta', text: 'Ver a área na lâmina', onclick: () => visor?.irPara({ x: q.regiao.x + q.regiao.w / 2, y: q.regiao.y + q.regiao.h / 2, largura: Math.max(q.regiao.w, q.regiao.h) * 2.5 }) })),
          );
          if (q.resposta) bloco.append(el('div', { class: 'resposta-aberta' }, el('span', { class: 'suave', text: 'Resposta: ' }), q.resposta));
        }
      } else {
        // Pergunta aberta: o aluno escreve, confere com a resposta do patologista e diz se acertou.
        const campo = el('textarea', { class: 'caixa-texto', id: `resposta-${caso.codigo}-${i}`, placeholder: 'Escreva sua resposta antes de conferir', disabled: resp.conferido });
        campo.value = resp.texto || '';
        bloco.append(campo);
        if (!resp.conferido) {
          bloco.append(
            el('div', { class: 'linha-botoes' }, el('button', {
              type: 'button',
              class: 'ferramenta',
              text: 'Conferir',
              onclick: () => {
                estado.respostas[i] = { texto: campo.value, conferido: true, certo: null };
                salvar();
              },
            })),
          );
        } else {
          bloco.append(el('div', { class: 'resposta-aberta' }, el('span', { class: 'suave', text: 'Resposta do patologista: ' }), q.resposta));
          if (resp.certo == null) {
            const marcar = (certo) => () => {
              estado.respostas[i] = { ...resp, certo };
              salvar();
            };
            bloco.append(
              el('div', { class: 'linha-botoes' }, el('span', { class: 'suave', text: 'Você acertou?' }), el('button', { type: 'button', class: 'ferramenta', text: 'Acertei', onclick: marcar(true) }), el('button', { type: 'button', class: 'ferramenta', text: 'Errei', onclick: marcar(false) })),
            );
          } else {
            bloco.append(el('p', { class: 'resultado ' + (resp.certo ? 'certo' : 'errado'), text: resp.certo ? 'Você marcou que acertou.' : 'Você marcou que errou.' }));
          }
        }
      }
      if (resp.certo != null && q.explicacao) bloco.append(el('p', { class: 'explicacao', text: q.explicacao }));
      anexar(bloco);
    });
    if (quizCompleto(caso, estado)) {
      const acertos = estado.respostas.filter((r) => r?.certo).length;
      anexar(
        el(
          'div',
          { class: 'placar' },
          el('p', { text: `Você acertou ${acertos} de ${caso.quiz.length}.` }),
          el(
            'div',
            { class: 'linha-botoes' },
            caso.tour.length ? el('button', { type: 'button', class: 'ferramenta destaque', text: 'Fazer o tour guiado', onclick: () => abrirAba('tour') }) : null,
            el('button', { type: 'button', class: 'ferramenta', text: 'Ver o caso', onclick: () => abrirAba('caso') }),
            el('button', {
              type: 'button',
              class: 'ferramenta',
              text: 'Refazer',
              onclick: () => {
                guardar.gravar('quiz:' + caso.codigo, { respostas: [], revelado: false });
                desenharQuiz();
                desenharMarcas();
              },
            }),
          ),
        ),
      );
    }
  }

  // ----- Tour guiado -----
  function irParaPasso(i) {
    passoTour = i;
    if (visor) visor.irPara(caso.tour[i]);
    if (abaAtual === 'tour') {
      corpoAba.textContent = '';
      desenharTour();
      desenharMarcas();
    }
  }
  function desenharTour() {
    if (!caso.tour.length) {
      anexar(el('p', { class: 'suave', text: 'Este caso ainda não tem tour guiado.' }));
      return;
    }
    if (!liberado(caso)) return bloqueado('O tour mostra os achados do caso, por isso abre depois do quiz.');
    const atual = caso.tour[passoTour];
    anexar(
      el('p', { class: 'suave', text: `O patologista escolheu ${caso.tour.length} ${caso.tour.length === 1 ? 'ponto' : 'pontos'} desta lâmina. Siga na ordem.` }),
      atual
        ? el('div', { class: 'passo-tour' }, el('span', { class: 'rotulo', text: `Ponto ${passoTour + 1} de ${caso.tour.length}` }), el('p', { text: atual.texto || 'Sem comentário neste ponto.' }))
        : null,
      el(
        'div',
        { class: 'linha-botoes' },
        passoTour > 0 ? el('button', { type: 'button', class: 'ferramenta', text: '← Anterior', onclick: () => irParaPasso(passoTour - 1) }) : null,
        passoTour < caso.tour.length - 1
          ? el('button', { type: 'button', class: 'ferramenta destaque', text: passoTour < 0 ? 'Começar o tour' : 'Próximo →', onclick: () => irParaPasso(passoTour + 1) })
          : el('button', { type: 'button', class: 'ferramenta', text: 'Ver a lâmina inteira', onclick: () => visor?.viewer.viewport.goHome() }),
      ),
      el('ol', { class: 'lista-tour' }, caso.tour.map((p, i) => el('li', {}, el('button', { type: 'button', class: 'link' + (i === passoTour ? ' atual' : ''), text: p.texto || `Ponto ${i + 1}`, onclick: () => irParaPasso(i) })))),
    );
  }

  // ----- O caso -----
  function desenharCaso() {
    if (!liberado(caso)) return bloqueado('O diagnóstico aparece depois do quiz, para você treinar sem pista.');
    const ficha = visor?.ficha;
    const um = caso.umPorPixel || ficha?.umPorPixel;
    const tamanho = ficha
      ? um
        ? `${((ficha.largura * um) / 1000).toFixed(1).replace('.', ',')} × ${((ficha.altura * um) / 1000).toFixed(1).replace('.', ',')} mm`
        : `${ficha.largura.toLocaleString('pt-BR')} × ${ficha.altura.toLocaleString('pt-BR')} px`
      : '';
    const linhas = [
      ['Espécie', caso.especie],
      ['Órgão', caso.orgao],
      ['Categoria', caso.categoria],
      ['Coloração', caso.coloracao],
      ['Dificuldade', caso.dificuldade],
      ['Escaneada em', caso.objetiva ? caso.objetiva + '×' : ''],
      ['Imagem', tamanho],
    ].filter(([, v]) => v);
    anexar(
      el('span', { class: 'rotulo', text: 'Diagnóstico' }),
      el('p', { class: 'diagnostico', text: caso.diagnostico || 'Ainda não informado' }),
      el('dl', { class: 'ficha' }, linhas.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
      caso.diferenciais.length ? el('span', { class: 'rotulo', text: 'Diagnósticos diferenciais' }) : null,
      caso.diferenciais.length ? el('ul', {}, caso.diferenciais.map((d) => el('li', { text: d }))) : null,
      caso.achados.length ? el('span', { class: 'rotulo', text: 'O que procurar na lâmina' }) : null,
      caso.achados.length ? el('ul', {}, caso.achados.map((a) => el('li', { text: a }))) : null,
      caso.comentario ? el('span', { class: 'rotulo', text: 'Comentário do patologista' }) : null,
      caso.comentario ? el('p', { text: caso.comentario }) : null,
      caso.tour.length ? el('button', { type: 'button', class: 'ferramenta destaque', text: 'Fazer o tour guiado', onclick: () => abrirAba('tour') }) : null,
    );
  }

  // ----- Anotações -----
  function gravarNotas() {
    guardar.gravar('notas:' + caso.codigo, notas.map(({ x, y, texto }) => ({ x, y, texto })));
  }
  function desenharNotas(focarUltima) {
    if (abaAtual !== 'notas') return;
    corpoAba.textContent = '';
    if (!notas.length) {
      anexar(el('p', { class: 'suave' }, 'Toque em ', el('strong', { text: 'Anotar' }), ' e depois num ponto da lâmina para marcar o que observou.'));
      return;
    }
    notas.forEach((n, i) => {
      const campo = el('textarea', { class: 'caixa-texto', id: `nota-${caso.codigo}-${i}`, placeholder: 'O que você observou aqui?' });
      campo.value = n.texto;
      campo.addEventListener('input', () => {
        n.texto = campo.value;
        gravarNotas();
      });
      anexar(
        el(
          'div',
          { class: 'nota' },
          el('button', { type: 'button', class: 'ferramenta', title: 'Ir até este ponto', text: String(i + 1), onclick: () => irParaPonto(n) }),
          campo,
          el('button', {
            type: 'button',
            class: 'ferramenta',
            title: 'Apagar anotação',
            'aria-label': 'Apagar anotação',
            text: '×',
            onclick: () => {
              notas.splice(i, 1);
              gravarNotas();
              desenharNotas();
              desenharMarcas();
            },
          }),
        ),
      );
      if (focarUltima && i === notas.length - 1) campo.focus();
    });
  }

  abrirAba(abaAtual);
  window.scrollTo(0, 0);

  criarVisor(caixaVisor, caso.codigo, { objetiva: caso.objetiva, umPorPixel: caso.umPorPixel, vista, enderecoBase, elementoTelaCheia: tela })
    .then(async (v) => {
      if (fechada) return v.destruir();
      visor = v;
      await v.pronto;
      if (fechada) return;
      desenharMarcas();
      if (abaAtual === 'caso') abrirAba('caso');
      v.viewer.addHandler('canvas-click', (e) => {
        if (!e.quick || (respondendo == null && !anotando)) return;
        e.preventDefaultAction = true;
        const p = v.pontoDoEvento(e.position);
        if (!p) return;
        if (respondendo != null) {
          const q = caso.quiz[respondendo];
          const r = q.regiao;
          const estado = estadoQuiz(caso);
          estado.respostas[respondendo] = { ponto: p, certo: p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h };
          guardar.gravar('quiz:' + caso.codigo, estado);
          pararResposta();
          abrirAba('quiz');
          return;
        }
        notas.push({ x: p.x, y: p.y, texto: '' });
        gravarNotas();
        if (abaAtual !== 'notas') abrirAba('notas');
        else desenharMarcas();
        desenharNotas(true);
      });
    })
    .catch(() => {
      if (!fechada) caixaVisor.append(el('p', { class: 'vazio', style: 'padding:24px', text: 'Não foi possível abrir esta lâmina. Confira a conexão e tente de novo.' }));
    });

  return () => {
    fechada = true;
    if (visor) visor.destruir();
  };
}
