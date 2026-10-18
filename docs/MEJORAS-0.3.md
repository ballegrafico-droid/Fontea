# Fontea 0.3: aplicación que puede alojarse y probarse

Se continúa sobre `492018f`, conservando `21f1e73` y la rama `codex/fontea-v1`. No se reconstruye el proyecto. Catálogo actual: **17 familias / 66 variantes**, sin nuevas fuentes comerciales. La ampliación de 11/42 a 17/66 y su efecto medido permanecen en [el informe 0.2](MEJORAS-0.2.md): +24 variantes, mediana Python 1,396 → 2,187 s; OCR literal 54 → 109 de 115 con el ajuste de idioma/preparación. Es una medición histórica, no una nueva ejecución de Python en esta sesión.

## Implementado

Además del servidor Node/Python, existe una compilación funcional `npm run build:web`. Ejecuta OCR Tesseract.js/WASM y comparación de contornos con los archivos reales del mismo catálogo, en Workers del navegador. No requiere API comercial ni envía imágenes a otro proveedor. Se sirve como sitio estático: así puede alojarse en la vista privada sin necesitar un proceso Python remoto. La interfaz es la misma: subir/pegar, recortar, OCR revisable, relectura con idioma prioritario, comparación y superposición, familia/variante, fuente oficial, licencia y descarga original autorizada.

Todos los modelos, fuentes y bibliotecas se sirven desde el propio sitio. La construcción comprueba hashes de fuentes, licencias y modelos; conserva sus licencias originales. No hay resultados prefijados ni sustitución silenciosa por demostraciones. Las distancias no son probabilidades y ningún candidato se anuncia como exacto. El filtro y las categorías no se han relajado: umbral 0,155; margen 0,025; cinco letras distintas, altura/contraste suficientes y aviso de varias líneas.

La cancelación del lector termina su Worker y libera su turno; se corrigió un bloqueo que podía impedir una nueva lectura tras cancelar durante el reconocimiento. El turno lleva un identificador propio para que una tarea antigua no libere el de otra. Durante la inicialización asíncrona de Tesseract la cancelación puede esperar a que se obtenga el Worker para poder terminarlo. Timeout local de 90 s, una operación simultánea por pestaña. La interfaz conserva edición manual si falla el OCR.

## Resultados del navegador

**Transcripción literal**, incluidas mayúsculas, acentos, puntuación y ñ. La evaluación tipográfica usa el texto correcto, equivalente a corregir el OCR en pantalla; no se presenta como precisión automática de extremo a extremo. No se han retocado las transcripciones esperadas ni entrenado el motor con estos resultados.

| Evaluación | 115 imágenes de 0.2 | 30 imágenes nuevas Pillow |
| --- | ---: | ---: |
| OCR literal correcto | 109 / 115 | 23 / 30 |
| Muestras con familia cubierta | 99 | 22 |
| Familia correcta en primera posición, texto revisado | 99 / 99 | 22 / 22 |
| Variante correcta en primera posición, texto revisado | 99 / 99 | 21 / 22 |
| Listas de candidatas que incluyen la variante correcta | 77 / 99 | 16 / 22 |
| Listas de candidatas que excluyen la variante real | 0 | 0 |
| Propuestas originales para fuentes externas | 0 / 12 | 0 / 6 |
| Propuestas originales para pocas letras | 0 / 4 | 0 / 2 |
| OCR: mediana / p95 | 0,351 / 0,492 s | 0,369 / 0,453 s |
| Comparador: mediana / p95 | 1,996 / 2,411 s | 2,125 / 2,514 s |

El primer conjunto usa exactamente los 115 PNG y hashes reservados en 0.2, con familias próximas (Inter/Roboto/Open Sans, Lora/Source Serif, etc.), pesos/cursivas y degradación. **Canvas también es el rasterizador del nuevo comparador**, así que este conjunto favorece condiciones coincidentes; no demuestra una mejora de precisión respecto a Python. Python 0.2 obtuvo igualmente 109 OCR literales, 99 primeras variantes y 73 candidatas correctas. Los cuatro casos adicionales que ahora pasan el filtro son diferencias entre rasterizadores, no pruebas de cuatro identificaciones exactas.

Por eso se fija antes de ejecutar un segundo conjunto de **30 PNG Pillow/FreeType**: las 17 familias con variantes diferentes, cinco degradadas, seis externas y dos cortas. Tiene nuevas frases y un rasterizador distinto del comparador. Las 22 muestras cubiertas aciertan familia en primer lugar y 21 variante; solo 16 superan el filtro. El fallo es Lato Regular degradada: se ordena primero Lato Bold (d=0,177), pero el filtro se abstiene y no la propone como original. Queda registrado en el JSON. Los controles externos usan Liberation Sans, Liberation Serif, Nimbus Sans, Nimbus Roman, URW Gothic y P052. Son imágenes sintéticas con fondo uniforme, no fotografías reales ni cobertura comercial; no anuncies una precisión general a partir de ellas.

Los seis errores OCR del primer conjunto incluyen «&» leído como ««», «$» u «8.», una ñ perdida y dos controles cortos. El segundo descubre pérdidas del acento inicial de «Ágil», «947» → «94]» en Oswald y un control corto vacío. Se conservan todos en los denominadores y en los JSON. No se fuerza la letra esperada ni se cambia el criterio para aparentar corrección. Elegir inglés primero y **Volver a leer** recupera el control inglés de Lato en la prueba de interfaz; no se suma a los aciertos automáticos. Revisar el texto sigue siendo necesario.

Tiempos de pared en Chromium 154 sobre este entorno, incluyendo Worker y lectura HTTP local de recursos. Las primeras muestras coincidieron con compilación/pruebas del servidor: **no es una comparación controlada de velocidad con los tiempos históricos Python** ni una garantía para móviles/VPS. La primera visita además debe descargar recursos. Cero peticiones a orígenes externos y cero respuestas HTTP de error en ambas evaluaciones locales.

Datos por muestra y errores completos: [115 resultados](browser/rows.json), [resumen](browser/summary.json), [entorno](browser/environment.json); [30 muestras y hashes](browser-independent/samples.json), [resultados independientes](browser-independent/rows.json) y [resumen independiente](browser-independent/summary.json).

## Pruebas y reproducción

Las ocho pruebas del servidor pasan: archivos/licencias reales, OCR y búsqueda reales, formato/tamaño/resolución, controles cortos, idioma validado, concurrencia y recuperación tras timeout. `doctor.py` confirma 66 variantes, licencias y modelos intactos. Se verificó que un puerto inválido o ya ocupado detiene el arranque con un error claro; no se mata ni modifica el servicio que lo ocupa.

La interfaz se comprueba con Chromium en 320, 390, 768 y 1440 px: carga y pegado mediante evento real de Clipboard, recorte arrastrable, OCR, edición, comparación, superposición, descarga y enlace correspondientes, sin identificación para pocas letras, relectura en inglés y archivo corrupto. La modalidad de navegador añade cancelación durante un mensaje real de reconocimiento y una lectura posterior. Es emulación Linux, no Safari/iOS/Android físicos. [Registro del navegador](browser/ui-checks.json); capturas en esa misma carpeta. No se ha realizado una prueba de carga del VPS ni se ha accedido a él.

```bash
npm ci
npm run build:web
npm run preview:web
# Otra terminal, con requirements-dev.txt y Chromium instalados:
python benchmarks/revision.py --generate
python benchmarks/browser.py http://127.0.0.1:4173
python benchmarks/browser_independent_samples.py
python benchmarks/browser.py http://127.0.0.1:4173 --pillow
FONTEA_WEB_QA=1 python scripts/ui_smoke.py http://127.0.0.1:4173
# Servidor:
npm run build
npm test
python scripts/doctor.py
```

El benchmark crea un módulo de prueba temporal dentro de `dist-web` para acceder al cliente real; se elimina al terminar y no se incluye en la publicación. No ejecutes simultáneamente dos benchmarks sobre ese mismo directorio. Las imágenes sintéticas se guardan en `tests/artifacts` y se reproducen con los scripts; no se versionan.

## Alojamiento y pendientes

La vista alojada usa la compilación de navegador y acceso privado; el motor Python sigue listo para un VPS Ubuntu. El enlace y su estado real se comprueban al publicar y se comunican en la entrega, sin presentar localhost como URL accesible. El código se mantiene en la misma rama/PR, con ZIP del proyecto y bundle del historial.

La [guía de Ubuntu/Nginx](UBUNTU.md) clona ahora la rama que contiene la aplicación, exige comprobar un puerto libre (ejemplo 3401), usa un subdominio y servicio propios y conserva los sitios de otras aplicaciones. Incluye también la opción estática sin proceso Node/Python. Se requiere configurar tu dominio/DNS y HTTPS, instalar dependencias, compilar y aplicar la configuración elegida. No se ha publicado en tu VPS ni contratado ningún servicio.

Quedan OCR imperfecto, fotografías y perspectiva, efectos/logos alterados, fuentes externas y comerciales, todos los ejes variables y navegadores/dispositivos físicos. No hay integración de pago pendiente para ejecutar esta versión; cualquier proveedor comercial futuro necesita verificación de condiciones y autorización de costes.
