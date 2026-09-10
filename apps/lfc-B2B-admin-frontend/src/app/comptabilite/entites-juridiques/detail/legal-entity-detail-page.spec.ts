import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { LegalEntityView } from '@lfd/contracts';

import { LegalEntitiesService } from '../../legal-entities.service';
import { LegalEntityDetailPage } from './legal-entity-detail-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - 🔴 **le mandat d'exemple est inactif tant que l'entité ne peut pas
 *   encaisser.** Le serveur répond 409, et un bouton actif dont la seule issue
 *   est une erreur est une affordance qui ment ;
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

  one(): Promise<LegalEntityView> {
    return Promise.resolve(this.row);
  }
}

async function render(api: FakeLegalEntities): Promise<ComponentFixture<LegalEntityDetailPage>> {
  TestBed.configureTestingModule({
    imports: [LegalEntityDetailPage],
    providers: [{ provide: LegalEntitiesService, useValue: api }],
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

const mandateButton = (fixture: ComponentFixture<LegalEntityDetailPage>): HTMLButtonElement => {
  const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    'button[pageActions]',
  );
  if (button === null) {
    throw new Error('Le bouton du mandat est absent de la page.');
  }
  return button;
};

describe('LegalEntityDetailPage', () => {
  it('refuse le mandat tant que l’entité ne peut pas encaisser, et dit pourquoi', async () => {
    const fixture = await render(new FakeLegalEntities());

    expect(mandateButton(fixture).disabled).toBe(true);
    expect(text(fixture)).toContain('Incomplète');
    expect(text(fixture)).toContain("l'identifiant créancier (ICS)");
  });

  it('ouvre le mandat dès que l’entité peut encaisser', async () => {
    const api = new FakeLegalEntities();
    api.row = entity(COMPLETE);

    const fixture = await render(api);

    expect(mandateButton(fixture).disabled).toBe(false);
    expect(text(fixture)).toContain('Peut encaisser');
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
