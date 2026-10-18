# Fontea 0.5 · comprobación privada y fuentes comerciales

Se continúa sobre `codex/fontea-v1`, partiendo de `3ebcb1d`, y se conserva todo el historial, incluido `21f1e73`. No se ha incorporado una alternativa gratuita como si fuese Bauhaus. No se han recibido en este entorno las capturas ni el original del logo: **el logo del usuario no está identificado ni evaluado**.

## Qué puede probarse

1. Sube o pega una imagen, recorta una sola línea, deja leer el OCR y corrige la transcripción.
2. «Buscar en el catálogo» conserva las 117 familias / 203 variantes abiertas, con búsqueda en dos etapas, candidatos sin identidad confirmada y alternativas filtradas. **Cero variantes de Bauhaus**.
3. Abre «¿Tienes el archivo? Compara tu propia fuente», elige un **TTF u OTF individual de hasta 8 MB**, comprueba familia/estilo/versión declarados y ajusta sus ejes variables si existen. Compara el render y los contornos reales. Un mal ajuste se muestra como insuficiente, sin convertirlo en una fuente similar ni exacta.
4. Corrige el OCR si hace falta: se descarta la comparación anterior, conservando el archivo en memoria hasta retirarlo, cambiar el recorte o cerrar la página. «Retirar archivo de esta sesión» elimina sus referencias y resultado.
5. En «Fuentes comerciales y fuera del catálogo» puedes guardar tu recorte y abrir el identificador externo WhatFontIs. Tú seleccionas allí la imagen. Buscar «Bauhaus» en el directorio muestra ITC Bauhaus y Bauhaus 93 como **referencias por nombre**, con fichas de compra verificadas; no son resultados del logo.

El archivo tipográfico propio no sale del navegador, tampoco usando el backend Node/Python. No se añade al catálogo, descarga pública, caché de almacenamiento ni proveedor. La comparación no verifica procedencia o licencia, y no significa que se pueda redistribuir una fuente comercial. El lector rechaza contenedores TTC/WOFF/WOFF2, archivos corruptos y tamaños superiores al límite; el navegador valida los contornos. Si faltan caracteres, se rechaza el texto en vez de utilizar glifos de sustitución.

## Varias líneas y calidad

Ambas vías comprueban geometría, número de líneas del OCR y saltos explícitos. Un recorte con varias líneas se bloquea antes de la comparación tipográfica; editar el OCR para unir palabras no evita el bloqueo. La interfaz permite volver al mismo recorte y seleccionar una línea, explicando que puede haber varias tipografías. La heurística no garantiza detectar todas las composiciones o mezclas en una misma línea: esos fragmentos deben separarse manualmente.

Se conserva la fórmula de distancia, el umbral de originales de 0,155/margen 0,025, el de alternativas de 0,20 y la compatibilidad de proporciones 1,2×. Para el archivo propio, «ajuste útil» usa el mismo límite visual de alternativas y filtros de calidad; no se convierte en una identificación original. Una muestra corta puede tener distancia baja y aun así no aportar evidencia suficiente. No se cambian umbrales para aceptar Bauhaus ni para mejorar las métricas.

También se corrigió el ancho de los renders en móvil para que la línea completa quepa en la tarjeta. Las superposiciones mantienen sus proporciones normalizadas y el algoritmo sigue contando las proporciones originales en la distancia.

## Pruebas nuevas

- **16 pruebas Node**, todas aprobadas: las 12 API existentes y cuatro de metadatos/límites/cobertura real. Se revisan los 165 archivos distintos del catálogo: 164 admitidos para comparación privada; Gamja Flower supera el límite de 8 MB y se rechaza, como debe hacerse. Se prueban tablas truncadas, offsets imposibles, archivos comprimidos no admitidos y caracteres ausentes.
- **13 controles del comparador privado, en navegador estático y en aplicación con servidor**: Inter 700, Roboto 400, Caveat 400, Fredoka 700, DejaVu Serif Bold, DejaVu Sans Oblique y Nimbus Roman Regular OTF/CFF, renderizados con FreeType. Los siete archivos correspondientes dan un ajuste útil, sin afirmar identidad. Un archivo incorrecto da distancia 0,430 y no pasa; una palabra con pocas letras y una muestra de baja resolución tampoco pasan. Dos fuentes en dos líneas, señal OCR de dos líneas y salto explícito se bloquean sin renderizar un candidato.
- En las peticiones observadas al comparar el archivo no hay POST, descarga del índice ni de fuentes del catálogo. En modo servidor sí se envía previamente el recorte para OCR, pero **no el archivo de fuente**. No se solicitan servicios externos en ninguna de estas pruebas.
- Escritorio y anchos 320/390/768/1440: controles, archivo real, ejes, corrección OCR conservando fuente, eliminación, formato inválido, render completo y overlay. Chromium con viewport móvil, no un teléfono físico ni Safari/Firefox.
- Se repite el flujo de subida/pegado, recorte, OCR real, relectura en inglés, cancelación y siguientes trabajos, búsqueda, enlaces y formato inválido. La imagen de dos familias no permite buscar aunque se edite el OCR para unirlo; después se recorta su línea superior y se completa un análisis real por separado.

Registros: [navegador](revision-0.5/local-font-browser.json), [modo servidor](revision-0.5/local-font-server.json), capturas [móvil](revision-0.5/local-font-mobile.png) y [escritorio](revision-0.5/local-font-desktop.png). Las 13 pruebas reciben texto revisado; no son una medición de exactitud automática OCR. Sus tiempos medianos de Worker fueron aproximadamente **232 ms y 207 ms**, respectivamente, en un navegador ya abierto, con otras pruebas ejecutándose a la vez. No incluyen la selección/lectura inicial del archivo ni constituyen un benchmark independiente del dispositivo.

## Regresión medida antes/después

Se construye el Worker 0.4 desde el commit `3ebcb1d` y el nuevo desde la fuente actual; ambos usan las mismas dependencias de regiones/recuperación, catálogo e imágenes independientes existentes. Catorce muestras, 28 observaciones, alternando orden con proceso/perfil Chromium nuevo en cada observación: ocho variantes catalogadas (incluyendo cursiva, decorativas y degradadas), dos externas, dos varias líneas y dos calidad insuficiente. No se ha ajustado el motor sobre estas muestras. Para reproducir esta regresión se necesita el historial Git, disponible en la rama o en el bundle, además de las imágenes generadas. [Registro completo](revision-0.5/regression.json), [script reproducible](../benchmarks/revision05.py).

| Medida | Antes 0.4 | Después 0.5 |
| --- | ---: | ---: |
| Familias / variantes primeras correctas en ocho cubiertas | 8 / 8 | 8 / 8 |
| Cubiertas con propuestas que incluyen variante correcta | 6 / 8 | 6 / 8 |
| Propuestas que excluyen la variante real | 0 | 0 |
| Externas con propuestas originales | 0 / 2 | 0 / 2 |
| Recortes de varias líneas bloqueados | 2 / 2 | 2 / 2 |
| Tiempo mediano, 14 casos incluidos controles | 1,550 s | 1,606 s |
| PSS máximo por observación: mediana | 602,05 MiB | 603,08 MiB |
| Mayor PSS observado | 697,02 MiB | 681,87 MiB |

No hay diferencias de estado, ranking, IDs de candidatos, distancias de alternativas o número de variantes comparadas. Se repitió la medición después de añadir un error comprensible para navegadores sin FontFace en Worker; el [primer registro](revision-0.5/initial-regression-run.txt) se conserva y la tabla corresponde al Worker final. La diferencia temporal y de memoria se trata como variación de esta ejecución, **no como una mejora demostrada de rendimiento**. El PSS incluye procesos descendientes de la prueba (Chromium y su driver Playwright); no es el heap del comparador, un móvil físico ni el consumo del VPS. Por eso no se compara directamente esta memoria con el protocolo de 0.4, que tenía otra raíz de muestreo.

Se conservan las 76 muestras, los resultados y los errores de pesos intermedios de [0.4](MEJORAS-0.4.md). Esta revisión no corrige ni oculta esos errores y no anuncia precisión general. El catálogo no crece en esta revisión: el archivo privado es una comprobación aparte, sin cambiar la cobertura anunciada.

## Reconocimiento comercial: lo resuelto y lo pendiente

Se verificaron productos y enlaces de Bauhaus, y la existencia/condiciones de WhatFontIs API 2.2. [Fuentes, tarifa publicada y pasos pendientes](COMERCIALES.md). La búsqueda externa manual y el archivo privado funcionan sin clave; la API remota **no está integrada ni activada**. Antes de hacerlo hay que aclarar autorización comercial y conservación de datos con el proveedor, obtener una clave privada y evaluar resultados comerciales reales. No se contratan créditos ni se activa gasto automático.

El usuario puede probar ahora su archivo propio en la vista alojada. Para contrastar específicamente el logo falta recibir la imagen original o, al menos, una captura realmente adjunta y datos de la versión/fundición. No se pide redistribuir un archivo comercial en el repositorio. Ubuntu/Nginx mantiene puerto configurable, sin cambios en otras aplicaciones ni acceso al VPS.
