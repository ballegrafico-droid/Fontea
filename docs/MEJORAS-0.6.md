# Fontea 0.6 · conector externo real, pendiente de clave

La captura del diseño «balle gráfico» ya se recibió en esta conversación y se examinó visualmente. El usuario confirma que el recorte de «gráfico» tiene OCR correcto. Ese caso evidencia el límite del catálogo local; **no se afirma que volver a recortar resuelva una fuente ausente**. No se ha determinado la versión de la tipografía del logo ni se ha incorporado su nombre como resultado predeterminado.

El propietario ha indicado que no tiene clave y ha pedido preparar la integración y su activación. Esta entrega implementa el conector; no puede acreditar una recuperación ni precisión comercial real sin ese acceso.

## Cambios funcionales

- Adaptador WhatFontIs API 2.2 con petición HTTPS oficial, imagen base64, `FREEFONTS=0` (gratuitas y comerciales), modo fast y hasta 20 candidatos. Ningún filtro o parámetro pide Bauhaus. No hay resultados de reserva ni consultas basadas en un modelo de visión.
- API Node/Express en `/api/external/status` y `/api/external/identify`. La misma funcionalidad se prepara en un pequeño backend Cloudflare de la vista privada; el frontend React existente y su historial se conservan. No se accede al VPS.
- Sección visible de búsqueda externa junto al recorte: consentimiento por consulta, preparación local de la máscara de texto, envío, carga, cancelación, resultados separados, error y lista vacía. Sin clave se muestra `missing_key` y el botón está desactivado.
- Candidatos con título, posición del proveedor, tipo/vendedor declarados y ficha del identificador. Familia, variante, identidad y licencia permanecen sin verificar. No se utiliza su orden como porcentaje ni como distancia local. No se inventa un enlace de compra oficial o un render del texto con una fuente comercial que no se tiene.
- Validación en navegador y servidor: una línea, cinco letras distintas, resolución/contraste, PNG hasta 2 MB y 2200 × 600. El servidor comprueba CRC, descompresión acotada y geometría; una señal de una línea del cliente no evita rechazar dos líneas reales.
- Cuota persistente antes del envío: archivo protegido en Node, reserva SQL atómica en D1 para la vista alojada. Por defecto 20 intentos/día por clave, máximo configurable 50; un trabajo por proceso/isolate. Límite de petición 25 s, respuesta 512 KB, una sola tentativa, sin seguir redirecciones, sin compra/recarga de créditos. No se almacenan imágenes ni fuentes en el contador.

Los permisos para identificar/enlazar y para distribuir un archivo tipográfico se mantienen separados. Solo las fuentes abiertas ya autorizadas se sirven para descarga. El archivo propio permanece en el navegador, también al usar este backend.

## Cobertura y precisión

El catálogo local sigue en **117 familias / 203 variantes / cero Bauhaus**. El conector es otro motor y otro catálogo; su tamaño y cobertura exactos no son auditables desde este proyecto y no se suman artificialmente al catálogo local. No se añade una alternativa gratuita como solución a Bauhaus.

Se conserva literalmente la función de identificación local y sus módulos de distancia/recuperación/regiones respecto a 0.5; las pruebas API existentes vuelven a pasar. No cambian los umbrales 0,155/margen 0,025 de candidatos ni 0,20 y proporciones 1,2× de alternativas. El nuevo código prepara el transporte externo en otra operación del Worker; no modifica la selección local para aceptar este logo. Se conserva la evaluación de 76 imágenes y los errores de pesos próximos de [0.4](MEJORAS-0.4.md), además de la regresión de [0.5](MEJORAS-0.5.md).

**Consultas reales de reconocimiento a WhatFontIs: 0. Precisión, cobertura comercial, tiempo de respuesta y memoria del proveedor externo: no medidos.** No se promete que vaya a recuperar la versión exacta del logo; eso deberá comprobarse con la clave, resultados reales y evidencia visual. Las medidas anteriores no se reutilizan como una precisión comercial ni como latencia de esta API.

## Pruebas realizadas

1. **26 pruebas Node**, todas aprobadas: 16 existentes más 10 nuevas de conector, protocolo, límites y persistencia. El adaptador solicita también comerciales y no envía un nombre esperado ni un parámetro OCR no documentado. Respuestas vacías/no relacionadas no se convierten en Bauhaus. Se verifican enlaces, duplicados, errores, cuota, redirecciones y ausencia de campos de confianza inventados. El endpoint se prueba con HTTP real local y proveedor interceptado.
2. **Runtime Cloudflare real local (Miniflare/Workerd) y D1**, con toda salida a WhatFontIs interceptada: cinco controles. El PNG preparado por el Worker real del navegador pasa por el backend, validación, reserva SQL y respuesta externa de fixture; se bloquean falta de consentimiento, señal de varias líneas y dos líneas con información falsa del cliente. Dos intentos alcanzan el límite de prueba y el tercero no contacta al proveedor. Se detectó y corrigió la incompatibilidad de `redirect: error` del runtime: ahora usa `manual` y rechaza redirecciones sin reenviar la clave.
3. **Cinco controles de interfaz externa**: modo real sin clave, OCR real de una muestra sintética con la palabra «gráfico», consentimiento y PNG del recorte, resultados separados, vacío, cuota, bloqueo de varias líneas y anchos 320/390/768/1440. Los tres POST de resultados se interceptan **solo en el navegador de prueba**; las respuestas dicen TEST ONLY/fixture y no se sirven en producción. La palabra de prueba se genera con Inter; **no es el logo del usuario ni una identificación de Bauhaus**.
4. **13 comparaciones privadas** y los **11 controles de flujo completo** se repiten contra la nueva vista con backend local: subir/pegar, recortar, OCR editable, idioma, cancelar y continuar, catálogo, comparación real, enlaces/bytes y analizar una línea del diseño de dos fuentes. Se mantienen escritorio y móvil emulado en Chromium; no se ha probado un teléfono físico ni todos los navegadores.

La interfaz externa también pasa sus cinco controles en la aplicación Node/Express con OCR Python y CSP de Helmet: [registro Node](revision-0.6/node/external-checks.json).

Registros: [interfaz externa](revision-0.6/external-checks.json), [Worker y D1](revision-0.6/worker-adapter-checks.json), [archivo privado](revision-0.6/local-font-browser.json). Las capturas de respuesta de fixture llevan esa indicación en el nombre y texto. [Estado real sin clave](revision-0.6/external-missing-key-mobile.png). No se usa ninguna respuesta de pruebas para suplir silenciosamente una API ausente.

## Reproducir sin consumir API ni créditos

```bash
npm ci
npm ci --prefix hosting
npm test
npm run build:site
# En una base local nueva, aplicar una sola vez la migración:
node hosting/node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config hosting/dist/server/wrangler.json --persist-to hosting/.wrangler/state --file drizzle/0000_external_quota.sql
npm run preview:site
# En otra terminal, Chromium/Playwright y Pillow instalados:
python scripts/qa_external.py http://127.0.0.1:4175
node scripts/qa_hosted_adapter.mjs
FONTEA_WEB_QA=1 FONTEA_QA_REVISION=0.6 python scripts/ui_smoke.py http://127.0.0.1:4175
FONTEA_QA_REVISION=0.6 python scripts/qa_local_font.py http://127.0.0.1:4175
```

`qa_external.py` genera muestras y el PNG preparado en `tests/artifacts/revision06/`, excluido de Git. El control de Miniflare utiliza ese PNG y respuestas interceptadas en memoria; no hay salida real al proveedor. No pongas una clave real en el entorno para esas pruebas. El proceso de preview es exclusivamente local; la URL de entrega alojada es independiente.

## Activación pendiente

[Pasos concretos, condiciones y coste publicado](ACTIVAR-EXTERNO.md). Falta obtener una clave y acceso gratuito autorizado, configurarlos de forma privada en el servidor correspondiente y realizar una evaluación real. Para uso comercial de la API, el proveedor pide contacto; la tarifa MCP/créditos publicada no acredita automáticamente ese permiso. No se ha contratado ni comprado nada. La activación no requiere añadir Bauhaus ni modificar el catálogo o los umbrales.

## Vista privada publicada y verificada

Se actualizó [la misma URL](https://fontea-estudio-2026.icycalf17.chatgpt.site) con el commit de código `2f62104`, conservando acceso de una sola cuenta propietaria. La API remota de Fontea responde de verdad `missing_key`; un POST sin clave recibe HTTP 503 con ese código, sin generar candidatos ni contactar al proveedor. La falta de identificación comercial no se presenta como problema del OCR o del recorte.

Se ejecutaron sobre esa URL los cinco controles externos (resultados exclusivamente de fixture donde corresponda), las 13 comparaciones privadas y los 11 controles de flujo completo, incluyendo OCR real de «gráfico» en la muestra sintética y recortar una línea del diseño mixto. Los cuatro archivos públicos de ejecución coinciden por SHA-256 con la compilación local. [Registro alojado](revision-0.6/hosted-checks.json), [pruebas externas alojadas](revision-0.6/hosted/external-checks.json). El commit posterior solo añade estos registros y documentación; no modifica el código del motor ni los candidatos.
