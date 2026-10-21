import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  BillingRhythmKind,
  CompanyHierarchyView,
  LegalEntityView,
  PayerBillingModeView,
  StaffPermission,
} from '@lfd/contracts';
import { FoldInlineConfirmComponent, FoldListboxComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { PermissionsStore } from '../../auth/permissions.store';
import { LegalEntitiesService } from '../../comptabilite/legal-entities.service';
import { NotifyService } from '../../notify.service';
import { PayerBillingModeService } from '../facturation/payer-billing-mode.service';
import { PayerBillingModeCard } from './payer-billing-mode-card';

/** Les instants ne sont comparés qu'aux libellés : aucune lecture du mur. */
const NOV_1 = '2026-10-31T23:00:00.000Z';

function company(hierarchy: Partial<CompanyHierarchyView> = {}): AdminCompanyDetail {
  return {
    id: 'c1',
    reference: 'C-1',
    raisonSociale: 'Chalets SAS',
    enseigne: 'Chalets du Lac',
    formeJuridique: 'SAS',
    siret: '73282932000074',
    siren: '732829320',
    vatNumber: '',
    status: 'active',
    grantedTerms: [],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      id: null,
      role: null,
      firstName: '',
      lastName: '',
      fonction: '',
      email: '',
      phone: '',
    },
    kbis: null,
    owner: null,
    hasOpenSupportRequest: false,
    parent: null,
    createdAt: '2026-07-30T10:00:00.000Z',
    activatedAt: null,
    warnings: [],
    activation: null,
    gate: { canActivate: false, blocking: [], checklist: [] },
    suspensionCause: null,
    vatNumberRequired: false,
    hasBankAccount: false,
    addresses: { billing: null, deliveries: [] },
    contacts: [],
    fulfillmentPreference: {
      method: null,
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: false,
    },
    hierarchy: {
      parent: null,
      subAccounts: [],
      follows: [],
      groupWithoutDelivery: false,
      collectionForm: null,
      ...hierarchy,
    },
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
      { closesAt: NOV_1, periodLabel: 'du 1er au 31 octobre 2026', invoicedOn: '2026-10-31' },
      {
        closesAt: '2026-11-30T23:00:00.000Z',
        periodLabel: 'du 1er au 30 novembre 2026',
        invoicedOn: '2026-11-30',
      },
      {
        closesAt: '2026-12-31T23:00:00.000Z',
        periodLabel: 'du 1er au 31 décembre 2026',
        invoicedOn: '2026-12-31',
      },
      {
        closesAt: '2027-01-31T23:00:00.000Z',
        periodLabel: 'du 1er au 31 janvier 2027',
        invoicedOn: '2027-01-31',
      },
    ],
    ...over,
  };
}

const PENDING: Partial<PayerBillingModeView> = {
  scheduled: { mode: 'weekly', effectiveAt: NOV_1 },
  changeLockedUntil: NOV_1,
};

interface Wire {
  view: PayerBillingModeView;
  refuse: unknown;
  gets: number;
  readonly set: { entity: string; company: string; mode: BillingRhythmKind }[];
  readonly cancelled: { entity: string; company: string }[];
}

let wire: Wire;

const ENTITY = { id: 'le1', name: 'La Folie Douce', archivedAt: null } as const;

async function boot(
  view: PayerBillingModeView,
  client: AdminCompanyDetail = company(),
  granted: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_accounting:write'],
): Promise<ComponentFixture<PayerBillingModeCard>> {
  wire = { view, refuse: null, gets: 0, set: [], cancelled: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PayerBillingModeCard],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          list: (): Promise<readonly Pick<LegalEntityView, 'id' | 'name' | 'archivedAt'>[]> =>
            Promise.resolve([ENTITY, { id: 'old', name: 'Ancienne', archivedAt: NOV_1 }]),
        },
      },
      {
        provide: PayerBillingModeService,
        useValue: {
          get: () => {
            wire.gets += 1;
            return Promise.resolve(wire.view);
          },
          set: (entity: string, companyId: string, payload: { mode: BillingRhythmKind }) => {
            if (wire.refuse !== null) {
              return Promise.reject(wire.refuse);
            }
            wire.set.push({ entity, company: companyId, mode: payload.mode });
            return Promise.resolve();
          },
          cancelScheduled: (entity: string, companyId: string) => {
            wire.cancelled.push({ entity, company: companyId });
            return Promise.resolve();
          },
        },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission): boolean => granted.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PayerBillingModeCard);
  fixture.componentRef.setInput('company', client);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

const text = (fixture: ComponentFixture<PayerBillingModeCard>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

const modeChoice = (fixture: ComponentFixture<PayerBillingModeCard>) =>
  fixture.debugElement
    .queryAll(By.directive(FoldListboxComponent))
    .find(
      (node) =>
        (node.componentInstance as FoldListboxComponent<unknown>).label() === 'Mode de facturation',
    );

const confirms = (fixture: ComponentFixture<PayerBillingModeCard>) =>
  fixture.debugElement.queryAll(By.directive(FoldInlineConfirmComponent));

const saveButton = (fixture: ComponentFixture<PayerBillingModeCard>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-payer-mode-save]');

/** Les lectures s'enchaînent (entités, puis mode) : on laisse passer quelques tours. */
async function settle(fixture: ComponentFixture<PayerBillingModeCard>): Promise<void> {
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

describe('PayerBillingModeCard — le mode de facturation d’un client', () => {
  it('dit le mensuel par défaut, la règle permanente et trois clôtures seulement', async () => {
    const fixture = await boot(modeView());

    expect(text(fixture)).toContain('Mensuel — par défaut.');
    expect(text(fixture)).toContain('Un seul changement à la fois');
    expect(text(fixture)).toContain('Période du 1er au 31 octobre 2026 — facturée le 31 oct. 2026');
    expect(text(fixture)).not.toContain('janvier 2027');
    expect(text(fixture)).toContain('la facture de la période part la veille à 23h55');
    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('choisir un mode : la confirmation nomme la prise d’effet, puis l’envoie', async () => {
    const fixture = await boot(modeView());
    modeChoice(fixture)?.triggerEventHandler('selectionChange', 'weekly');
    fixture.detectChanges();

    const confirm = confirms(fixture).at(-1);
    expect((confirm?.componentInstance as FoldInlineConfirmComponent).message()).toContain(
      'prendra effet à la clôture du 1er novembre 2026',
    );
    expect(saveButton(fixture)?.disabled).toBe(false);
    confirm?.triggerEventHandler('confirmed', '');
    await settle(fixture);

    expect(wire.set).toEqual([{ entity: 'le1', company: 'c1', mode: 'weekly' }]);
    expect(wire.gets).toBe(2);
  });

  it('verrouillé : le programmé se dit, le choix se ferme et dit quand il rouvrira', async () => {
    const fixture = await boot(modeView(PENDING));

    expect(text(fixture)).toContain(
      'Programmé : Chaque semaine, à partir de la clôture du 1er novembre 2026.',
    );
    expect(text(fixture)).toContain('modifiable à partir du 1er novembre 2026');
    expect(
      (modeChoice(fixture)?.componentInstance as FoldListboxComponent<string>).disabled(),
    ).toBe(true);
    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('« Annuler ce changement » retire le programmé par sa route', async () => {
    const fixture = await boot(modeView(PENDING));

    confirms(fixture)[0]?.triggerEventHandler('confirmed', '');
    await settle(fixture);

    expect(wire.cancelled).toEqual([{ entity: 'le1', company: 'c1' }]);
    expect(wire.set).toEqual([]);
  });

  it('un refus du serveur reste affiché, avec ses mots', async () => {
    const fixture = await boot(modeView());
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce site est facturé au nom de Chalets SAS.' },
    });
    modeChoice(fixture)?.triggerEventHandler('selectionChange', 'semimonthly');
    fixture.detectChanges();
    confirms(fixture).at(-1)?.triggerEventHandler('confirmed', '');
    await settle(fixture);

    expect(text(fixture)).toContain('Ce site est facturé au nom de Chalets SAS.');
  });

  it('un site facturé chez un autre suit le mode de son payeur, sans formulaire', async () => {
    const fixture = await boot(
      modeView(),
      company({
        parent: { id: 'p1', enseigne: 'Chalets du Lac', status: 'active' },
        follows: [{ aspect: 'billing', since: '2026-09-01T00:00:00.000Z' }],
      }),
    );

    expect(text(fixture)).toContain('Suit le mode de Chalets du Lac');
    expect(modeChoice(fixture)).toBeUndefined();
    expect(wire.gets).toBe(0);
  });

  it('un sous-compte qui règle seul choisit son propre mode', async () => {
    const fixture = await boot(
      modeView(),
      company({
        parent: { id: 'p1', enseigne: 'Chalets du Lac', status: 'active' },
        follows: [{ aspect: 'pricing', since: '2026-09-01T00:00:00.000Z' }],
      }),
    );

    expect(modeChoice(fixture)).toBeDefined();
    expect(text(fixture)).not.toContain('Suit le mode');
  });

  it('sans le droit d’écriture comptable : le choix est fermé, et la carte dit pourquoi', async () => {
    const fixture = await boot(modeView(), company(), ['b2b_accounting:read']);

    expect(text(fixture)).toContain('Seule la comptabilité peut changer ce mode');
    expect(
      (modeChoice(fixture)?.componentInstance as FoldListboxComponent<unknown>).disabled(),
    ).toBe(true);
    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('sans le droit de lecture comptable : rien n’est lu, la carte dit pourquoi', async () => {
    const fixture = await boot(modeView(), company(), []);

    expect(wire.gets).toBe(0);
    expect(text(fixture)).toContain('réservé à la comptabilité');
  });
});
