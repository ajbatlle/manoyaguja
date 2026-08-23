/*
  Control de stock de prendas unicas.

  El problema que resuelve: cada prenda existe una sola vez. Si dos personas
  la compran con segundos de diferencia, el taller queda debiendo una.

  Como funciona, en tres estados:

    libre      -> no hay nada guardado para esa prenda
    reservada  -> alguien esta pagandola ahora mismo. Expira sola.
    vendida    -> pago aprobado. No expira nunca.

  La reserva se toma con SET NX, que es atomico: si dos peticiones llegan en
  el mismo instante, la base de datos le concede la prenda a UNA sola y a la
  otra le responde que no. No hay ventana de carrera.

  Guarda los datos en Redis (Upstash), que se agrega desde el Marketplace de
  Vercel. La integracion inyecta sola las variables de entorno.
*/

/*
  La integracion crea varias variables de conexion a la vez: unas con
  direcciones rediss:// (para clientes tradicionales) y una https:// que es la
  que se usa aca, porque las funciones de Vercel no mantienen conexiones
  abiertas. Se elige la https sin depender de que variable la traiga.
*/
const URL_BASE = [
  process.env.KV_REST_API_URL,
  process.env.UPSTASH_REDIS_REST_URL,
  process.env.KV_REST_API_KV_URL,
  process.env.KV_REST_API_REDIS_URL,
  process.env.STORAGE_URL
]
  .filter((u) => typeof u === "string" && u.startsWith("https://"))
  .map((u) => u.replace(/\/+$/, ""))[0] || "";

const TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.STORAGE_TOKEN ||
  "";

// Cuanto dura una reserva mientras la persona esta en Mercado Pago pagando.
const MINUTOS_DE_RESERVA = 45;

const clavePrenda = (id) => "prenda:" + id;
const clavePedido = (ref) => "pedido:" + ref;

function hayBaseDeDatos() {
  return Boolean(URL_BASE && TOKEN);
}

async function ejecutar(comando) {
  const respuesta = await fetch(URL_BASE, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(comando)
  });
  if (!respuesta.ok) {
    throw new Error("Redis respondio " + respuesta.status);
  }
  const datos = await respuesta.json();
  return datos.result;
}

async function ejecutarVarios(comandos) {
  if (comandos.length === 0) return [];
  const respuesta = await fetch(URL_BASE + "/pipeline", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(comandos)
  });
  if (!respuesta.ok) {
    throw new Error("Redis respondio " + respuesta.status);
  }
  const datos = await respuesta.json();
  return datos.map((d) => d.result);
}

/*
  Devuelve el estado de todas las prendas consultadas:
    { 3: "vendida", 7: "reservada" }
  Las que no aparecen estan libres.
*/
async function estadoDe(ids) {
  if (!hayBaseDeDatos()) return {};
  const valores = await ejecutarVarios(ids.map((id) => ["GET", clavePrenda(id)]));
  const estado = {};
  ids.forEach((id, i) => {
    const valor = valores[i];
    if (!valor) return;
    estado[id] = String(valor).startsWith("reservada") ? "reservada" : "vendida";
  });
  return estado;
}

/*
  Intenta apartar todas las prendas de un pedido.

  O se reservan todas, o no se reserva ninguna: si una ya estaba tomada, se
  sueltan las que alcanzo a apartar este mismo pedido. Asi nadie queda con
  medio carrito bloqueado por una prenda que no consiguio.

  Devuelve { ok: true } o { ok: false, ocupada: <id> }.
*/
async function reservar(ids, referencia) {
  if (!hayBaseDeDatos()) {
    throw new Error("El control de stock no esta configurado.");
  }

  const marca = "reservada:" + referencia;
  const segundos = MINUTOS_DE_RESERVA * 60;
  const conseguidas = [];

  for (const id of ids) {
    // SET ... NX: solo escribe si la clave no existe. Es la operacion que
    // hace imposible que dos pedidos se lleven la misma prenda.
    const resultado = await ejecutar([
      "SET", clavePrenda(id), marca, "NX", "EX", String(segundos)
    ]);

    if (resultado === null || resultado === undefined) {
      await soltar(conseguidas, referencia);
      return { ok: false, ocupada: id };
    }
    conseguidas.push(id);
  }

  // Se guarda que prendas lleva este pedido, para que el aviso de pago
  // aprobado sepa cuales marcar como vendidas.
  await ejecutar([
    "SET", clavePedido(referencia), JSON.stringify(ids), "EX", String(60 * 60 * 24 * 30)
  ]);

  return { ok: true };
}

/*
  Suelta reservas, pero solo si siguen siendo de este pedido. Si la prenda ya
  se vendio, o si otro pedido la tomo despues, no se toca.
*/
async function soltar(ids, referencia) {
  if (!hayBaseDeDatos() || ids.length === 0) return;
  const marca = "reservada:" + referencia;
  const valores = await ejecutarVarios(ids.map((id) => ["GET", clavePrenda(id)]));
  const aBorrar = ids.filter((id, i) => valores[i] === marca);
  if (aBorrar.length > 0) {
    await ejecutarVarios(aBorrar.map((id) => ["DEL", clavePrenda(id)]));
  }
}

/*
  Marca como vendidas las prendas de un pedido. Sin expiracion: es definitivo.
  Se llama solo desde el aviso verificado de Mercado Pago.
*/
async function marcarVendidas(referencia) {
  if (!hayBaseDeDatos()) {
    throw new Error("El control de stock no esta configurado.");
  }
  const guardado = await ejecutar(["GET", clavePedido(referencia)]);
  if (!guardado) return { ids: [], encontrado: false };

  let ids;
  try {
    ids = JSON.parse(guardado);
  } catch (e) {
    return { ids: [], encontrado: false };
  }
  if (!Array.isArray(ids) || ids.length === 0) return { ids: [], encontrado: false };

  await ejecutarVarios(ids.map((id) => ["SET", clavePrenda(id), "vendida"]));
  return { ids, encontrado: true };
}

/* Suelta las prendas de un pedido que se rechazo o se cancelo. */
async function liberarPedido(referencia) {
  if (!hayBaseDeDatos()) return { ids: [] };
  const guardado = await ejecutar(["GET", clavePedido(referencia)]);
  if (!guardado) return { ids: [] };
  let ids;
  try {
    ids = JSON.parse(guardado);
  } catch (e) {
    return { ids: [] };
  }
  await soltar(ids, referencia);
  return { ids };
}

module.exports = {
  hayBaseDeDatos,
  estadoDe,
  reservar,
  soltar,
  marcarVendidas,
  liberarPedido,
  MINUTOS_DE_RESERVA
};
