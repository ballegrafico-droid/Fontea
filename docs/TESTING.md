# Pruebas y alcance de la evidencia

Pruebas ejecutadas el 17 de octubre de 2026. Los recuentos siguientes no estiman precisión general. Son muestras sintéticas de texto horizontal sobre blanco, no fotografías ni diseños comerciales reales.

## Separación entre ajuste y evaluación

- **Desarrollo: 26 muestras.** Dos transcripciones (`Hamburgo creativo 123`, `Agua mineral bosque`), 16 imágenes limpias de ocho familias/pesos, seis degradadas y cuatro externas (DejaVu Sans/Serif, limpias y degradadas). Se utilizó para detectar el efecto del tamaño óptico de Inter y conservar un filtro conservador de distancia 0,155. [Detalle por muestra](dev-results.csv), [resumen](dev-summary.json).
- **Evaluación inicial: 79 muestras distintas.** Transcripciones `Diseño y memoria 826` y `Ritmo visual elegante`. 42 variantes limpias de las once familias, 21 muestras degradadas, doce externas de seis familias y cuatro con letras insuficientes. No se cambió el filtro ni se ajustó el ranking con sus resultados. Detectó que los datos ingleses iniciales del OCR perdían la ñ en todas las muestras que la contenían. Se decidió incorporar los datos oficiales ingleses/españoles de Tesseract bajo Apache 2.0. Se conserva este resultado, no se sustituye: [CSV](evaluation-results.csv), [resumen](evaluation-summary.json).
- **Evaluación final: 79 muestras con textos nuevos**, `Impresión y carácter 497` y `Café diseño y tamaño`, con la misma cobertura de familias/variantes, externos y degradaciones. Evalúa el sistema con los modelos eng+spa incluidos. El algoritmo de comparación y su filtro permanecen como tras el desarrollo. [CSV](final-results.csv), [resumen](final-summary.json).

En total son **184 ejecuciones sobre 180 muestras distintas** en tres conjuntos (26 + 79 + 79). Las cuatro cadenas cortas son controles repetidos entre las dos evaluaciones. No se debe presentar este total como 184 casos independientes de fuentes arbitrarias. Las familias conocidas se comparten deliberadamente para probar nuevas transcripciones de cada variante; las familias externas de desarrollo son distintas de las de evaluación.

## Cómo se generan y miden

El rasterizador de las muestras es **Chromium Canvas**, distinto de Pillow/FreeType del comparador. Se carga cada archivo real mediante FontFace, con su peso/cursiva, a 60–78 px según caso. No se utiliza el renderizador del motor para crear las muestras del benchmark.

Las degradadas sufren reducción a la mitad, desenfoque gaussiano 0,45 px, JPEG calidad 52 y, en las familias del catálogo, un espaciado de 0,25 px. Esto no reproduce todas las degradaciones reales. Las fuentes externas son Liberation Sans, Liberation Serif, Nimbus Sans, Nimbus Roman, URW Gothic y P052; ninguna se añade al catálogo. Los controles cortos son HHH, Ill, aaa y OOO.

Se registra OCR literal y comparación **con la transcripción correcta**, que equivale a la corrección manual prevista en la interfaz. Por tanto, acertar la familia en esta tabla no implica que el flujo automático completo sin revisión haya acertado. El CSV conserva tanto `text` como `ocr` para comprobarlo.

- `top1FamilyCorrect` / `top1VariantCorrect`: primera posición del ranking, incluso si solo se muestra como alternativa. No son identificaciones confirmadas.
- `proposedCandidates`: el filtro permite proponer alguna fuente del catálogo.
- `candidateIncludesExpected`: esa lista incluye la variante correcta.
- `ocrExact`: transcripción completa idéntica, incluidos signos, tildes y números. Un solo carácter diferente cuenta como fallo literal.
- Externas: el comportamiento deseado es **cero candidatas originales**, aunque se ofrezcan alternativas explícitas.

## Desarrollo e informe inicial

| Conjunto inicial               | Muestras | Familia en primera posición | Variante en primera posición | Con candidatas | OCR literal |
| ------------------------------ | -------: | --------------------------: | ---------------------------: | -------------: | ----------: |
| Desarrollo, limpias            |       16 |                          16 |                           16 |             16 |          14 |
| Desarrollo, degradadas         |        6 |                           6 |                            6 |              2 |           6 |
| Desarrollo, externas           |        4 |                           — |                            — |              0 |           4 |
| Evaluación inicial, limpias    |       42 |                          42 |                           42 |             35 |           0 |
| Evaluación inicial, degradadas |       21 |                          21 |                           19 |              6 |          21 |
| Evaluación inicial, externas   |       12 |                           — |                            — |              0 |           6 |
| Evaluación inicial, cortas     |        4 |                           4 |                            4 |              0 |           2 |

Los dos errores de variante iniciales fueron Roboto Regular degradada → Roboto Bold y Roboto Mono Regular degradada → Roboto Mono Bold. En ambos casos el filtro evitó proponer una original. En siete muestras limpias y quince degradadas del catálogo no se propuso identificación a pesar de ordenar bien la familia: el filtro favorece abstenerse.

## Evaluación final

La tabla se completa a partir del JSON de la ejecución final. Véanse también las filas individuales, que son la evidencia primaria.

| Conjunto final      | Muestras | Familia en primera posición | Variante en primera posición | Con candidatas correctas | OCR literal |
| ------------------- | -------: | --------------------------: | ---------------------------: | -----------------------: | ----------: |
| Limpias             |       42 |                          42 |                           42 |                       39 |          21 |
| Degradadas          |       21 |                          21 |                           21 |                        4 |           9 |
| Externas limpias    |        6 |                           — |                            — |                        0 |           3 |
| Externas degradadas |        6 |                           — |                            — |                        0 |           3 |
| Pocas letras        |        4 |                           4 |                            4 |                        0 |           1 |

Con transcripción corregida, las 63 muestras del catálogo quedan ordenadas primero por familia y variante correctas. El filtro solo propone candidatas en 43; se abstiene en tres limpias y diecisiete degradadas. Las doce externas y los cuatro controles cortos quedan sin identificación. No hubo propuestas originales erróneas en este conjunto pequeño; no demuestra que no puedan ocurrir con otros diseños o fuentes.

El OCR final es literalmente correcto en **30 de las 63 muestras del catálogo** y 37 de las 79 totales. Recupera la ñ en la comprobación de regresión, pero puede perder otras tildes, confundir caracteres o añadir puntuación. Por ejemplo, `Diseño y tipografía` puede salir como `Diseño y tipografia`. Esto exige revisar la transcripción: no ofrecemos un flujo automático fiable sin esa corrección. El CSV permite examinar cada error, en lugar de ocultarlo tras un porcentaje agregado.

Estos son nuevos textos con acentos, no el mismo conjunto de la evaluación inicial, por lo que los recuentos de OCR no constituyen una comparación controlada del efecto del idioma. La comprobación específica con ñ y las pruebas de integración confirman que el modelo español se carga y se utiliza. La calidad del OCR y la cobertura fuera del catálogo son las principales tareas pendientes.

## API y navegador

`npm run build`: TypeScript y compilación de cliente/servidor correctos. Vite avisa que las URLs `/fonts/...` se resuelven en ejecución: son recursos servidos por Express, comprobados por HTTP y hash; no faltan en producción.

`npm test`: siete pruebas de integración:

1. Catálogo real, fuentes descargables idénticas a sus hashes, revisión fijada y licencias OFL.
2. OCR real de la demostración, conservación de la ñ en una muestra en español y comparación con resultado Inter Bold, sin campo de confianza inventado.
3. Archivos corruptos y transcripción ausente.
4. Más de 8 MB y dimensiones superiores al límite.
5. Pocas letras distintas: solo alternativas.
6. Una operación pesada concurrente; rechazo de la segunda y recuperación posterior.
7. Timeout: termina el grupo de procesos y admite una petición posterior.

`python scripts/doctor.py`: dependencias, Tesseract, modelos eng+spa, hashes de fuentes/modelos y licencias comprobados. `npm audit --omit=dev`: cero vulnerabilidades notificadas en la ejecución de esta entrega; no equivale a una auditoría de seguridad completa.

`python scripts/ui_smoke.py`: [registro](ui-checks.json). Chromium en Linux; sin desbordamiento a 320, 390, 768 y 1440 px. Prueba arrastre del recorte, diálogo y Escape, demostración marcada, OCR, resultado real Inter Bold, superposición, enlaces/descarga, corrección a texto insuficiente, carga de archivo en móvil y evento de pegado, y error por formato inválido. Sin excepciones JavaScript. El evento de portapapeles se simula; no se ha probado el portapapeles del sistema ni dispositivos físicos Android/iOS, Safari o Firefox.

Las once fichas oficiales respondieron HTTP 200: [registro](link-checks.json). Los archivos de licencia y fuente se descargaron desde URLs oficiales fijadas, y los tests comprueban que el archivo servido corresponde al resultado. No es una certificación legal externa ni garantiza disponibilidad futura de esos sitios.

## Reproducir

Con dependencias de desarrollo Python instaladas y Chromium en `/usr/bin/chromium`:

```bash
npm run build
npm test
python scripts/doctor.py
# En otra terminal, con PYTHON_BIN correcto:
npm start
python scripts/ui_smoke.py http://127.0.0.1:3001
python scripts/evaluate.py --split final
```

Las imágenes se guardan en `tests/artifacts/final` (ignorado en Git). Los CSV/JSON se versionan. Para reproducir los informes anteriores usa `TESSERACT_LANG=eng python scripts/evaluate.py --split dev` o `TESSERACT_LANG=eng python scripts/evaluate.py --split evaluation`. El archivo inglés incluido tiene el mismo SHA-256 que el inglés del sistema utilizado en esas ejecuciones. Sin esa variable se usa eng+spa y cambian las transcripciones OCR, no el comparador. No ajustes el motor con `final` si quieres seguir usando ese conjunto como evaluación reservada; crea textos y fuentes externos nuevos para la próxima versión.
