import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  CollectionMeansName,
  LegalEntityView,
  PayerBillingModeView,
  PayerCollectionMeansView,
  StaffPermission,
} from '@lfd/contracts';
import { FoldInlineConfirmComponent, FoldViewToggleComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { LegalEntitiesService } from '../../comptabilite/legal-entities.service';
import { NotifyService } from '../../notify.service';
import { PayerBillingModeService } from '../facturation/payer-billing-mode.service';
import { PayerCollectionMeansService } from '../facturation/payer-collection-means.service';
import { CollectionMeansChoice, type ShownCollectionMeans } from './collection-means-choice';

/** Des instants seulement affichés : aucun n'est comparé à l'horloge. */
const DEC_1 = '2026-11-30T23:00:00.000Z';

const ENTITY = { id: 'le1', name: 'La Folie Douce', archivedAt: null } as const;

function meansView(over: Partial<PayerCollectionMeansView> = {}): PayerCollectionMeansView {
  return {
    legalEntityId: 'le1',
    companyId: 'c1',
    payerCompanyId: 'c1',
    followsPayer: null,
    means: 'sepa_debit',
    since: null,
    scheduled: null,
    ...over,
  };
}

function modeView(over: Partial<PayerBillingModeView> = {}): PayerBillingModeView {
  return {
    legalEntityId: 'le1',
    payerCompanyId: 'c1',
    mode: 'monthly',
    since: null,
    scheduled: null,
    changeLockedUntil: null,
    upcomingClosures: [
      {
        closesAt: DEC_1,
        periodLabel: 'du 1er au 30 novembre 2026',
        invoicedOn: '2026-11-30',
        periodDays: 30,
      },
    ],
    ...over,
  };
}

interface Wire {
  means: PayerCollectionMeansView;
  mode: PayerBillingModeView;
  refuse: unknown;
  after: PayerCollectionMeansView | null;
  readonly said: string[];
  readonly set: { entity: string; company: string; means: CollectionMeansName; reason: string }[];
  readonly cancelled: string[];
  readonly shown: (ShownCollectionMeans | null)[];
}

let wire: Wire;

async function boot(
  means: PayerCollectionMeansView,
  mode: PayerBillingModeView = modeView(),
  granted: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_collection_means:write'],
): Promise<ComponentFixture<CollectionMeansChoice>> {
  wire = { means, mode, refuse: null, after: null, said: [], set: [], cancelled: [], shown: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CollectionMeansChoice],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          list: (): Promise<readonly Pick<LegalEntityView, 'id' | 'name' | 'archivedAt'>[]> =>
            Promise.resolve([ENTITY]),
        },
      },
      {
        provide: PayerCollectionMeansService,
        useValue: {
          get: () => Promise.resolve(wire.means),
          set: (
            entity: string,
            company: string,
            payload: { means: CollectionMeansName; reason: string },
          ) => {
            if (wire.refuse !== null) {
              return Promise.reject(wire.refuse);
            }
            wire.set.push({ entity, company, ...payload });
            if (wire.after !== null) {
              wire.means = wire.after;
            }
            return Promise.resolve();
          },
          cancelScheduled: (entity: string) => {
            wire.cancelled.push(entity);
            return Promise.resolve();
          },
        },
      },
      { provide: PayerBillingModeService, useValue: { get: () => Promise.resolve(wire.mode) } },
      {
        provide: NotifyService,
        useValue: { success: (message: string) => wire.said.push(message), error: () => undefined },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission): boolean => granted.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CollectionMeansChoice);
  fixture.componentRef.setInput('companyId', 'c1');
  fixture.componentInstance.shownChange.subscribe((shown) => wire.shown.push(shown));
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<CollectionMeansChoice>): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const text = (fixture: ComponentFixture<CollectionMeansChoice>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

const find = (fixture: ComponentFixture<CollectionMeansChoice>, selector: string) =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);

const toggle = (fixture: ComponentFixture<CollectionMeansChoice>) =>
  fixture.debugElement.query(By.directive(FoldViewToggleComponent));

const confirms = (fixture: ComponentFixture<CollectionMeansChoice>) =>
  fixture.debugElement.queryAll(By.directive(FoldInlineConfirmComponent));

async function choose(
  fixture: ComponentFixture<CollectionMeansChoice>,
  means: CollectionMeansName,
): Promise<void> {
  toggle(fixture).triggerEventHandler('valueChange', means);
  await settle(fixture);
}

async function typeReason(
  fixture: ComponentFixture<CollectionMeansChoice>,
  reason: string,
): Promise<void> {
  const area = find(fixture, '[data-means-reason] textarea') as HTMLTextAreaElement;
  area.value = reason;
  area.dispatchEvent(new Event('input'));
  await settle(fixture);
}

describe('CollectionMeansChoice — prélèvement ou virement', () => {
  it('un payeur jamais changé : « prélèvement, par défaut », et la section montre le prélèvement', async () => {
    const fixture = await boot(meansView());

    expect(text(fixture)).toContain('Prélèvement SEPA, par défaut.');
    expect(wire.shown.at(-1)?.means).toBe('sepa_debit');
    expect(wire.shown.at(-1)?.entity.id).toBe('le1');
    expect(find(fixture, '[data-means-change]')).toBeNull();
  });

  it('basculer le toggle ne change rien : il montre le virement, annonce la date d’effet et demande un motif', async () => {
    const fixture = await boot(meansView());
    await choose(fixture, 'bank_transfer');

    expect(wire.shown.at(-1)?.means).toBe('bank_transfer');
    expect(wire.set).toEqual([]);
    expect(find(fixture, '[data-means-effective]')?.textContent).toContain(
      'à la clôture du 1er décembre 2026',
    );
    expect(find(fixture, '[data-means-reason]')).not.toBeNull();
    expect((find(fixture, '[data-means-save]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('avec un motif, enregistrer envoie le moyen et le motif nettoyé, puis dit la date d’effet relue', async () => {
    const fixture = await boot(meansView());
    wire.after = meansView({
      scheduled: { means: 'bank_transfer', effectiveAt: DEC_1, reason: 'demande du client' },
    });
    await choose(fixture, 'bank_transfer');
    await typeReason(fixture, '  demande du client  ');
    expect((find(fixture, '[data-means-save]') as HTMLButtonElement).disabled).toBe(false);

    confirms(fixture).at(-1)?.triggerEventHandler('confirmed', '');
    await settle(fixture);

    expect(wire.set).toEqual([
      { entity: 'le1', company: 'c1', means: 'bank_transfer', reason: 'demande du client' },
    ]);
    expect(wire.said).toEqual(['Virement bancaire à partir de la clôture du 1er décembre 2026.']);
    expect(find(fixture, '[data-means-scheduled]')?.textContent).toContain('demande du client');
  });

  it('un refus du serveur reste à l’écran, avec ses mots', async () => {
    const fixture = await boot(meansView());
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Un retour bancaire est en cours pour ce payeur.' },
    });
    await choose(fixture, 'bank_transfer');
    await typeReason(fixture, 'demande du client');
    confirms(fixture).at(-1)?.triggerEventHandler('confirmed', '');
    await settle(fixture);

    expect(text(fixture)).toContain('Un retour bancaire est en cours pour ce payeur.');
    expect(wire.said).toEqual([]);
  });

  it('un moyen déjà programmé ferme le changement et s’annule', async () => {
    const fixture = await boot(
      meansView({
        scheduled: { means: 'bank_transfer', effectiveAt: DEC_1, reason: 'demande du client' },
      }),
    );

    expect(wire.shown.at(-1)?.means).toBe('bank_transfer');
    await choose(fixture, 'sepa_debit');
    expect(find(fixture, '[data-means-save]')).toBeNull();

    confirms(fixture)[0]?.triggerEventHandler('confirmed', '');
    await settle(fixture);
    expect(wire.cancelled).toEqual(['le1']);
  });

  it('un changement de mode programmé ferme aussi le moyen (un seul changement à la fois)', async () => {
    const fixture = await boot(
      meansView(),
      modeView({ scheduled: { mode: 'weekly', effectiveAt: DEC_1 }, changeLockedUntil: DEC_1 }),
    );
    await choose(fixture, 'bank_transfer');

    expect(find(fixture, '[data-means-mode-pending]')?.textContent).toContain('1er décembre 2026');
    expect(find(fixture, '[data-means-save]')).toBeNull();
  });

  it('un site facturé chez son principal lit son moyen sans pouvoir le changer', async () => {
    const fixture = await boot(
      meansView({
        payerCompanyId: 'p1',
        followsPayer: { id: 'p1', name: 'Groupe Lac' },
        means: 'bank_transfer',
        since: DEC_1,
      }),
    );

    expect(find(fixture, '[data-means-follows]')?.textContent).toContain('Groupe Lac');
    await choose(fixture, 'sepa_debit');
    expect(find(fixture, '[data-means-change]')).toBeNull();
  });

  it('sans le droit d’écrire, le toggle montre ce que l’autre moyen demanderait, sans bouton', async () => {
    const fixture = await boot(meansView(), modeView(), ['b2b_accounting:read']);
    await choose(fixture, 'bank_transfer');

    expect(find(fixture, '[data-means-no-write]')).not.toBeNull();
    expect(find(fixture, '[data-means-save]')).toBeNull();
    expect(wire.shown.at(-1)?.means).toBe('bank_transfer');
  });

  it('sans le droit de lire, rien n’est demandé et la section garde le prélèvement', async () => {
    const fixture = await boot(meansView(), modeView(), []);

    expect(find(fixture, '[data-means-no-read]')).not.toBeNull();
    expect(wire.shown).toEqual([null]);
  });
});
