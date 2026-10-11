'use strict';
// Utilidades usadas pelo site do aluno e pela área do patologista.

const PASTA_LAMINAS = 'laminas/';

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

// Cria um elemento. Texto sempre via textContent, nunca como HTML, para não interpretar o que vem das fichas.
function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'value') e.value = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) e.append(f instanceof Node ? f : document.createTextNode(f));
  return e;
}

function avisar(texto) {
  const aviso = el('div', { class: 'aviso-flutuante', role: 'status', text: texto });
  document.body.append(aviso);
  setTimeout(() => aviso.remove(), 4000);
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

const numero = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const texto = (v) => String(v ?? '').trim();
const lista = (v) => (Array.isArray(v) ? v.map(texto).filter(Boolean) : []);

// Converte a ficha do patologista no caso que o aluno vê: tira campos internos e itens em branco.
// Mesma regra de ferramentas/casos_do_app.py.
function fichaParaCaso(f) {
  const quiz = [];
  for (const q of f.quiz || []) {
    const pergunta = texto(q.pergunta);
    if (!pergunta) continue;
    const tipo = q.tipo === 'aberta' || q.tipo === 'regiao' ? q.tipo : 'multipla';
    const item = { tipo, pergunta, resposta: texto(q.resposta), alternativas: [], explicacao: texto(q.explicacao) };
    if (tipo === 'regiao') {
      const r = q.regiao;
      if (!r || !(r.w > 0) || !(r.h > 0)) continue;
      item.regiao = { x: r.x, y: r.y, w: r.w, h: r.h };
    } else {
      if (!item.resposta) continue;
      if (tipo === 'multipla') item.alternativas = lista(q.alternativas);
      if (tipo === 'multipla' && !item.alternativas.length) item.tipo = 'aberta';
    }
    quiz.push(item);
  }
  const tour = (f.tour || [])
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && (p.zoom > 0 || p.largura > 0))
    .map((p) => ({ x: p.x, y: p.y, zoom: p.zoom || 0, largura: p.largura || 0, texto: texto(p.texto) }));
  return {
    codigo: f.codigo,
    especie: texto(f.especie),
    raca: texto(f.raca),
    idade: texto(f.idade),
    sexo: texto(f.sexo),
    historico: texto(f.historico),
    orgao: texto(f.orgao),
    categoria: texto(f.categoria),
    coloracao: texto(f.coloracao),
    dificuldade: texto(f.dificuldade),
    diagnostico: texto(f.diagnostico),
    diferenciais: lista(f.diferenciais),
    achados: lista(f.achados),
    comentario: texto(f.comentario),
    objetiva: numero(f.objetiva),
    umPorPixel: numero(f.umPorPixel),
    quiz,
    tour,
  };
}

// Casos antigos do catálogo em arquivo não têm "tipo" nas perguntas.
function normalizarCaso(c) {
  return {
    diferenciais: [],
    achados: [],
    tour: [],
    ...c,
    quiz: (c.quiz || []).map((q) => ({
      explicacao: '',
      alternativas: [],
      ...q,
      tipo: q.tipo || (q.alternativas?.length ? 'multipla' : 'aberta'),
    })),
  };
}
