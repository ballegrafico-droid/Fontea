# Motor, fuentes de datos y límites

## Investigación y decisión

Revisión realizada el 17 de octubre de 2026:

- [Tesseract](https://github.com/tesseract-ocr/tesseract): proyecto real, OCR local, licencia Apache 2.0. Ejecutamos la CLI instalada; no es un identificador tipográfico. Se verificó la página (HTTP 200), la instalación y su salida sobre nuestras imágenes. Por defecto se usa `spa+eng`, dando prioridad al español. La interfaz permite releer con prioridad español/inglés de forma explícita; la API valida ambos valores. Se incluyen los datos oficiales sin modificar de [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast), con licencia Apache 2.0, revisión y hashes en `engine/tessdata/manifest.json`. No se descargan modelos al analizar imágenes.
- [Repositorio oficial Google Fonts](https://github.com/google/fonts): archivos TTF y `OFL.txt` accesibles sin clave mediante HTTPS. Se descargaron fuentes **sin modificar** y licencias a una revisión fija registrada en `catalog/manifest.json`. No se usa scraping de previews ni una supuesta API de identificación de Google. [Documentación de uso](https://fonts.google.com/knowledge/using_type/using_web_fonts) accesible (HTTP 200).
- Se intentó consultar la página de WhatTheFont de MyFonts; devolvió HTTP 403 en este entorno. No hemos validado condiciones de una API comercial, credenciales, cobertura, coste ni permiso de automatización. No se integra ni se hacen afirmaciones sobre ella.
- No se utiliza un modelo de visión ni servicios contratados. El motor local no usa claves. En 0.6 existe un conector opcional WhatFontIs con clave privada y controles de acceso, desactivado en esta entrega.

## Flujo implementado

1. El navegador valida firma básica, tamaño y dimensiones, permite pegar/arrastrar/seleccionar una imagen y genera el recorte con Canvas. El recorte se envía como PNG; el original no se envía al servidor. El recorte elimina metadatos EXIF. El backend comprueba formato real con Pillow, tamaño, dimensiones y número de cuadros de cada archivo recibido.
2. Tesseract procesa PNG por stdin/stdout (`psm 6`), con un límite de 15 segundos y los datos ingleses/españoles incluidos en el proyecto. La versión 0.2 normaliza la polaridad, usa la altura de tinta para ampliar como máximo 3× y añade un margen de 16 px; conserva grises para no perder tildes. Se avisa de varias líneas o palabras dudosas. El usuario puede corregir o escribir el texto; no se necesita que el OCR acierte para continuar.
3. El motor prepara una máscara usando Otsu, polaridad a partir del borde y supresión de componentes de 1 píxel. Se limita el lienzo de análisis a 2200 × 500.
4. Preselecciona hasta 32 variantes mediante el índice de glifos, sin abrir todos los TTF. Renderiza la transcripción con Pillow/FreeType para las variantes seleccionadas entre las 203 autorizadas. Compara tres espaciados (-0,8/0/+0,8 píxeles a 96 px) y, en fuentes con eje óptico, el valor predeterminado y el máximo del archivo. Se mantiene el peso/cursiva del candidato; no se exploran todos los valores variables.
5. La distancia detallada combina diferencia de intersección/unión de máscaras (0,62), distancia de contornos bidireccional (0,28) y diferencia de proporciones (0,10). Para contornos se normalizan alto y ancho; la pérdida de proporción tiene su penalización independiente. **No es una probabilidad, un porcentaje de acierto ni una medida calibrada entre imágenes distintas.**
6. Filtro experimental: distancia <=0,155, al menos cinco letras distintas, altura de tinta >=24, contraste >=50 y sin aviso heurístico de varias líneas. Entre las primeras posiciones, solo se proponen hasta tres variantes dentro de 0,025 de la mejor. Las restantes son alternativas, o todas lo son si no se supera el filtro. Las etiquetas siempre conservan la incertidumbre. Una fuente ajena puede parecerse mucho y superar el filtro.
7. Las tarjetas muestran PNG generados a partir del archivo concreto comparado. La superposición normaliza ambos ejes y se etiqueta expresamente. La descarga entrega el archivo original: si es variable contiene otros pesos además del comparado. Los enlaces de origen y licencias son del manifiesto, no del OCR ni de generación de texto.

## Cobertura

117 familias / 203 variantes: las 17 anteriores y 100 ampliadas con estilos manuscritos, lúdicos/decorativos y titulares. La lista exacta, pesos, cursivas y ejes se conserva en `catalog/manifest.json`; no se presupone que cada familia tenga cuatro variantes. 202 variantes cubren todos los caracteres españoles acentuados; Gamja Flower no los incluye. Se exploran los tamaños ópticos anteriores, no todos los ejes continuos. SIL OFL 1.1 verificada por familia; conserva licencias, copyright y nombres reservados al redistribuir. No se incluyen fuentes de licencia comercial cerrada ni solo personal.

Consulta los archivos y enlaces exactos en [el manifiesto](../catalog/manifest.json); hashes SHA-256 para verificar que no se han modificado. `scripts/fetch_catalog.py` reproduce la descarga fijada a esa revisión. No se sincroniza con “latest” al arrancar. Las 117 licencias se incluyen en `catalog/licenses` y se sirven al usuario.

## Arquitectura y ampliación

React/TypeScript (Vite) → API Express → un proceso Python por operación. El contrato de OCR es `{text,lineCount,needsReview}`; el de identificación es `{status,candidates,alternatives,reasons,quality,text,catalog,normalizedSource,method}`. La API no recibe URLs remotas ni rutas, solo archivos. No hay base de datos, historial ni sesiones. Un único proceso pesado por instancia, 20 peticiones API por IP/minuto y 45 segundos de timeout de motor por defecto. En caso de desconexión o timeout se mata el grupo de procesos, incluido Tesseract. No se crean imágenes temporales.

El catálogo está separado del algoritmo: el manifiesto declara ID, familia, variante, ejes, archivo original, hash, origen, ficha oficial y licencia. Para añadir fuentes abiertas, incorpora sus archivos y licencia verificada, añade entradas al manifiesto y vuelve a evaluar con un conjunto reservado. El coste de búsqueda crece linealmente; no añadas miles de archivos al bucle sin un índice de candidatos previo.

Para una API externa, mantén un adaptador en el servidor que devuelva ese contrato con procedencia verificable, licencia/enlace verificados o explícitamente desconocidos, y evidencia visual real. Separa resultados de proveedores; no combines distancias incompatibles ni uses su score como probabilidad. Claves exclusivamente en variables privadas. No implementamos una integración comercial ficticia ni una interfaz que presuponga que ya existe.

## Límites importantes

Solo texto latino, una línea, 3–80 caracteres, fondo uniforme y texto aproximadamente horizontal. No corrige perspectiva, curvatura, inclinación, efectos, logotipos modificados ni mezclas de fuentes. La comprobación heurística de líneas no detecta todos esos casos. El tamaño óptico, hinting, rasterizador, compresión y espaciado pueden variar. El texto incorrecto perjudica toda la comparación. La versión no conoce todas las fuentes del mundo y no puede excluir clones indistinguibles. No hay ninguna etiqueta “exacta”.

Los resultados de evaluación se documentan en [MEJORAS-0.2.md](MEJORAS-0.2.md) y el informe histórico [TESTING.md](TESTING.md). Son muestras sintéticas con un rasterizador distinto al motor; no establecen precisión general en material de diseño real. No se han probado fotografías reales etiquetadas por una fundición ni un corpus comercial independiente.

## Modalidad de navegador (0.3)

`npm run build:web` activa un adaptador explícito mediante `VITE_ENGINE_TARGET=browser`. `src/browser/client.ts` ejecuta Tesseract.js 6 / WASM con los modelos fijados de español/inglés. `src/browser/matcher.worker.ts` carga los originales del manifiesto con FontFace en un Worker y renderiza las variantes con Canvas. La fórmula, los filtros de calidad, umbral 0,155 y margen 0,025 se conservan. El remuestreo y el rasterizador pueden producir distancias distintas: no se intercambian las cifras de precisión entre motores. El transformado de distancia euclídea es separable y exacto, no una respuesta de un modelo de visión.

El contrato de resultado es el mismo que el servidor. Una sola operación por pestaña; límite de imagen antes de recortar, máximo de 90 s y terminación de Workers al cancelar. La inicialización asíncrona de Tesseract puede acabar antes de poder terminar su Worker, manteniendo ocupado el analizador durante ese intervalo. Si faltan capacidades del navegador o falla un archivo, se muestra un error; no se devuelven resultados prefijados ni se envían imágenes a otro proveedor.

El script de construcción comprueba SHA-256 de fuentes, licencias y modelos antes de copiarlos. Todos los recursos proceden del mismo sitio, con caché HTTP normal de archivos públicos; no se almacenan imágenes ni transcripciones. La compilación incluye las licencias de Tesseract.js y su núcleo. [Evaluación separada](MEJORAS-0.3.md), incluidas muestras Pillow para evitar basarse únicamente en el rasterizador Canvas del comparador. Los resultados de la evaluación 0.2 corresponden exclusivamente al motor Python.

## Revisión 0.4

El OCR conserva `lineCount`. La interfaz, la API y el comparador impiden comparar una imagen con varias líneas contra una sola línea renderizada. `needs_crop` devuelve cero candidatas/alternativas y cero comparaciones; no se carga el índice para ese recorte. El agrupado de cuerpos de línea ignora marcas pequeñas y junta separaciones de acentos. No detecta de forma fiable varias fuentes en la misma línea: el usuario debe recortar cada fragmento.

`engine/retrieval.py` y `src/browser/retrieval.ts` recomponen la transcripción usando datos de glifos a 32px con avances/kerning. La comparación inicial procesa todas las variantes compatibles; selecciona 24 mejor puntuadas y hasta ocho familias adicionales, máximo 32. Solo esas fuentes originales pasan a la comparación detallada. Puede haber omisiones: se mide recuperación del índice separada de precisión y abstención. El índice comprimido y su SHA están en el manifiesto y se verifican al construir y ejecutar. No es un score de identidad.

El filtro de originales sigue en 0,155/margen 0,025. Alternativas: distancia <=0,20 y proporciones dentro de 1,2×, sin avisos de calidad; si ninguna supera el filtro no se muestran fuentes como similares. [Cobertura, errores, tiempo y memoria antes/después](MEJORAS-0.4.md). Los informes antiguos 0.2/0.3 son históricos y no describen la cobertura actual.

## Revisión 0.5: archivos privados y reconocimiento externo

El Worker admite `operation: local-font`, que comparte la preparación, detección de líneas, renderizado y distancia del catálogo, sin llamar a su índice ni a sus fuentes. `local-font-info.ts` verifica un SFNT TTF/OTF acotado, sus metadatos, ejes y cmap. `local-font.ts` gestiona un Worker efímero con cancelación y límite de 30 segundos; no hay endpoint de subida de fuentes, caché persistente ni proveedor externo. Incluso cuando OCR e identificación usan Node/Python, la comparación de ese archivo siempre usa el navegador. Los criterios del reconocimiento existente no cambian.

Las referencias comerciales se buscan por nombre, no por imagen, y no se cuentan como variantes del catálogo. Se documentan Bauhaus 93 e ITC Bauhaus por separado. El acceso externo es manual y explícito; no se envía la imagen automáticamente ni se incorporan resultados ajenos. [Condiciones verificadas y arquitectura pendiente de la integración](COMERCIALES.md), [pruebas nuevas](MEJORAS-0.5.md).

## Revisión 0.6: recuperación externa implementada

`server/providers/whatfontis.ts` implementa la petición REST oficial a `https://www.whatfontis.com/api2/`, con `FREEFONTS=0`, imagen base64, modo fast y límite 20, sin nombre de fuente prefijado. Valida la respuesta y los enlaces del identificador; no devuelve sus campos como identidades, licencias o probabilidades verificadas. No recibe ni descarga archivos tipográficos comerciales.

Node monta el router `/api/external` y conserva un contador protegido en disco; la vista alojada usa `hosting/worker.ts` y una reserva SQL atómica en D1. Solo se procesa un trabajo por proceso/isolate y se aplica el presupuesto antes del contacto con el proveedor. Las imágenes no se persisten. Sin clave o acceso permitido el motor no se invoca. El límite de Fontea no acredita el saldo de una cuenta del proveedor compartida con otras aplicaciones.

El navegador comprueba la muestra en el Worker existente, sin cargar el índice ni fuentes del catálogo. Envía solo una máscara del recorte con margen, máximo 2 MB y 2200 × 600. El servidor vuelve a comprobar el PNG, su CRC, una descompresión limitada y sus regiones: no confía solo en el número de líneas del cliente. El proveedor hace su lectura de la imagen; el contrato REST documentado no incluye el texto corregido como pista, y no se inventa ese parámetro.

La petición tiene 25 segundos de límite, una sola tentativa y no sigue redirecciones: se utiliza `manual` y se rechazan 3xx para ser compatible con Workers sin reenviar la clave a otra URL. Se acotan las respuestas a 512 KB y los resultados a 20. Cancelar puede consumir una consulta ya enviada. Errores y resultados vacíos no se sustituyen por fuentes locales ni por un nombre conocido del usuario. [Activación](ACTIVAR-EXTERNO.md), [validación y límites](MEJORAS-0.6.md).
