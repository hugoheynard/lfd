import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductHttpApi } from '../../product-http-api';
import { ProductFormStore } from '../product-form-store';
import { VisualsPanel } from './visuals-panel';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

/**
 * L'enveloppe telle que l'API la rend VRAIMENT — c'est elle que `httpErrorMessage`
 * sait lire, et un faux approximatif ferait passer le test pour de mauvaises
 * raisons. `HttpErrorResponse` est une `Error` dont le `message` est générique :
 * toute la valeur est dans `error.message`.
 */
function refusal(message: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 400,
    url: 'http://localhost:3200/pim/catalogue/media',
    error: { code: 'catalogue.media.unsupported_image', message },
  });
}

/** Un dépôt qui échoue, l'API remplacée par la porte d'injection — pas par une
 *  écriture dans un champ privé du store. */
function refusing(message: string): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [
      ProductFormStore,
      provideHttpClient(),
      {
        provide: ProductHttpApi,
        useValue: { uploadMedia: (): Promise<never> => Promise.reject(refusal(message)) },
      },
    ],
  });
  return TestBed.inject(ProductFormStore);
}

describe('VisualsPanel — le refus du serveur', () => {
  it('affiche la raison du refus, pas le code HTTP', async () => {
    const reason = 'Visuel refusé : format non accepté — PNG, JPEG ou WebP attendus.';
    const store = refusing(reason);

    await store.uploadMedia(new File([new Uint8Array([1])], 'photo.heic'));

    expect(store.error()).toBe(reason);
  });

  it('ne laisse pas le dépôt marqué « en cours » après un refus', async () => {
    const store = refusing('Trop petit.');

    await store.uploadMedia(new File([new Uint8Array([1])], 'photo.png'));

    expect(store.uploading()).toBe(false);
  });
});

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

  it('marque sur la VIGNETTE ce qui pèche, pas dans un panneau', () => {
    // C'est ce qui rend visible d'un coup l'image fautive, sans ouvrir les
    // trois. Une liste de lignes obligeait à les lire une par une.
    const store = setup();
    store.media.set([
      { role: 'hero', url: 'https://media.test/a.png', alt: { fr: 'Une tarte' } },
      { role: 'gallery', url: 'https://media.test/b.png' },
    ]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const tiles = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.media-tile')];
    expect(tiles.length).toBe(2);
    expect(tiles[0]?.classList.contains('is-incomplete')).toBe(false);
    expect(tiles[1]?.classList.contains('is-incomplete')).toBe(true);
    expect(tiles[1]?.textContent).toContain('Texte alternatif manquant');
  });

  it('désigne la PRINCIPALE, celle que les boutiques prennent', () => {
    const store = setup();
    store.media.set([
      { role: 'gallery', url: 'https://media.test/b.png', alt: { fr: 'Une part' } },
      { role: 'hero', url: 'https://media.test/a.png', alt: { fr: 'Une tarte' } },
    ]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const tiles = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.media-tile')];
    // C'est le RÔLE qui la désigne, pas la position — le modèle porte les deux,
    // et seul le rôle survit à un réordonnancement.
    expect(tiles[0]?.classList.contains('is-hero')).toBe(false);
    expect(tiles[1]?.classList.contains('is-hero')).toBe(true);
    expect(tiles[1]?.querySelector('.media-badge')).not.toBeNull();
  });

  it('pose le dépôt DANS la galerie, à la place de l’image suivante', () => {
    setup();
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    const gallery = (fixture.nativeElement as HTMLElement).querySelector('.media')!;
    expect(gallery.querySelector('fold-file-dropzone')).not.toBeNull();
  });

  it("dit qu'une image externe n'est pas mesurée, plutôt que d'inventer 0 × 0", () => {
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://ailleurs.test/a.png' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('non hébergée');
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
