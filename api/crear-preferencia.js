/*
  Crea una "preferencia" de pago en Mercado Pago y devuelve el link del checkout.

  Por que esto no puede vivir en el navegador: crear la orden requiere el
  ACCESS TOKEN de la cuenta de Mercado Pago, que es una clave secreta. Si
  estuviera en el HTML, cualquiera podria leerla y cobrar en nombre del taller.

  El token se configura como variable de entorno en el panel de Vercel
  (Settings -> Environment Variables -> MP_ACCESS_TOKEN).
  Nunca se escribe en el codigo ni se sube al repositorio.
*/

const { PRODUCTS, ENVIOS, MONEDA } = require("../productos.js");
const stock = require("../lib/stock.js");

const MP_API = "https://api.mercadopago.com/checkout/preferences";

// Dominios a los que se permite volver despues de pagar. El navegador puede
// mentir en la cabecera Host, asi que no se usa a ciegas para armar la URL
// de retorno: solo se acepta el dominio propio o un despliegue de Vercel.
const DOMINIO_PROPIO = "https://www.tallermanoyaguja.com";

function sitioDeRetorno(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");

  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const limpio = String(host).split(",")[0].trim();

  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/i.test(limpio)) {
    return "https://" + limpio;
  }
  if (/^(www\.)?tallermanoyaguja\.com$/i.test(limpio)) {
    return "https://" + limpio;
  }
  return DOMINIO_PROPIO;
}

function limpiar(texto, max) {
  if (typeof texto !== "string") return "";
  return texto.trim().slice(0, max || 120);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo no permitido." });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error("Falta la variable de entorno MP_ACCESS_TOKEN.");
    return res.status(500).json({ error: "El medio de pago no esta configurado todavia." });
  }

  // Vercel ya deja el JSON parseado en req.body, pero si llega como texto
  // (por ejemplo con otro Content-Type) igual se intenta leer.
  let payload = req.body;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch (e) { payload = null; }
  }
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "No pudimos leer el pedido." });
  }

  // --- Validacion del carrito -------------------------------------------
  // El navegador solo manda ids. Los precios salen de productos.js, aca en el
  // servidor. Asi el total cobrado no depende de lo que diga el cliente.
  const pedidos = Array.isArray(payload.items) ? payload.items : [];
  if (pedidos.length === 0) {
    return res.status(400).json({ error: "El carrito esta vacio." });
  }

  const vistos = new Set();
  const items = [];

  for (const pedido of pedidos) {
    const id = Number(pedido && pedido.id);
    const producto = PRODUCTS.find((p) => p.id === id);

    if (!producto) {
      return res.status(400).json({ error: "Una de las prendas ya no existe en el catalogo." });
    }
    if (!producto.available) {
      return res.status(409).json({ error: `"${producto.name}" ya no esta disponible.` });
    }
    if (vistos.has(id)) {
      return res.status(400).json({ error: "Hay una prenda repetida en el carrito." });
    }
    vistos.add(id);

    // Cada prenda es una pieza unica: siempre cantidad 1.
    items.push({
      id: String(producto.id),
      title: producto.name,
      quantity: 1,
      unit_price: producto.price,
      currency_id: MONEDA
    });
  }

  // --- Validacion del despacho ------------------------------------------
  const envio = ENVIOS.find((e) => e.id === payload.envio);
  if (!envio) {
    return res.status(400).json({ error: "Falta elegir como recibir el pedido." });
  }
  if (envio.price > 0) {
    items.push({
      id: "envio-" + envio.id,
      title: envio.label,
      quantity: 1,
      unit_price: envio.price,
      currency_id: MONEDA
    });
  }

  // --- Datos del cliente -------------------------------------------------
  const cliente = payload.cliente || {};
  const nombre = limpiar(cliente.nombre, 80);
  const email = limpiar(cliente.email, 120);
  const telefono = limpiar(cliente.telefono, 30);
  const direccion = limpiar(cliente.direccion, 160);
  const comuna = limpiar(cliente.comuna, 80);

  if (!nombre || !email) {
    return res.status(400).json({ error: "Necesitamos tu nombre y tu correo." });
  }
  if (envio.pideDireccion && (!direccion || !comuna)) {
    return res.status(400).json({ error: "Necesitamos la direccion y la comuna para el despacho." });
  }

  const referencia = "MA-" + Date.now().toString(36).toUpperCase();

  // --- Reserva del stock -------------------------------------------------
  // Antes de mandar a nadie a pagar, se apartan las prendas. Si otra persona
  // esta pagando la misma, aca se corta. Si el control de stock no responde,
  // NO se vende: es preferible perder una venta a vender dos veces la misma
  // prenda unica.
  const idsPrendas = Array.from(vistos);
  let reserva;
  try {
    reserva = await stock.reservar(idsPrendas, referencia);
  } catch (e) {
    console.error("No se pudo reservar el stock:", e);
    return res.status(503).json({
      error: "No pudimos confirmar la disponibilidad en este momento. Intenta de nuevo en un minuto."
    });
  }

  if (!reserva.ok) {
    const ocupada = PRODUCTS.find((p) => p.id === reserva.ocupada);
    return res.status(409).json({
      error: ocupada
        ? `Alguien se adelanto con "${ocupada.name}". Es una pieza unica, asi que quedo fuera de tu carrito.`
        : "Una de las prendas ya no esta disponible.",
      prendaOcupada: reserva.ocupada
    });
  }

  // Resumen legible que queda pegado al pago en el panel de Mercado Pago.
  // Sin base de datos propia, este es el lugar donde el taller ve que pidieron
  // y a donde hay que mandarlo.
  const resumen = [
    "Pedido " + referencia,
    items
      .filter((i) => !String(i.id).startsWith("envio-"))
      .map((i) => i.title)
      .join(" + "),
    "Entrega: " + envio.label,
    envio.pideDireccion ? "Dirección: " + direccion + ", " + comuna : null,
    telefono ? "Teléfono: " + telefono : null
  ]
    .filter(Boolean)
    .join(" | ");

  const sitio = sitioDeRetorno(req);

  const preferencia = {
    items,
    external_reference: referencia,
    additional_info: resumen,
    statement_descriptor: "MANOYAGUJA",
    binary_mode: true, // sin pagos "en proceso": aprobado o rechazado
    payer: {
      name: nombre,
      email: email,
      phone: telefono ? { number: telefono } : undefined,
      address: envio.pideDireccion
        ? { street_name: direccion, zip_code: "", street_number: "" }
        : undefined
    },
    metadata: {
      envio: envio.id,
      comuna: comuna || null,
      direccion: direccion || null
    },
    back_urls: {
      success: sitio + "/gracias.html",
      pending: sitio + "/gracias.html",
      failure: sitio + "/gracias.html"
    },
    // Mercado Pago avisa aca cuando el pago cambia de estado. Es lo unico
    // que marca una prenda como vendida de forma definitiva: el retorno del
    // navegador no sirve para eso, porque lo puede falsear cualquiera.
    notification_url: sitio + "/api/webhook-mercadopago"
  };

  // auto_return solo funciona con URLs https. En desarrollo local se omite.
  if (sitio.startsWith("https://")) {
    preferencia.auto_return = "approved";
  }

  try {
    const respuesta = await fetch(MP_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        "X-Idempotency-Key": referencia
      },
      body: JSON.stringify(preferencia)
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      // El detalle del error queda en los logs de Vercel, no se le muestra
      // al cliente: puede contener informacion de la cuenta.
      console.error("Mercado Pago rechazo la preferencia:", respuesta.status, datos);
      // Si no hay cobro, las prendas no pueden quedar apartadas.
      await stock.soltar(idsPrendas, referencia).catch(() => {});
      return res.status(502).json({ error: "Mercado Pago no pudo generar el cobro. Intenta de nuevo en un momento." });
    }

    return res.status(200).json({
      init_point: datos.init_point,
      referencia
    });
  } catch (e) {
    console.error("Error llamando a Mercado Pago:", e);
    await stock.soltar(idsPrendas, referencia).catch(() => {});
    return res.status(502).json({ error: "No pudimos conectar con Mercado Pago. Intenta de nuevo." });
  }
};
