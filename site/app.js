'use strict';
// Banco de Lâminas: uma página só, com as telas escolhidas pelo endereço:
//   #inicio · #planos · #laminas (catálogo) · #<código> (lâmina) · #<código>~x~y~z<aumento> (lâmina numa vista)
//   #fichas · #fichas~<código> (área do patologista)
// Quando a página roda no Claude com banco de dados, os casos vêm das fichas (casos/<código>) e uma ficha
// marcada como "Publicada" aparece na hora. Fora dele, vêm de dados/casos.json, gerado das fichas por
// ferramentas/casos_do_app.py. As lâminas ficam em laminas/<código>/ (ferramentas/converter_lamina.py).

const app = document.getElementById('app');
// Endereço público da página, para o link de uma vista. Vazio = o endereço atual do navegador.
const ENDERECO_PUBLICO = document.documentElement.dataset.endereco || '';
const TELAS_FIXAS = ['inicio', 'laminas', 'planos', 'fichas'];

const banco = {
  db: null,
  assets: null,
  fichas: new Map(),
  ouvintes: new Set(),
  ouvir(fn) {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  },
};
let casos = [];
let desmontar = null;
let rotaMostrada = '';

function lerRota() {
  const bruto = decodeURIComponent(location.hash.slice(1));
  const [nome, ...resto] = bruto.split('~');
  if (nome === 'fichas') return { tela: 'fichas', codigo: resto[0] || '' };
  if (TELAS_FIXAS.includes(nome)) return { tela: nome };
  // A ficha ainda não publicada também abre, para o patologista conferir como o aluno vai ver.
  const ficha = banco.fichas.get(nome);
  const caso = casos.find((c) => c.codigo === nome) || (ficha ? fichaParaCaso(ficha) : null);
  if (caso) {
    // Vista no link: x~y~z<aumento da imagem>, ou x~y~<largura> nos links antigos.
    const [x, y] = resto.map(Number);
    const terceiro = resto[2] || '';
    const zoom = terceiro.startsWith('z') ? Number(terceiro.slice(1)) : 0;
    const largura = zoom ? 0 : Number(terceiro);
    const valida = Number.isFinite(x) && Number.isFinite(y) && (zoom > 0 || largura > 0);
    return { tela: 'lamina', caso, vista: valida ? { x, y, zoom, largura } : null };
  }
  return { tela: 'inicio' };
}

function mostrar() {
  if (desmontar) desmontar();
  desmontar = null;
  document.body.classList.remove('modo-lamina', 'modo-fichas');
  app.textContent = '';
  const rota = lerRota();
  rotaMostrada = rota.tela;
  for (const a of document.querySelectorAll('.menu a')) {
    const atual = a.dataset.rota === rota.tela || (a.dataset.rota === 'laminas' && rota.tela === 'lamina') || (a.dataset.rota === 'inicio' && rota.tela === 'planos');
    if (atual) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (rota.tela === 'laminas') telaCatalogo(app, casos);
  else if (rota.tela === 'lamina') desmontar = telaLamina(app, rota.caso, { vista: rota.vista, enderecoBase: ENDERECO_PUBLICO || location.href.split('#')[0] });
  else if (rota.tela === 'fichas') {
    if (!banco.db) {
      app.append(el('div', { class: 'conteudo vazio' }, el('h1', { text: 'Área do patologista' }), el('p', { text: 'As fichas só abrem com a página aberta no Claude, logado na conta que tem acesso a elas.' })));
      return;
    }
    desmontar = telaFichas(app, banco, rota.codigo);
  } else telaInicio(app, casos, rota.tela === 'planos');
}

function casosDasFichas() {
  return [...banco.fichas.values()]
    .filter((f) => f.situacao === 'pronta')
    .map(fichaParaCaso)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
}

async function carregarDoArquivo() {
  const r = await fetch('dados/casos.json');
  if (!r.ok) throw new Error('catalogo');
  return (await r.json()).map(normalizarCaso);
}

async function iniciar() {
  // Fora do Claude não existe window.claude; dentro dele, use() devolve null quando o banco não está disponível.
  if (window.claude?.use) [banco.db, banco.assets] = await Promise.all(['db', 'assets'].map((n) => window.claude.use(n).catch(() => null)));
  if (!banco.db) {
    document.querySelector('.menu a[data-rota="fichas"]')?.remove();
    try {
      casos = await carregarDoArquivo();
    } catch {
      app.append(el('p', { class: 'conteudo vazio', text: 'Não foi possível carregar o catálogo de lâminas. Recarregue a página para tentar de novo.' }));
      return;
    }
    mostrar();
    return;
  }
  let primeira = true;
  banco.db.collection('casos').onSnapshot(
    (snap) => {
      banco.fichas = new Map(snap.docs.map((d) => [d.id, d.data()]));
      casos = casosDasFichas();
      for (const fn of banco.ouvintes) fn();
      // Catálogo e início refletem as fichas na hora; a lâmina aberta e as fichas cuidam de si mesmas.
      if (primeira || rotaMostrada === 'laminas' || rotaMostrada === 'inicio') mostrar();
      primeira = false;
    },
    () => avisar('As fichas pararam de atualizar. Recarregue a página.'),
  );
}

document.getElementById('entrar').addEventListener('click', () => avisar('O cadastro e o login entram na próxima etapa, junto com a assinatura.'));
window.addEventListener('hashchange', mostrar);
iniciar();
