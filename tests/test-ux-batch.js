// Harness UX batch: rampa, rewind, párrafos, chunks, tap zones (salto por
// oración), seek, temas, splitRatio persistente, buscador. 53 checks.
//
// Requiere playwright-core con Chrome instalado (channel: 'chrome').
//   Local:      node tests/test-ux-batch.js
//   Producción: TARGET_URL=https://rsvp.yr.com.uy/ node tests/test-ux-batch.js
// Si playwright-core no está en el proyecto: NODE_PATH=~/node_modules node ...
const { chromium } = require('playwright-core');
const path = require('path');

const FILE_URL = process.env.TARGET_URL ||
  'file://' + path.resolve(__dirname, '..', 'static', 'index.html');
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, detail); }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  PAGEERROR:', e.message));
  await page.goto(FILE_URL);
  await page.waitForTimeout(300);

  // --- unidades puras ---
  const units = await page.evaluate(() => {
    const t = tokenizeWithParas('Hola mundo.\nSegundo parrafo aqui.\n\nTercero.');
    const c1 = chunkWord('dificultosamente,');
    const c2 = chunkWord('casa');
    const c3 = chunkWord('supercalifragilisticoespialidoso');
    return {
      words: t.words, paraEnds: [...t.paraEnds],
      c1, c2, c3,
    };
  });
  check('tokenize: 6 palabras', units.words.length === 6, JSON.stringify(units.words));
  check('tokenize: paraEnds en 1,4,5', JSON.stringify(units.paraEnds) === '[1,4,5]', JSON.stringify(units.paraEnds));
  check('chunk: palabra 17 chars → 2 segmentos', units.c1.length === 2, JSON.stringify(units.c1));
  check('chunk: marcador · en cortes', units.c1[0].endsWith('·') && units.c1[1].startsWith('·'), JSON.stringify(units.c1));
  check('chunk: palabra corta intacta', units.c2.length === 1 && units.c2[0] === 'casa');
  check('chunk: 32 chars → 3 segmentos', units.c3.length === 3, JSON.stringify(units.c3));
  check('chunk: reconstruye la palabra', units.c1.map(s => s.replace(/·/g, '')).join('') === 'dificultosamente,');

  // --- español: sílabas, ORP con puntuación, números/siglas ---
  const es = await page.evaluate(() => ({
    d: chunkWord('dificultosamente,'),
    e: chunkWord('extraordinariamente'),
    a: chunkWord('arrepentimiento'),
    orp1: orpIndex('¡Dorotea!'),
    orp2: orpIndex('—¿Viernes?'),
    num: wordDelay('1984', 100) / wordDelay('casa', 100),
    sig: wordDelay('UNESCO', 100) / wordDelay('unesco', 100),
  }));
  check('silábico: dificultosa·/·mente,', JSON.stringify(es.d) === '["dificultosa·","·mente,"]', JSON.stringify(es.d));
  check('silábico: extraordina·/·riamente', JSON.stringify(es.e) === '["extraordina·","·riamente"]', JSON.stringify(es.e));
  check('silábico: no parte la rr', JSON.stringify(es.a) === '["arrepenti·","·miento"]', JSON.stringify(es.a));
  check('ORP salta ¡ inicial (¡Dorotea! pivota en o)', es.orp1 === 4, 'idx=' + es.orp1);
  check('ORP salta —¿ inicial', es.orp2 === 5, 'idx=' + es.orp2);
  check('números ×1.3', Math.abs(es.num - 1.3) < 0.01, es.num);
  check('siglas ×1.2', Math.abs(es.sig - 1.2) < 0.01, es.sig);

  // --- abrir el demo y leer ---
  await page.click('#btn-demo');
  await page.waitForSelector('#view-reader.active');
  await page.waitForTimeout(700); // auto-play arranca a los 400ms

  const playing1 = await page.evaluate(() => ({ playing: app.playing, ramp: app.ramp, paraEnds: app.paraEnds && app.paraEnds.size }));
  check('auto-play activo', playing1.playing);
  check('paraEnds cargados del cuento', playing1.paraEnds > 5, 'size=' + playing1.paraEnds);

  // rampa: recién arrancado, ramp debe estar decreciendo desde 10
  check('rampa activa al arrancar', playing1.ramp > 0 && playing1.ramp <= 10, 'ramp=' + playing1.ramp);

  // --- pausa + resume con rewind ---
  await page.evaluate(() => { stop(); });
  const idxPaused = await page.evaluate(() => app.index);
  await page.evaluate(() => togglePlay());
  await page.waitForTimeout(50);
  const afterResume = await page.evaluate(() => ({ idx: app.index, playing: app.playing, ramp: app.ramp }));
  check('resume rebobina ~4 palabras', afterResume.idx <= Math.max(0, idxPaused - 3) && afterResume.idx >= idxPaused - 5,
    `paused@${idxPaused} resumed@${afterResume.idx}`);
  check('resume reproduce con rampa', afterResume.playing && afterResume.ramp > 0);

  // --- tap zones ---
  await page.evaluate(() => stop());
  const idx0 = await page.evaluate(() => { app.index = 50; app.sub = 0; displayCurrentWord(); return app.index; });
  const box = await page.locator('#split-rsvp').boundingBox();
  // derecha: inicio de la oración siguiente (v0.14.0 navega por oración)
  const expNext = await page.evaluate(() => {
    const si = _sentOf[app.index];
    return (si < _sentRanges.length - 1) ? _sentRanges[si + 1][0] : _sentRanges[si][0];
  });
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  let idx = await page.evaluate(() => app.index);
  check('tap derecha = oración siguiente', idx === expNext, `50→${idx} (esperado ${expNext})`);
  const keepPlaying = await page.evaluate(() => app.playing);
  check('tap derecha en pausa queda en pausa', keepPlaying === false);
  // izquierda: inicio de la oración actual (o la anterior si ya está al inicio)
  const expPrev = await page.evaluate(() => {
    const si = _sentOf[app.index];
    return (app.index > _sentRanges[si][0]) ? _sentRanges[si][0] : (si > 0 ? _sentRanges[si - 1][0] : 0);
  });
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
  idx = await page.evaluate(() => app.index);
  check('tap izquierda = inicio de oración', idx === expPrev, `→${idx} (esperado ${expPrev})`);
  // centro: play
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.waitForTimeout(50);
  check('tap centro = play', await page.evaluate(() => app.playing));
  // centro de nuevo: pausa
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  check('tap centro = pausa', !(await page.evaluate(() => app.playing)));

  // tap zones mientras reproduce: sigue reproduciendo tras el salto
  await page.evaluate(() => resumeWithContext());
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await page.waitForTimeout(50);
  check('salto durante play sigue reproduciendo', await page.evaluate(() => app.playing));
  await page.evaluate(() => stop());

  // --- barra de progreso seekeable ---
  const tapBox = await page.locator('#progress-tap').boundingBox();
  await page.mouse.click(tapBox.x + tapBox.width * 0.5, tapBox.y + tapBox.height / 2);
  await page.waitForTimeout(50);
  const seek = await page.evaluate(() => ({ idx: app.index, total: app.words.length, playing: app.playing }));
  const frac = seek.idx / (seek.total - 1);
  check('seek al 50% de la barra', Math.abs(frac - 0.5) < 0.03, `frac=${frac.toFixed(3)}`);
  check('seek arranca reproducción', seek.playing);
  await page.evaluate(() => stop());

  // --- chunk rendering en vivo ---
  const chunkRender = await page.evaluate(() => {
    const i = app.words.findIndex(w => [...w].length > 14);
    if (i < 0) return { skip: true };
    app.index = i; app.sub = 0; displayCurrentWord();
    const first = document.querySelector('#word-display .word-inner').textContent;
    app.sub = 1; displayCurrentWord();
    const second = document.querySelector('#word-display .word-inner').textContent;
    const word = app.words[i];
    return { word, first, second };
  });
  if (!chunkRender.skip) {
    check('render segmento 1 con ·', chunkRender.first.endsWith('·'), JSON.stringify(chunkRender));
    check('render segmento 2 con ·', chunkRender.second.startsWith('·'), JSON.stringify(chunkRender));
  } else console.log('  SKIP chunk render (no hay palabra >14 en el demo)');

  // --- puntito de párrafo ---
  const dot = await page.evaluate(() => {
    const pe = [...app.paraEnds][0]; // fin del primer párrafo del cuento
    const res = {};
    app.index = pe; app.sub = chunkWord(app.words[pe]).length - 1; displayCurrentWord();
    res.end = paraDot.classList.contains('show');
    app.index = pe + 1; app.sub = 0; displayCurrentWord();
    res.start = paraDot.classList.contains('show');
    app.index = Math.max(1, pe - 2); app.sub = 0; displayCurrentWord();
    res.mid = paraDot.classList.contains('show');
    return res;
  });
  check('puntito en fin de párrafo', dot.end);
  check('puntito en inicio de párrafo', dot.start);
  check('sin puntito a mitad de párrafo', !dot.mid);

  // --- agrupado de palabras cortas (WPM alto) ---
  const grp = await page.evaluate(() => {
    stop();
    const res = {};
    setWpm(500);
    let gi = -1;
    for (let i = 0; i < app.words.length - 1; i++) { if (groupCount(i) === 2) { gi = i; break; } }
    res.found = gi >= 0;
    if (gi >= 0) {
      app.index = gi; app.sub = 0; displayCurrentWord();
      res.group = app.group;
      res.shown = document.querySelector('#word-display .word-inner').textContent;
      res.pair = app.words[gi] + ' ' + app.words[gi + 1];
      res.orpChar = document.querySelector('#word-display .orp').textContent;
      res.hl2 = _wordSpans[gi + 1].classList.contains('current');
      setWpm(350);
      app.sub = 0; displayCurrentWord();
      res.groupOff = app.group;
    }
    return res;
  });
  check('agrupado: encuentra par a 500wpm', grp.found);
  check('agrupado: muestra el par junto', grp.shown === grp.pair, JSON.stringify(grp));
  check('agrupado: ORP no cae en el espacio', grp.orpChar !== ' ', JSON.stringify(grp.orpChar));
  check('agrupado: resalta ambas palabras en el panel', grp.hl2 === true);
  check('agrupado: apagado a 350wpm', grp.groupOff === 1);

  // --- frame en blanco tras oración ---
  const blank = await page.evaluate(() => {
    stop(); setWpm(350);
    let si = -1;
    for (let i = 0; i < app.words.length - 2; i++) { if (sentenceEnd(app.words[i])) { si = i; break; } }
    const res = { si };
    app.index = si; app.sub = chunkWord(app.words[si]).length - 1; displayCurrentWord();
    app.playing = true;
    tick(); // primer tick tras la oración: frame en blanco
    res.blankShown = app.blank === true;
    res.blankText = document.querySelector('#word-display .word-inner').textContent.trim();
    clearTimeout(app.timer);
    tick(); // segundo tick: avanza a la palabra siguiente
    res.advanced = app.index === si + 1;
    res.blankCleared = app.blank === false;
    app.playing = false; clearTimeout(app.timer);
    return res;
  });
  check('frame en blanco tras oración', blank.blankShown && blank.blankText === '', JSON.stringify(blank));
  check('tras el blanco avanza a la siguiente', blank.advanced && blank.blankCleared, JSON.stringify(blank));

  // --- sheet de ajustes ---
  await page.click('#btn-settings');
  check('sheet de ajustes abre', await page.evaluate(() => document.getElementById('settings-backdrop').classList.contains('open')));
  const uiSync = await page.evaluate(() => {
    const cbs = [...document.querySelectorAll('#settings-backdrop input[data-set]')];
    return cbs.every(cb => cb.checked === !!settings[cb.dataset.set]);
  });
  check('sheet refleja el estado actual', uiSync);
  // apagar agrupado y blank desde la UI
  await page.evaluate(() => {
    for (const key of ['group', 'blank']) {
      const cb = document.querySelector(`#settings-backdrop input[data-set=${key}]`);
      cb.checked = false; cb.dispatchEvent(new Event('change'));
    }
  });
  const gOff = await page.evaluate(() => {
    setWpm(500); let g = 1;
    for (let i = 0; i < app.words.length - 1; i++) g = Math.max(g, groupCount(i));
    setWpm(350); return g;
  });
  check('toggle apaga el agrupado', gOff === 1);
  const nb = await page.evaluate(() => {
    stop(); let si = -1;
    for (let i = 0; i < app.words.length - 2; i++) { if (sentenceEnd(app.words[i])) { si = i; break; } }
    app.index = si; app.sub = chunkWord(app.words[si]).length - 1; displayCurrentWord();
    app.playing = true; tick();
    const r = { blank: app.blank, idx: app.index, si };
    app.playing = false; clearTimeout(app.timer); return r;
  });
  check('toggle apaga el frame en blanco (avanza directo)', nb.blank === false && nb.idx === nb.si + 1, JSON.stringify(nb));
  // rebobinado a 0 desde la UI
  await page.evaluate(() => { document.querySelector('#seg-rewind button[data-v="0"]').click(); });
  const noRewind = await page.evaluate(() => {
    stop(); app.index = 60; app.sub = 0; displayCurrentWord();
    togglePlay(); const idx = app.index; stop(); return idx;
  });
  check('rebobinado 0: resume no retrocede', noRewind === 60, 'idx=' + noRewind);
  const savedSet = await page.evaluate(() => JSON.parse(localStorage.getItem('spritz-settings')));
  check('ajustes persisten en localStorage', savedSet.group === false && savedSet.blank === false && savedSet.rewind === 0);
  // restaurar defaults para el resto del harness
  await page.evaluate(() => {
    Object.assign(settings, { group: true, blank: true, rewind: 4 }); saveSettings(); syncSettingsUI();
    document.getElementById('settings-backdrop').classList.remove('open');
  });

  // ORP sigue clavado al 35% con segmentos
  const orpOk = await page.evaluate(() => {
    const panel = document.getElementById('word-display');
    const orp = panel.querySelector('.orp');
    const pr = panel.getBoundingClientRect(), or = orp.getBoundingClientRect();
    return Math.abs((or.left + or.width / 2 - pr.left) / pr.width - 0.35) < 0.02;
  });
  check('ORP al 35% en segmento', orpOk);

  // --- tema del panel ---
  await page.click('#btn-theme');
  check('tema sepia aplicado', await page.evaluate(() => splitReader.classList.contains('sepia')));
  await page.click('#btn-theme');
  check('tema claro aplicado', await page.evaluate(() => splitReader.classList.contains('light')));
  await page.click('#btn-theme');
  check('vuelve a oscuro', await page.evaluate(() => !splitReader.classList.contains('sepia') && !splitReader.classList.contains('light')));
  await page.click('#btn-theme'); // dejar en sepia para test de persistencia

  // --- persistencia: splitRatio + tema tras reload ---
  await page.evaluate(() => localStorage.setItem('spritz-split', '0.3'));
  await page.reload();
  await page.waitForTimeout(300);
  const persisted = await page.evaluate(() => ({
    split: app.splitRatio,
    theme: localStorage.getItem('spritz-reader-theme'),
    sepia: splitReader.classList.contains('sepia'),
  }));
  check('splitRatio restaurado', persisted.split === 0.3, 'got ' + persisted.split);
  check('tema restaurado tras reload', persisted.theme === 'sepia' && persisted.sepia);

  // --- buscador de biblioteca (>6 libros) ---
  await page.evaluate(async () => {
    for (let i = 1; i <= 7; i++) await saveTextAsBook('Libro número ' + i, 'texto de prueba ' + i + ' con algo de contenido acá', 'Autor ' + i);
    await loadLibrary();
  });
  await page.waitForTimeout(200);
  const searchTest = await page.evaluate(() => {
    const input = document.getElementById('lib-search');
    if (!input) return { hasInput: false };
    input.value = 'numero 3'; // sin tilde: prueba normalización
    input.dispatchEvent(new Event('input'));
    const cards = [...document.querySelectorAll('.book-card')];
    const visible = cards.filter(c => c.style.display !== 'none');
    return { hasInput: true, total: cards.length, visible: visible.length, title: visible[0] && visible[0].querySelector('.bc-title').textContent };
  });
  check('buscador visible con 8 libros', searchTest.hasInput);
  check('filtra sin tildes', searchTest.visible === 1 && /número 3/.test(searchTest.title || ''), JSON.stringify(searchTest));

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
