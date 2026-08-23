# Mano y Aguja — notas del sitio

Sitio: https://www.tallermanoyaguja.com

## Cómo está armado

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Todo el catálogo y el carrito. Es una sola página. |
| `productos.js` | **Las prendas y los precios.** Único archivo que hay que tocar para el día a día. |
| `gracias.html` | La página a la que vuelve el cliente después de pagar. |
| `api/crear-preferencia.js` | Le pide a Mercado Pago el cobro y aparta la prenda. No se toca. |
| `api/webhook-mercadopago.js` | Recibe el aviso de pago aprobado y marca la prenda vendida. No se toca. |
| `api/estado-stock.js` | Le dice al catálogo qué prendas ya no están. No se toca. |
| `lib/stock.js` | La lógica de reservas y ventas. No se toca. |

## Tareas del día a día

Todas se hacen editando **`productos.js`** y subiendo el cambio. El sitio se
actualiza solo un par de minutos después.

### Marcar una prenda como vendida

**Las ventas por la web se marcan solas.** Esto es solo para prendas que
vendiste en persona, regalaste o mandaste a arreglar.

Buscar la prenda y cambiar `available:true` por `available:false`.

```js
{ id:2, name:"Chaqueta 02", price:PRECIO_CHAQUETA, category:"Chaquetas", available:false, images:[...] },
```

Queda visible en el catálogo con el cartel "Vendida", pero ya no se puede
agregar al carrito ni pagar.

### Cambiar un precio

Cambiar `PRECIO_CHAQUETA` o `PRECIO_PANTALON` arriba del archivo, o el `price`
de una prenda suelta.

### Cambiar el costo del despacho en Santiago

En la lista `ENVIOS`, el `price` de la opción `santiago`.

### Agregar una prenda nueva

1. Dejar las fotos en `assets/`.
2. Copiar una línea de `PRODUCTS` y cambiarle `id` (uno que no exista),
   `name` e `images`.

### Subir los cambios

```bash
git add . && git commit -m "actualizo catálogo" && git push
```

## Cómo se evita vender dos veces la misma prenda

Cada prenda es única, así que el sistema lleva tres estados:

- **libre** — se puede comprar.
- **reservada** — alguien está pagándola en este momento. Dura 30 minutos.
  Si no completa el pago, vuelve sola al catálogo.
- **vendida** — el pago se aprobó. Es definitivo.

La reserva se toma en el instante en que alguien aprieta *Pagar*, antes de
mandarlo a Mercado Pago. Si dos personas aprietan el botón en el mismo
segundo, la base de datos le concede la prenda a una sola y a la otra le
responde que ya no está. No hay empate posible.

Lo que pasa a *vendida* no es el regreso del comprador al sitio, sino el aviso
que Mercado Pago le manda al servidor cuando el pago se aprueba. Esa
diferencia importa: la página de gracias la puede abrir cualquiera escribiendo
la dirección a mano, así que confiar en ella permitiría vaciar el catálogo sin
pagar un peso.

**Si la base de datos no responde, el sitio no vende.** Prefiere perder una
venta antes que arriesgar vender dos veces la misma prenda.

### Devolver una prenda al catálogo después de una devolución

Si le devuelves el dinero a alguien, la prenda **no vuelve sola** al catálogo:
queda marcada como vendida. Hoy eso se corrige a mano en la base de datos y no
hay una pantalla para hacerlo. Si te pasa, pídeme que lo haga o que arme una
forma de hacerlo tú.

## Por qué los precios están en un solo archivo

`productos.js` lo leen los dos lados: el navegador para mostrar el catálogo, y
el servidor para calcular cuánto cobrar. El navegador solo manda los números de
las prendas; el precio lo pone siempre el servidor. Si alguien manipula la
página desde la consola del navegador, el monto cobrado no cambia.

Por eso los precios no se editan en `index.html`.

## La clave de Mercado Pago

El token de acceso de Mercado Pago **no está en este repositorio** y no debe
estarlo nunca: cualquiera que lo tenga puede cobrar a nombre del taller.

Vive como variable de entorno en el panel de Vercel:

    Environment Variables → MP_ACCESS_TOKEN

Si alguna vez se filtra, hay que regenerarlo desde el panel de desarrolladores
de Mercado Pago y actualizarlo en Vercel.

## Variables de entorno que necesita el sitio

| Variable | De dónde sale |
|---|---|
| `MP_ACCESS_TOKEN` | Mercado Pago → Tus integraciones → tu aplicación → Credenciales |
| `MP_WEBHOOK_SECRET` | Mercado Pago → tu aplicación → Webhooks → clave secreta |
| `KV_REST_API_URL` | La pone sola la base de datos al agregarla en Vercel |
| `KV_REST_API_TOKEN` | Idem |

Ninguna de estas va en el repositorio.

## Hosting

El sitio corre en Vercel, no en GitHub Pages. Vercel publica los archivos de la
raíz tal cual y convierte cada archivo de `api/` en una función de servidor.
No hay proceso de compilación ni `package.json`: es HTML y JavaScript sin más.

Cada `git push` dispara un despliegue nuevo automáticamente.

## Dónde se ven los pedidos

En el panel de Mercado Pago, en cada pago. El detalle del pedido (qué prendas,
cómo se entrega, dirección y teléfono) queda escrito en la información
adicional del pago, con un código tipo `MA-XXXXXX`.

El sitio no guarda pedidos por su cuenta: no hay base de datos. El stock se
lleva a mano marcando `available:false`.
