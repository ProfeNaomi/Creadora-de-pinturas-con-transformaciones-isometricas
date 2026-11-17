/// <reference types="vite/client" />

declare module 'opentype.js' {
  export interface FontBoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  export interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  export interface OpenTypePath {
    commands: PathCommand[];
    getBoundingBox(): FontBoundingBox;
    toPathData(decimalPlaces?: number): string;
  }

  export interface Glyph {
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): OpenTypePath;
  }

  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    stringToGlyphs(str: string): Glyph[];
    getKerningValue(leftGlyph: Glyph, rightGlyph: Glyph): number;
    getPath(
      text: string,
      x: number,
      y: number,
      fontSize: number,
      options?: Record<string, unknown>
    ): OpenTypePath;
  }

  export function parse(buffer: ArrayBuffer): Font;
}
