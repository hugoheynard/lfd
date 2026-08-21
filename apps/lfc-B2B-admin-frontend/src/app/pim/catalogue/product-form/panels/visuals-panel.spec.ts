import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';
import { VisualsPanel } from './visuals-panel';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

describe('VisualsPanel', () => {
  it('ajoute un visuel via le store au clic', () => {
    const store = setup();
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    const add = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Ajouter'),
    );
    (add as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.media()).toHaveLength(1);
    expect(store.media()[0]?.role).toBe('hero');
  });

  it('retire un visuel', () => {
    const store = setup();
    store.media.set([{ role: 'hero', url: '' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    const remove = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Retirer'),
    );
    (remove as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.media()).toHaveLength(0);
  });

  it("réserve la place de l'aperçu au ratio de l'image", () => {
    // Sans ratio, la liste saute au chargement de chaque image — le défaut que
    // les dimensions mesurées au dépôt existent pour corriger.
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://media.test/a.png', width: 1200, height: 800 }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const thumb = (fixture.nativeElement as HTMLElement).querySelector('.media-thumb');
    expect(thumb?.getAttribute('style')).toContain('1200 / 800');
  });

  it("n'invente pas de ratio pour un visuel dont on ne connaît pas la taille", () => {
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://ailleurs.test/a.png' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.media-thumb')?.getAttribute('style')).toContain('1 / 1');
    expect(host.textContent).toContain('non hébergée');
  });

  it('expose le texte alternatif, qui ne se saisissait nulle part', () => {
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://media.test/a.png', width: 800, height: 800 }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const alts = [...(fixture.nativeElement as HTMLElement).querySelectorAll('fold-input')];
    expect(alts.length).toBeGreaterThan(0);
  });
});
