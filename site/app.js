'use strict';
// Site de demonstração do Banco de Lâminas. Uma página só, com três telas escolhidas pelo endereço:
// #inicio, #laminas (catálogo) e #<código da lâmina>. Os casos vêm de dados/casos.json (gerado da planilha
// por ferramentas/casos_da_planilha.py) e cada lâmina de laminas/<código>/ (gerada por converter_lamina.py).
// Nesta fase, respostas e anotações ficam no navegador; na plataforma irão para a conta do aluno.

const app = document.getElementById('app');
const PASTA_LAMINAS = 'laminas/';
const TELAS_FIXAS = ['inicio', 'laminas', 'planos'];
let casos = [];
let viewer = null;

// ---------- Utilidades ----------
const guardar = {
  ler(chave, padrao) {
    try {
      const v = localStorage.getItem(chave);
      return v ? JSON.parse(v) : padrao;
    } catch {
      return padrao;
    }
  },
  gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // Sem armazenamento (janela anônima): vale só enquanto a página estiver aberta.
    }
  },
};

// Cria um elemento. Texto sempre via textContent, nunca como HTML, para não interpretar o que vem da planilha.
function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) e.append(f instanceof Node ? f : document.createTextNode(f));
  return e;
}

function nomeDoCaso(caso) {
  const numero = caso.codigo.match(/(\d+)$/);
  return numero ? 'Caso ' + numero[1] : caso.codigo;
}
function resumo(caso) {
  return [caso.especie, caso.orgao].filter(Boolean).join(' · ');
}

// Embaralha as alternativas sempre do mesmo jeito para a mesma pergunta, para a ordem não mudar ao voltar.
function embaralhar(lista, semente) {
  let h = 2166136261;
  for (const ch of semente) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = (h >>> 0) % (i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function estadoQuiz(caso) {
  return guardar.ler('quiz:' + caso.codigo, { respostas: [], revelado: false });
}
function quizCompleto(caso, estado = estadoQuiz(caso)) {
  return caso.quiz.length > 0 && caso.quiz.every((_, i) => estado.respostas[i]?.certo != null);
}

// ---------- Rotas ----------
function rotaAtual() {
  const r = decodeURIComponent(location.hash.slice(1));
  if (TELAS_FIXAS.includes(r)) return r;
  if (casos.some((c) => c.codigo === r)) return r;
  return 'inicio';
}

function mostrar() {
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
  document.body.classList.remove('modo-lamina');
  app.textContent = '';
  const rota = rotaAtual();
  for (const a of document.querySelectorAll('.menu a')) {
    if (a.dataset.rota === rota || (a.dataset.rota === 'laminas' && casos.some((c) => c.codigo === rota))) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (rota === 'laminas') telaCatalogo();
  else if (TELAS_FIXAS.includes(rota)) telaInicio(rota === 'planos');
  else telaLamina(casos.find((c) => c.codigo === rota));
}

// ---------- Início ----------
function telaInicio(irParaPlanos) {
  const destaque = casos[0];
  const vidro = destaque
    ? el(
        'div',
        { class: 'vidro', 'aria-hidden': 'true' },
        el('div', { class: 'vidro-etiqueta' }, el('strong', { text: 'IFVET' }), el('span', { text: destaque.codigo }), el('span', { text: destaque.coloracao || 'HE' })),
        el('div', { class: 'vidro-corte' }, el('img', { src: `${PASTA_LAMINAS}${destaque.codigo}/${destaque.codigo}_miniatura.jpeg`, alt: '' })),
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
        el(
          'p',
          { text: 'Lâminas reais escaneadas por inteiro e selecionadas por patologistas. Navegue do panorama ao detalhe, marque o que encontrar e teste seu diagnóstico antes de ver a resposta.' },
        ),
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
        el('li', {}, el('h3', { text: 'Escolha uma lâmina' }), el('p', { text: 'Filtre por espécie, órgão e dificuldade. O diagnóstico fica escondido, como na rotina.' })),
        el('li', {}, el('h3', { text: 'Examine e anote' }), el('p', { text: 'Use o zoom do aumento menor ao maior e marque na própria lâmina o que chamou sua atenção.' })),
        el('li', {}, el('h3', { text: 'Responda e confira' }), el('p', { text: 'Faça o quiz do caso. Depois veja o diagnóstico, os achados principais e o comentário do patologista.' })),
      ),
    ),
    el(
      'section',
      { class: 'conteudo secao' },
      el('h2', { text: 'Para quem é' }),
      el(
        'div',
        { class: 'publico' },
        ['Estudantes de medicina veterinária', 'Residentes em patologia', 'Médicos-veterinários que querem treinar histopatologia', 'Professores que precisam de material para aula'].map((t) =>
          el('span', { class: 'etiqueta', text: t }),
        ),
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
function telaCatalogo() {
  const filtros = guardar.ler('filtros', {});
  const campos = [
    ['especie', 'Espécie'],
    ['orgao', 'Órgão'],
    ['dificuldade', 'Dificuldade'],
  ];
  const grade = el('div', { class: 'grade' });

  function desenhar() {
    grade.textContent = '';
    const lista = casos.filter((c) => campos.every(([k]) => !filtros[k] || c[k] === filtros[k]));
    if (!lista.length) grade.append(el('p', { class: 'vazio', text: 'Nenhuma lâmina com esses filtros. Tente limpar algum deles.' }));
    for (const caso of lista) {
      const estado = estadoQuiz(caso);
      const acertos = estado.respostas.filter((r) => r?.certo).length;
      grade.append(
        el(
          'a',
          { class: 'cartao', href: '#' + caso.codigo },
          el('div', { class: 'cartao-imagem' }, el('img', { src: `${PASTA_LAMINAS}${caso.codigo}/${caso.codigo}_miniatura.jpeg`, alt: '', loading: 'lazy' })),
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
              quizCompleto(caso, estado) ? el('span', { class: 'etiqueta certo', text: `Feito · ${acertos}/${caso.quiz.length}` }) : null,
              caso.exemplo && el('span', { class: 'etiqueta', text: 'Ficha de exemplo' }),
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
async function telaLamina(caso) {
  document.body.classList.add('modo-lamina');
  const pasta = `${PASTA_LAMINAS}${caso.codigo}/`;
  let ficha;
  let anotando = false;
  let notas = guardar.ler('notas:' + caso.codigo, []);
  let marcadoresNotas = [];

  const visor = el('div', { class: 'visor' });
  const botaoAnotar = el('button', {
    class: 'ferramenta',
    type: 'button',
    'aria-pressed': 'false',
    title: 'Toque na lâmina para marcar um ponto e escrever uma nota',
    text: 'Anotar',
    onclick: () => {
      anotando = !anotando;
      botaoAnotar.setAttribute('aria-pressed', anotando);
      visor.classList.toggle('anotando', anotando);
      if (anotando) abrirAba('notas');
    },
  });
  const abas = { quiz: 'Quiz', notas: 'Anotações', caso: 'O caso' };
  const corpoAba = el('div', { class: 'aba' });
  const botoesAbas = Object.entries(abas).map(([id, nome]) => el('button', { type: 'button', role: 'tab', 'data-aba': id, text: nome, onclick: () => abrirAba(id) }));

  app.append(
    el(
      'div',
      { class: 'lamina' },
      el(
        'div',
        { class: 'lamina-barra' },
        el('a', { href: '#laminas', text: '← Lâminas' }),
        el('h1', {}, nomeDoCaso(caso), el('small', { text: [resumo(caso), caso.coloracao].filter(Boolean).join(' · ') })),
        el('div', { class: 'ferramentas' }, botaoAnotar, el('button', { class: 'ferramenta', type: 'button', text: 'Lâmina inteira', onclick: () => viewer?.viewport.goHome() })),
      ),
      visor,
      el('aside', { class: 'painel' }, el('div', { class: 'abas', role: 'tablist' }, botoesAbas), corpoAba),
    ),
  );
  const detalhe = el(
    'dialog',
    {},
    el('img', { alt: 'Foto de maior aumento' }),
    el('p', {}),
    el('form', { method: 'dialog' }, el('button', { class: 'ferramenta', text: 'Fechar' })),
  );
  app.append(detalhe);

  let abaAtual = guardar.ler('aba', 'quiz');
  function abrirAba(id) {
    abaAtual = id;
    guardar.gravar('aba', id);
    for (const b of botoesAbas) b.setAttribute('aria-selected', b.dataset.aba === id);
    corpoAba.textContent = '';
    if (id === 'quiz') desenharQuiz();
    else if (id === 'notas') desenharNotas();
    else desenharCaso();
  }

  // ----- Quiz -----
  function desenharQuiz() {
    const estado = estadoQuiz(caso);
    const salvar = () => {
      guardar.gravar('quiz:' + caso.codigo, estado);
      desenharQuiz();
    };
    corpoAba.textContent = '';
    const animal = [caso.especie, caso.raca, caso.idade, caso.sexo].filter(Boolean).join(' · ');
    if (caso.historico || animal)
      corpoAba.append(
        el(
          'div',
          { class: 'historico' },
          el('span', { class: 'rotulo', text: 'Histórico' }),
          animal ? el('strong', { text: animal }) : null,
          caso.historico ? el('p', { text: caso.historico }) : null,
        ),
      );
    if (!caso.quiz.length) {
      corpoAba.append(el('p', { class: 'suave', text: 'Este caso ainda não tem perguntas. Examine a lâmina e veja o caso na aba ao lado.' }));
      return;
    }
    caso.quiz.forEach((q, i) => {
      const resp = estado.respostas[i] || {};
      const bloco = el('div', { class: 'pergunta' }, el('h3', { text: `${i + 1}. ${q.pergunta}` }));
      if (q.alternativas.length) {
        const opcoes = embaralhar([q.resposta, ...q.alternativas], caso.codigo + i);
        for (const op of opcoes) {
          const respondido = resp.escolha != null;
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
        if (resp.escolha != null) {
          bloco.append(el('p', { class: 'resultado ' + (resp.certo ? 'certo' : 'errado'), text: resp.certo ? 'Acertou.' : 'Não foi dessa vez. A certa está em verde.' }));
          if (q.explicacao) bloco.append(el('p', { class: 'explicacao', text: q.explicacao }));
        }
      } else {
        // Pergunta aberta: o aluno escreve, confere com a resposta do patologista e diz se acertou.
        const campo = el('textarea', { class: 'campo', id: `resposta-${caso.codigo}-${i}`, placeholder: 'Escreva sua resposta antes de conferir', disabled: resp.conferido });
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
          if (q.explicacao) bloco.append(el('p', { class: 'explicacao', text: q.explicacao }));
          if (resp.certo == null) {
            const marcar = (certo) => () => {
              estado.respostas[i] = { ...resp, certo };
              salvar();
            };
            bloco.append(
              el(
                'div',
                { class: 'linha-botoes' },
                el('span', { class: 'suave', text: 'Você acertou?' }),
                el('button', { type: 'button', class: 'ferramenta', text: 'Acertei', onclick: marcar(true) }),
                el('button', { type: 'button', class: 'ferramenta', text: 'Errei', onclick: marcar(false) }),
              ),
            );
          } else {
            bloco.append(el('p', { class: 'resultado ' + (resp.certo ? 'certo' : 'errado'), text: resp.certo ? 'Você marcou que acertou.' : 'Você marcou que errou.' }));
          }
        }
      }
      corpoAba.append(bloco);
    });
    if (quizCompleto(caso, estado)) {
      const acertos = estado.respostas.filter((r) => r?.certo).length;
      corpoAba.append(
        el(
          'div',
          { class: 'placar' },
          el('p', { text: `Você acertou ${acertos} de ${caso.quiz.length}.` }),
          el(
            'div',
            { class: 'linha-botoes' },
            el('button', { type: 'button', class: 'ferramenta', text: 'Ver o caso', onclick: () => abrirAba('caso') }),
            el('button', {
              type: 'button',
              class: 'ferramenta',
              text: 'Refazer',
              onclick: () => {
                guardar.gravar('quiz:' + caso.codigo, { respostas: [], revelado: false });
                desenharQuiz();
              },
            }),
          ),
        ),
      );
    }
  }

  // ----- O caso -----
  function desenharCaso() {
    const estado = estadoQuiz(caso);
    if (!quizCompleto(caso, estado) && !estado.revelado && caso.quiz.length) {
      corpoAba.append(
        el(
          'div',
          { class: 'bloqueado' },
          el('p', { text: 'O diagnóstico aparece depois do quiz, para você treinar sem pista.' }),
          el('div', { class: 'linha-botoes' }, el('button', { type: 'button', class: 'ferramenta', text: 'Ir para o quiz', onclick: () => abrirAba('quiz') }), el('button', {
            type: 'button',
            class: 'ferramenta',
            text: 'Mostrar mesmo assim',
            onclick: () => {
              guardar.gravar('quiz:' + caso.codigo, { ...estado, revelado: true });
              abrirAba('caso');
            },
          })),
        ),
      );
      return;
    }
    const tamanho = ficha?.umPorPixel
      ? `${((ficha.largura * ficha.umPorPixel) / 1000).toFixed(1).replace('.', ',')} × ${((ficha.altura * ficha.umPorPixel) / 1000).toFixed(1).replace('.', ',')} mm`
      : ficha
        ? `${ficha.largura.toLocaleString('pt-BR')} × ${ficha.altura.toLocaleString('pt-BR')} px`
        : '';
    const linhas = [
      ['Espécie', caso.especie],
      ['Órgão', caso.orgao],
      ['Categoria', caso.categoria],
      ['Coloração', caso.coloracao],
      ['Dificuldade', caso.dificuldade],
      ['Objetiva', ficha?.objetiva ? ficha.objetiva + '×' : ''],
      ['Imagem', tamanho],
    ].filter(([, v]) => v);
    corpoAba.append(
      el('span', { class: 'rotulo', text: 'Diagnóstico' }),
      el('p', { class: 'diagnostico', text: caso.diagnostico || 'Ainda não informado' }),
      el('dl', { class: 'ficha' }, linhas.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
      caso.diferenciais?.length ? el('span', { class: 'rotulo', text: 'Diagnósticos diferenciais' }) : null,
      caso.diferenciais?.length ? el('ul', {}, caso.diferenciais.map((d) => el('li', { text: d }))) : null,
      caso.achados.length ? el('span', { class: 'rotulo', text: 'O que procurar na lâmina' }) : null,
      caso.achados.length ? el('ul', {}, caso.achados.map((a) => el('li', { text: a }))) : null,
      caso.comentario ? el('span', { class: 'rotulo', text: 'Comentário do patologista' }) : null,
      caso.comentario ? el('p', { text: caso.comentario }) : null,
    );
  }

  // ----- Anotações -----
  function gravarNotas() {
    guardar.gravar(
      'notas:' + caso.codigo,
      notas.map(({ x, y, texto }) => ({ x, y, texto })),
    );
  }
  function noPonto(x, y) {
    return viewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(x, y));
  }
  function irPara(x, y) {
    viewer.viewport.panTo(noPonto(x, y));
    viewer.viewport.zoomTo(Math.max(viewer.viewport.getZoom(), viewer.viewport.getMaxZoom() / 4));
  }
  function marcador(texto, classe) {
    return el('div', { class: 'marcador' + (classe ? ' ' + classe : ''), text: texto });
  }
  function desenharMarcadores() {
    if (!viewer) return;
    for (const m of marcadoresNotas) viewer.removeOverlay(m);
    marcadoresNotas = notas.map((n, i) => {
      const m = marcador(String(i + 1));
      new OpenSeadragon.MouseTracker({ element: m, clickHandler: () => irPara(n.x, n.y) });
      viewer.addOverlay({ element: m, location: noPonto(n.x, n.y), placement: OpenSeadragon.Placement.CENTER });
      return m;
    });
  }
  function desenharNotas(focarUltima) {
    desenharMarcadores();
    if (abaAtual !== 'notas') return;
    corpoAba.textContent = '';
    if (!notas.length) {
      corpoAba.append(el('p', { class: 'suave' }, 'Toque em ', el('strong', { text: 'Anotar' }), ' e depois num ponto da lâmina para marcar o que observou.'));
      return;
    }
    notas.forEach((n, i) => {
      const campo = el('textarea', { class: 'campo', id: `nota-${caso.codigo}-${i}`, placeholder: 'O que você observou aqui?' });
      campo.value = n.texto;
      campo.addEventListener('input', () => {
        n.texto = campo.value;
        gravarNotas();
      });
      corpoAba.append(
        el(
          'div',
          { class: 'nota' },
          el('button', { type: 'button', class: 'ferramenta', title: 'Ir até este ponto', text: String(i + 1), onclick: () => irPara(n.x, n.y) }),
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
            },
          }),
        ),
      );
      if (focarUltima && i === notas.length - 1) campo.focus();
    });
  }

  // ----- Visualizador -----
  function atualizarEscala() {
    if (!ficha?.umPorPixel) return;
    const umPorPonto = ficha.umPorPixel / viewer.viewport.viewportToImageZoom(viewer.viewport.getZoom(true));
    const opcoes = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
    let L = opcoes[0];
    for (const v of opcoes) if (v / umPorPonto <= 140) L = v;
    visor.querySelector('.escala div').style.width = Math.max(16, L / umPorPonto) + 'px';
    visor.querySelector('.escala span').textContent = L >= 1000 ? String(L / 1000).replace('.', ',') + ' mm' : L + ' µm';
  }

  abrirAba(abaAtual in abas ? abaAtual : 'quiz');
  window.scrollTo(0, 0);
  try {
    const resposta = await fetch(pasta + caso.codigo + '.json');
    if (!resposta.ok) throw new Error();
    ficha = await resposta.json();
  } catch {
    visor.append(el('p', { class: 'vazio', style: 'padding:24px', text: 'Não foi possível abrir esta lâmina. Confira a conexão e tente de novo.' }));
    return;
  }
  if (!document.body.contains(visor)) return; // a pessoa já saiu da tela enquanto carregava
  if (abaAtual === 'caso') abrirAba('caso');

  viewer = OpenSeadragon({
    element: visor,
    tileSources: pasta + ficha.dzi,
    showNavigationControl: false,
    showNavigator: true,
    navigatorPosition: 'BOTTOM_RIGHT',
    maxZoomPixelRatio: 2,
    visibilityRatio: 0.5,
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
    gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true },
  });
  if (ficha.umPorPixel) {
    visor.append(el('div', { class: 'escala' }, el('div'), el('span')));
    viewer.addHandler('animation', atualizarEscala);
  }
  viewer.addHandler('open', () => {
    desenharMarcadores();
    for (const p of ficha.pinos || []) {
      const m = marcador(p.rotulo || '•', 'pino');
      m.title = p.texto || 'Foto de maior aumento';
      new OpenSeadragon.MouseTracker({
        element: m,
        clickHandler: () => {
          const img = detalhe.querySelector('img');
          img.hidden = !p.imagem;
          if (p.imagem) img.src = pasta + p.imagem;
          detalhe.querySelector('p').textContent = p.texto || '';
          detalhe.showModal();
        },
      });
      viewer.addOverlay({ element: m, location: noPonto(p.x, p.y), placement: OpenSeadragon.Placement.CENTER });
    }
    atualizarEscala();
  });
  viewer.addHandler('canvas-click', (e) => {
    if (!anotando || !e.quick) return;
    e.preventDefaultAction = true;
    const p = viewer.viewport.viewerElementToImageCoordinates(e.position);
    if (p.x < 0 || p.y < 0 || p.x > ficha.largura || p.y > ficha.altura) return;
    notas.push({ x: Math.round(p.x), y: Math.round(p.y), texto: '' });
    gravarNotas();
    if (abaAtual !== 'notas') abrirAba('notas');
    desenharNotas(true);
  });
}

// ---------- Partida ----------
document.getElementById('entrar').addEventListener('click', () => {
  const aviso = el('div', { class: 'aviso-flutuante', role: 'status', text: 'O cadastro e o login entram na próxima etapa, junto com a assinatura.' });
  document.body.append(aviso);
  setTimeout(() => aviso.remove(), 4000);
});
window.addEventListener('hashchange', mostrar);
fetch('dados/casos.json')
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((lista) => {
    casos = lista;
    mostrar();
  })
  .catch(() => {
    app.append(el('p', { class: 'conteudo vazio', text: 'Não foi possível carregar o catálogo de lâminas. Recarregue a página para tentar de novo.' }));
  });
