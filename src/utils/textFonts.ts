import * as opentype from 'opentype.js';
import cinzelWoffUrl from '@fontsource/cinzel/files/cinzel-latin-600-normal.woff?url';
import fredokaWoffUrl from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff?url';
import jetbrainsWoffUrl from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import montserratWoffUrl from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff?url';
import pacificoWoffUrl from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff?url';
import playfairWoffUrl from '@fontsource/playfair-display/files/playfair-display-latin-600-normal.woff?url';
import { FontId, Point2D, TextSpec } from '../types/geometry';
import {
  boundsFromPoints,
  roundCoord,
  transformMathPath,
  translationMatrix,
} from './math2d';

export interface FontDefinition {
  id: FontId;
  label: string;
  styleTag: string;
  cssFamily: string;
  url: string;
}

export const FONT_DEFINITIONS: FontDefinition[] = [
  {
    id: 'montserrat',
    label: 'Moderna (Montserrat)',
    styleTag: 'Geométrica',
    cssFamily: 'TallerMontserrat',
    url: montserratWoffUrl,
  },
  {
    id: 'playfair',
    label: 'Elegante (Playfair)',
    styleTag: 'Serif clásica',
    cssFamily: 'TallerPlayfair',
    url: playfairWoffUrl,
  },
  {
    id: 'pacifico',
    label: 'Manuscrita (Pacifico)',
    styleTag: 'Cursiva',
    cssFamily: 'TallerPacifico',
    url: pacificoWoffUrl,
  },
  {
    id: 'fredoka',
    label: 'Redondeada (Fredoka)',
    styleTag: 'Amigable',
    cssFamily: 'TallerFredoka',
    url: fredokaWoffUrl,
  },
  {
    id: 'cinzel',
    label: 'Inscripción (Cinzel)',
    styleTag: 'Grabado romano',
    cssFamily: 'TallerCinzel',
    url: cinzelWoffUrl,
  },
  {
    id: 'jetbrains',
    label: 'Técnica (JetBrains)',
    styleTag: 'Monoespacio',
    cssFamily: 'TallerJetBrains',
    url: jetbrainsWoffUrl,
  },
];

export const FONT_MAP: Record<FontId, FontDefinition> = FONT_DEFINITIONS.reduce(
  (acc, f) => {
    acc[f.id] = f;
    return acc;
  },
  {} as Record<FontId, FontDefinition>
);

const parsedFonts = new Map<FontId, opentype.Font>();
const pendingLoads = new Map<FontId, Promise<opentype.Font>>();
const registeredCssFaces = new Set<FontId>();

function registerCssFontFace(def: FontDefinition, buffer: ArrayBuffer): void {
  if (
    registeredCssFaces.has(def.id) ||
    typeof document === 'undefined' ||
    typeof FontFace === 'undefined'
  ) {
    return;
  }
  registeredCssFaces.add(def.id);
  try {
    const face = new FontFace(def.cssFamily, buffer);
    face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
      })
      .catch(() => {
        // Ignore browser CSS FontFace preview error; vector paths still work
      });
  } catch {
    // Ignore
  }
}

export function getCachedFont(fontId: FontId): opentype.Font | undefined {
  return parsedFonts.get(fontId);
}

export async function ensureFontLoaded(fontId: FontId): Promise<opentype.Font> {
  const cached = parsedFonts.get(fontId);
  if (cached) return cached;

  const inflight = pendingLoads.get(fontId);
  if (inflight) return inflight;

  const def = FONT_MAP[fontId] ?? FONT_DEFINITIONS[0];
  const promise = (async () => {
    const resp = await fetch(def.url);
    if (!resp.ok) {
      throw new Error(`No se pudo cargar la fuente ${def.label}`);
    }
    const buffer = await resp.arrayBuffer();
    registerCssFontFace(def, buffer.slice(0));
    const font = opentype.parse(buffer);
    parsedFonts.set(fontId, font);
    pendingLoads.delete(fontId);
    return font;
  })().catch((err) => {
    pendingLoads.delete(fontId);
    throw err;
  });

  pendingLoads.set(fontId, promise);
  return promise;
}

export function preloadAllFonts(): void {
  for (const def of FONT_DEFINITIONS) {
    void ensureFontLoaded(def.id).catch(() => {});
  }
}

export function buildTextLocalPaths(
  font: opentype.Font,
  spec: TextSpec
): { localPaths: string[]; widthCm: number; heightCm: number } | null {
  const rawLines = spec.text.split(/\r?\n/);
  if (rawLines.every((l) => l.trim().length === 0)) return null;

  const fontSizeCm = Math.max(0.4, Math.min(15, spec.fontSizeCm || 2));
  const letterSpacingCm = spec.letterSpacingCm ?? 0;
  const align = spec.align ?? 'center';
  const scale = fontSizeCm / Math.max(1, font.unitsPerEm);
  const lineHeight = fontSizeCm * 1.25;

  const lineGlyphs = rawLines.map((line) => font.stringToGlyphs(line));
  const lineWidths = lineGlyphs.map((glyphs) => {
    let w = 0;
    for (let i = 0; i < glyphs.length; i++) {
      if (i > 0) {
        w +=
          font.getKerningValue(glyphs[i - 1], glyphs[i]) * scale +
          letterSpacingCm;
      }
      w += (glyphs[i].advanceWidth ?? 0) * scale;
    }
    return Math.max(0, w);
  });

  const maxLineWidth = Math.max(...lineWidths, 0.1);
  const rawGlyphPaths: string[] = [];
  const allPoints: Point2D[] = [];

  lineGlyphs.forEach((glyphs, lineIdx) => {
    const lineW = lineWidths[lineIdx];
    let cursorX =
      align === 'left'
        ? -maxLineWidth / 2
        : align === 'right'
          ? maxLineWidth / 2 - lineW
          : -lineW / 2;
    const baselineMathY = -lineIdx * lineHeight;

    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      if (i > 0) {
        cursorX +=
          font.getKerningValue(glyphs[i - 1], g) * scale + letterSpacingCm;
      }

      const otPath = g.getPath(cursorX, 0, fontSizeCm);
      if (otPath.commands.length > 0) {
        const parts: string[] = [];
        let hasOpenContour = false;
        for (const cmd of otPath.commands) {
          if (cmd.type === 'M' && cmd.x !== undefined && cmd.y !== undefined) {
            if (hasOpenContour) {
              parts.push('Z');
            }
            const x = roundCoord(cmd.x);
            const y = roundCoord(baselineMathY - cmd.y);
            parts.push(`M ${x} ${y}`);
            allPoints.push({ x, y });
            hasOpenContour = true;
          } else if (
            cmd.type === 'L' &&
            cmd.x !== undefined &&
            cmd.y !== undefined
          ) {
            const x = roundCoord(cmd.x);
            const y = roundCoord(baselineMathY - cmd.y);
            parts.push(`L ${x} ${y}`);
            allPoints.push({ x, y });
          } else if (
            cmd.type === 'C' &&
            cmd.x1 !== undefined &&
            cmd.y1 !== undefined &&
            cmd.x2 !== undefined &&
            cmd.y2 !== undefined &&
            cmd.x !== undefined &&
            cmd.y !== undefined
          ) {
            const x1 = roundCoord(cmd.x1);
            const y1 = roundCoord(baselineMathY - cmd.y1);
            const x2 = roundCoord(cmd.x2);
            const y2 = roundCoord(baselineMathY - cmd.y2);
            const x = roundCoord(cmd.x);
            const y = roundCoord(baselineMathY - cmd.y);
            parts.push(`C ${x1} ${y1} ${x2} ${y2} ${x} ${y}`);
            allPoints.push({ x: x1, y: y1 }, { x: x2, y: y2 }, { x, y });
          } else if (
            cmd.type === 'Q' &&
            cmd.x1 !== undefined &&
            cmd.y1 !== undefined &&
            cmd.x !== undefined &&
            cmd.y !== undefined
          ) {
            const x1 = roundCoord(cmd.x1);
            const y1 = roundCoord(baselineMathY - cmd.y1);
            const x = roundCoord(cmd.x);
            const y = roundCoord(baselineMathY - cmd.y);
            parts.push(`Q ${x1} ${y1} ${x} ${y}`);
            allPoints.push({ x: x1, y: y1 }, { x, y });
          } else if (cmd.type === 'Z') {
            if (hasOpenContour) {
              parts.push('Z');
              hasOpenContour = false;
            }
          }
        }
        if (hasOpenContour) {
          parts.push('Z');
        }
        const glyphD = parts.join(' ').trim();
        if (glyphD) rawGlyphPaths.push(glyphD);
      }

      cursorX += (g.advanceWidth ?? 0) * scale;
    }
  });

  if (rawGlyphPaths.length === 0 || allPoints.length === 0) return null;

  const bounds = boundsFromPoints(allPoints);
  if (!bounds) return null;

  const invTranslate = translationMatrix(-roundCoord(bounds.cx), -roundCoord(bounds.cy));
  const localPaths = rawGlyphPaths
    .map((d) => transformMathPath(d, invTranslate).svgD)
    .filter(Boolean);

  if (localPaths.length === 0) return null;

  return {
    localPaths,
    widthCm: roundCoord(bounds.width),
    heightCm: roundCoord(bounds.height),
  };
}

export async function generateTextLocalPathsAsync(
  spec: TextSpec
): Promise<{ localPaths: string[]; widthCm: number; heightCm: number } | null> {
  const font = await ensureFontLoaded(spec.fontId);
  return buildTextLocalPaths(font, spec);
}
