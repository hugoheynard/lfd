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

/** Un dépôt qui aboutit — l'API rend l'objet tel qu'elle le rend vraiment. */
function accepting(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [
      ProductFormStore,
      provideHttpClient(),
      {
        provide: ProductHttpApi,
        useValue: {
          uploadMedia: (): Promise<{ url: string; width: number; height: number }> =>
            Promise.resolve({ url: 'https://media.test/depose.png', width: 800, height: 600 }),
        },
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
  it('un visuel déposé prend un rôle NEUTRE', async () => {
    // L'API en exige un, mais l'écran n'en propose plus. Le premier déposé
    // devenait « hero », ce qui affirmait une hiérarchie que ni Shopify ni le
    // B2B ne lisent.
    const store = accepting();

    await store.uploadMedia(new File([new Uint8Array([1])], 'photo.png'));

    expect(store.media()).toHaveLength(1);
    expect(store.media()[0]?.role).toBe('gallery');
  });

  it('pose le dépôt DANS la galerie, à la place de l’image suivante', () => {
    setup();
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    const gallery = (fixture.nativeElement as HTMLElement).querySelector('.media')!;
    expect(gallery.querySelector('fold-file-dropzone')).not.toBeNull();
  });

  it('dit la FORME du fichier en pastille, que le recadrage cache', () => {
    // La vignette recadre pour que la grille reste comparable ; sans la
    // pastille, on découvrirait en boutique qu'un visuel était un portrait.
    const store = setup();
    store.media.set([
      {
        role: 'hero',
        url: 'https://media.test/a.png',
        name: 'tarte-face',
        alt: { fr: 'Une tarte' },
        width: 1600,
        height: 1200,
        bytes: 253952,
      },
    ]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.media-ratio')?.textContent?.trim()).toBe('4:3');
    expect(host.textContent).toContain('1600 × 1200');
    expect(host.textContent).toContain('248 ko');
  });

  it('ne met AUCUNE pastille sur une image non mesurée', () => {
    // Une pastille vide vaudrait mieux que rien ; une pastille FAUSSE serait
    // pire que les deux.
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://ailleurs.test/a.png', name: '' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.media-ratio')).toBeNull();
  });

  it('réduit un ratio de capteur en décimale plutôt qu’en fraction illisible', () => {
    const store = setup();
    store.media.set([
      { role: 'hero', url: 'https://media.test/a.png', name: '', width: 4289, height: 2848 },
    ]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.media-ratio')?.textContent,
    ).toContain(':1');
  });

  it("dit qu'une image n'est pas mesurée, plutôt que d'inventer 0 × 0", () => {
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://media.test/a.png', name: '' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Dimensions inconnues');
  });

  it("n'offre AUCUN chemin pour saisir une URL — un visuel entre par le dépôt", () => {
    // Le dépôt écrit dans notre stockage ; une URL saisie ferait pointer la
    // fiche vers un fichier que personne ici ne garde, et qui peut disparaître
    // sans que rien ne le signale.
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://media.test/a.png', name: 'a' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).not.toContain('URL');
    const urlInputs = Array.from(host.querySelectorAll('input')).filter(
      (input) => input.type !== 'file',
    );
    expect(urlInputs).toEqual([]);
  });

  it('marque la tuile d’un liseré, et détaille AU-DESSUS de la grille', () => {
    // Un message par vignette devenait le motif de fond de la section : répété
    // huit fois, on ne lisait plus que lui. La tuile dit « celle-ci », le
    // callout dit « ce qui manque ».
    const store = setup();
    store.media.set([
      {
        role: 'gallery',
        url: 'https://media.test/a.png',
        name: 'a',
        alt: { fr: 'Une tarte', en: 'A tart', it: 'Una crostata' },
      },
      { role: 'gallery', url: 'https://media.test/b.png', name: 'b' },
    ]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const tiles = [...host.querySelectorAll('.media-tile')];
    expect(tiles[0]?.classList.contains('is-incomplete')).toBe(false);
    expect(tiles[1]?.classList.contains('is-incomplete')).toBe(true);

    const callouts = host.querySelectorAll('fold-callout');
    expect(callouts.length).toBe(1);
    expect(callouts[0]?.textContent).toContain('aucune description');
  });

  it('ne classe RIEN — la section agrège des ressources', () => {
    // Quelle image une boutique prend pour vignette est une décision du CANAL.
    const store = setup();
    store.media.set([
      { role: 'hero', url: 'https://media.test/a.png', name: 'a', alt: { fr: 'Une tarte' } },
    ]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.media-badge')).toBeNull();
    expect(host.textContent).not.toContain('Principale');
  });

  it('affiche le NOM du visuel, distinct de sa description', () => {
    // Le nom identifie le fichier pour l'équipe ; la description dit l'image à
    // qui ne la voit pas. Deux informations, deux publics, deux lignes.
    const store = setup();
    store.media.set([
      {
        role: 'gallery',
        url: 'https://media.test/a.png',
        name: 'tarte-face-01',
        alt: { fr: 'Tarte entière, vue de face' },
      },
    ]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.media-name')?.textContent?.trim()).toBe('tarte-face-01');
    expect(host.querySelector('.media-alt')?.textContent?.trim()).toBe(
      'Tarte entière, vue de face',
    );
  });

  it('dit « sans nom » plutôt que de laisser la rangée vide', () => {
    const store = setup();
    store.media.set([{ role: 'gallery', url: 'https://media.test/a.png', name: '' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.media-name')?.textContent).toContain('Sans nom');
    expect(host.querySelector('.media-alt')?.textContent).toContain('Sans description');
  });

  it('pose le menu dans la LÉGENDE, pas sur l’aperçu', () => {
    // Un contrôle posé sur une photo quelconque a exactement le problème de
    // lisibilité qu'avait la pastille « Principale ».
    const store = setup();
    store.media.set([{ role: 'gallery', url: 'https://media.test/a.png', name: 'a' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.media-thumb .media-menu')).toBeNull();
    expect(host.querySelector('.media-caption .media-menu')).not.toBeNull();
  });
});
