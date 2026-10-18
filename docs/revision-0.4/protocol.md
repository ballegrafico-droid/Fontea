# Protocolo fijado antes de evaluar

- Baseline: código y catálogo 0.3 (`61e6ffb`), 17 familias / 66 variantes.
- Desarrollo: 16 imágenes independientes de las de evaluación, texto «AVATAR, ritmo y alegría 135», Pillow/FreeType. No contienen el diseño real del usuario.
- Evaluación nueva: 76 PNG; 24 variantes originales (17 familias), 32 familias añadidas, ocho imágenes de seis familias ajenas, ocho diseños de dos/tres líneas (una o varias familias) y cuatro controles de resolución/contraste/letras insuficientes.
- Texto correcto suministrado para comparar tipografía: equivale a revisar el OCR. No se mide aquí precisión automática de extremo a extremo.
- Umbral original 0,155 y margen 0,025 conservados. Alternativas nuevas: distancia <=0,20 y cociente de proporciones dentro de 1,2×. No se admiten alternativas con calidad insuficiente ni varias líneas.
- Etapa 1: glifos rasterizados a 32px, métricas y kerning; recomposición y comparación gruesa sin archivos tipográficos. 24 variantes mejor puntuadas y hasta ocho de familias adicionales; máximo 32. Etapa 2: fuente original, tres espaciados y tamaños ópticos existentes, misma distancia de contornos anterior.
- Navegador Chromium 154, perfil/proceso nuevo por observación y orden antes/después alternado. Mismos PNG y hashes, fondo uniforme, FreeType distinto de Canvas. Sin carga simultánea de otros experimentos durante la evaluación final.
- Tiempo de pared del Worker, incluidas descarga HTTP local de índice/fuentes, composición, comparación y PNG. Memoria: máximo PSS/RSS del árbol Chromium cada 75ms, excluido Node Playwright; PSS reparte páginas compartidas y RSS las cuenta varias veces. Incluye la base del navegador. No es solo heap JS ni una predicción para un móvil físico/VPS.
- Red: tamaño de los archivos tipográficos únicos solicitados, no bytes reales de transferencia ni medición de caché; la página puede haber cargado dos fuentes de interfaz antes. Se incluye por separado el índice de 2.381.932 bytes.
- Se usa el servidor HTTP estándar local para ambas versiones. Vite preview tenía proxy heredado hacia una API ausente y manejo diferente de comas escapadas en los nombres de fuentes variables: se corrigieron ambos para la aplicación actual. No se modificó la geometría ni el algoritmo del baseline.
- Nombres/fichas proceden de metadatos oficiales fijados; 117 enlaces HEAD 200. 165 originales TTF se cargan correctamente con FontFace. 202/203 variantes cubren todas las letras españolas con tildes/diéresis/ñ; Gamja Flower carece de ellas y no se selecciona para transcripciones que las requieran.

Los resultados mostrarán errores, candidatas equivocadas, fallos de recuperación inicial y abstenciones, sin eliminarlos del denominador. Un ranking correcto no se considera identidad exacta. El caso «Dawn en la granja» queda pendiente de recibir el archivo/capturas y su procedencia tipográfica: no se ha afirmado identificarlo.

## Segunda ejecución y diagnóstico de pesos

Se mantiene el resultado inicial con 76 pares en `initial-*`. Una evaluación adicional de pesos no muestreados reveló errores de variante. La versión final añade un veto si un peso intermedio del mismo archivo mejora por más de 0,025, sin disminuir el filtro de originales. Se repiten las 76 observaciones de la versión final; el baseline de 0.3 se reutiliza sin alterar. Por tanto, la comparación temporal final no vuelve a alternar las dos versiones. Los pesos no muestreados se validan además con otro grupo de seis imágenes/pesos/frases; los fallos remanentes se registran y no se retoca el margen para eliminarlos.
