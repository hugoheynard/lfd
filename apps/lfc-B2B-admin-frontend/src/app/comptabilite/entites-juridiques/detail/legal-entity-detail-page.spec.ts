import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LegalEntityView } from '@lfd/contracts';

import { LegalEntitiesService } from '../../legal-entities.service';
import { LegalEntityDetailPage } from './legal-entity-detail-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - 🔴 **les DEUX boutons du mandat sont inactifs tant que l'entité ne peut pas
 *   encaisser.** Le serveur répond 409, et un bouton actif dont la seule issue
 *   est une erreur est une affordance qui ment ;
 * - 🔴 **« Voir » demande la variante `inline`**, « Télécharger » non. C'est ce
 *   paramètre qui décide entre un onglet et un fichier de plus dans un dossier
 *   de téléchargements, et rien dans les types ne le dirait ;
 * - **le champ ICS disparaît une fois l'ICS posé**, pour la même raison ;
 * - 🔴 **aucun IBAN ne s'affiche.** Le champ est vide même compte enregistré :
 *   l'IBAN ne revient d'aucune route.
 */

function entity(over: Partial<LegalEntityView> = {}): LegalEntityView {
  return {
    id: 'le1',
    name: 'La Folie Douce',
    legalForm: 'SAS',
    siren: '552100554',
    vatNumber: 'FR89552100554',
    rcs: 'Chambéry B 552 100 554',
    shareCapitalCents: 1_000_000,
    addressLine1: '12 rue du Fournil',
    addressLine2: '',
    postalCode: '73000',
    city: 'Chambéry',
    countryCode: 'FR',
    ics: '',
    creditorAccountLast4: '',
    preNotificationDays: 14,
    archivedAt: null,
    canCollect: false,
    missingToCollect: ["l'identifiant créancier (ICS)", "le compte bancaire de l'entité"],
    ...over,
  };
}

const COMPLETE: Partial<LegalEntityView> = {
  ics: 'FR72ZZZ123456',
  creditorAccountLast4: '2606',
  canCollect: true,
  missingToCollect: [],
};

class FakeLegalEntities {
  row: LegalEntityView = entity();
  /** Les options reçues par chaque appel au mandat, dans l'ordre. */
  readonly mandateCalls: { readonly inline?: boolean }[] = [];

  one(): Promise<LegalEntityView> {
    return Promise.resolve(this.row);
  }

  sampleMandate(_id: string, options: { readonly inline?: boolean } = {}): Promise<Blob> {
    this.mandateCalls.push(options);
    return Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
  }
}

async function render(api: FakeLegalEntities): Promise<ComponentFixture<LegalEntityDetailPage>> {
  TestBed.configureTestingModule({
    imports: [LegalEntityDetailPage],
    // `fold-back-link` porte un `routerLink` : sans routeur, son injection de
    // `ActivatedRoute` fait échouer la page entière.
    providers: [{ provide: LegalEntitiesService, useValue: api }, provideRouter([])],
  });
  const fixture: ComponentFixture<LegalEntityDetailPage> =
    TestBed.createComponent(LegalEntityDetailPage);
  fixture.componentRef.setInput('id', 'le1');
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<LegalEntityDetailPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

/**
 * Les deux boutons du mandat, NOMMÉS — et l'ordre du gabarit vérifié au passage
 * : « Voir » d'abord, parce que c'est le geste courant.
 */
const mandateButtons = (
  fixture: ComponentFixture<LegalEntityDetailPage>,
): { readonly view: HTMLButtonElement; readonly download: HTMLButtonElement } => {
  const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
    '.ej-mandate-actions button',
  );
  const [view, download] = [...buttons];
  if (view === undefined || download === undefined || buttons.length !== 2) {
    throw new Error(`La page porte ${buttons.length} bouton(s) de mandat au lieu de deux.`);
  }
  return { view, download };
};

describe('LegalEntityDetailPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuse les DEUX gestes du mandat tant que l’entité ne peut pas encaisser', async () => {
    const fixture = await render(new FakeLegalEntities());

    const buttons = mandateButtons(fixture);
    expect([buttons.view.disabled, buttons.download.disabled]).toEqual([true, true]);
    expect(text(fixture)).toContain('Incomplète');
    expect(text(fixture)).toContain("l'identifiant créancier (ICS)");
  });

  it('ouvre les deux gestes dès que l’entité peut encaisser', async () => {
    const api = new FakeLegalEntities();
    api.row = entity(COMPLETE);

    const fixture = await render(api);

    const buttons = mandateButtons(fixture);
    expect([buttons.view.disabled, buttons.download.disabled]).toEqual([false, false]);
    expect(buttons.view.textContent).toContain('Voir le mandat SEPA');
    expect(text(fixture)).toContain('Peut encaisser');
  });

  it('« Voir » demande la variante inline, « Télécharger » ne la demande pas', async () => {
    const api = new FakeLegalEntities();
    api.row = entity(COMPLETE);
    // `window.open` n'est pas implémenté dans jsdom : sans ce double, l'appel
    // écrirait une erreur « not implemented » et la page se croirait bloquée.
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    const fixture = await render(api);
    const buttons = mandateButtons(fixture);

    buttons.view.click();
    await fixture.whenStable();
    buttons.download.click();
    await fixture.whenStable();

    expect(api.mandateCalls).toEqual([{ inline: true }, { inline: false }]);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('l’état ne se lit qu’une fois : le badge est dans l’en-tête, pas dans la section', async () => {
    const api = new FakeLegalEntities();
    api.row = entity(COMPLETE);

    const fixture = await render(api);
    const badges = (fixture.nativeElement as HTMLElement).querySelectorAll('fold-badge');

    // Répéter l'état à trois centimètres ferait lire deux états là où il n'y
    // en a qu'un.
    expect(badges).toHaveLength(1);
    expect(badges[0]?.hasAttribute('titleBadge')).toBe(true);
  });

  it("n'offre PLUS de champ ICS une fois l'ICS posé", async () => {
    const api = new FakeLegalEntities();
    api.row = entity({ ics: 'FR72ZZZ123456' });

    const fixture = await render(api);
    const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll('fold-input');

    expect(text(fixture)).toContain('FR72ZZZ123456');
    // Le seul champ texte restant est celui de l'IBAN : un champ ICS ouvert
    // promettrait un geste que le serveur refuse en 409.
    expect(inputs).toHaveLength(1);
    expect(text(fixture)).toContain('Il ne se remplace pas');
  });

  it('ne montre jamais un IBAN, seulement ses quatre derniers caractères', async () => {
    const api = new FakeLegalEntities();
    api.row = entity({ creditorAccountLast4: '2606' });

    const fixture = await render(api);

    expect(text(fixture)).toContain('•••• 2606');
    // Le champ reste vide : l'IBAN ne revient d'aucune route, et le préremplir
    // demanderait de le faire redescendre.
    const iban = (fixture.nativeElement as HTMLElement).querySelector('input[type="text"]');
    expect((iban as HTMLInputElement | null)?.value ?? '').toBe('');
  });

  it('une entité archivée propose de la remettre en service', async () => {
    const api = new FakeLegalEntities();
    api.row = entity({ ...COMPLETE, archivedAt: '2026-09-10T09:00:00.000Z', canCollect: false });

    const fixture = await render(api);

    expect(text(fixture)).toContain('Archivée');
    expect(text(fixture)).toContain('Remettre en service');
  });
});
