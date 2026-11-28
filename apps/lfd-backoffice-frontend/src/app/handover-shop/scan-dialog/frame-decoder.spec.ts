import { afterEach, describe, expect, it } from 'vitest';

import { frameDecoder } from './frame-decoder';
import { readQrCode } from './qr-reader';

/**
 * Régression : le lecteur du retrait n'avait que `BarcodeDetector`, que Safari
 * ne fournit pas — un iPhone disait « on ne peut pas lire » (2026-11-28).
 */
describe('frameDecoder', () => {
  const original: unknown = Reflect.get(globalThis, 'BarcodeDetector');

  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis, 'BarcodeDetector');
    } else {
      Reflect.set(globalThis, 'BarcodeDetector', original);
    }
  });

  it('retombe sur jsQR quand le navigateur n’a pas BarcodeDetector (Safari)', async () => {
    Reflect.deleteProperty(globalThis, 'BarcodeDetector');
    const decode = await frameDecoder();
    expect(decode).not.toBe(readQrCode);
  });

  it('jsQR ne lit rien sur une vidéo qui n’a pas encore d’image', async () => {
    Reflect.deleteProperty(globalThis, 'BarcodeDetector');
    const decode = await frameDecoder();
    const video = document.createElement('video');
    expect(await decode(video)).toBeNull();
  });
});
