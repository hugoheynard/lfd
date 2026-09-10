import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { afterEach, describe, expect, it } from 'vitest';

import { MandatePanel, type MandatePanelData } from './mandate-panel';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - 🔴 **l'URL d'objet est révoquée quand le panneau se ferme**, pas après un
 *   délai. C'est la seule raison d'avoir remplacé l'onglet : la fermeture EST
 *   l'instant où plus personne ne regarde le document. Sans ce cas, la
 *   révocation se perdrait au premier refactor sans que rien ne rougisse ;
 * - **le document affiché est celui qu'on a reçu** — l'iframe pointe sur l'URL
 *   fabriquée à partir du blob, et sur aucune autre.
 */

const PDF = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

const DATA: MandatePanelData = {
  blob: PDF,
  entityName: 'La Folie Douce',
  fileName: 'mandat-sepa-exemple.pdf',
};

/**
 * Les deux fonctions d'URL d'objet, remplacées puis rendues.
 *
 * Remplacées et non espionnées : selon la version de jsdom, `createObjectURL`
 * peut ne pas exister du tout, et `vi.spyOn` sur une méthode absente échoue.
 * On ne touche que ces deux propriétés — remplacer `URL` entier casserait le
 * constructeur, dont Angular se sert.
 */
function stubObjectUrls(url: string): {
  readonly created: Blob[];
  readonly revoked: string[];
} {
  const created: Blob[] = [];
  const revoked: string[] = [];
  const previous = {
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
  };
  restore = (): void => {
    URL.createObjectURL = previous.create;
    URL.revokeObjectURL = previous.revoke;
  };
  URL.createObjectURL = (blob: Blob): string => {
    created.push(blob);
    return url;
  };
  URL.revokeObjectURL = (value: string): void => {
    revoked.push(value);
  };
  return { created, revoked };
}

/** Rendu par `stubObjectUrls`, rejoué après chaque cas. */
let restore: () => void = () => undefined;

async function render(): Promise<ComponentFixture<MandatePanel>> {
  TestBed.configureTestingModule({
    imports: [MandatePanel],
    // Un vrai `FoldPanelRef` plutôt qu'un double casté : sa signature est
    // publique, et un cast masquerait le jour où elle change.
    providers: [{ provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) }],
  });
  const fixture: ComponentFixture<MandatePanel> = TestBed.createComponent(MandatePanel);
  fixture.componentRef.setInput('data', DATA);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('MandatePanel', () => {
  afterEach(() => {
    restore();
    restore = (): void => undefined;
  });

  it('affiche le document reçu dans une iframe', async () => {
    const urls = stubObjectUrls('blob:mandat');

    const fixture = await render();
    const frame = (fixture.nativeElement as HTMLElement).querySelector('iframe');

    expect(urls.created).toEqual([PDF]);
    expect(frame?.getAttribute('src')).toBe('blob:mandat');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('La Folie Douce');
  });

  it("révoque l'URL du blob à la fermeture du panneau, et pas avant", async () => {
    const urls = stubObjectUrls('blob:mandat');
    const fixture = await render();

    // Tant que le panneau est à l'écran, le document doit rester lisible :
    // révoquer ici viderait l'iframe sous les yeux du lecteur.
    expect(urls.revoked).toEqual([]);

    // La fermeture du panneau détruit le composant — c'est le même instant.
    fixture.destroy();

    expect(urls.revoked).toEqual(['blob:mandat']);
  });
});
