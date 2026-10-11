'use strict';
// Área do patologista: preenche a ficha de cada caso com a lâmina ao lado, para marcar a área das perguntas
// de clicar na lesão e os pontos do tour guiado. Cada ficha é o documento casos/<código> do banco da página;
// marcar como "Publicada" já põe o caso no catálogo do aluno.

const ESPECIES = ['Cão', 'Gato', 'Equino', 'Bovino', 'Ovino', 'Caprino', 'Suíno', 'Ave', 'Coelho', 'Silvestre'];
const ORGAOS = ['Pele', 'Subcutâneo', 'Glândula mamária', 'Linfonodo', 'Baço', 'Fígado', 'Rim', 'Pulmão', 'Intestino', 'Estômago', 'Cavidade oral', 'Útero', 'Ovário', 'Testículo', 'Bexiga', 'Osso', 'Músculo', 'Encéfalo', 'Olho', 'Coração'];
const COLORACOES = ['HE', 'PAS', 'Tricrômico de Masson', 'Giemsa', 'Azul de toluidina', 'Ziehl-Neelsen', 'Grocott', 'Imuno-histoquímica'];
const CATEGORIAS = ['Neoplasia', 'Inflamatória', 'Infecciosa ou parasitária', 'Degenerativa', 'Circulatória', 'Hiperplasia ou displasia', 'Do desenvolvimento', 'Tecido normal'];
const DIFICULDADES = ['Fácil', 'Médio', 'Difícil'];
const OBJETIVAS = [
  ['4', '4×'],
  ['10', '10×'],
  ['20', '20×'],
  ['40', '40×'],
];
const SITUACOES = [
  ['rascunho', 'Rascunho'],
  ['revisao', 'Em revisão'],
  ['pronta', 'Publicada'],
];
const TIPOS_PERGUNTA = [
  ['multipla', 'Múltipla escolha'],
  ['aberta', 'Resposta aberta'],
  ['regiao', 'Clicar na lesão'],
];

function casoVazio(codigo) {
  return {
    codigo,
    arquivo: '',
    especie: '',
    raca: '',
    idade: '',
    sexo: '',
    historico: '',
    orgao: '',
    coloracao: 'HE',
    objetiva: '',
    umPorPixel: '',
    categoria: '',
    diagnostico: '',
    diferenciais: [],
    dificuldade: 'Médio',
    achados: [''],
    quiz: [{ tipo: 'multipla', pergunta: 'Qual o diagnóstico?', resposta: '', alternativas: ['', '', ''], explicacao: '' }],
    tour: [],
    comentario: '',
    revisadoPor: '',
    situacao: 'rascunho',
  };
}
// Garante todos os campos (fichas criadas antes de um campo existir).
function completarFicha(dados) {
  const base = casoVazio(dados.codigo);
  const c = { ...base, ...structuredClone(dados) };
  for (const k of ['diferenciais', 'achados', 'quiz', 'tour']) if (!Array.isArray(c[k])) c[k] = base[k];
  if (!c.achados.length) c.achados = base.achados;
  if (!c.quiz.length) c.quiz = base.quiz;
  c.quiz = c.quiz.map((q) => ({ tipo: 'multipla', pergunta: '', resposta: '', alternativas: [], explicacao: '', ...q }));
  c.objetiva = c.objetiva == null ? '' : String(c.objetiva);
  c.umPorPixel = c.umPorPixel == null ? '' : String(c.umPorPixel);
  return c;
}

function oQueFalta(c) {
  const falta = [];
  if (!c.especie.trim()) falta.push('espécie');
  if (!c.orgao.trim()) falta.push('órgão');
  if (!c.historico.trim()) falta.push('histórico');
  if (!numero(c.objetiva)) falta.push('objetiva do escaneamento');
  if (!c.diagnostico.trim()) falta.push('diagnóstico');
  if (!c.achados.some((a) => a.trim())) falta.push('pelo menos um achado');
  if (!c.quiz.some((q) => q.pergunta.trim())) falta.push('uma pergunta do quiz');
  for (const [i, q] of c.quiz.entries()) {
    if (!q.pergunta.trim()) continue;
    if (q.tipo === 'regiao') {
      if (!q.regiao) falta.push(`área da pergunta ${i + 1} na lâmina`);
      continue;
    }
    if (!q.resposta.trim()) falta.push(`resposta da pergunta ${i + 1}`);
    if (q.tipo === 'multipla' && q.alternativas.filter((a) => a.trim()).length < 2) falta.push(`2 alternativas erradas na pergunta ${i + 1}`);
  }
  return falta;
}

// Envio do .html do Microview em partes de 15 MB (o armazenamento aceita até 20 MB por arquivo). O Claude
// junta as partes, converte a lâmina e marca o envio como convertido.
const TAMANHO_PARTE = 15 * 1024 * 1024;
const MARCA_MICROVIEW = '<script id="dados" type="application/json">';
function partesDoArquivo(bytes) {
  const partes = [];
  let inicio = 0;
  while (inicio < bytes.length) {
    let fim = Math.min(bytes.length, inicio + TAMANHO_PARTE);
    while (fim < bytes.length && (bytes[fim] & 0xc0) === 0x80) fim--; // não parte um caractere acentuado
    partes.push(bytes.subarray(inicio, fim));
    inicio = fim;
  }
  return partes;
}
async function enviarLamina(banco, arquivo, codigo, aoProgresso) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const inicio = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 200000)));
  if (!inicio.includes(MARCA_MICROVIEW) && !new TextDecoder().decode(bytes).includes(MARCA_MICROVIEW)) throw new Error('Este arquivo não parece ser uma lâmina virtual do Microview.');
  const partes = partesDoArquivo(bytes);
  const enviadas = [];
  try {
    for (const parte of partes) {
      aoProgresso(enviadas.length, partes.length);
      enviadas.push((await banco.assets.upload(new Blob([parte], { type: 'text/plain' }), { type: 'text/plain' })).id);
    }
    await banco.db.collection('envios').add({ arquivo: arquivo.name, bytes: arquivo.size, partes: enviadas, enviadaEm: new Date().toISOString(), convertida: false, codigo });
  } catch (e) {
    // Partes de um envio que falhou não servem para nada: remove para não ocupar espaço.
    for (const id of enviadas) banco.assets.delete(id).catch(() => {});
    throw e;
  }
}

const nomeSituacao = (s) => (SITUACOES.find(([k]) => k === s) || SITUACOES[0])[1];

// banco = {db, fichas: Map, ouvir(fn) -> cancelar}
function telaFichas(app, banco, codigoInicial) {
  document.body.classList.add('modo-fichas');
  let aberto = null; // cópia local da ficha em edição
  let ultimaEdicao = 0;
  let timerSalvar = null;
  let salvando = Promise.resolve();
  let estadoSalvo = '';
  let visor = null;
  let visorDe = null;
  let marcasVisor = [];
  let marcando = null; // índice da pergunta cuja área está sendo desenhada
  let rascunhoArea = null;
  let timerVisor = null;
  let fechada = false;
  let envios = [];
  let enviando = null; // {codigo, feitas, total}
  let semLaminaDe = null; // código do caso aberto que não tem lâmina convertida

  const busca = el('input', { class: 'fx-busca', id: 'fx-busca', type: 'text', placeholder: 'Buscar', 'aria-label': 'Buscar casos' });
  const contagem = el('p', { class: 'fx-sub' });
  const lista = el('div', { class: 'fx-lista' });
  const ficha = el('main', { class: 'fx-ficha' });
  const raiz = el(
    'div',
    { class: 'fx' },
    el(
      'aside',
      { class: 'fx-caixa' },
      el('div', {}, el('h1', { text: 'Fichas das lâminas' }), contagem),
      el('div', { class: 'fx-lado' }, busca, el('button', { class: 'fx-botao pequeno', type: 'button', text: '+ Novo caso', onclick: novoCaso })),
      lista,
    ),
    ficha,
  );
  app.append(raiz);
  busca.addEventListener('input', desenharLista);

  // ---------- Lista ----------
  function desenharLista() {
    const termo = busca.value.trim().toLowerCase();
    const todos = [...banco.fichas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
    const publicadas = todos.filter((c) => c.situacao === 'pronta').length;
    contagem.textContent = todos.length ? `${todos.length} ${todos.length === 1 ? 'caso' : 'casos'} · ${publicadas} ${publicadas === 1 ? 'publicado' : 'publicados'}` : 'Nenhum caso ainda.';
    lista.textContent = '';
    const filtrados = todos.filter((c) => !termo || [c.codigo, c.especie, c.orgao, c.diagnostico, c.arquivo].join(' ').toLowerCase().includes(termo));
    if (!filtrados.length && todos.length) lista.append(el('p', { class: 'fx-sub', text: 'Nenhum caso com essa busca.' }));
    for (const c of filtrados) {
      lista.append(
        el(
          'button',
          { class: 'fx-item', type: 'button', 'aria-current': aberto?.codigo === c.codigo ? 'true' : 'false', onclick: () => abrir(c.codigo) },
          el('span', { class: 'fx-mini', style: `background-image:url("${miniatura(c.codigo)}")` }),
          el(
            'span',
            { class: 'fx-item-texto' },
            el('strong', { text: c.codigo }),
            el('span', { text: [c.especie, c.orgao].filter(Boolean).join(' · ') || 'Sem espécie e órgão' }),
            el('span', { class: 'fx-selo ' + c.situacao, text: nomeSituacao(c.situacao) }),
          ),
        ),
      );
    }
  }

  // ---------- Salvar ----------
  const semData = (c) => {
    const { atualizadoEm, ...resto } = c;
    return JSON.stringify(resto);
  };
  function marcarStatus(t) {
    estadoSalvo = t;
    const s = raiz.querySelector('#fx-salvo');
    if (s) s.textContent = t;
  }
  function mudou() {
    ultimaEdicao = Date.now();
    marcarStatus('Salvando…');
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(salvarAgora, 700);
    atualizarFalta();
  }
  function salvarAgora() {
    clearTimeout(timerSalvar);
    timerSalvar = null;
    if (!aberto) return salvando;
    const copia = { ...structuredClone(aberto), atualizadoEm: new Date().toISOString() };
    // Uma escrita por vez no mesmo documento: encadeia na anterior.
    salvando = salvando
      .then(() => banco.db.collection('casos').doc(copia.codigo).set(copia))
      .then(() => {
        banco.fichas.set(copia.codigo, copia);
        if (!timerSalvar) marcarStatus('Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
        desenharLista();
      })
      .catch(() => marcarStatus('Não foi possível salvar. Confira a conexão; o texto continua aqui.'));
    return salvando;
  }

  // ---------- Campos ----------
  function campoTexto(rotulo, chave, { dica, linhas, placeholder, sugestoes, aoMudar } = {}) {
    const id = 'fx-' + chave;
    const entrada = linhas ? el('textarea', { id, rows: linhas, placeholder }) : el('input', { id, type: 'text', placeholder });
    entrada.value = aberto[chave] || '';
    let chips = null;
    const opcoes = (sugestoes || []).map((s) => (Array.isArray(s) ? s : [s, s]));
    const marcarChips = () => {
      if (chips) for (const b of chips.children) b.setAttribute('aria-pressed', b.dataset.valor === entrada.value ? 'true' : 'false');
    };
    entrada.addEventListener('input', () => {
      aberto[chave] = entrada.value;
      marcarChips();
      mudou();
      aoMudar?.();
    });
    if (opcoes.length) {
      chips = el(
        'div',
        { class: 'fx-sugestoes' },
        opcoes.map(([valor, nome]) =>
          el('button', {
            type: 'button',
            class: 'fx-chip',
            'data-valor': valor,
            text: nome,
            onclick: () => {
              entrada.value = valor;
              aberto[chave] = valor;
              marcarChips();
              mudou();
              aoMudar?.();
            },
          }),
        ),
      );
      marcarChips();
    }
    return el('div', { class: 'fx-campo' }, el('label', { for: id, text: rotulo }), entrada, chips, dica ? el('small', { text: dica }) : null);
  }

  function segmentos(rotulo, opcoes, ler, gravar) {
    const caixa = el('div', { class: 'fx-segmentos', role: 'group', 'aria-label': rotulo });
    const desenhar = () => {
      caixa.textContent = '';
      for (const [valor, nome] of opcoes)
        caixa.append(
          el('button', {
            type: 'button',
            'aria-pressed': ler() === valor ? 'true' : 'false',
            text: nome,
            onclick: () => {
              gravar(valor);
              desenhar();
              mudou();
            },
          }),
        );
    };
    desenhar();
    return el('div', { class: 'fx-campo' }, el('span', { class: 'fx-rotulo', text: rotulo }), caixa);
  }

  // Lista de textos (achados, diferenciais, alternativas): uma linha por item, com botão de remover.
  function listaTextos(itens, { marca, placeholder, rotuloAdicionar, idBase }) {
    const caixa = el('div', { class: 'fx-linhas' });
    const ph = (i) => (typeof placeholder === 'function' ? placeholder(i) : placeholder);
    function desenhar(focar) {
      caixa.textContent = '';
      itens.forEach((valor, i) => {
        const entrada = el('input', { type: 'text', id: `${idBase}-${i}`, placeholder: ph(i), 'aria-label': ph(i) || 'Item' });
        entrada.value = valor;
        entrada.addEventListener('input', () => {
          itens[i] = entrada.value;
          mudou();
        });
        entrada.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          itens.splice(i + 1, 0, '');
          desenhar(i + 1);
          mudou();
        });
        caixa.append(
          el(
            'div',
            { class: 'fx-linha-item' },
            marca ? marca(i) : null,
            entrada,
            el('button', {
              type: 'button',
              class: 'fx-icone',
              title: 'Remover',
              'aria-label': 'Remover',
              text: '×',
              onclick: () => {
                itens.splice(i, 1);
                desenhar();
                mudou();
              },
            }),
          ),
        );
        if (focar === i) entrada.focus();
      });
      caixa.append(
        el('button', {
          type: 'button',
          class: 'fx-adicionar',
          text: rotuloAdicionar,
          onclick: () => {
            itens.push('');
            desenhar(itens.length - 1);
            mudou();
          },
        }),
      );
    }
    desenhar();
    return caixa;
  }

  function confirmar(caixa, rotulo, pergunta, acao) {
    const inicial = () => {
      caixa.textContent = '';
      caixa.append(
        el('button', {
          type: 'button',
          class: 'fx-botao pequeno discreto',
          text: rotulo,
          onclick: () => {
            caixa.textContent = '';
            caixa.append(el('span', { text: pergunta }), el('button', { type: 'button', class: 'fx-botao pequeno perigo', text: rotulo, onclick: acao }), el('button', { type: 'button', class: 'fx-botao pequeno discreto', text: 'Cancelar', onclick: inicial }));
          },
        }),
      );
    };
    inicial();
    return caixa;
  }

  // ---------- Quiz ----------
  const caixaQuiz = el('div', { class: 'fx-linhas', style: 'gap:14px' });
  function desenharQuiz() {
    caixaQuiz.textContent = '';
    aberto.quiz.forEach((q, i) => {
      const campo = (rotulo, chave, entrada) => {
        entrada.value = q[chave] || '';
        entrada.addEventListener('input', () => {
          q[chave] = entrada.value;
          mudou();
        });
        return el('div', { class: 'fx-campo' }, el('label', { for: entrada.id, text: rotulo }), entrada);
      };
      const tipo = el(
        'div',
        { class: 'fx-segmentos', role: 'group', 'aria-label': 'Tipo de pergunta' },
        TIPOS_PERGUNTA.map(([v, n]) =>
          el('button', {
            type: 'button',
            'aria-pressed': q.tipo === v ? 'true' : 'false',
            text: n,
            onclick: () => {
              q.tipo = v;
              if (v === 'multipla' && !q.alternativas.length) q.alternativas = ['', ''];
              desenharQuiz();
              desenharMarcasVisor();
              mudou();
            },
          }),
        ),
      );
      let corpo;
      if (q.tipo === 'regiao') {
        const estado = el('div', { class: 'fx-lado' });
        if (marcando === i) estado.append(el('span', { class: 'fx-aviso', text: 'Arraste na lâmina para desenhar a área. Use o zoom antes, se precisar.' }), el('button', { type: 'button', class: 'fx-botao pequeno discreto', text: 'Cancelar', onclick: pararMarcacao }));
        else if (q.regiao)
          estado.append(
            el('span', { class: 'fx-selo pronta', text: 'Área marcada' }),
            el('button', { type: 'button', class: 'fx-botao pequeno discreto', text: 'Ver na lâmina', onclick: () => visor?.irPara({ x: q.regiao.x + q.regiao.w / 2, y: q.regiao.y + q.regiao.h / 2, largura: Math.max(q.regiao.w, q.regiao.h) * 2.5 }) }),
            el('button', { type: 'button', class: 'fx-botao pequeno discreto', text: 'Marcar de novo', onclick: () => comecarMarcacao(i) }),
          );
        else estado.append(el('button', { type: 'button', class: 'fx-botao pequeno', text: 'Marcar a área na lâmina', onclick: () => comecarMarcacao(i) }));
        corpo = [
          el('div', { class: 'fx-campo' }, el('span', { class: 'fx-rotulo', text: 'Área da resposta' }), estado, el('small', { text: 'O aluno acerta se clicar dentro dessa área.' })),
          campo('Nome do que está na área', 'resposta', el('input', { id: `fx-q-${i}-resposta`, type: 'text', placeholder: 'Opcional: aparece depois que o aluno responde' })),
        ];
      } else {
        corpo = [
          el(
            'div',
            { class: 'fx-campo' },
            el('label', { for: `fx-q-${i}-resposta`, text: q.tipo === 'multipla' ? 'Resposta certa' : 'Resposta esperada' }),
            el('div', { class: 'fx-linha-item' }, el('span', { class: 'fx-marca certa', text: '✓' }), (() => {
              const e = el('input', { id: `fx-q-${i}-resposta`, type: 'text', placeholder: q.tipo === 'multipla' ? 'A alternativa certa' : 'O que o aluno deveria responder' });
              e.value = q.resposta;
              e.addEventListener('input', () => {
                q.resposta = e.value;
                mudou();
              });
              return e;
            })()),
          ),
          q.tipo === 'multipla'
            ? el(
                'div',
                { class: 'fx-campo' },
                el('span', { class: 'fx-rotulo', text: 'Alternativas erradas' }),
                listaTextos(q.alternativas, { idBase: `fx-q-${i}-alt`, marca: () => el('span', { class: 'fx-marca errada', text: '✕' }), placeholder: 'Um diagnóstico parecido, que confunde', rotuloAdicionar: '+ Outra alternativa' }),
                el('small', { text: 'O site embaralha a ordem. Escreva as alternativas no mesmo estilo da certa, sem ponto final, para não dar pista.' }),
              )
            : el('small', { text: 'O aluno escreve a resposta, compara com a sua e marca se acertou.' }),
        ];
      }
      const remover = el('div', { class: 'fx-confirmar' });
      if (aberto.quiz.length > 1)
        confirmar(remover, 'Remover pergunta', 'Remover esta pergunta?', () => {
          aberto.quiz.splice(i, 1);
          desenharQuiz();
          desenharMarcasVisor();
          mudou();
        });
      caixaQuiz.append(
        el(
          'div',
          { class: 'fx-pergunta' },
          el('div', { class: 'fx-pergunta-topo' }, el('strong', { text: `Pergunta ${i + 1}` }), tipo),
          campo('Pergunta', 'pergunta', el('textarea', { id: `fx-q-${i}-pergunta`, rows: 2, placeholder: q.tipo === 'regiao' ? 'Ex.: Clique numa célula gigante multinucleada' : 'Ex.: Qual o diagnóstico?' })),
          corpo,
          campo('Explicação', 'explicacao', el('textarea', { id: `fx-q-${i}-explicacao`, rows: 2, placeholder: 'Opcional: por que essa é a resposta (aparece depois que o aluno responde)' })),
          remover,
        ),
      );
    });
    if (aberto.quiz.length < 6)
      caixaQuiz.append(
        el('button', {
          type: 'button',
          class: 'fx-adicionar',
          text: '+ Nova pergunta',
          onclick: () => {
            aberto.quiz.push({ tipo: 'multipla', pergunta: '', resposta: '', alternativas: ['', ''], explicacao: '' });
            desenharQuiz();
            mudou();
          },
        }),
      );
  }

  // ---------- Tour ----------
  const caixaTour = el('div', { class: 'fx-linhas' });
  function desenharTour(focar) {
    caixaTour.textContent = '';
    if (!aberto.tour.length) caixaTour.append(el('p', { class: 'fx-sub', text: 'Nenhum ponto ainda. Enquadre na lâmina o que quer mostrar, no aumento certo, e use o botão abaixo.' }));
    aberto.tour.forEach((p, i) => {
      const texto = el('textarea', { id: `fx-tour-${i}`, rows: 2, placeholder: 'O que o aluno deve ver neste ponto' });
      texto.value = p.texto || '';
      texto.addEventListener('input', () => {
        p.texto = texto.value;
        mudou();
      });
      const mover = (d) => () => {
        const [item] = aberto.tour.splice(i, 1);
        aberto.tour.splice(i + d, 0, item);
        desenharTour();
        desenharMarcasVisor();
        mudou();
      };
      caixaTour.append(
        el(
          'div',
          { class: 'fx-passo' },
          el('button', { type: 'button', class: 'fx-marca tour', title: 'Ir até este ponto', text: String(i + 1), onclick: () => visor?.irPara(p) }),
          texto,
          el(
            'div',
            { class: 'fx-passo-acoes' },
            i > 0 ? el('button', { type: 'button', class: 'fx-icone', title: 'Subir', 'aria-label': 'Subir', text: '↑', onclick: mover(-1) }) : null,
            i < aberto.tour.length - 1 ? el('button', { type: 'button', class: 'fx-icone', title: 'Descer', 'aria-label': 'Descer', text: '↓', onclick: mover(1) }) : null,
            el('button', {
              type: 'button',
              class: 'fx-icone',
              title: 'Usar a vista atual neste ponto',
              'aria-label': 'Usar a vista atual neste ponto',
              text: '⌖',
              onclick: () => {
                if (!visor) return;
                Object.assign(p, visor.vistaAtual());
                desenharMarcasVisor();
                mudou();
              },
            }),
            el('button', {
              type: 'button',
              class: 'fx-icone',
              title: 'Remover ponto',
              'aria-label': 'Remover ponto',
              text: '×',
              onclick: () => {
                aberto.tour.splice(i, 1);
                desenharTour();
                desenharMarcasVisor();
                mudou();
              },
            }),
          ),
        ),
      );
      if (focar === i) texto.focus();
    });
    caixaTour.append(
      el('button', {
        type: 'button',
        class: 'fx-adicionar',
        text: '+ Adicionar a vista atual da lâmina',
        disabled: !visor,
        onclick: () => {
          if (!visor) return;
          visor.esconderMarcas(false);
          aberto.tour.push({ ...visor.vistaAtual(), texto: '' });
          desenharTour(aberto.tour.length - 1);
          desenharMarcasVisor();
          mudou();
        },
      }),
    );
  }

  // ---------- Lâmina ao lado ----------
  const caixaVisor = el('div', { class: 'fx-visor visor' });
  const faixaVisor = el('div', { class: 'visor-faixa', hidden: true });
  const areaVisor = el('div', { class: 'fx-visor-area' }, caixaVisor, faixaVisor);

  function desenharMarcasVisor() {
    if (!visor || !aberto) return;
    for (const m of marcasVisor) visor.remover(m);
    marcasVisor = [];
    aberto.quiz.forEach((q, i) => {
      if (q.tipo === 'regiao' && q.regiao && marcando !== i) marcasVisor.push(visor.retangulo(q.regiao, 'resposta', `P${i + 1}`));
    });
    aberto.tour.forEach((p, i) => marcasVisor.push(visor.marcador(String(i + 1), 'tour', p.x, p.y, () => visor.irPara(p))));
  }

  function comecarMarcacao(i) {
    visor?.esconderMarcas(false);
    marcando = i;
    caixaVisor.classList.add('respondendo');
    faixaVisor.textContent = '';
    faixaVisor.append(el('span', { text: `Pergunta ${i + 1}: arraste para desenhar a área da resposta.` }), el('button', { type: 'button', class: 'ferramenta', text: 'Cancelar', onclick: pararMarcacao }));
    faixaVisor.hidden = false;
    areaVisor.scrollIntoView({ block: 'nearest' });
    desenharQuiz();
    desenharMarcasVisor();
  }
  function pararMarcacao() {
    marcando = null;
    if (rascunhoArea) visor?.remover(rascunhoArea.el);
    rascunhoArea = null;
    caixaVisor.classList.remove('respondendo');
    faixaVisor.hidden = true;
    if (aberto) {
      desenharQuiz();
      desenharMarcasVisor();
    }
  }

  function montarVisor() {
    if (visor) visor.destruir();
    visor = null;
    visorDe = aberto.codigo;
    semLaminaDe = null;
    caixaVisor.textContent = '';
    const codigo = aberto.codigo;
    criarVisor(caixaVisor, codigo, { objetiva: numero(aberto.objetiva), umPorPixel: numero(aberto.umPorPixel) })
      .then(async (v) => {
        if (fechada || visorDe !== codigo) return v.destruir();
        visor = v;
        await v.pronto;
        desenharMarcasVisor();
        desenharTour();
        const area = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
        v.viewer.addHandler('canvas-press', (e) => {
          if (marcando == null) return;
          const p = v.pontoDoEvento(e.position);
          if (!p) return;
          rascunhoArea = { inicio: p, el: v.retangulo({ x: p.x, y: p.y, w: 1, h: 1 }, 'rascunho') };
        });
        v.viewer.addHandler('canvas-drag', (e) => {
          if (marcando == null) return;
          e.preventDefaultAction = true;
          if (!rascunhoArea) return;
          const p = v.viewer.viewport.viewerElementToImageCoordinates(e.position);
          v.mover(rascunhoArea.el, area(rascunhoArea.inicio, p));
        });
        v.viewer.addHandler('canvas-release', (e) => {
          if (marcando == null || !rascunhoArea) return;
          const p = v.viewer.viewport.viewerElementToImageCoordinates(e.position);
          const r = area(rascunhoArea.inicio, p);
          v.remover(rascunhoArea.el);
          rascunhoArea = null;
          if (r.w < 4 || r.h < 4) return; // um clique sem arrastar não vale como área
          const f = v.ficha;
          const x = Math.max(0, Math.round(r.x)),
            y = Math.max(0, Math.round(r.y));
          aberto.quiz[marcando].regiao = { x, y, w: Math.round(Math.min(f.largura, r.x + r.w) - x), h: Math.round(Math.min(f.altura, r.y + r.h) - y) };
          mudou();
          pararMarcacao();
        });
      })
      .catch(() => {
        if (fechada || visorDe !== codigo) return;
        semLaminaDe = codigo;
        desenharSemLamina();
        desenharTour();
      });
  }

  function desenharSemLamina() {
    const codigo = aberto?.codigo;
    if (!codigo || visor || semLaminaDe !== codigo) return;
    caixaVisor.textContent = '';
    const envio = envios.find((e) => e.codigo === codigo && !e.convertida);
    const painel = el('div', { class: 'fx-sem-lamina' }, el('strong', { text: 'Lâmina ainda não convertida' }));
    if (enviando?.codigo === codigo) {
      painel.append(el('p', { text: `Enviando parte ${enviando.feitas + 1} de ${enviando.total}…` }), el('div', { class: 'fx-barra' }, el('div', { style: `width:${Math.round((enviando.feitas / enviando.total) * 100)}%` })));
    } else if (envio) {
      painel.append(el('p', { text: `${envio.arquivo} enviado em ${new Date(envio.enviadaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Avise o Claude na conversa para ele converter. Enquanto isso, dá para preencher a ficha.` }));
    } else if (banco.assets) {
      const entrada = el('input', { type: 'file', accept: '.html,.htm,text/html', hidden: true, id: 'fx-arquivo' });
      const zona = el('label', { class: 'fx-envio', for: 'fx-arquivo' }, el('strong', { text: 'Arraste aqui o .html do Microview' }), el('span', { text: 'ou toque para escolher o arquivo. Pode ser grande: ele vai em partes.' }), entrada);
      const receber = (arquivo) => {
        if (!arquivo) return;
        if (!/\.html?$/i.test(arquivo.name)) return avisar('Envie o arquivo .html da lâmina, sem compactar.');
        enviando = { codigo, feitas: 0, total: 1 };
        desenharSemLamina();
        enviarLamina(banco, arquivo, codigo, (feitas, total) => {
          enviando = { codigo, feitas, total };
          desenharSemLamina();
        })
          .then(() => avisar('Lâmina enviada. Avise o Claude para converter.'))
          .catch((e) => avisar(e?.code === 'quota_or_state' ? 'Sem espaço para o envio. Apague envios antigos e tente de novo.' : e?.message && !e.code ? e.message : 'O envio falhou. Confira a conexão e tente de novo.'))
          .finally(() => {
            enviando = null;
            desenharSemLamina();
          });
      };
      entrada.addEventListener('change', () => receber(entrada.files[0]));
      zona.addEventListener('dragover', (e) => {
        e.preventDefault();
        zona.classList.add('sobre');
      });
      zona.addEventListener('dragleave', () => zona.classList.remove('sobre'));
      zona.addEventListener('drop', (e) => {
        e.preventDefault();
        zona.classList.remove('sobre');
        receber(e.dataTransfer.files[0]);
      });
      painel.append(el('p', { text: 'Envie o arquivo do Microview por aqui e avise o Claude. Dá para preencher a ficha enquanto isso.' }), zona);
    } else {
      painel.append(el('p', { text: 'Para enviar a lâmina, abra esta página com a conta dona dela.' }));
    }
    caixaVisor.append(painel);
  }
  // Mudou a objetiva ou a calibração: refaz o visualizador para atualizar aumentos e escala.
  function refazerVisorDepois() {
    clearTimeout(timerVisor);
    timerVisor = setTimeout(() => {
      if (aberto) montarVisor();
    }, 900);
  }

  // ---------- Ficha ----------
  function atualizarFalta() {
    const caixa = raiz.querySelector('#fx-falta');
    if (!caixa || !aberto) return;
    const falta = oQueFalta(aberto);
    caixa.textContent = '';
    caixa.classList.toggle('ok', !falta.length);
    if (!falta.length) caixa.append(aberto.situacao === 'pronta' ? 'Ficha completa e publicada no site.' : 'Ficha completa. Quando estiver revisada, marque como "Publicada" para o caso aparecer no site.');
    else caixa.append(el('strong', { text: 'Falta preencher: ' }), falta.join(', ') + '.', aberto.situacao === 'pronta' ? ' O caso já aparece no site assim mesmo.' : '');
  }

  function desenharCabeca() {
    const cab = raiz.querySelector('#fx-cabeca');
    if (!cab) return;
    cab.textContent = '';
    cab.append(
      el(
        'div',
        { class: 'fx-cabeca-texto' },
        el('span', { class: 'fx-codigo', text: aberto.codigo }),
        el('h2', { text: aberto.diagnostico.trim() || 'Caso sem diagnóstico ainda' }),
        el(
          'div',
          { class: 'fx-linha-status' },
          el('span', { class: 'fx-selo ' + aberto.situacao, text: nomeSituacao(aberto.situacao) }),
          aberto.arquivo ? el('span', { text: 'Arquivo: ' + aberto.arquivo }) : null,
          el('a', { href: '#' + aberto.codigo, text: aberto.situacao === 'pronta' ? 'Ver no site' : 'Ver como o aluno vai ver' }),
          el('span', { id: 'fx-salvo', text: estadoSalvo }),
        ),
      ),
    );
  }

  function desenharFicha() {
    ficha.textContent = '';
    if (!aberto) {
      if (visor) visor.destruir();
      visor = visorDe = null;
      ficha.append(el('div', { class: 'fx-vazio' }, el('h2', { text: 'Escolha um caso' }), el('p', { text: 'Ou crie um novo. Tudo o que você escreve é salvo sozinho.' })));
      return;
    }
    const campoDiag = campoTexto('Diagnóstico', 'diagnostico', { placeholder: 'Ex.: Carcinoma de células escamosas bem diferenciado', aoMudar: desenharCabeca });
    const bloco = (titulo, dica, ...conteudo) => el('section', { class: 'fx-bloco' }, el('header', {}, el('h3', { text: titulo }), dica ? el('p', { text: dica }) : null), ...conteudo);

    desenharQuiz();
    ficha.append(
      el(
        'div',
        { class: 'fx-miolo' },
        el(
          'div',
          { class: 'fx-formulario' },
          el('button', { type: 'button', class: 'fx-botao pequeno discreto fx-voltar', text: '← Casos', onclick: fechar }),
          el('div', { class: 'fx-cabeca', id: 'fx-cabeca' }),
          el('div', { class: 'fx-falta', id: 'fx-falta', role: 'status' }),
          bloco(
            'O animal',
            'O que o aluno lê antes de examinar a lâmina. Não coloque nome do animal, do tutor nem da clínica.',
            campoTexto('Espécie', 'especie', { sugestoes: ESPECIES, placeholder: 'Escolha acima ou escreva' }),
            el('div', { class: 'fx-grade3' }, campoTexto('Raça', 'raca', { placeholder: 'Ex.: SRD' }), campoTexto('Idade', 'idade', { placeholder: 'Ex.: 9 anos' }), campoTexto('Sexo', 'sexo', { placeholder: 'Ex.: Fêmea castrada' })),
            campoTexto('Histórico clínico', 'historico', { linhas: 3, placeholder: 'Ex.: Nódulo cutâneo em membro torácico, de crescimento rápido, ulcerado. Excisão cirúrgica.' }),
          ),
          bloco(
            'A lâmina',
            null,
            campoTexto('Órgão ou tecido', 'orgao', { sugestoes: ORGAOS, placeholder: 'Escolha acima ou escreva' }),
            campoTexto('Coloração', 'coloracao', { sugestoes: COLORACOES }),
            el(
              'div',
              { class: 'fx-grade2' },
              campoTexto('Objetiva usada no escaneamento', 'objetiva', { sugestoes: OBJETIVAS, placeholder: 'Ex.: 10', dica: 'Liga os botões de aumento (2×, 4×, 10×…) para o aluno.', aoMudar: refazerVisorDepois }),
              campoTexto('Calibração (µm por pixel)', 'umPorPixel', { placeholder: 'Ex.: 0,65', dica: 'Medida com lâmina micrométrica. Liga a barra de escala; pode ficar em branco.', aoMudar: refazerVisorDepois }),
            ),
            campoTexto('Arquivo do Microview', 'arquivo', { placeholder: 'Ex.: P3834-26 panorama', dica: 'Só para vocês saberem qual arquivo é. Não aparece no site.' }),
          ),
          bloco(
            'Diagnóstico',
            'Fica escondido do aluno até ele terminar o quiz.',
            campoDiag,
            campoTexto('Categoria', 'categoria', { sugestoes: CATEGORIAS, placeholder: 'Escolha acima ou escreva' }),
            el('div', { class: 'fx-campo' }, el('span', { class: 'fx-rotulo', text: 'Diagnósticos diferenciais' }), listaTextos(aberto.diferenciais, { idBase: 'fx-dif', placeholder: 'Ex.: Tricoepitelioma', rotuloAdicionar: '+ Diferencial' })),
            segmentos(
              'Dificuldade',
              DIFICULDADES.map((d) => [d, d]),
              () => aberto.dificuldade,
              (v) => (aberto.dificuldade = v),
            ),
          ),
          bloco(
            'O que procurar na lâmina',
            'Os achados que o aluno deve encontrar. Um por linha; Enter cria a próxima.',
            listaTextos(aberto.achados, { idBase: 'fx-achado', marca: (i) => el('span', { class: 'fx-marca', text: String(i + 1) }), placeholder: (i) => (i === 0 ? 'Ex.: Ninhos de queratinócitos atípicos invadindo a derme' : 'Outro achado'), rotuloAdicionar: '+ Achado' }),
          ),
          bloco('Quiz', 'De 1 a 6 perguntas. Em "Clicar na lesão", você desenha na lâmina a área onde o aluno deve clicar.', caixaQuiz),
          bloco('Tour guiado', 'Os pontos que você mostraria ao lado do microscópio, em ordem. Cada ponto guarda a posição e o aumento da vista. O aluno vê depois do quiz.', caixaTour),
          bloco('Comentário do patologista', 'Aparece no fim, junto com o diagnóstico.', campoTexto('Comentário', 'comentario', { linhas: 5, placeholder: 'Ex.: Repare na transição abrupta entre epitélio normal e neoplásico…' })),
          bloco(
            'Revisão',
            null,
            el(
              'div',
              { class: 'fx-grade2' },
              campoTexto('Revisado por', 'revisadoPor', { placeholder: 'Nome de quem revisou' }),
              segmentos(
                'Situação',
                SITUACOES,
                () => aberto.situacao,
                (v) => {
                  aberto.situacao = v;
                  desenharCabeca();
                },
              ),
            ),
            confirmar(el('div', { class: 'fx-confirmar' }), 'Excluir caso', `Excluir ${aberto.codigo} e tudo o que foi escrito nele?`, excluirCaso),
          ),
        ),
        areaVisor,
      ),
    );
    desenharCabeca();
    atualizarFalta();
    if (visorDe !== aberto.codigo) montarVisor();
    else {
      desenharMarcasVisor();
      desenharTour();
    }
  }

  async function excluirCaso() {
    const codigo = aberto.codigo;
    clearTimeout(timerSalvar);
    timerSalvar = null;
    try {
      await salvando;
      await banco.db.collection('casos').doc(codigo).delete();
      banco.fichas.delete(codigo);
      aberto = null;
      raiz.classList.remove('aberta');
      desenharLista();
      desenharFicha();
    } catch {
      marcarStatus('Não foi possível excluir agora. Tente de novo.');
    }
  }

  function abrir(codigo) {
    if (aberto && timerSalvar) salvarAgora();
    if (marcando != null) pararMarcacao();
    const c = banco.fichas.get(codigo);
    if (!c) return;
    aberto = completarFicha(c);
    estadoSalvo = c.atualizadoEm ? 'Salvo em ' + new Date(c.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    raiz.classList.add('aberta');
    desenharLista();
    desenharFicha();
    ficha.scrollTop = 0;
  }
  function fechar() {
    if (timerSalvar) salvarAgora();
    raiz.classList.remove('aberta');
  }

  function novoCaso() {
    let maior = 0;
    for (const k of banco.fichas.keys()) maior = Math.max(maior, Number((k.match(/(\d+)$/) || [])[1] || 0));
    const codigo = 'CASO-' + String(maior + 1).padStart(3, '0');
    banco.fichas.set(codigo, { ...casoVazio(codigo), atualizadoEm: new Date().toISOString() });
    abrir(codigo);
    salvarAgora();
  }

  // Mudança feita por outra pessoa: só redesenha a ficha aberta se ninguém está digitando aqui agora.
  const cancelar = banco.ouvir(() => {
    desenharLista();
    if (!aberto) return;
    const remoto = banco.fichas.get(aberto.codigo);
    if (!remoto) {
      if (!timerSalvar) {
        aberto = null;
        desenharFicha();
      }
      return;
    }
    const editandoAqui = timerSalvar || marcando != null || Date.now() - ultimaEdicao < 4000;
    if (!editandoAqui && semData(completarFicha(remoto)) !== semData(aberto)) {
      aberto = completarFicha(remoto);
      estadoSalvo = 'Atualizado por outra pessoa às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      desenharFicha();
    }
  });

  const cancelarEnvios = banco.db.collection('envios').onSnapshot(
    (snap) => {
      envios = snap.docs.map((d) => d.data());
      desenharSemLamina();
    },
    () => {},
  );

  desenharLista();
  if (codigoInicial && banco.fichas.has(codigoInicial)) abrir(codigoInicial);
  else desenharFicha();
  window.addEventListener('beforeunload', salvarSePendente);
  function salvarSePendente() {
    if (timerSalvar) salvarAgora();
  }

  return () => {
    fechada = true;
    salvarSePendente();
    cancelar();
    cancelarEnvios();
    window.removeEventListener('beforeunload', salvarSePendente);
    if (visor) visor.destruir();
  };
}
