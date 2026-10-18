# Motor, fuentes de datos y límites

## Investigación y decisión

Revisión realizada el 17 de octubre de 2026:

- [Tesseract](https://github.com/tesseract-ocr/tesseract): proyecto real, OCR local, licencia Apache 2.0. Ejecutamos la CLI instalada; no es un identificador tipográfico. Se verificó la página (HTTP 200), la instalación y su salida sobre nuestras imágenes. Por defecto se usa `spa+eng`, dando prioridad al español. La interfaz permite releer con prioridad español/inglés de forma explícita; la API valida ambos valores. Se incluyen los datos oficiales sin modificar de [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast), con licencia Apache 2.0, revisión y hashes en `engine/tessdata/manifest.json`. No se descargan modelos al analizar imágenes.
- [Repositorio oficial Google Fonts](https://github.com/google/fonts): archivos TTF y `OFL.txt` accesibles sin clave mediante HTTPS. Se descargaron fuentes **sin modificar** y licencias a una revisión fija registrada en `catalog/manifest.json`. No se usa scraping de previews ni una supuesta API de identificación de Google. [Documentación de uso](https://fonts.google.com/knowledge/using_type/using_web_fonts) accesible (HTTP 200).
- Se intentó consultar la página de WhatTheFont de MyFonts; devolvió HTTP 403 en este entorno. No hemos validado condiciones de una API comercial, credenciales, cobertura, coste ni permiso de automatización. No se integra ni se hacen afirmaciones sobre ella.
- No se utiliza un modelo de visión, servicios de pago ni claves externas. Una futura integración requiere verificar términos y autorización de costes primero.

## Flujo implementado

1. El navegador valida firma básica, tamaño y dimensiones, permite pegar/arrastrar/seleccionar una imagen y genera el recorte con Canvas. El recorte se envía como PNG; el original no se envía al servidor. El recorte elimina metadatos EXIF. El backend comprueba formato real con Pillow, tamaño, dimensiones y número de cuadros de cada archivo recibido.
2. Tesseract procesa PNG por stdin/stdout (`psm 6`), con un límite de 15 segundos y los datos ingleses/españoles incluidos en el proyecto. La versión 0.2 normaliza la polaridad, usa la altura de tinta para ampliar como máximo 3× y añade un margen de 16 px; conserva grises para no perder tildes. Se avisa de varias líneas o palabras dudosas. El usuario puede corregir o escribir el texto; no se necesita que el OCR acierte para continuar.
3. El motor prepara una máscara usando Otsu, polaridad a partir del borde y supresión de componentes de 1 píxel. Se limita el lienzo de análisis a 2200 × 500.
4. Renderiza la transcripción con Pillow/FreeType para las 66 variantes autorizadas. Compara tres espaciados (-0,8/0/+0,8 píxeles a 96 px) y, en fuentes con eje óptico, el valor predeterminado y el máximo del archivo. Se mantiene el peso/cursiva del candidato; no se exploran todos los valores variables.
5. La distancia combina diferencia de intersección/unión de máscaras (0,62), distancia de contornos bidireccional (0,28) y diferencia de proporciones (0,10). Para contornos se normalizan alto y ancho; la pérdida de proporción tiene su penalización independiente. **No es una probabilidad, un porcentaje de acierto ni una medida calibrada entre imágenes distintas.**
6. Filtro experimental: distancia <=0,155, al menos cinco letras distintas, altura de tinta >=24, contraste >=50 y sin aviso heurístico de varias líneas. Entre las primeras posiciones, solo se proponen hasta tres variantes dentro de 0,025 de la mejor. Las restantes son alternativas, o todas lo son si no se supera el filtro. Las etiquetas siempre conservan la incertidumbre. Una fuente ajena puede parecerse mucho y superar el filtro.
7. Las tarjetas muestran PNG generados a partir del archivo concreto comparado. La superposición normaliza ambos ejes y se etiqueta expresamente. La descarga entrega el archivo original: si es variable contiene otros pesos además del comparado. Los enlaces de origen y licencias son del manifiesto, no del OCR ni de generación de texto.

## Cobertura

17 familias: Inter, Roboto, Open Sans, Montserrat, Lato, Poppins, Lora, Playfair Display, Source Serif 4, Roboto Mono, Oswald, Nunito Sans, Raleway, DM Sans, Bitter, Fira Sans y Libre Franklin. Regular 400 y Bold 700, en recta y cursiva, salvo Oswald (solo recta): 66 variantes. Ancho y otros ejes se mantienen por defecto; se exploran dos tamaños ópticos cuando existen. La SIL OFL 1.1 permite uso personal/comercial, incrustación y redistribución bajo sus condiciones. Mantén los avisos de copyright y licencia; no vendas las fuentes por separado. Revisa el texto de cada familia para nombres reservados y demás condiciones. No cubre fuentes con licencia solo personal.

Consulta los archivos y enlaces exactos en [el manifiesto](../catalog/manifest.json); hashes SHA-256 para verificar que no se han modificado. `scripts/fetch_catalog.py` reproduce la descarga fijada a esa revisión. No se sincroniza con “latest” al arrancar. Las diecisiete licencias se incluyen en `catalog/licenses` y se sirven al usuario.

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
