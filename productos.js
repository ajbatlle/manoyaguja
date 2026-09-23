/*
  Fuente unica de verdad de productos, precios y despachos.
  La usan DOS lados:
    - el navegador (index.html), para mostrar el catalogo
    - la funcion de Netlify, para calcular el total real que se le cobra al cliente

  El precio NUNCA se toma de lo que manda el navegador: el servidor lo busca aca
  por id. Si alguien manipula el carrito desde la consola, el cobro no cambia.

  Para cambiar precios o agregar prendas, se edita SOLO este archivo.
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PRODUCTS_DATA = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  var PRECIO_CHAQUETA = 60000;
  var PRECIO_PANTALON = 20000;

  var PRODUCTS = [
    { id:1,  name:"Chaqueta 01", price:PRECIO_CHAQUETA, category:"Chaquetas",  talla:2, available:true, images:["assets/chaqueta-azul-roja1.png","assets/chaqueta-azul-roja.png"] },
    { id:2,  name:"Chaqueta 02", price:PRECIO_CHAQUETA, category:"Chaquetas",  talla:2, available:false, images:["assets/chaqueta-cuadros.png","assets/chaqueta-cuadros1.png"] },
    { id:3,  name:"Chaqueta 03", price:PRECIO_CHAQUETA, category:"Chaquetas",  talla:4, available:true, images:["assets/chaqueta-verde.png","assets/chaqueta-verde1.png"] },

    { id:4,  name:"Pantalón 01", price:PRECIO_PANTALON, category:"Pantalones", talla:4, available:true, images:["assets/pantalon.png"] },
    { id:5,  name:"Pantalón 02", price:PRECIO_PANTALON, category:"Pantalones", talla:4, available:true, images:["assets/pantalon1.png"] },
    { id:6,  name:"Pantalón 03", price:PRECIO_PANTALON, category:"Pantalones", talla:4, available:false, images:["assets/pantalon2.png"] },
    { id:7,  name:"Pantalón 04", price:PRECIO_PANTALON, category:"Pantalones", talla:1, available:true, images:["assets/pantalon3.png"] },
    { id:8,  name:"Pantalón 05", price:PRECIO_PANTALON, category:"Pantalones", talla:1, available:true, images:["assets/pantalon4.png"] },
    { id:9,  name:"Pantalón 06", price:PRECIO_PANTALON, category:"Pantalones", talla:1, available:true, images:["assets/pantalon5.png"] },
    { id:10, name:"Pantalón 07", price:PRECIO_PANTALON, category:"Pantalones", talla:1, available:true, images:["assets/pantalon6.png"] },
    { id:11, name:"Pantalón 08", price:PRECIO_PANTALON, category:"Pantalones", talla:1, available:true, images:["assets/pantalon7.png"] },
    { id:12, name:"Pantalón 09", price:PRECIO_PANTALON, category:"Pantalones", talla:1, available:true, images:["assets/pantalon8.png"] },
    { id:13, name:"Pantalón 10", price:PRECIO_PANTALON, category:"Pantalones", talla:1, available:true, images:["assets/pantalon9.png"] },
    { id:14, name:"Pantalón 11", price:PRECIO_PANTALON, category:"Pantalones", talla:1, available:true, images:["assets/pantalon10.png"] },
    { id:15, name:"Pantalón 12", price:PRECIO_PANTALON, category:"Pantalones", talla:2, available:false, images:["assets/pantalon11.png"] }
  ];

  // Opciones de despacho. El precio tambien se valida en el servidor.
  var ENVIOS = [
    {
      id: "retiro",
      label: "Retiro en el taller",
      detalle: "Coordinamos día y hora por WhatsApp una vez confirmado el pago.",
      price: 0,
      pideDireccion: false
    },
    {
      id: "santiago",
      label: "Despacho en Santiago",
      detalle: "Entrega dentro de la Región Metropolitana.",
      price: 3500,
      pideDireccion: true
    },
    {
      id: "regiones",
      label: "Despacho a regiones",
      detalle: "El envío se paga al recibir. Te escribimos por WhatsApp para coordinarlo.",
      price: 0,
      pideDireccion: false
    }
  ];

  return {
    PRECIO_CHAQUETA: PRECIO_CHAQUETA,
    PRECIO_PANTALON: PRECIO_PANTALON,
    PRODUCTS: PRODUCTS,
    ENVIOS: ENVIOS,
    MATERIALES: "Telas compradas en el barrio Rosas y retazos reutilizados.",
    CUIDADO: "Lavar a mano o máquina en frío. No usar secadora. Planchar a temperatura media.",
    CATEGORIES: ["Todas","Chaquetas","Pantalones"],
    WHATSAPP: "56987362295",
    MONEDA: "CLP"
  };
});
