# Mano y Aguja — notas del sitio

Sitio: https://www.tallermanoyaguja.com

## Cómo está armado

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Todo el catálogo y el carrito. Es una sola página. |
| `productos.js` | **Las prendas y los precios.** Único archivo que hay que tocar para el día a día. |
| `gracias.html` | La página a la que vuelve el cliente después de pagar. |
| `api/crear-preferencia.js` | Le pide a Mercado Pago el cobro. No se toca. |

## Tareas del día a día

Todas se hacen editando **`productos.js`** y subiendo el cambio. El sitio se
actualiza solo un par de minutos después.

### Marcar una prenda como vendida

Buscar la prenda y cambiar `available:true` por `available:false`.

```js
{ id:2, name:"Chaqueta 02", price:PRECIO_CHAQUETA, category:"Chaquetas", available:false, images:[...] },
```

Queda visible en el catálogo con el cartel "Reservada", pero ya no se puede
agregar al carrito ni pagar. El servidor también la rechaza, así que no hay
riesgo de vender dos veces la misma prenda.

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

    Settings → Environment Variables → MP_ACCESS_TOKEN

Si alguna vez se filtra, hay que regenerarlo desde el panel de desarrolladores
de Mercado Pago y actualizarlo en Vercel.

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
