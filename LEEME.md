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

1. Dejar las fotos en `assets/` (ver **Fotos de producto**, más abajo).
2. Copiar una línea de `PRODUCTS` y cambiarle `id` (uno que no exista),
   `name` e `images`. El próximo id libre es el **25**; los ids nunca se
   reutilizan, porque el stock vendido se guarda por id.
3. Campos opcionales:
   - `talla:2`: los accesorios no la llevan y salen en el grupo "Accesorios".
   - `incluye:"Incluye portachupete y bolsa de tela."`: una línea bajo el
     precio en la ficha, para los sets.

Nombres de archivo: en minúsculas, sin tildes ni espacios. La foto principal va
sin letra y las demás con `a`, `b`, `c`… (`mochila-04.jpg`, `mochila-04a.jpg`).

### Ocultar una prenda sin marcarla vendida

Para sacarla de la tienda por un tiempo (por ejemplo, mientras faltan fotos),
poner `//` al comienzo de su línea en `productos.js` y quitar la coma de la línea
de arriba si era la última. No aparece en el catálogo ni se puede pagar, y sus
fotos siguen en `assets/`. Para volver a mostrarla, se deshace lo mismo.

Hoy está oculto así el **Portawipes 01** (id 24), hasta tener fotos definitivas.

### Subir los cambios

```bash
git add . && git commit -m "actualizo catálogo" && git push
```

## Fotos de producto

Todas las fotos de la tienda miden **1086 × 1448 px** (vertical 3:4), sobre
fondo blanco y con la prenda del mismo tamaño que las demás. La tienda recorta
cualquier otra proporción, así que las fotos deben llegar ya en 3:4.

### Cómo tomar la foto (lo que más pesa)

La edición solo funciona bien si la foto de origen es buena. Lo aprendido el
24/10/2026, después de varios intentos fallidos con fotos tomadas sobre la mesa:

- Colgar la prenda en la misma pared de siempre, de frente, sin zoom.
- Usar luz de día pareja: sin sol directo y sin la ventana al lado.
- Foto vertical, con la prenda entera y aire alrededor.
- Frente y espalda en el mismo lugar y a la misma distancia.
- No sirven las escenas sobre la mesa con varios objetos: al quitar el fondo,
  Adobe borra parte de lo que se ve, y la luz de ventana deja sombras duras.

### Dos caminos que funcionan

**A. Foto editada con ChatGPT** (Mochilas 01 a 04 de frente, Portawipes 01b).
No se toca, solo se ajusta al formato:

```bash
node herramientas/fotos/fotos.js vertical "<foto de ChatGPT>" assets/<nombre>.jpg
```

Si queda con el fondo gris claro, se le quita el fondo con Adobe (paso 2 del
camino B) y se deja tal cual.

**B. Foto colgada en la pared** (Chaqueta 04, Mochila 03 y 04 de espalda):

1. Si es HEIC del iPhone, convertirla:
   `powershell -ExecutionPolicy Bypass -File herramientas/fotos/heic-a-jpg.ps1 "<foto.HEIC>"`
   (el permiso vale solo para ese comando; Windows bloquea los scripts por defecto)
2. `node herramientas/fotos/fotos.js preparar <foto> <lista.jpg>` y pedirle a
   Claude que le quite el fondo con Adobe (`image_remove_background` con
   `backgroundColor: "#ffffff"`). **Sin tocar luz ni color.**
3. `node herramientas/fotos/fotos.js encuadrar <sobre-blanco.jpg> assets/<nombre>.jpg`
4. La foto de espalda se deja del mismo tamaño que la de frente:
   `node herramientas/fotos/fotos.js igualar <espalda-sobre-blanco.jpg> assets/<frente>.jpg assets/<espalda>.jpg`

### Antes de publicar

- `node herramientas/fotos/fotos.js comparar revision.jpg assets/<nuevas> assets/<anteriores>`
  y mirar las nuevas junto a las que ya están en la tienda.
- Los originales se guardan en `../3 Fotos/Productos AAAA-MM-DD`.

### Lo que no hay que hacer

- Subir saturación o luz "para que se vean más vivas": quedan forzadas.
- Igualar colores de forma automática con otra foto: deja tonos raros.
- Inventar partes de la escena para llenar el formato vertical.

Las herramientas están en `herramientas/fotos/`. Se instalan una sola vez con
`cd herramientas/fotos && npm install` y no se publican en el sitio
(`.vercelignore`).

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
No hay proceso de compilación ni `package.json` en la raíz: es HTML y JavaScript
sin más. La carpeta `herramientas/` tiene el suyo, pero `.vercelignore` la deja fuera.

Cada `git push` dispara un despliegue nuevo automáticamente.

## Dónde se ven los pedidos

En el panel de Mercado Pago, en cada pago. El detalle del pedido (qué prendas,
cómo se entrega, dirección y teléfono) queda escrito en la información
adicional del pago, con un código tipo `MA-XXXXXX`.

El sitio no guarda pedidos por su cuenta: no hay base de datos. El stock se
lleva a mano marcando `available:false`.
