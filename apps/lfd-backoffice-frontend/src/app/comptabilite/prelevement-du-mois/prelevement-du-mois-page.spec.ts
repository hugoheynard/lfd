import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type {
  CollectionBatchView,
  CollectionCycleView,
  CollectionPreviewView,
  ConstitutedBatchesView,
  LegalEntityView,
  StaffPermission,
} from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { CollectionBatchesService } from '../collection-batches.service';
import { LegalEntitiesService } from '../legal-entities.service';
import { PrelevementDuMoisPage } from './prelevement-du-mois-page';

/**
 * Ce que ces cas tiennent : l'écran se lit de haut en bas (calendrier,
 * aperçu, lot à traiter, historique) ; l'aperçu vide dit pourquoi ; le bouton
 * de préparation nomme le mois clos ; les refus du serveur s'affichent tels
 * quels ; un lot déposé passe à l'historique, sans geste.
 *
 * Les dates ne sont comparées qu'entre elles : le mois de l'aperçu est
 * octobre parce que la prochaine clôture est le 1er novembre, jamais parce
 * que l'horloge le dit.
 */

/** Le 1er novembre 2026, 00h00 de Paris. */
const NEXT_CLOSURE = '2026-10-31T23:00:00.000Z';
/** Le 1er octobre 2026, 00h00 de Paris : la clôture de septembre. */
const SEPTEMBER_CLOSURE = '2026-09-30T22:00:00.000Z';

function batch(over: Partial<CollectionBatchView> = {}): CollectionBatchView {
  return {
    id: 'b1',
    scheme: 'B2B',
    cycleStartsAt: '2026-08-31T22:00:00.000Z',
    cycleClosesAt: SEPTEMBER_CLOSURE,
    status: 'constituted',
    constitutedAt: '2026-10-02T09:00:00.000Z',
    depositedAt: null,
    cancelledAt: null,
    lineCount: 2,
    orderCount: 5,
    totalCents: 123_400,
    unmandatedCompanies: [],
    depositable: true,
    requestedCollectionDay: '2026-10-15',
    postponedFromDay: null,
    depositDeadline: null,
    lines: [],
    ...over,
  };
}

const OPEN_PREVIEW: CollectionPreviewView = {
  state: 'open',
  cycleStartsAt: SEPTEMBER_CLOSURE,
  cycleClosesAt: NEXT_CLOSURE,
  floorAt: '2026-08-01T00:00:00.000Z',
  lines: [
    {
      scheme: 'B2B',
      payerCompanyId: 'c1',
      debtorName: 'Boulangerie du Port',
      orderCount: 2,
      amountCents: 22,
      ordersTotalCents: 24,
    },
  ],
  totalCents: 22,
  ordersTotalCents: 24,
  exclusions: [],
  unmandatedCompanies: [],
};

class FakeApi {
  view: CollectionCycleView = { batches: [batch()], exclusions: [] };
  previewView: CollectionPreviewView = OPEN_PREVIEW;
  previewRefusal: unknown = null;
  deposited: string[] = [];
  constituted = 0;
  refuse: unknown = null;

  cycle(): Promise<CollectionCycleView> {
    return Promise.resolve(this.view);
  }
  preview(): Promise<CollectionPreviewView> {
    return this.previewRefusal === null
      ? Promise.resolve(this.previewView)
      : Promise.reject(this.previewRefusal);
  }
  constitute(): Promise<ConstitutedBatchesView> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.constituted += 1;
    return Promise.resolve({ batchIds: ['b2'] });
  }
  deposit(id: string): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.deposited.push(id);
    return Promise.resolve();
  }
}

const ENTITY: Partial<LegalEntityView> = {
  id: 'le1',
  name: 'La Folie Douce',
  siren: '552100554',
  archivedAt: null,
  autoCollectionEnabled: false,
  nextCollection: {
    closesAt: NEXT_CLOSURE,
    plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
    collectionDay: '2026-11-16',
    depositDeadline: null,
  },
};

async function render(
  api: FakeApi,
  permissions: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_accounting:write'],
  entity: Partial<LegalEntityView> = ENTITY,
): Promise<ComponentFixture<PrelevementDuMoisPage>> {
  TestBed.configureTestingModule({
    imports: [PrelevementDuMoisPage],
    providers: [
      provideRouter([]),
      { provide: CollectionBatchesService, useValue: api },
      {
        provide: LegalEntitiesService,
        useValue: {
          list: (): Promise<readonly Partial<LegalEntityView>[]> => Promise.resolve([entity]),
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(PrelevementDuMoisPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<PrelevementDuMoisPage>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<PrelevementDuMoisPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const text = (fixture: ComponentFixture<PrelevementDuMoisPage>): string =>
  host(fixture).textContent ?? '';

function button(
  fixture: ComponentFixture<PrelevementDuMoisPage>,
  label: string,
): HTMLButtonElement | undefined {
  const all = host(fixture).querySelectorAll<HTMLButtonElement>('button');
  return Array.from(all).find((b) => b.textContent?.trim() === label);
}

describe('PrelevementDuMoisPage', () => {
  it('se lit dans l’ordre du mois : calendrier, aperçu, lot à traiter', async () => {
    const body = text(await render(new FakeApi()));

    const order = ['Le calendrier du mois', 'Le mois en cours — octobre', 'Le lot à traiter'].map(
      (heading) => body.indexOf(heading),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('le calendrier mène à la fiche de l’entité, et dit l’automatisme désactivé', async () => {
    const fixture = await render(new FakeApi());

    expect(host(fixture).querySelector('[data-schedule-settings]')?.getAttribute('href')).toBe(
      '/comptabilite/entites-juridiques/le1',
    );
    expect(host(fixture).querySelector('[data-auto-state]')?.textContent).toContain(
      'Préparation automatique désactivée',
    );
  });

  it('automatisme activé : dit honnêtement qu’il n’est pas encore branché', async () => {
    const fixture = await render(new FakeApi(), undefined, {
      ...ENTITY,
      autoCollectionEnabled: true,
    });

    expect(host(fixture).querySelector('[data-auto-state]')?.textContent).toContain(
      'pas encore branchée',
    );
  });

  it('l’aperçu montre le facturé, Σ bons et l’écart', async () => {
    const fixture = await render(new FakeApi());

    expect(host(fixture).querySelector('[data-preview-total]')?.textContent).toMatch(/0,22\s€/u);
    expect(host(fixture).querySelector('[data-preview-lines]')?.textContent).toContain(
      'Boulangerie du Port',
    );
    expect(text(fixture)).toMatch(/−\s?0,02\s€|-0,02\s€/u);
  });

  it('un aperçu vide dit pourquoi', async () => {
    const api = new FakeApi();
    api.previewView = { ...OPEN_PREVIEW, lines: [], totalCents: 0, ordersTotalCents: 0 };
    const fixture = await render(api);

    expect(host(fixture).querySelector('[data-empty]')?.textContent).toContain(
      'depuis la mise en service du prélèvement (1er août 2026)',
    );
  });

  it('pas encore prélevable : nomme la clôture du premier mois prélevable', async () => {
    const api = new FakeApi();
    api.previewView = {
      state: 'not_yet_open',
      floorAt: '2026-11-05T08:00:00.000Z',
      firstClosureAt: '2026-11-30T23:00:00.000Z',
    };
    const fixture = await render(api);

    expect(host(fixture).querySelector('[data-not-yet-open]')?.textContent).toContain(
      'Le premier mois prélevable se clôt le 1er décembre 2026',
    );
  });

  it('un aperçu en panne ne coûte que sa carte : le lot reste à l’écran', async () => {
    const api = new FakeApi();
    api.previewRefusal = new Error('boum');
    const fixture = await render(api);

    expect(host(fixture).querySelector('[data-preview-error]')).not.toBeNull();
    expect(button(fixture, 'Marquer déposé')).toBeDefined();
  });

  it('le bouton nomme le mois clos, et prépare son lot', async () => {
    const api = new FakeApi();
    api.view = { batches: [], exclusions: [] };
    const fixture = await render(api);

    expect(text(fixture)).toContain('Le lot de septembre n’est pas encore préparé.');
    button(fixture, 'Préparer le lot de septembre')?.click();
    await settle(fixture);

    expect(api.constituted).toBe(1);
  });

  it('le lot de septembre déjà là : pas de bouton à refuser', async () => {
    const fixture = await render(new FakeApi());

    expect(host(fixture).querySelector('[data-prepare]')).toBeNull();
  });

  it('un refus de préparation s’affiche avec les mots du serveur', async () => {
    const api = new FakeApi();
    api.view = { batches: [], exclusions: [] };
    const fixture = await render(api);
    api.refuse = { error: { message: 'Le premier mois prélevable se clôt le 1er novembre 2026.' } };

    button(fixture, 'Préparer le lot de septembre')?.click();
    await settle(fixture);

    expect(text(fixture)).toContain('Le premier mois prélevable se clôt le 1er novembre 2026.');
  });

  it('le lot à traiter : ses dates, son signalement, et le dépôt bloqué sans mandat', async () => {
    const api = new FakeApi();
    api.view = {
      batches: [batch({ depositable: false, unmandatedCompanies: ['Chalet Sans Mandat'] })],
      exclusions: [
        {
          orderId: 'o1',
          orderNumber: 'CMD-9',
          companyName: 'Chalet Sans Mandat',
          placedAt: '2026-09-20T09:00:00.000Z',
          amountCents: 1_000,
          reason: 'no_mandate',
        },
      ],
    };
    const fixture = await render(api);

    expect(text(fixture)).toContain('Lot de septembre — B2B');
    expect(text(fixture)).toContain('15 oct. 2026');
    expect(text(fixture)).toContain('à renseigner');
    expect(host(fixture).querySelector('[data-unmandated]')?.textContent).toContain(
      'Chalet Sans Mandat',
    );
    expect(host(fixture).querySelector('[data-exclusions]')?.textContent).toContain('CMD-9');
    expect(button(fixture, 'Marquer déposé')?.disabled).toBe(true);
  });

  it('dépose le lot', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    button(fixture, 'Marquer déposé')?.click();
    await settle(fixture);

    expect(api.deposited).toEqual(['b1']);
  });

  /** PA2 : D4 a repoussé l'échéance — l'écran dit de quelle date, et pourquoi. */
  it('une échéance repoussée dit de quelle date, et pourquoi', async () => {
    const api = new FakeApi();
    api.view = {
      batches: [batch({ requestedCollectionDay: '2026-10-16', postponedFromDay: '2026-10-15' })],
      exclusions: [],
    };
    const fixture = await render(api);

    const postponed = host(fixture).querySelector('[data-postponed]')?.textContent ?? '';
    expect(text(fixture)).toContain('16 oct. 2026');
    expect(postponed).toContain('repoussée du 15 oct. 2026');
    expect(postponed).toContain('le préavis court depuis sa');
  });

  /** PA2 : un avis pas parti se signale, et le refus du serveur s'affiche tel quel. */
  it('les avis pas encore partis sont nommés, et le refus de dépôt s’affiche tel quel', async () => {
    const api = new FakeApi();
    api.view = {
      batches: [
        batch({
          lines: [
            {
              rank: 1,
              debtorName: 'Boulangerie du Port',
              amountCents: 10_550,
              ordersTotalCents: 10_550,
              billingStatementId: 'st_1',
              notice: {
                kind: 'notice',
                status: 'unsendable',
                recipientEmail: null,
                sentAt: null,
                failure: null,
              },
            },
          ],
        }),
      ],
      exclusions: [],
    };
    const fixture = await render(api);

    expect(host(fixture).querySelector('[data-unsent-notices]')?.textContent).toContain(
      'Boulangerie du Port (non envoyable)',
    );
    expect(host(fixture).querySelector('[data-line-notice]')?.textContent).toContain(
      'Non envoyable',
    );
    const refusal =
      'Dépôt refusé — l’avis de prélèvement n’est pas parti pour : Boulangerie du Port (aucune adresse).';
    api.refuse = { error: { message: refusal } };
    button(fixture, 'Marquer déposé')?.click();
    await settle(fixture);

    expect(text(fixture)).toContain(refusal);
  });

  it('un lot déposé passe à l’historique, sans geste', async () => {
    const api = new FakeApi();
    api.view = { batches: [batch({ status: 'deposited' })], exclusions: [] };
    const fixture = await render(api);

    expect(host(fixture).querySelector('[data-history]')?.textContent).toContain('septembre');
    expect(button(fixture, 'Marquer déposé')).toBeUndefined();
    expect(text(fixture)).toContain('Le lot de septembre est déjà déposé');
  });

  it('sans droit d’écriture, ni préparer ni déposer', async () => {
    const api = new FakeApi();
    api.view = { batches: [batch()], exclusions: [] };
    const fixture = await render(api, ['b2b_accounting:read']);

    expect(host(fixture).querySelector('[data-prepare]')).toBeNull();
    expect(button(fixture, 'Marquer déposé')).toBeUndefined();
    expect(button(fixture, 'Fichier')).toBeDefined();
  });

  it('n’emploie pas le vocabulaire bancaire interne', async () => {
    const body = text(await render(new FakeApi())).toLowerCase();

    for (const word of ['cycle', 'constitu', 'cut-off', 'target2']) {
      expect(body).not.toContain(word);
    }
  });
});
