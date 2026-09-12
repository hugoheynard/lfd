import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import type { LegalEntityView } from '@lfd/contracts';

import { LegalEntitiesService } from '../legal-entities.service';
import { EntitesJuridiquesPage } from './entites-juridiques-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **chaque colonne rend quelque chose.** `fold-data-table` n'a aucun rendu par
 *   défaut : une colonne sans `foldCell` rend une cellule VIDE, sans que rien ne
 *   rougisse. Les cas lisent donc le texte réellement produit ;
 * - **l'écran ne recalcule pas la complétude.** Il affiche ce que le serveur a
 *   rédigé — `canCollect: true` doit montrer « Peut encaisser », parce que c'est
 *   l'agrégat qui décide ;
 * - **le bouton de déclaration ne se trouve qu'à UN endroit à la fois** — dans
 *   l'empty state quand il n'y a rien, dans les actions de page sinon.
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
    creditorBic: '',
    creditorAccountLast4: '',
    preNotificationDays: 14,
    archivedAt: null,
    canCollect: false,
    hasLogo: false,
    isLastActive: false,
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
    providers: [{ provide: LegalEntitiesService, useValue: api }, provideRouter([])],
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
  it('rend chaque colonne, y compris les plus bêtes', async () => {
    const api = new FakeLegalEntities();
    api.rows = [entity({ ics: 'FR72ZZZ123456', creditorAccountLast4: '2606' })];

    const fixture = await render(api);
    const body = text(fixture);

    expect(body).toContain('La Folie Douce');
    expect(body).toContain('552100554');
    expect(body).toContain('FR72ZZZ123456');
    expect(body).toContain('•••• 2606');
  });

  it('dit ce qui manque avec les mots du serveur, et prévient en tête', async () => {
    const fixture = await render(new FakeLegalEntities());

    expect(text(fixture)).toContain('Incomplète');
    // L'avertissement de tête : rien ne peut être prélevé aujourd'hui.
    expect(text(fixture)).toContain("Aucun prélèvement n'est possible");
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
    expect(text(fixture)).not.toContain('Peut encaisser');
  });

  /**
   * Régression : le nom était la SEULE cible cliquable, une ancre au milieu de
   * la ligne. C'est la ligne entière qui ouvre la fiche désormais — et le test
   * porte sur la navigation, pas sur un `href`, parce qu'il n'y a plus d'ancre
   * (fix 2026-09-12).
   */
  it('la ligne entière mène à la fiche, et plus une ancre à viser', async () => {
    const fixture = await render(new FakeLegalEntities());
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('tbody tr');
    row?.click();

    expect(navigate).toHaveBeenCalledWith(['/comptabilite/entites-juridiques', 'le1']);
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href]')).toBeNull();
  });

  it("sans entité, explique pourquoi rien ne peut être facturé et n'offre qu'un geste", async () => {
    const api = new FakeLegalEntities();
    api.rows = [];

    const fixture = await render(api);
    const host = fixture.nativeElement as HTMLElement;

    expect(text(fixture)).toContain('Aucune entité déclarée');
    // 🔴 `subtitle`, pas `description` : un attribut inconnu ne lève rien et
    // n'affiche rien. Seul le texte rendu l'atteste.
    expect(text(fixture)).toContain("a besoin d'un émetteur");
    // Le bouton est DANS l'empty state, et nulle part ailleurs.
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(host.querySelector('[pageActions]')).toBeNull();
  });

  it('avec des entités, le geste remonte dans les actions de page', async () => {
    const fixture = await render(new FakeLegalEntities());
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[pageActions]')?.textContent).toContain('Déclarer une entité');
    expect(text(fixture)).not.toContain('Aucune entité déclarée');
  });
});
