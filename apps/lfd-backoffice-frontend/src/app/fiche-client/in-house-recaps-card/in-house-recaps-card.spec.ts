import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  InHouseRecapSummaryView,
  PayerInHouseRecapsView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { InHousePayerService } from '../in-house-payer-card/in-house-payer.service';
import { InHouseRecapsCard, monthLabel, recapRow } from './in-house-recaps-card';
import { InHouseRecapsService } from './in-house-recaps.service';

/** Des instants seulement affichés : aucun n'est comparé à l'horloge. */
const OCTOBER: InHouseRecapSummaryView = {
  id: 'r_2',
  number: 'RBL-202610-0002',
  month: '2026-10',
  issuedAt: '2026-11-20T09:00:00.000Z',
  hasDocument: true,
  replacedById: null,
  noteCount: 4,
  revisedNoteCount: 0,
};

const REPLACED: InHouseRecapSummaryView = {
  ...OCTOBER,
  id: 'r_1',
  number: 'RBL-202610-0001',
  issuedAt: '2026-11-01T00:30:00.000Z',
  replacedById: 'r_2',
};

function viewOf(
  recaps: readonly InHouseRecapSummaryView[],
  months: Partial<Pick<PayerInHouseRecapsView, 'emptyMonths' | 'missedMonths'>> = {},
): PayerInHouseRecapsView {
  return { recaps, emptyMonths: months.emptyMonths ?? [], missedMonths: months.missedMonths ?? [] };
}

interface Api {
  views: PayerInHouseRecapsView[];
  inHouse: boolean;
  readonly calls: { kind: 'resend' | 'reissue'; recapId: string; key: string }[];
  refusal: unknown;
}

function api(views: PayerInHouseRecapsView[], inHouse = true): Api {
  return { views, inHouse, calls: [], refusal: null };
}

async function boot(
  calls: Api,
  permissions: readonly StaffPermission[],
  errors: unknown[] = [],
): Promise<ComponentFixture<InHouseRecapsCard>> {
  const gesture = (kind: 'resend' | 'reissue') => (recapId: string, key: string) => {
    calls.calls.push({ kind, recapId, key });
    return calls.refusal === null
      ? Promise.resolve(kind === 'resend' ? { recapId } : { id: 'r_new' })
      : Promise.reject(calls.refusal);
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: InHouseRecapsService,
        useValue: {
          ofCompany: () =>
            Promise.resolve(calls.views.length > 1 ? calls.views.shift() : calls.views[0]),
          document: () => Promise.resolve(new Blob()),
          resend: gesture('resend'),
          reissue: gesture('reissue'),
        },
      },
      {
        provide: InHousePayerService,
        useValue: {
          read: (companyId: string) =>
            Promise.resolve({ companyId, inHouse: calls.inHouse, declaredAt: null }),
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      {
        provide: NotifyService,
        useValue: { success: () => undefined, error: (error: unknown) => errors.push(error) },
      },
    ],
  });
  const fixture = TestBed.createComponent(InHouseRecapsCard);
  fixture.componentRef.setInput('companyId', 'co_resto');
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

/** Laisse finir les lectures (deux promesses, puis le rendu). */
async function settle(fixture: ComponentFixture<InHouseRecapsCard>): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

const root = (fixture: ComponentFixture<InHouseRecapsCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('les mots d’un récapitulatif', () => {
  it('dit le mois en toutes lettres', () => {
    expect(monthLabel('2026-10')).toBe('octobre 2026');
    expect(monthLabel('2027-01')).toBe('janvier 2027');
  });

  it('signale les BL révisés, au singulier comme au pluriel', () => {
    expect(recapRow(OCTOBER).revised).toBeNull();
    expect(recapRow({ ...OCTOBER, revisedNoteCount: 1 }).revised).toContain('1 BL révisé ');
    expect(recapRow({ ...OCTOBER, revisedNoteCount: 2 }).revised).toContain('2 BL révisés');
  });

  it('dit qu’un PDF n’est pas encore rangé', () => {
    expect(recapRow({ ...OCTOBER, hasDocument: false }).meta).toContain('PDF pas encore rangé');
  });
});

describe('InHouseRecapsCard', () => {
  it('liste les récapitulatifs, le remplacé sans geste, les gestes pour qui écrit', async () => {
    const fixture = await boot(api([viewOf([OCTOBER, REPLACED])]), ['b2b_in_house_payers:write']);

    const text = root(fixture).textContent ?? '';
    expect(text).toContain('RBL-202610-0002 · octobre 2026');
    expect(text).toContain('Remplacé');
    expect(root(fixture).querySelectorAll('[data-in-house-recap-pdf]')).toHaveLength(2);
    expect(root(fixture).querySelectorAll('[data-in-house-recap-resend]')).toHaveLength(1);
    expect(root(fixture).querySelectorAll('[data-in-house-recap-reissue]')).toHaveLength(1);
  });

  it('sans le droit de la nature maison, la liste et le PDF, sans les gestes', async () => {
    const fixture = await boot(api([viewOf([OCTOBER])]), ['b2b_companies:read']);

    expect(root(fixture).querySelector('[data-in-house-recap-pdf]')).not.toBeNull();
    expect(root(fixture).querySelector('[data-in-house-recap-resend]')).toBeNull();
    expect(root(fixture).querySelector('[data-in-house-recap-reissue]')).toBeNull();
  });

  it('montre les mois vides, les mois manqués et les BL révisés', async () => {
    const fixture = await boot(
      api([
        viewOf([{ ...OCTOBER, revisedNoteCount: 2 }], {
          emptyMonths: ['2026-08'],
          missedMonths: ['2026-09'],
        }),
      ]),
      ['b2b_in_house_payers:write'],
    );

    expect(root(fixture).querySelector('[data-in-house-recaps-empty]')?.textContent).toContain(
      'août 2026',
    );
    expect(root(fixture).querySelector('[data-in-house-recaps-missed]')?.textContent).toContain(
      'septembre 2026',
    );
    expect(root(fixture).querySelector('[data-in-house-recap-revised]')).not.toBeNull();
  });

  it('muette pour un client qui n’est pas maison et ne l’a jamais été', async () => {
    const fixture = await boot(api([viewOf([])], false), ['b2b_in_house_payers:write']);

    expect(root(fixture).querySelector('[data-in-house-recaps]')).toBeNull();
  });

  it('visible pour un client marqué maison, même sans récapitulatif encore', async () => {
    const fixture = await boot(api([viewOf([])], true), ['b2b_in_house_payers:write']);

    expect(root(fixture).querySelector('[data-in-house-recaps]')).not.toBeNull();
  });

  it('renvoie sous la même clé tant que le geste a échoué, puis une clé neuve', async () => {
    const calls = api([viewOf([OCTOBER])]);
    calls.refusal = new Error('refus');
    const errors: unknown[] = [];
    const fixture = await boot(calls, ['b2b_in_house_payers:write'], errors);
    const button = (): HTMLButtonElement | null =>
      root(fixture).querySelector('[data-in-house-recap-resend]');

    button()?.click();
    await settle(fixture);
    calls.refusal = null;
    button()?.click();
    await settle(fixture);
    button()?.click();
    await settle(fixture);

    const keys = calls.calls.map((call) => call.key);
    expect(errors).toHaveLength(1);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('« Réémettre » et « Renvoyer » ne partagent pas leur clé', async () => {
    const calls = api([viewOf([OCTOBER])]);
    const fixture = await boot(calls, ['b2b_in_house_payers:write']);

    root(fixture).querySelector<HTMLButtonElement>('[data-in-house-recap-reissue]')?.click();
    await settle(fixture);
    root(fixture).querySelector<HTMLButtonElement>('[data-in-house-recap-resend]')?.click();
    await settle(fixture);

    expect(calls.calls.map((call) => call.kind)).toEqual(['reissue', 'resend']);
    expect(calls.calls[0]?.key).not.toBe(calls.calls[1]?.key);
  });
});
