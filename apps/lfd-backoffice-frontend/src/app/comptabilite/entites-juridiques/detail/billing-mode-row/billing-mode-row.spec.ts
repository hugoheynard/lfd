import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  BillingRhythmKind,
  LegalEntityBillingModeView,
  SetBillingModeDatesPayload,
  UpcomingClosureView,
} from '@lfd/contracts';
import {
  FoldInlineConfirmComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
} from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { BillingModeRow, type BillingModeSaved } from './billing-mode-row';

/** Les instants ne sont comparés qu'entre eux et aux libellés : aucune lecture du mur. */
const NOV_1 = '2026-10-31T23:00:00.000Z';
const NOV_2 = '2026-11-01T23:00:00.000Z';

const CLOSURES: readonly UpcomingClosureView[] = [
  {
    closesAt: NOV_1,
    periodLabel: 'du 1er au 31 octobre 2026',
    invoicedOn: '2026-10-31',
    periodDays: 31,
  },
  {
    closesAt: '2026-11-30T23:00:00.000Z',
    periodLabel: 'du 1er au 30 novembre 2026',
    invoicedOn: '2026-11-30',
    periodDays: 30,
  },
  {
    closesAt: '2026-12-31T23:00:00.000Z',
    periodLabel: 'du 1er au 31 décembre 2026',
    invoicedOn: '2026-12-31',
    periodDays: 31,
  },
  {
    closesAt: '2027-01-31T23:00:00.000Z',
    periodLabel: 'du 1er au 31 janvier 2027',
    invoicedOn: '2027-01-31',
    periodDays: 31,
  },
];

function modeView(
  mode: BillingRhythmKind,
  over: Partial<LegalEntityBillingModeView> = {},
): LegalEntityBillingModeView {
  return {
    mode,
    current: { days: mode === 'semimonthly' ? [1, 16] : [1], since: null },
    scheduled: null,
    changeLockedUntil: null,
    upcomingClosures: CLOSURES,
    payerCount: 0,
    ...over,
  };
}

const PENDING: Partial<LegalEntityBillingModeView> = {
  scheduled: { days: [15], effectiveAt: NOV_1 },
  changeLockedUntil: NOV_1,
};

interface Wire {
  readonly put: { id: string; mode: string; payload: SetBillingModeDatesPayload }[];
  readonly cancelled: { id: string; mode: string }[];
  readonly saved: BillingModeSaved[];
}

let wire: Wire;

function boot(view: LegalEntityBillingModeView): ComponentFixture<BillingModeRow> {
  wire = { put: [], cancelled: [], saved: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BillingModeRow],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          setBillingModeDates: (id: string, mode: string, payload: SetBillingModeDatesPayload) => {
            wire.put.push({ id, mode, payload });
            return Promise.resolve();
          },
          cancelScheduledBillingModeDates: (id: string, mode: string) => {
            wire.cancelled.push({ id, mode });
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BillingModeRow);
  fixture.componentRef.setInput('entityId', 'le1');
  fixture.componentRef.setInput('mode', view);
  fixture.componentInstance.saved.subscribe((request) => wire.saved.push(request));
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<BillingModeRow>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

const numbers = (fixture: ComponentFixture<BillingModeRow>) =>
  fixture.debugElement.queryAll(By.directive(FoldNumberInputComponent));

const confirms = (fixture: ComponentFixture<BillingModeRow>) =>
  fixture.debugElement.queryAll(By.directive(FoldInlineConfirmComponent));

const saveButton = (fixture: ComponentFixture<BillingModeRow>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-mode-save]');

function typeDay(fixture: ComponentFixture<BillingModeRow>, index: number, value: number): void {
  numbers(fixture)[index]?.triggerEventHandler('valueChange', value);
  fixture.detectChanges();
}

describe('BillingModeRow — les dates d’un mode de l’entité', () => {
  it('dit les dates en vigueur, la règle permanente, trois clôtures et les clients du mode', () => {
    const fixture = boot(modeView('weekly', { payerCount: 2 }));

    expect(text(fixture)).toContain('Hebdomadaire');
    expect(text(fixture)).toContain('Chaque semaine, clôture le lundi.');
    expect(text(fixture)).toContain(
      'Un seul changement à la fois : le nouveau réglage prend effet à la prochaine clôture ; le suivant ne sera possible qu’après.',
    );
    expect(text(fixture)).toContain('Période du 1er au 31 octobre 2026 — facturée le 31 oct. 2026');
    expect(text(fixture)).not.toContain('janvier 2027');
    expect(text(fixture)).toContain('2 clients ont choisi ce mode.');
  });

  it('le mensuel dit que ses clients par défaut ne sont pas comptés', () => {
    expect(text(boot(modeView('monthly', { payerCount: 1 })))).toContain(
      '1 client a choisi ce mode ; les clients qui n’ont rien choisi sont aussi au mensuel, et ne sont pas comptés.',
    );
  });

  it('un champ par mode : un jour, deux jours, un jour de semaine', () => {
    expect(numbers(boot(modeView('monthly'))).length).toBe(1);
    expect(numbers(boot(modeView('semimonthly'))).length).toBe(2);
    const weekly = boot(modeView('weekly'));
    expect(numbers(weekly).length).toBe(0);
    expect(weekly.debugElement.queryAll(By.directive(FoldListboxComponent)).length).toBe(1);
  });

  it('rien à enregistrer tant que la saisie redit les dates en vigueur', () => {
    expect(saveButton(boot(modeView('monthly')))?.disabled).toBe(true);
  });

  it('deux jours identiques : refusé avant l’envoi, et dit', () => {
    const fixture = boot(modeView('semimonthly'));
    typeDay(fixture, 1, 1);

    expect(saveButton(fixture)?.disabled).toBe(true);
    expect(text(fixture)).toContain('Les deux jours de clôture doivent être différents.');
  });

  it('la confirmation nomme la prise d’effet, puis envoie les jours triés', async () => {
    const fixture = boot(modeView('semimonthly'));
    typeDay(fixture, 0, 20);
    typeDay(fixture, 1, 5);

    const confirm = confirms(fixture).at(-1);
    expect((confirm?.componentInstance as FoldInlineConfirmComponent).message()).toContain(
      'prendront effet à la clôture du 1er novembre 2026',
    );
    expect(saveButton(fixture)?.disabled).toBe(false);
    confirm?.triggerEventHandler('confirmed', '');
    await wire.saved[0]?.action();

    expect(wire.put).toEqual([{ id: 'le1', mode: 'semimonthly', payload: { days: [5, 20] } }]);
  });

  it('verrouillé : le programmé se dit, le formulaire se ferme et dit quand il rouvrira', () => {
    const fixture = boot(modeView('monthly', PENDING));

    expect(text(fixture)).toContain(
      'Programmé : Chaque mois, clôture le 15, à partir de la clôture du 1er novembre 2026.',
    );
    expect(text(fixture)).toContain('modifiables à partir du 1er novembre 2026');
    expect((numbers(fixture)[0]?.componentInstance as FoldNumberInputComponent).disabled()).toBe(
      true,
    );
    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('verrouillé, un geste forcé n’envoie rien', () => {
    const fixture = boot(modeView('monthly', PENDING));
    typeDay(fixture, 0, 9);
    confirms(fixture).at(-1)?.triggerEventHandler('confirmed', '');

    expect(wire.saved).toEqual([]);
  });

  it('« Annuler ce changement » retire le programmé par sa route', async () => {
    const fixture = boot(modeView('monthly', PENDING));

    confirms(fixture)[0]?.triggerEventHandler('confirmed', '');
    await wire.saved[0]?.action();

    expect(wire.cancelled).toEqual([{ id: 'le1', mode: 'monthly' }]);
    expect(wire.put).toEqual([]);
    expect(wire.saved[0]?.said).toBe('Changement du mode « Mensuel » annulé.');
  });

  it('sans programmé, aucune annulation n’est proposée', () => {
    expect(text(boot(modeView('monthly')))).not.toContain('Annuler ce changement');
  });

  it('une première période d’un jour après la bascule se signale', () => {
    const fixture = boot(
      modeView('monthly', {
        ...PENDING,
        upcomingClosures: [
          {
            closesAt: NOV_1,
            periodLabel: 'du 1er au 31 octobre 2026',
            invoicedOn: '2026-10-31',
            periodDays: 31,
          },
          {
            closesAt: NOV_2,
            periodLabel: 'du 1er au 1er novembre 2026',
            invoicedOn: '2026-11-01',
            periodDays: 1,
          },
        ],
      }),
    );

    expect(text(fixture)).toContain('ne dure qu’un seul jour');
  });
});
