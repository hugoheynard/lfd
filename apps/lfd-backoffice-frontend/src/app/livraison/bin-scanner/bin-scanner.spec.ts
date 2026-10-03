import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BinScanner } from './bin-scanner';

async function boot(): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(BinScanner);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BinScanner', () => {
  it('sans caméra offerte à la page, renvoie au code tapé', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
    const element = await boot();
    expect(element.querySelector('[data-no-camera]')).not.toBeNull();
    expect(element.querySelector('[data-camera-on]')).toBeNull();
  });

  it('n’allume rien à l’ouverture : la caméra attend un geste', async () => {
    const getUserMedia = vi.fn(() => Promise.reject(new Error('refusé')));
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    const element = await boot();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(element.querySelector('[data-camera-on]')).not.toBeNull();
  });

  it('dit le refus de la caméra, et garde le bouton pour réessayer', async () => {
    const getUserMedia = vi.fn(() => Promise.reject(new Error('refusé')));
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(BinScanner);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('button[data-camera-on]')?.click();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(element.querySelector('[data-camera-denied]')).not.toBeNull();
    expect(element.querySelector('[data-camera-on]')).not.toBeNull();
  });

  it('une seule caméra sur la page : allumer un lecteur éteint l’autre, et rend un flux arrivé trop tard', async () => {
    const stopTrack = vi.fn();
    type FakeStream = { readonly getTracks: () => readonly { readonly stop: () => void }[] };
    const pending: ((stream: FakeStream) => void)[] = [];
    const getUserMedia = vi.fn(() => new Promise<FakeStream>((resolve) => pending.push(resolve)));
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    TestBed.resetTestingModule();
    const first = TestBed.createComponent(BinScanner);
    const second = TestBed.createComponent(BinScanner);
    first.detectChanges();
    second.detectChanges();
    const a = first.nativeElement as HTMLElement;
    const b = second.nativeElement as HTMLElement;

    a.querySelector<HTMLButtonElement>('button[data-camera-on]')?.click();
    first.detectChanges();
    expect(a.querySelector('[data-camera-off]')).not.toBeNull();

    b.querySelector<HTMLButtonElement>('button[data-camera-on]')?.click();
    await first.whenStable();
    first.detectChanges();
    second.detectChanges();
    expect(b.querySelector('[data-camera-off]')).not.toBeNull();
    expect(a.querySelector('[data-camera-off]')).toBeNull();
    expect(a.querySelector('[data-camera-on]')).not.toBeNull();

    // L'autorisation du premier arrive après coup : son flux est rendu aussitôt.
    pending[0]?.({ getTracks: () => [{ stop: stopTrack }] });
    await new Promise((resolve) => setTimeout(resolve));
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
