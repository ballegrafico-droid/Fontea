# Activar la búsqueda externa de Fontea 0.6

El conector WhatFontIs API 2.2 **ya está implementado** en Node y en el backend de la vista alojada. Está desactivado: el propietario ha confirmado que todavía no tiene una clave. No se ha creado ninguna cuenta, contratado acceso, comprado créditos ni realizado una identificación real con ese proveedor.

## Paso que corresponde ahora al propietario

1. Abre la [página oficial de la API](https://www.whatfontis.com/API-identify-fonts-from-image.html), crea una cuenta o inicia sesión y obtén la clave que su apartado `API_KEY` muestra tras autenticarse. La [página de claves y créditos](https://www.whatfontis.com/credits.html) es otra entrada indicada por el proveedor. **No hace falta contratar PRO ni comprar créditos para preparar la integración.**
2. Comprueba que el acceso permite tu uso. Su documentación declara acceso personal gratuito con atribución y 200 consultas diarias; pide contactarles para el uso comercial de la API. Que Fontea busque **fuentes comerciales** no implica descargar sus archivos ni convierte por sí solo esa búsqueda en un uso comercial de la API: se trata de dos permisos distintos.
3. No pegues la clave en el chat, en un comentario de PR ni en GitHub. Configúrala como valor privado del servidor siguiendo una de las opciones siguientes. Si el proveedor exige pago para tu uso, **detente y confirma primero la tarifa**; esta versión solo habilita acceso declarado gratuito autorizado.

La [oferta oficial MCP/créditos](https://www.whatfontis.com/mcp.html) publica 200 consultas diarias gratuitas y prepago de 1 USD por 1.000 créditos, con precio Enterprise personalizado. No se presupone que esa tarifa autorice la integración comercial REST de Fontea ni se contrata. El contador de Fontea no puede consultar el saldo ni el uso de esa cuenta en otras aplicaciones: usa acceso sin créditos comprados/recarga automática y confirma con el proveedor las condiciones para evitar consumo de saldo. No se compra crédito desde Fontea.

## Opción A: servidor Node (local o futuro Ubuntu)

Instala y ejecuta la aplicación como describe el README. Edita el archivo `.env` **ignorado por Git** de esa instalación, sin imprimir la clave en comandos o logs:

```dotenv
# Valor real introducido solo en tu editor privado:
WFI_API_KEY=
# Solo para un uso personal que el proveedor permita:
WFI_ACCESS=personal-free
WFI_DAILY_LIMIT=20
WFI_QUOTA_FILE=.fontea/external-quota.json
```

Rellena el valor de `WFI_API_KEY` en el editor. Si el proveedor ha confirmado gratuitamente otro uso comercial, utiliza `WFI_ACCESS=commercial-authorized-free` en lugar de `personal-free`. Este valor es una declaración del operador sobre su permiso: **no solicita, compra ni demuestra** una licencia. No lo configures sin obtener acceso permitido. La clave nunca debe llamarse `VITE_*`.

Protege `.env` con permisos 600 y reinicia **solo Fontea**. En el servicio Ubuntu documentado utiliza `WFI_QUOTA_FILE=/var/lib/fontea/external-quota.json`, con `StateDirectory=fontea`; no des permisos amplios a `/opt` ni cambies servicios de otras aplicaciones. El puerto permanece configurable mediante `PORT`.

Comprueba, sustituyendo 3401 por el puerto configurado:

```bash
curl --fail http://127.0.0.1:3401/api/external/status
```

`missing_key` indica que ese proceso no recibió la clave; `missing_access`, que no se configuró un acceso permitido. `ready: true` solo confirma configuración, no valida todavía la clave en WhatFontIs ni mide su saldo. Esta comprobación **no consume una identificación**. Recarga Fontea, sube/recorta una línea, revisa el OCR, marca la casilla del envío a WhatFontIs y pulsa «Buscar fuentes externas» para realizar una consulta real. La clave viaja únicamente del backend al endpoint HTTPS oficial, nunca al navegador.

## Opción B: la vista privada alojada de esta entrega

La vista conserva su URL y propietario. El frontend sigue usando React, OCR y comparación local; se añade un Worker de servidor para `/api/external/*` y D1 para el contador de intentos. **No requiere entrar en el VPS.**

Configura en las variables **runtime privadas del mismo Site**:

- `WFI_API_KEY`: la clave, marcada como secreto.
- `WFI_ACCESS`: el acceso gratuito autorizado indicado arriba.
- `WFI_DAILY_LIMIT`: `20` (intervalo permitido 1–50).

Estas variables se gestionan con la configuración segura de Sites (`update_environment_variables`) y se aplican al volver a desplegar una versión guardada. No se colocan en `.openai/hosting.json`, `out/`, un archivo público o la compilación Vite. Un `.env` del entorno de trabajo por sí solo **no configura el Site remoto**. Si tu interfaz no ofrece un editor de secretos del Site, no inventes un menú ni compartas la clave en el chat: primero obtén la clave y utiliza el canal seguro de configuración disponible para tu cuenta. El backend ya está preparado; no hay que modificar el algoritmo ni añadir Bauhaus para activarlo.

La vista publicada sin clave responde `ready: false, code: missing_key`; no es un fallo de recorte ni un resultado de identificación. Hasta activarla, el OCR, las 117 familias / 203 variantes abiertas y el archivo propio siguen funcionando. No se presenta el conector pendiente como una búsqueda comercial ya ejecutada.

## Qué resultados devuelve y qué no acredita

El servidor solicita hasta 20 candidatos de fuentes gratuitas **y comerciales**, con `FREEFONTS=0`; no envía el nombre «Bauhaus» ni otro nombre como respuesta esperada. Envía solo una máscara PNG de la línea recortada, preparada en el navegador. Vuelve a validar tamaño, PNG y regiones antes del contacto externo. No envía la imagen completa, el archivo de una fuente privada ni el OCR como parámetro no documentado.

La API facilita un título y una ficha de WhatFontIs, con tipo y vendedor declarados. La interfaz los muestra como **candidatos externos sin verificar**: no calcula una probabilidad, no supone una familia/variante exacta por el título y no mezcla el orden externo con la distancia local. La etiqueta Free no acredita uso comercial. La ficha recibida es del identificador; si no se ha verificado el enlace de compra de la fundición/distribuidor, se dice expresamente. No se inventan URLs oficiales ni se descargan fuentes comerciales para generar un render ficticio.

El límite de Fontea es persistente y se reserva antes de llamar al proveedor; errores y cancelaciones después de enviar pueden contar. No hay reintentos automáticos, compras ni recargas. No borres el contador para intentar recuperar cuota. Si un cierre abrupto deja el bloqueo `.lock` de Node, detén primero todas las instancias de Fontea y elimina solo ese bloqueo tras comprobar que nadie escribe; conserva el JSON de cuota. Respuestas vacías, errores o falta de clave nunca se sustituyen por Bauhaus ni por otras fuentes.
