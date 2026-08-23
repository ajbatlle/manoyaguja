/*
  Recibe los avisos de Mercado Pago cuando un pago cambia de estado.

  Es el UNICO lugar donde una prenda pasa a "vendida". La pagina de gracias a
  la que vuelve el comprador no sirve para eso: esa direccion la puede abrir
  cualquiera escribiendola a mano, asi que confiar en ella permitiria vaciar
  el catalogo sin pagar un peso.

  Aca en cambio se verifica dos veces:
    1. Que el aviso venga firmado por Mercado Pago (cabecera x-signature).
    2. Que el pago realmente este aprobado, preguntandoselo a su API.
*/

const crypto = require("crypto");
const stock = require("../lib/stock.js");

/*
  Mercado Pago firma cada aviso con un secreto que se configura en su panel.
  La firma se calcula sobre una frase armada con el id del pago, el id de la
  peticion y la marca de tiempo. Si no calza, el aviso no es suyo.
*/
function firmaValida(req, secreto) {
  const cabecera = req.headers["x-signature"];
  const idPeticion = req.headers["x-request-id"];
  if (!cabecera || !idPeticion) return false;

  let ts = null;
  let v1 = null;
  for (const parte of String(cabecera).split(",")) {
    const [clave, valor] = parte.split("=").map((s) => (s || "").trim());
    if (clave === "ts") ts = valor;
    if (clave === "v1") v1 = valor;
  }
  if (!ts || !v1) return false;

  const idPago = idDelPago(req);
  if (!idPago) return false;

  // Mercado Pago pide el id en minusculas cuando es alfanumerico.
  const id = /^[a-zA-Z0-9]+$/.test(idPago) ? idPago.toLowerCase() : idPago;
  const frase = `id:${id};request-id:${idPeticion};ts:${ts};`;

  const esperado = crypto.createHmac("sha256", secreto).update(frase).digest("hex");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function idDelPago(req) {
  const q = req.query || {};
  const desdeQuery = q["data.id"] || q.id;
  if (desdeQuery) return String(desdeQuery);

  const cuerpo = typeof req.body === "object" && req.body ? req.body : {};
  if (cuerpo.data && cuerpo.data.id) return String(cuerpo.data.id);
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo no permitido." });
  }

  const secreto = process.env.MP_WEBHOOK_SECRET;
  const token = process.env.MP_ACCESS_TOKEN;

  if (!secreto || !token) {
    // Se responde con error para que Mercado Pago reintente mas tarde, en vez
    // de dar el aviso por entregado y perder la venta.
    console.error("Webhook sin configurar: falta MP_WEBHOOK_SECRET o MP_ACCESS_TOKEN.");
    return res.status(500).json({ error: "Webhook no configurado." });
  }

  if (!firmaValida(req, secreto)) {
    console.warn("Aviso con firma invalida. Se descarta.");
    return res.status(401).json({ error: "Firma invalida." });
  }

  // Solo interesan los avisos de pagos.
  const tipo = (req.query && (req.query.type || req.query.topic)) ||
    (req.body && (req.body.type || req.body.topic));
  if (tipo && tipo !== "payment") {
    return res.status(200).json({ ignorado: tipo });
  }

  const idPago = idDelPago(req);
  if (!idPago) {
    return res.status(400).json({ error: "Aviso sin id de pago." });
  }

  try {
    // Segunda verificacion: se le pregunta a Mercado Pago por el pago real.
    // Nunca se confia en el estado que venga en el aviso.
    const respuesta = await fetch("https://api.mercadopago.com/v1/payments/" + idPago, {
      headers: { Authorization: "Bearer " + token }
    });

    if (!respuesta.ok) {
      console.error("No se pudo consultar el pago", idPago, respuesta.status);
      return res.status(500).json({ error: "No se pudo consultar el pago." });
    }

    const pago = await respuesta.json();
    const referencia = pago.external_reference;
    const estado = pago.status;

    if (!referencia) {
      console.warn("Pago sin referencia de pedido:", idPago);
      return res.status(200).json({ sinReferencia: true });
    }

    if (estado === "approved") {
      const resultado = await stock.marcarVendidas(referencia);
      console.log("Pago aprobado", referencia, "prendas vendidas:", resultado.ids);
      return res.status(200).json({ ok: true, vendidas: resultado.ids });
    }

    if (estado === "rejected" || estado === "cancelled") {
      const resultado = await stock.liberarPedido(referencia);
      console.log("Pago", estado, referencia, "prendas liberadas:", resultado.ids);
      return res.status(200).json({ ok: true, liberadas: resultado.ids });
    }

    // Cualquier otro estado (in_process, authorized) se deja como esta: la
    // reserva sigue viva y expira sola si el pago nunca se concreta.
    console.log("Pago", referencia, "en estado", estado, "- sin cambios de stock.");
    return res.status(200).json({ ok: true, estado });
  } catch (e) {
    console.error("Error procesando el aviso de Mercado Pago:", e);
    return res.status(500).json({ error: "Error interno." });
  }
};
