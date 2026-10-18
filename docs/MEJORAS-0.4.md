# Fontea 0.4: varias líneas, alternativas y catálogo ampliado

Se continúa sobre `61e6ffb`, en `codex/fontea-v1` y la misma PR #1. Se conservan todos los commits anteriores. No se ha accedido a un VPS ni contratado servicios.

## Fallo investigado y cambio

En 0.3, el OCR avisaba de varias líneas, pero el botón de comparación seguía disponible. El comparador normalizaba la transcripción como una sola línea y podía comparar toda la composición con ella. Además, siempre devolvía las mejores alternativas, aunque fueran lejanas; “mejor entre 66” no significaba “visualmente útil”.

Ahora la interfaz conserva la información de líneas del OCR aunque se edite el texto, bloquea Buscar y pide **Seleccionar una línea**. La guía explica que puede haber varias tipografías, incluso dentro de una línea, y pide analizar cada fragmento con una única fuente. El recorte restablece el estado y ejecuta un OCR nuevo. La API valida el número de líneas; el motor también detecta cuerpos de texto separados y bloquea transcripciones con saltos de línea. Un resultado `needs_crop` devuelve cero candidatas, cero alternativas y cero comparaciones detalladas. El índice y las fuentes no se cargan para esa operación. La detección agrupa acentos/puntos antes de contar cuerpos de línea; es una heurística, no segmentación universal ni detector fiable de cambios de fuente en la misma línea.

Las alternativas se muestran solo con distancia <=0,20 y proporciones dentro de 1,2×, sobre una muestra con calidad suficiente. La fórmula existente implica además un solapamiento normalizado mínimo aproximado de 0,677 cuando se supera ese límite. Las demás se descartan, aunque sean las menos malas del catálogo. La interfaz dice **No encontramos alternativas útiles** cuando no queda ninguna. Las candidatas originales mantienen el filtro 0,155, margen 0,025 y exigencias de calidad: no se rebajan para admitir más resultados. Ninguna se etiqueta como identidad exacta.

La prueba de cancelación descubrió una carrera al cambiar de imagen mientras terminaba de inicializarse un lector cancelado. Una operación nueva espera a su liberación, con espera acotada, en lugar de fallar inmediatamente como “ocupado”; no abre lectores pesados en paralelo. También se corrigió la vista estática local de Vite: no debe heredar el proxy de la API ni fallar con comas escapadas en nombres de fuentes variables.

## Cobertura real y reproducción legal

**117 familias / 203 variantes**, frente a 17/66. Se incorporan 100 familias de metadatos oficiales con estilos manuscritos, lúdicos/decorativos y de titulares: entre otras Fredoka, Baloo 2, Balsamiq Sans, Comic Neue, Bubblegum Sans, Lilita One, Bangers, Caveat, Kalam, Patrick Hand, Delius, Mali, Ribeye, Henny Penny, Londrina, Lobster y Cabin Sketch. Las etiquetas de estilo son una selección editorial, no una afirmación de uso exclusivo o de identidad de la imagen del usuario.

La lista exacta está en `catalog/selection.json` y el manifiesto completo en `catalog/manifest.json`. La revisión de Google Fonts sigue siendo `47d54ca1ebb14fd864695f1d39dc734f39017c33`. Se conservan los 66 hashes originales. Los 165 archivos TTF únicos permanecen sin modificar; no se hacen subsetting, conversiones ni redistribución comercial no autorizada. Las 117 licencias OFL 1.1 se conservan, con sus copyright/nombres reservados y SHA-256; se sirven junto a sus fuentes. Knewave usa otro formato de cabecera de la misma OFL: se verifica la declaración de versión y el hash completo, sin alterar el texto. Se excluyen de esta selección 17 familias sin OFL en esa revisión, aunque algunas puedan tener otra licencia permitida: no se atribuye una OFL inexistente.

Los nombres provienen de `METADATA.pb`, pesos/cursivas/ejes de los archivos, y las fichas enlazan al proveedor oficial. [Comprobación de los 117 enlaces](revision-0.4/links.json): todos respondieron 200. La licencia se verifica por sus bytes oficiales, no se deduce del HTTP 200. [Auditoría FontFace](revision-0.4/font-audit.json): los 165 TTF cargan en Chromium. El índice confirma que 202/203 variantes cubren todos los acentos/diéresis/ñ españoles; Gamja Flower no los cubre y se descarta para textos que los requieran. No se han añadido fuentes comerciales ni una supuesta API de identificación.

```bash
python scripts/fetch_catalog.py       # restaurar/verificar todos los originales fijados
python scripts/expand_catalog.py      # selección explícita; conserva las 66 anteriores
python scripts/build_glyph_index.py   # regenerar índice y su hash
python scripts/doctor.py
```

La restauración ya no contiene una lista antigua de 17 familias que pueda reducir silenciosamente el catálogo. La ampliación usa el árbol Git fijado y URLs de originales, no “latest” ni una descarga automática al analizar. El índice se entrega generado y verificado, de modo que no hace falta reconstruirlo ni tener Python para compilar la modalidad de navegador.

## Búsqueda en dos etapas

El índice de **2.381.932 bytes** (7.671.811 sin comprimir) contiene imágenes pequeñas de glifos, sus posiciones, avances y kerning, derivados de los originales a 32 px. Son datos de análisis; no sustituyen al archivo tipográfico descargable. Se sirve comprimido en un fichero `.bin` con hash en el nombre: evita que algunos servidores lo descompriman implícitamente por una extensión `.gz`. El cliente verifica SHA-256 y descomprime el índice. Las licencias originales siguen incluidas.

1. Se recompone la transcripción con esos glifos y se hace una comparación gruesa sobre todas las variantes compatibles, sin descargar ni abrir todos los TTF. Se eligen las 24 mejor puntuadas y hasta ocho de familias adicionales, con máximo de 32.
2. Solo esas variantes se renderizan desde el TTF original. Se mantienen los tres espaciados y tamaños ópticos anteriores y la misma distancia de contornos/proporciones. Se generan comparaciones y superposiciones reales para los resultados admitidos.

La búsqueda es aproximada: puede omitir la variante correcta en la primera etapa. La interfaz informa del catálogo y del número comparado en detalle; el contrato incluye los IDs seleccionados para poder medir la recuperación. No se presenta el ranking grueso como una identificación ni se inventa probabilidad. El índice puede requerir descarga inicial y parseo en cada Worker; las siguientes peticiones dependen de la caché HTTP del navegador, que no se confunde con cero consumo. Las fuentes de interfaz son independientes de las solicitadas por el motor.

## Evaluación

[Protocolo fijado](revision-0.4/protocol.md). Desarrollo: 16 imágenes, sin errores de propuestas ni omisiones de la fuente real en la primera etapa. Evaluación nueva: 76 imágenes FreeType, separadas de desarrollo y del diseño del usuario; 24 variantes originales (las 17 familias), 32 familias nuevas, ocho muestras de seis fuentes externas, ocho composiciones de dos/tres líneas con una o varias familias y cuatro controles de baja calidad/pocas letras. Ambos motores reciben los mismos PNG y transcripciones revisadas. No es precisión automática de extremo a extremo ni una evaluación de fotografías reales.

El informe pareado, sus tiempos y máximos de memoria se guardan en [summary.json](revision-0.4/summary.json) y [paired-rows.json](revision-0.4/paired-rows.json). Se distinguen ranking, propuestas, abstenciones, alternativas y fallos de recuperación; no se eliminan errores del denominador. El tiempo incluye HTTP local, Worker y PNG; PSS/RSS incluyen el árbol de Chromium, no solo el heap del algoritmo. No se extrapola a dispositivos físicos o un VPS.

## Resultado medido antes/después

| Medida sobre los mismos 76 PNG, texto revisado | 0.3: 17/66 | 0.4 final: 117/203 |
| --- | ---: | ---: |
| Familias/variantes primeras en 24 muestras comunes | 24 / 24 | 24 / 24 |
| Comunes con propuestas que incluyen la variante correcta | 21 / 24 | 19 / 24 |
| Nuevas: familia y variante primeras | fuera del catálogo | 32 / 32 |
| Nuevas con propuestas que incluyen la variante correcta | 0 / 32 (no incluidas) | 28 / 32 |
| Listas de candidatas que excluyen la variante real, este conjunto | 0 | 0 |
| Muestras externas con propuestas originales | 0 / 8 | 0 / 8 |
| Varias líneas bloqueadas antes de comparar | 0 / 8 | 8 / 8 |
| Controles de baja calidad/pocas letras con alternativas | 4 / 4 | 0 / 4 |
| Muestras con alternativas por encima de distancia 0,20 | 74 / 76 | 0 / 76 |
| Tiempo del comparador: mediana / p95 | 2,444 / 2,811 s | 1,508 / 2,004 s |
| PSS del árbol Chromium: mediana / p95 | 534,75 / 594,51 MiB | 455,65 / 530,20 MiB |
| PSS máximo observado | 630,31 MiB | 596,89 MiB |
| Archivos TTF solicitados: mediana | 39 | 30 (máximo 32) |
| Tamaño de esos TTF: mediana | 17.722.816 bytes | 8.677.400 bytes |

En la columna nueva hay además 2.381.932 bytes de índice para cada Worker que lo solicita, sujetos a caché HTTP. Los bytes de TTF son la suma de tamaños de archivos únicos solicitados, no una captura de transferencia real ni una garantía de caché. No incluye descarga inicial de OCR, latencia Internet ni tiempo de revisión/crop. El catálogo completo tiene 165 archivos TTF, 52.368.776 bytes (véase el registro reproducible si se cambia la selección), y no se descarga completo al buscar.

El ranking correcto se conserva en 56/56 muestras cubiertas y la etapa inicial recupera 56/56 variantes reales. **Solo 47/56 se proponen como originales candidatas**: nueve quedan como alternativas/abstenciones. El control de pesos produce dos abstenciones adicionales en muestras que realmente eran correctas: `old-inter-700-clean` y `old-nunitosans-400-clean`. Son falsos avisos del veto de variante por diferencias de rasterización; se conservan en el informe y no se presentan como mejora. El filtro prefiere abstenerse, pero todavía necesita validación con fotografías y más rasterizadores.

Antes se mostraban 291 alternativas con distancia >0,20; ahora esas no se muestran. Eso demuestra la aplicación del filtro formal, no una validación humana universal de parecido. La distancia sigue siendo experimental y no es una probabilidad de identidad.

La primera ejecución, sin la nueva comprobación de pesos, obtuvo 49 candidatas correctas en 56 muestras cubiertas. Se conserva íntegra en [initial-summary.json](revision-0.4/initial-summary.json) y [initial-paired-rows.json](revision-0.4/initial-paired-rows.json). Tras descubrir el problema de pesos en otras imágenes, se reejecutaron las 76 muestras de la versión final; se reutilizaron los 76 resultados antes de 0.3, cuyo código e imágenes no cambian. **Los tiempos finales no son una nueva ejecución simultánea y alternada de ambas versiones**; son observaciones del mismo host, con perfil Chromium nuevo por imagen. No se extrapolan a móvil físico ni se anuncian como un SLA. Se conservan [hashes del motor evaluado](revision-0.4/frozen-inputs.json).

El subconjunto de doce imágenes del servidor se ha medido también en procesos Python nuevos, sin OCR ni HTTP: mediana 2,690 s → 1,636 s; RSS máximo mediano 123,57 → 108,94 MiB. No incluye Node/Nginx y no es comparable directamente con el PSS de todo Chromium. [Todas las observaciones](revision-0.4/server-subset.json).

### Pesos que no están en el catálogo: límites y nuevo control

Seis pruebas adicionales de pesos intermedios descubrieron tres propuestas de variante equivocada en 0.3 y cuatro en la 0.4 inicial, aunque nunca se etiquetaban como exactas. Los pesos reales se conocen por cómo se generaron las imágenes, no por el modelo. Se conserva [el registro inicial](revision-0.4/initial-uncatalogued-weights.txt).

Se añadió una comprobación general, aplicable a cualquier candidato con archivo variable y muestras de 400/700 disponibles: renderizar 450/500/550/600/650 con **el mismo TTF**, sin descargas adicionales. Si uno encaja mejor por más de 0,025, no se propone una variante del catálogo como original. Se conservan tanto el umbral 0,155 como el margen 0,025; no se reducen para aparentar más aciertos. Las cinco pruebas adicionales no amplían artificialmente el número de variantes catalogadas: son diagnósticos que solo pueden provocar abstención.

Después queda **una propuesta de variante equivocada de seis**: Inter real 650 todavía propone Inter 700. Un segundo grupo independiente, con otras frases/pesos (475, 625, 575, 550, 575 y 675), pasa de tres propuestas equivocadas a **dos**: Roboto 625→700 y Nunito Sans 675→700. No se ajustó el margen para hacer desaparecer esos fallos. [Primer grupo final](revision-0.4/uncatalogued-weights.json) y [validación independiente](revision-0.4/uncatalogued-weights-independent.json). La interfaz advierte explícitamente que el peso original no está verificado. Este control reduce errores, pero **no resuelve todos los pesos cercanos ni convierte los candidatos en exactos**.

## Pruebas y límites pendientes

Doce pruebas del servidor: catálogo/bytes/licencias reales, OCR, límites, concurrencia, timeout y cuota, bloqueo de varias líneas incluso con transcripción aplanada, recuperación limitada a 32 filtro de alternativas y abstención ante pesos variables no catalogados. La cuota de producción sigue siendo 20 peticiones/minuto; los tests restablecen su contador entre casos independientes y prueban también que la petición 21 se rechaza.

Interfaz Chromium 320/390/768/1440: búsqueda y filtro en el catálogo, carga/pegado, recorte, OCR editable, comparación/descarga verificada por SHA-256, pocas letras sin alternativas inútiles, relectura en inglés, cancelación y nueva lectura, y una imagen de dos familias que exige recortar aunque se edite el texto. [Registro de interfaz](browser/ui-checks.json). Las nuevas imágenes de `public/ejemplos` son demostraciones de procedencia conocida y pasan por el mismo motor; no representan el diseño del usuario.

El caso **«Dawn en la granja» no se ha identificado ni verificado**: las capturas/archivo no están disponibles en este mensaje. Se necesita el original (y, si se conoce, su familia/variante de origen) para comprobarlo con evidencia. No se ha asignado un nombre por semejanza ni ajustado el motor únicamente a esa frase.

Quedan fuentes comerciales y ajenas a estas 117 familias, fotografía/perspectiva, texto alterado, cambios de fuente dentro de una línea y más ejes variables. Un recorte difícil puede quedar sin candidatas ni alternativas, o requerir otra muestra. No se prometen aciertos universales. El OCR conserva sus modelos y errores; esta revisión evita usar varias líneas como una única muestra y mejora el manejo de sus avisos, no inventa una mejora de lectura de caracteres.

Si el recorte contiene únicamente «Dawn», son cuatro letras diferentes: la exigencia existente de cinco letras distintas seguirá pidiendo una muestra más amplia de **esa misma tipografía**. No se deben juntar líneas o fuentes diferentes para superar esa exigencia. Esto es una orientación condicional, no una descripción de las capturas que no se han recibido.
