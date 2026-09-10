import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { LegalEntityView } from '@lfd/contracts';

import { LegalEntitiesService } from '../legal-entities.service';
import { EntitesJuridiquesPage } from './entites-juridiques-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **le champ ICS disparaît une fois l'ICS posé.** C'est la règle des
 *   affordances qui mentent : le serveur refuserait en 409, et laisser un champ
 *   ouvert promet un geste impossible ;
 * - **l'écran ne recalcule pas la complétude.** Il affiche ce que le serveur a
 *   rédigé — un test qui passerait `canCollect: true` avec une liste de manques
 *   doit montrer « peut encaisser », parce que c'est l'agrégat qui décide ;
 * - 🔴 **aucun IBAN ne s'affiche.** Le champ est vide même compte enregistré.
 *
 * On passe par le DOM : les membres sont `protected`, et c'est le gabarit qui
 * câble les branches — ce que le typecheck ne lit pas.
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

class FakeLegalEntities {
  rows: readonly LegalEntityView[] = [entity()];

  list(): Promise<readonly LegalEntityView[]> {
    return Promise.resolve(this.rows);
  }
}

async function render(api: FakeLegalEntities): Promise<ComponentFixture<EntitesJuridiquesPage>> {
  TestBed.configureTestingModule({
    imports: [EntitesJuridiquesPage],
    providers: [{ provide: LegalEntitiesService, useValue: api }],
  });
  const fixture: ComponentFixture<EntitesJuridiquesPage> =
    TestBed.createComponent(EntitesJuridiquesPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<EntitesJuridiquesPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('EntitesJuridiquesPage', () => {
  it('dit ce qui manque, avec les mots du serveur', async () => {
    const fixture = await render(new FakeLegalEntities());

    expect(text(fixture)).toContain('Incomplète');
    expect(text(fixture)).toContain("l'identifiant créancier (ICS)");
    // L'avertissement de tête : rien ne peut être prélevé aujourd'hui.
    expect(text(fixture)).toContain("Aucun prélèvement n'est possible");
  });

  it("n'offre PLUS de champ ICS une fois l'ICS posé", async () => {
    const api = new FakeLegalEntities();
    api.rows = [entity({ ics: 'FR72ZZZ123456' })];

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
    api.rows = [entity({ creditorAccountLast4: '2606' })];

    const fixture = await render(api);

    expect(text(fixture)).toContain('•••• 2606');
    // Le champ reste vide : l'IBAN ne revient d'aucune route, et le préremplir
    // demanderait de le faire redescendre.
    const iban = (fixture.nativeElement as HTMLElement).querySelector('input[type="text"]');
    expect((iban as HTMLInputElement | null)?.value ?? '').toBe('');
  });

  it('une entité capable ne déclenche pas l’avertissement de tête', async () => {
    const api = new FakeLegalEntities();
    api.rows = [
      entity({
        ics: 'FR72ZZZ123456',
        creditorAccountLast4: '2606',
        canCollect: true,
        missingToCollect: [],
      }),
    ];

    const fixture = await render(api);

    expect(text(fixture)).toContain('Peut encaisser');
    expect(text(fixture)).not.toContain("Aucun prélèvement n'est possible");
  });

  it('une entité archivée le dit, et ne se présente pas comme capable', async () => {
    const api = new FakeLegalEntities();
    api.rows = [
      entity({
        ics: 'FR72ZZZ123456',
        creditorAccountLast4: '2606',
        archivedAt: '2026-09-10T09:00:00.000Z',
        canCollect: false,
        missingToCollect: ["l'entité est archivée"],
      }),
    ];

    const fixture = await render(api);

    expect(text(fixture)).toContain('Archivée');
    expect(text(fixture)).toContain('Remettre en service');
    expect(text(fixture)).not.toContain('Peut encaisser');
  });

  it('sans entité, explique pourquoi rien ne peut être facturé', async () => {
    const api = new FakeLegalEntities();
    api.rows = [];

    const fixture = await render(api);

    expect(text(fixture)).toContain('Aucune entité déclarée');
    expect(text(fixture)).toContain("a besoin d'un émetteur");
  });
});
