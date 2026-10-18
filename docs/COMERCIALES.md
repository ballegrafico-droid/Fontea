# Fuentes comerciales y reconocimiento externo · revisión 0.5

**Registro histórico. En 0.6 se implementó el conector descrito; permanece sin activar por falta de clave. Consulta [ACTIVAR-EXTERNO.md](ACTIVAR-EXTERNO.md) y [MEJORAS-0.6.md](MEJORAS-0.6.md).**

Comprobación: 18 de octubre de 2026. No se contrató, compró ni activó ningún servicio. Las condiciones y precios pueden cambiar. Esta revisión no incorpora un reconocedor comercial automático a Fontea.

## Qué cubre realmente Bauhaus

Una consulta reproducible a `catalog/manifest.json` da **117 familias, 203 variantes y cero entradas cuyo nombre de familia o variante contenga Bauhaus**. El directorio de compra de la interfaz es independiente del catálogo de reconocimiento. Ningún archivo comercial se ha descargado ni añadido al proyecto.

«Bauhaus» no determina una única familia o archivo. Se verificaron estas referencias:

| Producto documentado | Proveedor / estilos en su ficha | Referencia oficial o del distribuidor |
| --- | --- | --- |
| ITC Bauhaus | ITC; Pro Light, Pro Medium, Pro Demi, Pro Bold, Pro Heavy | [MyFonts, ficha de ITC](https://www.myfonts.com/collections/bauhaus-font-itc) |
| Bauhaus 93 | URW Type Foundry; Std Regular, un estilo en esta ficha | [MyFonts, ficha de URW](https://www.myfonts.com/collections/bauhaus-93-font-urw/) |
| Bauhaus 93 incluida en productos Microsoft | Microsoft documenta `Bauhs93.ttf`, proveedor URW, copyright 1993 | [Microsoft Typography](https://learn.microsoft.com/en-us/typography/font-list/bauhaus-93) |

Son referencias para comprobar el nombre, no identificaciones de la imagen del usuario. El catálogo no las compara automáticamente y no se presupone que la versión distribuida por Microsoft y un archivo de compra sean binariamente idénticos. Tampoco es una lista exhaustiva de todas las fuentes que contienen «Bauhaus» en el nombre.

Identificar una fuente o enlazar su compra no necesita redistribuir el archivo. Una licencia de escritorio no autoriza por defecto alojar la fuente como webfont, instalarla en un servidor para terceros ni incorporarla a un catálogo público. Fontea solo enlaza las fichas: hay que revisar la EULA del producto y uso concreto. No etiqueta estas fuentes como gratuitas ni inventa una licencia verificada para un archivo del usuario.

## Método viable sin clave

En **Fuentes comerciales y fuera del catálogo**, Fontea permite guardar el recorte de una línea y abrir [WhatFontIs](https://www.whatfontis.com/). El usuario decide si selecciona allí la imagen. Se trata de una búsqueda externa manual sobre otro motor con fuentes gratuitas y comerciales; Fontea no envía datos, automatiza su web, extrae sus resultados ni finge que ese servicio ya esté integrado. Sus candidatos deben verificarse y sus enlaces revisarse; no se convierten en coincidencias exactas de Fontea.

El pequeño directorio comercial permite buscar por nombre dos familias documentadas. La interfaz lo distingue expresamente de una búsqueda por imagen. El enlace de compra es el verificado de MyFonts, no una URL generada a partir del nombre. La clasificación comercial no dice qué usos permite una licencia concreta.

## Integración autorizada investigada

La [documentación oficial de WhatFontIs API 2.2](https://www.whatfontis.com/API-identify-fonts-from-image.html) describe `POST https://www.whatfontis.com/api2/`, clave `API_KEY`, imagen base64 (`IMAGEBASE64=1`, `urlimagebase64`), hasta 20 candidatos y modos `fast`/`pro`. El proveedor permite integrar el reconocimiento. Exige atribución con enlace y declara uso personal gratuito; para uso comercial pide contactarles. La cuota indicada es 200 consultas diarias por clave.

La [oferta oficial de MCP y créditos](https://www.whatfontis.com/mcp.html) anuncia 200 identificaciones diarias gratuitas tras registrarse y prepago de **1 USD por 1.000 créditos**, consumidos después de esa cuota. Enterprise tiene presupuesto personalizado. Esa tarifa publicada no acredita por sí sola autorización comercial de la API REST para una aplicación alojada. No confundimos la suscripción PRO de la web con API/créditos. No se ha creado ninguna cuenta, obtenido clave, comprado crédito ni realizado una consulta de reconocimiento al proveedor.

La respuesta REST documentada incluye nombre, ficha en WhatFontIs, imágenes de muestra, etiqueta Free/Commercial y nombre del sitio de origen. **No incluye una URL oficial de compra verificada ni una prueba de identidad**, y sus imágenes de muestra no son necesariamente el texto del usuario. No se debe fabricar una URL de compra o licencia a partir de esos datos.

Para activar una integración automática faltan:

1. Confirmación del proveedor sobre el uso comercial de Fontea, conservación de imágenes, presentación/almacenamiento de resultados y tarifa/cuota aplicable. La documentación pública tiene un límite personal y una oferta de créditos cuya relación comercial necesita aclaración.
2. Una clave privada, configurada por el propietario en el servidor; nunca en Vite, JavaScript público o este repositorio. No la envíes por una captura o un comentario de PR.
3. Adaptador del servidor con tiempo límite, cuota persistente sin rebasamiento automático de gasto, atribución y envío explícito del recorte. Nada de fuentes propias del usuario al proveedor. La vista estática actual no puede guardar una clave en secreto: requiere ese backend.
4. Resultados externos separados, procedencia y licencias desconocidas cuando corresponda; verificación del enlace de la fundición/distribuidor antes de marcarlo oficial. No reutilizar umbrales de distancia locales como si fueran probabilidades del otro motor.
5. Evaluación independiente con ejemplos comerciales etiquetados y autorizados. Ni el catálogo ni la documentación verifican que el proveedor vaya a distinguir todas las versiones de Bauhaus del logo.

Se preparó el acceso manual utilizable, no un adaptador vacío con resultados de demostración. No se encontró ni se presume una API pública autorizada de MyFonts/WhatTheFont o Fontspring que pueda automatizarse gratuitamente; no se usa scraping ni sus imágenes de espécimen como un catálogo de fuentes redistribuible.

## Comparar un archivo propio

Disponible sin clave, incluso con fuentes externas al catálogo. El usuario elige un TTF u OTF de hasta 8 MB que tenga permiso para utilizar localmente. El archivo permanece en memoria del navegador y de un Worker; no se envía al servidor ni al proveedor, no se instala en un servicio, no se guarda en IndexedDB/localStorage y no se publica. «Retirar archivo» elimina las referencias de la sesión; el cierre o un nuevo recorte también las descarta. La liberación física de memoria depende del recolector del navegador.

Se leen familia/estilo/versión/PostScript declarados y los ejes variables reales. Un lector SFNT acotado verifica tablas y cobertura de cada carácter para evitar sustituciones de glifos, y el navegador valida el archivo mediante FontFace. La versión inicial admite TTF/OTF individuales con contornos TrueType o CFF; no TTC, WOFF/WOFF2, Type 1, fuentes cifradas ni todos los posibles SFNT heredados. Una fuente de más de 8 MB se rechaza, aunque exista en el catálogo abierto. No se interpreta su metadata como licencia verificada.

Se renderiza el texto corregido, se comparan contornos/proporciones y se muestra superposición. La distancia conserva la fórmula y filtros de calidad anteriores. Un ajuste útil exige distancia ≤0,20, proporción dentro de 1,2× y muestra suficiente; no se afirma identificación exacta. Se puede mostrar el render de un mal ajuste para inspección, rotulado explícitamente como insuficiente. Se rechazan varias líneas antes de renderizar. Los ejes se eligen de forma explícita, sin inventar una variante comercial por el peso más cercano del catálogo.
