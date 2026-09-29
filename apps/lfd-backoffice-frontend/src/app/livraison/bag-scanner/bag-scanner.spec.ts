import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BagScanner } from './bag-scanner';

async function boot(): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(BagScanner);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BagScanner', () => {
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
    const fixture = TestBed.createComponent(BagScanner);
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
});
