/*
  Crea una "preferencia" de pago en Mercado Pago y devuelve el link del checkout.

  Por que esto no puede vivir en el navegador: crear la orden requiere el
  ACCESS TOKEN de la cuenta de Mercado Pago, que es una clave secreta. Si
  estuviera en el HTML, cualquiera podria leerla y cobrar en nombre del taller.

  El token se configura como variable de entorno en el panel de Netlify
  (Site settings -> Environment variables -> MP_ACCESS_TOKEN).
  Nunca se escribe en el codigo ni se sube al repositorio.
*/

const { PRODUCTS, ENVIOS, MONEDA } = require("../../productos.js");

const MP_API = "https://api.mercadopago.com/checkout/preferences";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}

function limpiar(texto, max) {
  if (typeof texto !== "string") return "";
  return texto.trim().slice(0, max || 120);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Metodo no permitido." });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error("Falta la variable de entorno MP_ACCESS_TOKEN.");
    return json(500, { error: "El medio de pago no esta configurado todavia." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "No pudimos leer el pedido." });
  }

  // --- Validacion del carrito -------------------------------------------
  // El navegador solo manda ids. Los precios salen de productos.js, aca en el
  // servidor. Asi el total cobrado no depende de lo que diga el cliente.
  const pedidos = Array.isArray(payload.items) ? payload.items : [];
  if (pedidos.length === 0) {
    return json(400, { error: "El carrito esta vacio." });
  }

  const vistos = new Set();
  const items = [];

  for (const pedido of pedidos) {
    const id = Number(pedido && pedido.id);
    const producto = PRODUCTS.find((p) => p.id === id);

    if (!producto) {
      return json(400, { error: "Una de las prendas ya no existe en el catalogo." });
    }
    if (!producto.available) {
      return json(409, { error: `"${producto.name}" ya no esta disponible.` });
    }
    if (vistos.has(id)) {
      return json(400, { error: "Hay una prenda repetida en el carrito." });
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
    return json(400, { error: "Falta elegir como recibir el pedido." });
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
    return json(400, { error: "Necesitamos tu nombre y tu correo." });
  }
  if (envio.pideDireccion && (!direccion || !comuna)) {
    return json(400, { error: "Necesitamos la direccion y la comuna para el despacho." });
  }

  const referencia = "MA-" + Date.now().toString(36).toUpperCase();

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

  const sitio = process.env.URL || "https://www.tallermanoyaguja.com";

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
    }
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
      // El detalle del error queda en los logs de Netlify, no se le muestra
      // al cliente: puede contener informacion de la cuenta.
      console.error("Mercado Pago rechazo la preferencia:", respuesta.status, datos);
      return json(502, { error: "Mercado Pago no pudo generar el cobro. Intenta de nuevo en un momento." });
    }

    return json(200, {
      init_point: datos.init_point,
      referencia
    });
  } catch (e) {
    console.error("Error llamando a Mercado Pago:", e);
    return json(502, { error: "No pudimos conectar con Mercado Pago. Intenta de nuevo." });
  }
};
