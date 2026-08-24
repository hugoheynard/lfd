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
    // Un rôle NEUTRE : l'API en exige un, mais l'écran n'en propose plus. Le
    // premier déposé devenait « hero », ce qui affirmait une hiérarchie que ni
    // Shopify ni le B2B ne lisent.
    expect(store.media()[0]?.role).toBe('gallery');
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

  it('ne classe RIEN — la section agrège des ressources', () => {
    // Quelle image une boutique prend pour vignette est une décision du CANAL,
    // comme le handle Shopify. La notion de « principale » n'avait d'ailleurs
    // aucun consommateur : ni la projection Shopify ni le B2B ne lisent le rôle.
    const store = setup();
    store.media.set([
      { role: 'hero', url: 'https://media.test/a.png', alt: { fr: 'Une tarte' } },
      { role: 'gallery', url: 'https://media.test/b.png', alt: { fr: 'Une part' } },
    ]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.media-badge')).toBeNull();
    expect(host.textContent).not.toContain('Principale');
    // …et aucun rôle à choisir : le menu ne porte plus que l'alternative et le retrait.
    const items = [...host.querySelectorAll('fold-dropdown-item')].map(
      (item) => item.textContent?.trim() ?? '',
    );
    expect(items).not.toContain('Galerie');
    expect(items.some((label) => label.includes('Texte alternatif'))).toBe(true);
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
    store.media.set([{ role: 'hero', url: 'https://ailleurs.test/a.png' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.media-ratio')).toBeNull();
  });

  it('réduit un ratio de capteur en décimale plutôt qu’en fraction illisible', () => {
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://media.test/a.png', width: 4289, height: 2848 }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.media-ratio')?.textContent,
    ).toContain(':1');
  });

  it('ouvre le texte alternatif dans un panneau, les trois langues d’un coup', () => {
    // Une tuile fait onze rems : un champ qui n'y montre qu'UNE langue oblige à
    // basculer trois fois pour vérifier une image.
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://media.test/a.png', alt: { fr: 'Une tarte' } }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    // Aucun champ de saisie dans la tuile — la légende est le bouton.
    expect(host.querySelector('.media-caption fold-input')).toBeNull();
    const trigger = host.querySelector<HTMLButtonElement>('.media-alt');
    expect(trigger?.textContent).toContain('Une tarte');
  });

  it('nomme les langues qui manquent À CETTE image', () => {
    // La question devant une galerie n'est pas « manque-t-il des traductions »
    // mais « laquelle, sur laquelle » — le compte de la section n'y répond pas.
    const store = setup();
    store.media.set([
      { role: 'hero', url: 'https://media.test/a.png', alt: { fr: 'Une tarte', en: 'A tart' } },
      { role: 'gallery', url: 'https://media.test/b.png', alt: { fr: 'Une part' } },
    ]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const tiles = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.media-tile')];
    expect(tiles[0]?.textContent).toContain('À traduire en italien');
    expect(tiles[0]?.textContent).not.toContain('anglais');
    expect(tiles[1]?.textContent).toContain('anglais et italien');
  });

  it("dit qu'une image externe n'est pas mesurée, plutôt que d'inventer 0 × 0", () => {
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://ailleurs.test/a.png' }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('non hébergée');
  });

  it('expose le texte alternatif — sur la vignette, et éditable', () => {
    // Il ne se saisissait NULLE PART avant ; il se lit maintenant sur la
    // légende, et s'édite dans le panneau qu'elle ouvre.
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://media.test/a.png', width: 800, height: 800 }]);
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.detectChanges();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector('.media-alt');
    expect(trigger).not.toBeNull();
    expect(trigger?.tagName).toBe('BUTTON');
  });
});
