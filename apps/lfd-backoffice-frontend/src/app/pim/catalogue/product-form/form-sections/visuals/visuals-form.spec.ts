import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../../product-form-store';
import { VisualsForm } from './visuals-form';

function setup(): ProductFormStore {
  TestBed.configureTestingModule({
    providers: [ProductFormStore, provideHttpClient()],
  });
  return TestBed.inject(ProductFormStore);
}

/*
 * 🔴 **Les trois cas de DÉPÔT ont été retirés le 2026-09-23** — le refus du
 * serveur, l'état « en cours » après un refus, et le rôle neutre d'un visuel
 * déposé. Ils éprouvaient `store.uploadMedia`, qui n'existe plus : une fiche
 * ne reçoit pas d'octets, elle rattache une URL de la médiathèque.
 *
 * Ce qu'ils gardaient est gardé ailleurs : le rôle neutre par
 * `addFromLibrary` (juste en dessous), et le refus d'un fichier par la
 * médiathèque, qui est désormais la seule à en accepter.
 */

describe('VisualsForm', () => {
  it('un visuel rattaché prend un rôle NEUTRE', () => {
    // L'API en exige un. Le premier entrant devenait « hero », ce qui
    // affirmait une hiérarchie que personne n'avait choisie.
    const store = setup();

    store.addFromLibrary([
      {
        url: 'https://media.test/a.png',
        name: 'tarte',
        width: 800,
        height: 600,
        bytes: 1024,
        contentType: 'image/png',
      },
    ]);

    expect(store.media()).toHaveLength(1);
    expect(store.media()[0]?.role).toBe('gallery');
  });

  it("transporte les dimensions MESURÉES, pour ne pas dire « inconnues » d'une image qu'on vient de rattacher", () => {
    // Régression : `addFromLibrary` ne gardait que l'URL et le nom, donc une
    // image rattachée s'affichait sans pastille de forme jusqu'au prochain
    // rechargement de la page (2026-09-23).
    const store = setup();

    store.addFromLibrary([
      {
        url: 'https://media.test/a.png',
        name: 'tarte',
        width: 1600,
        height: 1200,
        bytes: 253952,
        contentType: 'image/png',
      },
    ]);

    expect(store.media()[0]?.width).toBe(1600);
    expect(store.media()[0]?.height).toBe(1200);
  });

  it("n'offre AUCUN dépôt — les octets entrent par la médiathèque", () => {
    // Régression (2026-09-23) : la galerie portait une zone de dépôt en
    // dernière tuile, donc des octets entraient par une fiche. Alimenter et
    // taguer le fonds est un autre métier que rédiger une fiche, et un dépôt
    // offert ici remplissait la bibliothèque d'images que personne ne
    // retrouve.
    setup();
    const fixture = TestBed.createComponent(VisualsForm);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('fold-file-dropzone')).toBeNull();
    expect(host.querySelector('input[type="file"]')).toBeNull();
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
    const fixture = TestBed.createComponent(VisualsForm);
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
    const fixture = TestBed.createComponent(VisualsForm);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.media-ratio')).toBeNull();
  });

  it('réduit un ratio de capteur en décimale plutôt qu’en fraction illisible', () => {
    const store = setup();
    store.media.set([
      { role: 'hero', url: 'https://media.test/a.png', name: '', width: 4289, height: 2848 },
    ]);
    const fixture = TestBed.createComponent(VisualsForm);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.media-ratio')?.textContent,
    ).toContain(':1');
  });

  it("dit qu'une image n'est pas mesurée, plutôt que d'inventer 0 × 0", () => {
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://media.test/a.png', name: '' }]);
    const fixture = TestBed.createComponent(VisualsForm);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Dimensions inconnues');
  });

  it("n'offre AUCUN chemin pour saisir une URL — un visuel se choisit", () => {
    // Une URL saisie ferait pointer la fiche vers un fichier que personne ici
    // ne garde, et qui peut disparaître sans que rien ne le signale. Les URL
    // que la fiche porte viennent toutes du fonds.
    const store = setup();
    store.media.set([{ role: 'hero', url: 'https://media.test/a.png', name: 'a' }]);
    const fixture = TestBed.createComponent(VisualsForm);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).not.toContain('URL');
    const urlInputs = Array.from(host.querySelectorAll('input')).filter(
      (input) => input.type !== 'file',
    );
    expect(urlInputs).toEqual([]);
  });

  /*
   * 🔴 Le cas du LISERÉ a été retiré le 2026-09-23 : il éprouvait qu'une tuile
   * sans description se signale, or la fiche ne porte plus de description. Le
   * texte alternatif décrit l'image — partagée — et se saisit dans la
   * médiathèque. La complétude des descriptions est donc une question qui se
   * pose là-bas, sur le fonds, et plus fiche par fiche.
   */

  it('ne classe RIEN — la section agrège des ressources', () => {
    // Quelle image une boutique prend pour vignette est une décision du CANAL.
    const store = setup();
    store.media.set([
      { role: 'hero', url: 'https://media.test/a.png', name: 'a', alt: { fr: 'Une tarte' } },
    ]);
    const fixture = TestBed.createComponent(VisualsForm);
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
    const fixture = TestBed.createComponent(VisualsForm);
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
    const fixture = TestBed.createComponent(VisualsForm);
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
    const fixture = TestBed.createComponent(VisualsForm);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.media-thumb .media-menu')).toBeNull();
    expect(host.querySelector('.media-caption .media-menu')).not.toBeNull();
  });
});
