import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CounterAccountCeilingPayload,
  CounterAccountCeilingView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CounterAccountCeilingService } from '../counter-account-ceiling.service';
import { CounterAccountCeilingCard } from './counter-account-ceiling-card';

const NONE: CounterAccountCeilingView = {
  ceilingCents: null,
  updatedAt: null,
  updatedByStaffId: null,
  updatedByName: null,
};

const WRITE: readonly StaffPermission[] = ['lfc_order_settings:read', 'lfc_order_settings:write'];

async function mount(
  permissions: readonly StaffPermission[],
  initial: CounterAccountCeilingView,
  refuse = false,
): Promise<{
  fixture: ComponentFixture<CounterAccountCeilingCard>;
  sent: CounterAccountCeilingPayload[];
}> {
  const sent: CounterAccountCeilingPayload[] = [];
  let current = initial;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CounterAccountCeilingCard],
    providers: [
      {
        provide: CounterAccountCeilingService,
        useValue: {
          read: (): Promise<CounterAccountCeilingView> => Promise.resolve(current),
          set: (payload: CounterAccountCeilingPayload): Promise<void> => {
            sent.push(payload);
            if (refuse) {
              return Promise.reject(new Error('400'));
            }
            current = {
              ceilingCents: payload.ceilingCents,
              updatedAt: '2026-11-20T10:00:00.000Z',
              updatedByStaffId: 'st_1',
              updatedByName: 'Léa Martin',
            };
            return Promise.resolve();
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CounterAccountCeilingCard);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, sent };
}

const text = (fixture: ComponentFixture<CounterAccountCeilingCard>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('CounterAccountCeilingCard', () => {
  it('dit « Aucun plafond » par défaut, sans champ sans le droit d’écriture', async () => {
    const { fixture } = await mount(['lfc_order_settings:read'], NONE);
    expect(text(fixture)).toContain('Aucun plafond');
    expect(text(fixture)).toContain('Jamais réglé');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-counter-account-ceiling-input]'),
    ).toBeNull();
  });

  it('envoie le montant saisi en centimes, puis relit l’auteur', async () => {
    const { fixture, sent } = await mount(WRITE, NONE);
    fixture.componentInstance['draft'].set(500.5);
    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(sent).toEqual([{ ceilingCents: 50_050 }]);
    expect(text(fixture)).toMatch(/500,50\s€/);
    expect(text(fixture)).toContain('Modifié par Léa Martin');
  });

  it('vider le champ retire le plafond', async () => {
    const { fixture, sent } = await mount(WRITE, { ...NONE, ceilingCents: 10_000 });
    fixture.componentInstance['draft'].set(null);
    await fixture.componentInstance['save']();

    expect(sent).toEqual([{ ceilingCents: null }]);
  });

  it('n’envoie rien pour un montant négatif ou inchangé', async () => {
    const { fixture, sent } = await mount(WRITE, NONE);
    await fixture.componentInstance['save']();
    fixture.componentInstance['draft'].set(-1);
    fixture.detectChanges();
    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(sent).toEqual([]);
    expect(text(fixture)).toContain('ne peut pas être négatif');
  });

  it('garde le plafond servi et dit le refus', async () => {
    const { fixture } = await mount(WRITE, NONE, true);
    fixture.componentInstance['draft'].set(10);
    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Aucun plafond');
    expect(text(fixture)).toContain("Le plafond n'a pas pu être enregistré.");
  });
});
