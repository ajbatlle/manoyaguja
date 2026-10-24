/*
  Herramientas para dejar las fotos de producto listas para la tienda.
  Todas las fotos de la tienda miden 1086 x 1448 (vertical 3:4) y van sobre blanco.
  Ninguna de estas herramientas toca la luz ni el color: solo giran, recortan y escalan.

  Instalar una vez:   cd herramientas/fotos && npm install
  Uso:                node fotos.js <comando> ...

    preparar  <foto> <salida.jpg>
        Endereza la foto según el teléfono y la deja de 2400 px como máximo,
        lista para subirla a Adobe y quitarle el fondo.

    encuadrar <foto-sobre-blanco> <salida.jpg> [aire=0.19]
        Recorta y escala a 1086 x 1448 con la prenda centrada.
        "aire" es el margen a cada lado (0.19 deja la mochila del tamaño de las de ChatGPT).
        Si la prenda toca un borde de la foto, la deja saliendo por ese mismo borde.

    igualar   <espalda-sobre-blanco> <frente.jpg> <salida.jpg>
        Deja la foto de espalda con el mismo ancho, centro y borde de arriba que la de frente.

    vertical  <foto> <salida.jpg>
        Para fotos ya editadas (por ejemplo con ChatGPT): si viene horizontal, la gira
        a la izquierda; si ya es vertical, solo la convierte. Avisa si no queda de 1086 x 1448.

    medir     <fotos...>
        Muestra tamaño, caja de la prenda y ancho del cuerpo de cada foto.

    comparar  <salida.jpg> <fotos...>
        Arma una lámina con las fotos lado a lado, para revisarlas antes de publicar.
*/
const sharp = require("sharp");

const W = 1086, H = 1448;

// Píxeles que no son fondo blanco
async function leer(f) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const noBlanco = (x, y) => { const i = (y * w + x) * 3; return data[i] < 238 || data[i + 1] < 238 || data[i + 2] < 238; };
  return { w, h, noBlanco };
}

// Caja de la prenda y ancho máximo del cuerpo (entre el 25% y el 60% de su alto)
async function medir(f) {
  const { w, h, noBlanco } = await leer(f);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (noBlanco(x, y)) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  let cuerpo = 0, desde = 0;
  for (let y = Math.round(y0 + (y1 - y0) * 0.25); y < y0 + (y1 - y0) * 0.6; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (noBlanco(x, y)) { if (a < 0) a = x; b = x; }
    if (b - a > cuerpo) { cuerpo = b - a; desde = a; }
  }
  const borde = (prueba, n) => { let c = 0; for (let i = 0; i < n; i++) if (prueba(i)) c++; return c > 30; };
  const toca = {
    izq: borde(i => noBlanco(1, i), h), der: borde(i => noBlanco(w - 2, i), h),
    arriba: borde(i => noBlanco(i, 1), w), abajo: borde(i => noBlanco(i, h - 2), w),
  };
  return { w, h, x0, y0, x1, y1, cuerpo, centro: desde + cuerpo / 2, toca };
}

// Pega la foto escalada en un lienzo blanco de 1086 x 1448, en la posición dada
async function componer(src, escala, left, top, out) {
  const m = await sharp(src).metadata();
  const grande = await sharp(src).resize(Math.round(m.width * escala), Math.round(m.height * escala)).png().toBuffer();
  const M = 4000;
  const lienzo = await sharp({ create: { width: W + 2 * M, height: H + 2 * M, channels: 3, background: "#ffffff" } })
    .composite([{ input: grande, left: Math.round(left) + M, top: Math.round(top) + M }]).png().toBuffer();
  await sharp(lienzo).extract({ left: M, top: M, width: W, height: H }).jpeg({ quality: 92, mozjpeg: true }).toFile(out);
}

const comandos = {
  async preparar(src, out) {
    await sharp(src).rotate().resize(2400, 2400, { fit: "inside" }).jpeg({ quality: 92 }).toFile(out);
    const m = await sharp(out).metadata();
    console.log(out, `${m.width}x${m.height}`);
  },

  async encuadrar(src, out, aire = "0.19") {
    const PAD = +aire;
    const m = await medir(src);
    let { x0, y0, x1, y1 } = m; const t = m.toca;
    if (t.izq) x0 = 0; if (t.der) x1 = m.w - 1; if (t.arriba) y0 = 0; if (t.abajo) y1 = m.h - 1;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const libresH = !t.izq + !t.der, libresV = !t.arriba + !t.abajo;
    const cw = (t.izq && t.der) ? Math.min(bw, (3 / 4) * bh / (1 - PAD * libresV))
      : (t.arriba && t.abajo) ? (3 / 4) * bh
      : Math.max(bw / (1 - PAD * libresH), (3 / 4) * bh / (1 - PAD * libresV));
    const ch = cw * 4 / 3;
    const cx = t.izq && !t.der ? x0 : t.der && !t.izq ? x1 + 1 - cw : x0 + bw / 2 - cw / 2;
    const cy = t.arriba && !t.abajo ? y0 : t.abajo && !t.arriba ? y1 + 1 - ch : y0 + bh / 2 - ch / 2;
    const s = W / cw;
    await componer(src, s, -cx * s, -cy * s, out);
    console.log(out, "escala", s.toFixed(3), "toca bordes:", Object.keys(t).filter(k => t[k]).join(", ") || "ninguno");
  },

  async igualar(src, frente, out) {
    const a = await medir(src), r = await medir(frente);
    const s = r.cuerpo / a.cuerpo;
    await componer(src, s, r.centro - a.centro * s, r.y0 - a.y0 * s, out);
    console.log(out, "escala", s.toFixed(3), "ancho del cuerpo", r.cuerpo);
  },

  async vertical(src, out) {
    const m = await sharp(src).metadata();
    const img = m.width > m.height ? sharp(src).rotate(270) : sharp(src);
    await img.jpeg({ quality: 92, mozjpeg: true }).toFile(out);
    const f = await sharp(out).metadata();
    console.log(out, `${f.width}x${f.height}`, f.width === W && f.height === H ? "" : "(OJO: no mide 1086x1448; pasarla por 'encuadrar')");
  },

  async medir(...fotos) {
    for (const f of fotos) {
      const m = await medir(f);
      console.log(f, `${m.w}x${m.h}`, "caja", m.x0, m.y0, m.x1, m.y1, "cuerpo", m.cuerpo, "centro", Math.round(m.centro));
    }
  },

  async comparar(out, ...fotos) {
    const ancho = 420, alto = 560;
    const piezas = [];
    for (const f of fotos) piezas.push(await sharp(f).resize(ancho, alto, { fit: "contain", background: "#999" }).png().toBuffer());
    await sharp({ create: { width: fotos.length * (ancho + 10), height: alto, channels: 3, background: "#666" } })
      .composite(piezas.map((b, i) => ({ input: b, left: i * (ancho + 10), top: 0 }))).jpeg({ quality: 88 }).toFile(out);
    console.log(out);
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!comandos[cmd]) {
  console.log("Comandos: " + Object.keys(comandos).join(", ") + ". Ver el encabezado de fotos.js.");
  process.exit(1);
}
comandos[cmd](...args).catch(e => { console.error(e.message); process.exit(1); });
