'use strict';
// Visualizador da lâmina, usado na página do aluno e na área do patologista. Cuida do OpenSeadragon, dos
// botões de aumento, da barra de escala, de brilho e contraste, da tela cheia e do link para a vista atual.
// Coordenadas trocadas com quem usa o visualizador são sempre em pixels da imagem em resolução total.

const AUMENTOS = [2, 4, 10, 20, 40];

async function criarVisor(caixa, codigo, opcoes = {}) {
  const pasta = PASTA_LAMINAS + codigo + '/';
  const resposta = await fetch(pasta + codigo + '.json');
  if (!resposta.ok) throw new Error('lamina-ausente');
  const ficha = await resposta.json();
  // A ficha do patologista vale mais que o arquivo convertido: lá a objetiva e a calibração podem ser corrigidas.
  const objetiva = opcoes.objetiva || numero(ficha.objetiva);
  const umPorPixel = opcoes.umPorPixel || numero(ficha.umPorPixel);

  const viewer = OpenSeadragon({
    element: caixa,
    tileSources: pasta + ficha.dzi,
    showNavigationControl: false,
    showNavigator: true,
    navigatorPosition: 'BOTTOM_RIGHT',
    maxZoomPixelRatio: 2,
    visibilityRatio: 0.5,
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
    gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true },
  });
  const pronto = new Promise((ok) => viewer.addOnceHandler('open', ok));

  const ponto = (x, y) => viewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(x, y));
  const zoomImagem = () => viewer.viewport.viewportToImageZoom(viewer.viewport.getZoom(true));

  // ----- Aumento e escala -----
  const indicador = el('span', { class: 'visor-aumento' });
  const regua = el('div', { class: 'visor-regua' });
  const textoEscala = el('span');
  const rodape = el('div', { class: 'visor-rodape' }, umPorPixel ? el('div', { class: 'visor-escala' }, regua, textoEscala) : null, objetiva ? indicador : null);
  const botoesAumento = [];

  function atualizar() {
    const z = zoomImagem();
    if (objetiva) {
      const atual = objetiva * z;
      indicador.textContent = '≈ ' + String(atual >= 10 ? Math.round(atual) : Math.round(atual * 10) / 10).replace('.', ',') + '×';
      for (const b of botoesAumento) b.setAttribute('aria-pressed', Math.abs(Number(b.dataset.aumento) / atual - 1) < 0.06 ? 'true' : 'false');
    }
    if (umPorPixel) {
      const umPorPonto = umPorPixel / z;
      let L = 1;
      for (const v of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000]) if (v / umPorPonto <= 140) L = v;
      regua.style.width = Math.max(16, L / umPorPonto) + 'px';
      textoEscala.textContent = L >= 1000 ? String(L / 1000).replace('.', ',') + ' mm' : L + ' µm';
    }
  }

  // ----- Ferramentas -----
  const ferramentas = el('div', { class: 'visor-ferramentas' });
  const botao = (rotulo, titulo, acao, extra = {}) => el('button', { type: 'button', class: 'visor-botao', title: titulo, 'aria-label': titulo, text: rotulo, onclick: acao, ...extra });
  ferramentas.append(botao('Inteira', 'Ver a lâmina inteira', () => viewer.viewport.goHome()));

  // Aumentos como na objetiva do microscópio: 100% da imagem corresponde à objetiva usada no escaneamento.
  if (objetiva) {
    for (const a of AUMENTOS) {
      if (a > objetiva * 2) continue;
      const b = botao(a + '×', `Aumento de ${a}×`, () => viewer.viewport.zoomTo(viewer.viewport.imageToViewportZoom(a / objetiva)), { 'data-aumento': a, 'aria-pressed': 'false' });
      botoesAumento.push(b);
      ferramentas.append(b);
    }
  }

  const filtro = { brilho: 100, contraste: 100 };
  function aplicarFiltro() {
    const tela = viewer.drawer?.canvas;
    if (tela) tela.style.filter = filtro.brilho === 100 && filtro.contraste === 100 ? '' : `brightness(${filtro.brilho}%) contrast(${filtro.contraste}%)`;
  }
  const deslizante = (nome, rotulo) => {
    const id = `${codigo}-${nome}-${Math.random().toString(36).slice(2, 7)}`;
    const entrada = el('input', { id, type: 'range', min: '50', max: '160', step: '5', value: String(filtro[nome]) });
    entrada.addEventListener('input', () => {
      filtro[nome] = Number(entrada.value);
      aplicarFiltro();
    });
    return el('label', { for: id }, rotulo, entrada);
  };
  const ajustes = el(
    'div',
    { class: 'visor-ajustes', hidden: true },
    deslizante('brilho', 'Brilho'),
    deslizante('contraste', 'Contraste'),
    el('button', {
      type: 'button',
      class: 'visor-botao',
      text: 'Voltar ao normal',
      onclick: () => {
        filtro.brilho = filtro.contraste = 100;
        for (const i of ajustes.querySelectorAll('input')) i.value = '100';
        aplicarFiltro();
      },
    }),
  );
  ferramentas.append(botao('Brilho', 'Brilho e contraste', () => (ajustes.hidden = !ajustes.hidden)));

  const alvoTelaCheia = opcoes.elementoTelaCheia || caixa;
  if (document.fullscreenEnabled && alvoTelaCheia.requestFullscreen) {
    ferramentas.append(
      botao('Tela cheia', 'Tela cheia', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else alvoTelaCheia.requestFullscreen().catch(() => avisar('A tela cheia não está disponível aqui.'));
      }),
    );
  }
  if (opcoes.enderecoBase !== undefined) {
    ferramentas.append(
      botao('Link', 'Copiar o link desta vista', () => {
        const v = api.vistaAtual();
        const link = `${opcoes.enderecoBase}#${codigo}~${v.x}~${v.y}~z${v.zoom}`;
        const mostrar = () => avisar('Link desta vista: ' + link);
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(() => avisar('Link desta vista copiado.'), mostrar);
        else mostrar();
      }),
    );
  }
  caixa.append(ferramentas, ajustes, rodape);
  viewer.addHandler('animation', atualizar);
  viewer.addHandler('open', () => {
    atualizar();
    aplicarFiltro();
    if (opcoes.vista) api.irPara(opcoes.vista, true);
  });

  // Fotos de maior aumento que o Microview prende a pontos da lâmina.
  const detalhe = el('dialog', { class: 'visor-detalhe' }, el('img', { alt: 'Foto de maior aumento' }), el('p', {}), el('form', { method: 'dialog' }, el('button', { class: 'visor-botao', text: 'Fechar' })));
  caixa.append(detalhe);
  pronto.then(() => {
    for (const p of ficha.pinos || [])
      api.marcador(p.rotulo || '•', 'pino', p.x, p.y, () => {
        const img = detalhe.querySelector('img');
        img.hidden = !p.imagem;
        if (p.imagem) img.src = pasta + p.imagem;
        detalhe.querySelector('p').textContent = p.texto || '';
        detalhe.showModal();
      }).title = p.texto || 'Foto de maior aumento';
  });

  const api = {
    viewer,
    ficha,
    pronto,
    objetiva,
    // Ponto da imagem sob uma posição do evento do OpenSeadragon, ou null fora da lâmina.
    pontoDoEvento(posicao) {
      const p = viewer.viewport.viewerElementToImageCoordinates(posicao);
      if (p.x < 0 || p.y < 0 || p.x > ficha.largura || p.y > ficha.altura) return null;
      return { x: Math.round(p.x), y: Math.round(p.y) };
    },
    // A vista guarda o centro e o aumento (zoom = pixels da tela por pixel da imagem), e não a largura: assim
    // quem abre num monitor maior ou num celular vê o ponto no mesmo aumento, só com campo maior ou menor.
    vistaAtual() {
      const r = viewer.viewport.viewportToImageRectangle(viewer.viewport.getBounds(true));
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), largura: Math.round(r.width), zoom: Math.round(zoomImagem() * 10000) / 10000 };
    },
    irPara(v, imediato = false) {
      if (v.zoom > 0) {
        viewer.viewport.zoomTo(viewer.viewport.imageToViewportZoom(v.zoom), null, imediato);
        viewer.viewport.panTo(ponto(v.x, v.y), imediato);
        return;
      }
      const altura = v.largura * (caixa.clientHeight / Math.max(1, caixa.clientWidth));
      viewer.viewport.fitBounds(viewer.viewport.imageToViewportRectangle(v.x - v.largura / 2, v.y - altura / 2, v.largura, altura), imediato);
    },
    marcador(rotulo, classe, x, y, aoClicar) {
      const m = el('div', { class: 'marcador' + (classe ? ' ' + classe : ''), text: rotulo });
      if (aoClicar) new OpenSeadragon.MouseTracker({ element: m, clickHandler: aoClicar });
      viewer.addOverlay({ element: m, location: ponto(x, y), placement: OpenSeadragon.Placement.CENTER });
      return m;
    },
    retangulo(r, classe, rotulo) {
      const e = el('div', { class: 'area-marcada' + (classe ? ' ' + classe : '') }, rotulo ? el('span', { text: rotulo }) : null);
      viewer.addOverlay({ element: e, location: viewer.viewport.imageToViewportRectangle(r.x, r.y, r.w, r.h) });
      return e;
    },
    mover(e, r) {
      viewer.updateOverlay(e, viewer.viewport.imageToViewportRectangle(r.x, r.y, r.w, r.h));
    },
    remover(e) {
      if (e) viewer.removeOverlay(e);
    },
    destruir() {
      viewer.destroy();
    },
  };
  return api;
}
