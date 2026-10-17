# Fontea 0.2: comparación medida con la versión original

Se mantiene la rama `codex/fontea-v1` y el commit original `21f1e73` como ancestro. Antes de editar se regeneraron y verificaron el ZIP y el bundle de esa versión, conservados también como `Fontea-21f1e73.zip` y `Fontea-21f1e73.bundle`. No se ha accedido a ningún VPS ni contratado servicios.

## OCR: cambio y criterio

La versión anterior cargaba Tesseract con `eng+spa`. La versión 0.2 usa `spa+eng`: el modelo español tiene prioridad para la interfaz española y el inglés sigue disponible. Se usan **los mismos archivos de modelos, la misma segmentación PSM 6 y una sola pasada**. La preparación recorta el margen sobrante, normaliza la polaridad, mide la altura de la tinta y amplía solo hasta un objetivo de 72 px con un máximo de 3×, conservando grises y añadiendo 16 px de borde. Así se corrige un recorte ajustado que perdía la tilde de «tipografía» y se evita depender del alto total del lienzo. No se eliminan acentos, se corrigen palabras con la solución esperada ni se incorporan resultados de identificación al OCR. La interfaz permite elegir Español/Inglés primero y pulsar **Volver a leer** sobre el mismo recorte; esa acción explícita no se cuenta como OCR automático en la evaluación. La API solo admite esos dos órdenes y conserva los límites de consumo. La selección en pantalla tiene prioridad. `TESSERACT_LANG=spa+eng` define el valor predeterminado para peticiones de API sin idioma explícito; actualiza esa línea si conservas un `.env` antiguo.

La preparación conserva los 32 aciertos de desarrollo y supera el test literal del recorte ajustado; no se cambió ese test por una expresión más permisiva.

En 32 muestras de desarrollo extraídas de los fallos previamente documentados: OCR literal 14 → 32. Español primero, español solo y una opción de línea con borde lograron 32 en ese conjunto; se eligió el cambio mínimo (español primero), que conserva el procesamiento de varias líneas para poder advertir al usuario. Es desarrollo, no evidencia de precisión general. [CSV de las cuatro opciones](ocr-development.csv) y [resumen](ocr-development-summary.json). En este archivo se registran las transcripciones completas, no solo un porcentaje.

Después de elegir ese ajuste se generó un conjunto nuevo reservado. **Corrección literal exige la misma cadena, incluidas mayúsculas, puntuación, ñ y tildes.** Se cuentan además errores de caracteres con distancia de edición; no se usa una comparación sin acentos para inflar el resultado.

## Catálogo: ampliación real y legal

Pasa de 11 familias / 42 variantes a **17 familias / 66 variantes**. Añade Nunito Sans, Raleway, DM Sans, Bitter, Fira Sans y Libre Franklin, con 400/700 recta y cursiva. Cada familia cuenta con su `OFL.txt` original y una ficha oficial de Google Fonts. Las 17 fichas respondieron HTTP 200: [registro](revision/link-checks.json).

La revisión oficial de Google Fonts se mantiene en `47d54ca1ebb14fd864695f1d39dc734f39017c33`. Ninguno de los 42 archivos originales cambia. El manifiesto añade hashes de las licencias y si el archivo es estático o variable; la interfaz usa este dato real, por ejemplo para identificar las descargas estáticas de Fira Sans. Los archivos de las fuentes no se modifican. OFL 1.1 permite uso personal/comercial bajo sus condiciones, incluidas conservación de licencias y nombres reservados. No se agregan fuentes comerciales ni licencias de uso solo personal.

`scripts/fetch_catalog.py` restaura las fuentes desde URLs oficiales fijadas y comprueba que los archivos existentes coinciden con sus hashes; falla ante una alteración. No descarga archivos ni consulta servicios al analizar una imagen.

## Evaluación pareada reservada

115 imágenes nuevas: 63 de las familias originales (42 limpias y 21 degradadas), 36 de las añadidas (24 limpias y 12 degradadas), doce de seis familias que siguen fuera y cuatro controles de pocas letras. Se incluyen frases en español con acentos y controles en inglés. Las degradadas reciben la misma reducción, desenfoque, JPEG y espaciado que en el protocolo anterior.

Se generan con Chromium Canvas, no con el rasterizador Pillow del comparador. Cada imagen tiene un hash y una transcripción esperada en [samples.json](revision/samples.json). Las dos versiones reciben exactamente los mismos bytes. El orden de ejecución antes/después alterna por imagen. No se ajusta nada a sus resultados.

Para comparar se incluye una copia íntegra del motor 0.1 y del manifiesto de 42 variantes en `benchmarks/`. Es código de referencia para pruebas, no un segundo motor activo en la aplicación. La comparación de familias/variantes usa la **transcripción correcta**, equivalente a revisar el OCR en la interfaz. Una muestra nueva fuera de las 42 fuentes originales se considera fuera del catálogo anterior, no un fallo de clasificación de una familia cubierta.

No cambia la fórmula de distancia, el umbral 0,155, el margen 0,025, la altura mínima, las letras distintas exigidas ni las etiquetas de incertidumbre. Una propuesta errónea en el informe es una lista de candidatas que excluye la variante de origen (o cualquier candidata para una fuente que no está cubierta). También se conservan posición, distancia y pertenencia de la fuente correcta en el CSV para distinguir ranking y abstención.

| Medida, mismas imágenes                                               | Antes: 11 familias / 42 variantes | Después: 17 familias / 66 variantes |
| --------------------------------------------------------------------- | --------------------------------: | ----------------------------------: |
| OCR literalmente correcto, todas las imágenes                         |                          54 / 115 |                           109 / 115 |
| Errores de caracteres sobre 2802 caracteres esperados                 |                               144 |                                  10 |
| OCR correcto, 63 muestras de familias originales                      |                           33 / 63 |                             61 / 63 |
| Variante en primera posición, 63 muestras originales, texto corregido |                           63 / 63 |                             63 / 63 |
| Originales con candidatas que incluyen la variante correcta           |                           48 / 63 |                             48 / 63 |
| Añadidas con candidatas correctas                                     |       0 / 36 (fuera del catálogo) |                             25 / 36 |
| Añadidas, variante en primera posición                                |                                 — |                             36 / 36 |
| Fuentes aún externas: propuestas originales erróneas                  |                            0 / 12 |                              0 / 12 |
| Controles de pocas letras: propuestas originales                      |                             0 / 4 |                               0 / 4 |
| Comparación: mediana                                                  |                           1,396 s |                             2,187 s |
| Comparación: percentil 95 observado                                   |                           1,627 s |                             2,465 s |
| OCR: mediana                                                          |                           0,256 s |                             0,227 s |

Se ganan 58 transcripciones exactas y se pierden tres: mejora neta de 55. Las regresiones son `lato-400-clean` (& → «), `playfairdisplay-400-clean` (& → $) y `short-aaa-short` (aaa → ada). No se eliminan del denominador. **Inglés primero → Volver a leer** recupera literalmente los dos controles ingleses en una comprobación adicional; esa intervención no se suma a los 109 aciertos automáticos. El control corto sigue sin identificación tipográfica por tener pocas letras distintas.

La primera medición, cambiando solo el idioma, obtuvo 103/115, con siete regresiones en inglés. Se conserva en [CSV intermedio](revision/language-only-paired.csv) y [JSON intermedio](revision/language-only-summary.json). Un test de integración descubrió después un recorte justo que perdía la í de «tipografía»; se corrigió la preparación usando la altura de tinta y margen, **sin relajar el test literal**. Se reejecutó el OCR de ambas versiones y el subconjunto automático sobre los mismos 115 PNG verificados por hash. Como el comparador con texto corregido no cambia (AST de las funciones de comparación comprobado), sus resultados y tiempos se conservan de la primera ejecución pareada. `--generate --run` permite ejecutar todo de nuevo; `--refresh-ocr` reproduce este ahorro de cálculo y lo declara en el JSON.

La ampliación añade 24 variantes y 36 imágenes de prueba. Las 36 quedan ordenadas primero por variante correcta, pero el filtro solo permite proponer candidatas en 25: once se conservan como alternativas. En las 63 muestras originales no cambia el ranking ni el número de candidatas aceptadas. Se abstiene en quince muestras originales, once añadidas, doce externas y cuatro cortas. No hubo listas de candidatas que excluyeran la variante de origen en esta evaluación; no demuestra ausencia de falsos positivos fuera de ella.

El coste medido del catálogo es aproximadamente +0,79 s de mediana del comparador (+57 %). El OCR cuesta aproximadamente 0,23–0,26 s en estas ejecuciones; no se presenta esa diferencia pequeña como una mejora garantizada de velocidad. La búsqueda sigue siendo exhaustiva, adecuada para 66 variantes y sin afirmaciones de escalado a miles.

En el subconjunto automático de doce imágenes, sin corregir el OCR: antes se proponen cinco candidatas correctas, después ocho; el primer resultado de variante pasa de siete a diez. Dos muestras siguen fuera de catálogo. No se debe usar este subconjunto pequeño para anunciar precisión general.

Resultados completos: [CSV pareado final](revision/paired-results.csv), [resumen JSON](revision/summary.json), [entorno y versiones](revision/environment.json). El resultado se refiere a textos sintéticos horizontales, con frases repetidas por variantes, y no a una colección de fotografías de fuentes comerciales.

Un subconjunto preseleccionado de doce imágenes se analiza también con el OCR realmente obtenido por cada versión, sin corrección manual. Sus resultados se guardan aparte para que la evaluación con texto corregido no se confunda con precisión automática de extremo a extremo: [automatic-subset.csv](revision/automatic-subset.csv).

Los tiempos son de este entorno y no garantizan el comportamiento de un VPS. La comparación incluye dos módulos separados con cachés equivalentes; cada OCR ejecuta Tesseract de nuevo. El tiempo de identificación medido es el del motor Python, sin HTTP ni arranque del intérprete; las comprobaciones HTTP se documentan por separado. Se mantiene una operación pesada por instancia, límite de subida de 8 MB y timeout de 45 segundos.

## Qué puedes probar

Arranca con `npm run build` y `npm start`, con el Python del entorno virtual configurado. La aplicación se ha arrancado en el entorno de trabajo, pero no hay una herramienta disponible que publique una URL de vista previa accesible al usuario. `http://127.0.0.1:3001` es una dirección interna y no un enlace alojado.

En `public/ejemplos` y el ZIP hay cinco imágenes **de demostración** con su procedencia real:

- `demostracion-inter-cursiva-espanol.png`: carga, selecciona completa y revisa acentos/cursiva.
- `demostracion-fira-sans-bold.png`: busca una familia añadida y comprueba ficha oficial, licencia y descarga estática.
- `demostracion-dm-sans-regular.png`: fuente variable añadida; permite observar la limitación del tamaño óptico si no supera el filtro.
- `demostracion-ingles-lato.png`: muestra de Lato en inglés; selecciona inglés primero y pulsa Volver a leer para comprobar la regresión documentada y su manejo explícito.
- `demostracion-fuera-del-catalogo.png`: Liberation Serif, que sigue fuera; comprueba el estado sin identificación y las alternativas separadas.

La procedencia indicada de una imagen de prueba es conocida por cómo se generó. No es un resultado simulado ni una etiqueta exacta que el motor presente al usuario.

## Verificaciones de la aplicación

Compilación de TypeScript/React/servidor correcta y **ocho pruebas de integración aprobadas**: archivos reales y hashes, 66 variantes/17 familias, conservación de las 42 anteriores, OCR literal con ñ y tilde, idioma explícito validado, archivo corrupto, límites de tamaño/dimensiones, pocas letras, concurrencia y recuperación tras timeout. No se sustituyó la exigencia literal por una expresión regular para hacer pasar la regresión del recorte.

[Pruebas de navegador](ui-checks.json): Chromium, anchuras 320/390/768/1440 sin desbordamiento; flujo completo, recorte arrastrable, OCR, edición, candidatos, superposición, ficha/descarga, estado sin identificación y relectura explícita en inglés. No se han probado dispositivos físicos ni Safari/Firefox. Capturas actualizadas en `docs/`.

[Comprobación HTTP actual](revision/http-checks.json): Inter cursiva, Fira Sans Bold y DM Sans Regular transcritas literalmente, con candidata correcta en las tres. OCR HTTP: 0,49–0,60 s; identificación HTTP: 2,61–2,71 s, incluyendo arranque de Python y PNG de resultados. Son tres observaciones de la versión actual, no una comparación HTTP antes/después ni un SLA. La tabla pareada anterior mide solo el motor.

`doctor.py` verifica dependencias, los modelos ingleses/españoles, los hashes de fuentes y de sus 17 licencias. El código mantiene límites, claves privadas fuera del cliente y procesamiento en memoria; no se añaden servicios externos.

## Reproducir

```bash
pip install -r requirements-dev.txt
# Chromium en /usr/bin/chromium, Node >=22.9 y Tesseract 5
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python benchmarks/revision.py --generate --run
npm run build
npm test
python scripts/doctor.py
# En otra terminal: npm start
python scripts/ui_smoke.py http://127.0.0.1:3001
```

Los modelos/fuentes están incluidos; no hace falta una clave ni servicio de pago. Los PNG sintéticos de evaluación se guardan en `tests/artifacts/revision` (ignorado). El manifiesto de muestras y todos los CSV/JSON de resultados se versionan. El informe histórico `TESTING.md` no se reescribe con métricas nuevas.

## Pendiente y límites

No es una búsqueda universal ni una confirmación de identidad exacta. Quedan fotografías reales etiquetadas, perspectiva, efectos, texto curvado, fuentes comerciales, índices para miles de fuentes y más valores de los ejes variables. Solo se prueban los valores predeterminado/máximo de tamaño óptico existentes, no todo su continuo; DM Sans puede requerir otros valores. Un catálogo más amplio puede introducir candidatos indistinguibles y aumentar el tiempo. No se deben ocultar las regresiones del conjunto reservado ni ajustar el filtro sobre ese conjunto para anunciarlas como resueltas.

## Sincronización y respaldo

Se mantiene la rama `codex/fontea-v1`, con `21f1e73` intacto en su historial. El ZIP y el bundle finales se regeneran desde el nuevo commit y se verifican; los respaldos de la versión original se conservan por separado. El resultado del único intento de envío a GitHub —confirmación o error literal— se comunica en la entrega de esta sesión. Subir una rama no publica ni despliega la aplicación.
