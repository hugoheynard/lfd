import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { PdfPrinter } from './pdf-printer';

describe('PdfPrinter', () => {
  afterEach(() => {
    document.querySelectorAll('iframe').forEach((frame) => {
      frame.remove();
    });
  });

  it('imprime depuis un cadre caché qui porte le PDF', () => {
    TestBed.inject(PdfPrinter).print(new Blob(['%PDF-1.3'], { type: 'application/pdf' }));
    const frame = document.querySelector('iframe');
    expect(frame?.hidden).toBe(true);
    expect(frame?.getAttribute('src')).toMatch(/^blob:/u);
  });
});
