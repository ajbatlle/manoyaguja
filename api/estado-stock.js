/*
  Le dice al catalogo que prendas ya no estan disponibles.

  El navegador lo consulta al cargar la pagina. Es solo para mostrar: la
  decision de verdad sobre si se puede comprar algo la toma
  api/crear-preferencia.js al momento de reservar, que es lo unico que no se
  puede saltar desde el navegador.
*/

const { PRODUCTS } = require("../productos.js");
const stock = require("../lib/stock.js");

module.exports = async (req, res) => {
  // Nunca cachear: una prenda vendida hace un minuto tiene que verse vendida.
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Metodo no permitido." });
  }

  if (!stock.hayBaseDeDatos()) {
    return res.status(200).json({ vendidas: [], reservadas: [], configurado: false });
  }

  try {
    const ids = PRODUCTS.map((p) => p.id);
    const estado = await stock.estadoDe(ids);

    const vendidas = [];
    const reservadas = [];
    for (const id of ids) {
      if (estado[id] === "vendida") vendidas.push(id);
      else if (estado[id] === "reservada") reservadas.push(id);
    }

    return res.status(200).json({ vendidas, reservadas, configurado: true });
  } catch (e) {
    console.error("No se pudo leer el estado del stock:", e);
    // Si la base de datos falla, el catalogo se muestra completo. No es
    // riesgoso: la reserva al pagar sigue bloqueando lo que ya no esta.
    return res.status(200).json({ vendidas: [], reservadas: [], configurado: true, error: true });
  }
};
