# Taller Isométrico — Creadora de Pinturas y Corte Láser

Aplicación web educativa diseñada para que estudiantes creen obras de arte utilizando **transformaciones isométricas** (simetría axial, simetría central, rotación, rosetones/mandalas y traslación) y exporten sus diseños en formato **SVG 1:1 en milímetros** listos para cortadora láser sobre madera.

## Características principales

- **Cuadrícula e imán configurable:** Ajuste de precisión entre `1 cm` (enteros), `0.5 cm`, `0.25 cm`, `0.1 cm` (milímetros) y modo libre, además de imán automático a puntos de referencia.
- **Separación automática para cortadora láser:**
  - `CORTE_BORDE` (`#ff0000` rojo): exclusivamente el contorno exterior del tablero (`10×10`, `15×15`, `20×20`, `25×25`, `30×30` cm o personalizado, cuadrado, redondeado o circular, con opción de perforación para colgar).
  - `GRABADO_INTERIOR` (`#000000` negro): todas las líneas, trazos, punteados y formas interiores sin rellenos, listas para marcar/grabar sobre madera y pintar en físico.
- **Guías matemáticas (no exportadas al láser):** Puntos, rectas/ejes y vectores de traslación editables.
- **Panel lateral estilo GeoGebra:** Historial paramétrico de transformaciones aplicadas, objetos guía y figuras base, con opción de ocultar, ajustar parámetros (ángulo, copias) o borrar directamente.
- **Modo Pintura vs. Vista Láser:** Permite probar colores de relleno en pantalla para planificar cómo pintar la pieza en persona, y descargar una imagen PNG de referencia o guardar/abrir proyectos `.json`.

## Publicación en GitHub Pages

El repositorio incluye un flujo automático en `.github/workflows/deploy.yml`. En GitHub, ve a **Settings → Pages → Source** y selecciona **GitHub Actions**.
