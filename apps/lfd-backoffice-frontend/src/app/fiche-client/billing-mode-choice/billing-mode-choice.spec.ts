import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { BillingRhythmKind, LegalEntityView, PayerBillingModeView } from '@lfd/contracts';
import type { StaffPermission } from '@lfd/contracts';
import { FoldListboxComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { LegalEntitiesService } from '../../comptabilite/legal-entities.service';
import type { InitialBillingMode } from '../facturation/initial-billing-mode';
import { PayerBillingModeService } from '../facturation/payer-billing-mode.service';
import { BillingModeChoice } from './billing-mode-choice';

type Entity = Pick<LegalEntityView, 'id' | 'name' | 'archivedAt'>;

const LE1: Entity = { id: 'le1', name: 'La Folie Douce', archivedAt: null };
const LE2: Entity = { id: 'le2', name: 'Folie Traiteur', archivedAt: null };

interface Harness {
  readonly fixture: ComponentFixture<BillingModeChoice>;
  readonly emitted: InitialBillingMode[];
}

async function boot(options: {
  readonly entities?: readonly Entity[];
  readonly granted?: readonly StaffPermission[];
  readonly companyId?: string | null;
  readonly since?: string | null;
}): Promise<Harness> {
  const granted = options.granted ?? ['b2b_accounting:read', 'b2b_companies:write'];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BillingModeChoice],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: { list: () => Promise.resolve(options.entities ?? [LE1]) },
      },
      {
        provide: PayerBillingModeService,
        useValue: {
          get: (): Promise<Pick<PayerBillingModeView, 'mode' | 'since'>> =>
            Promise.resolve({ mode: 'weekly', since: options.since ?? null }),
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission): boolean => granted.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(BillingModeChoice);
  const emitted: InitialBillingMode[] = [];
  fixture.componentInstance.choiceChange.subscribe((choice) => emitted.push(choice));
  fixture.componentRef.setInput('companyId', options.companyId ?? null);
  fixture.detectChanges();
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { fixture, emitted };
}

const listbox = (fixture: ComponentFixture<BillingModeChoice>, label: string) =>
  fixture.debugElement
    .queryAll(By.directive(FoldListboxComponent))
    .find((node) => (node.componentInstance as FoldListboxComponent<unknown>).label() === label);

async function pick(
  fixture: ComponentFixture<BillingModeChoice>,
  label: string,
  value: string | BillingRhythmKind,
): Promise<void> {
  listbox(fixture, label)?.triggerEventHandler('selectionChange', value);
  await fixture.whenStable();
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<BillingModeChoice>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

describe('BillingModeChoice — le mode choisi à l’ouverture d’un compte', () => {
  it('rien n’est coché d’avance : le choix est exigé', async () => {
    const { fixture, emitted } = await boot({});

    const mode = listbox(fixture, 'Mode de facturation');
    expect((mode?.componentInstance as FoldListboxComponent<string>).value()).toBe(null);
    expect((mode?.componentInstance as FoldListboxComponent<string>).required()).toBe(true);
    expect(emitted.at(-1)).toEqual({ kind: 'missing' });
  });

  it('un mode choisi se rend avec l’entité en service', async () => {
    const { fixture, emitted } = await boot({});
    await pick(fixture, 'Mode de facturation', 'weekly');

    expect(emitted.at(-1)).toEqual({ kind: 'chosen', legalEntityId: 'le1', mode: 'weekly' });
  });

  it('plusieurs entités : le mode vaut pour celle choisie', async () => {
    const { fixture, emitted } = await boot({ entities: [LE1, LE2] });
    await pick(fixture, 'Entité émettrice', 'le2');
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await pick(fixture, 'Mode de facturation', 'monthly');

    expect(emitted.at(-1)).toEqual({ kind: 'chosen', legalEntityId: 'le2', mode: 'monthly' });
  });

  it('aucune entité en service : rien à choisir, le geste n’attend pas', async () => {
    const { fixture, emitted } = await boot({ entities: [] });

    expect(text(fixture)).toContain('Aucune entité émettrice en service');
    expect(emitted.at(-1)).toEqual({ kind: 'not-required' });
  });

  it('sans le droit d’écrire les sociétés : la carte le dit, et n’exige rien', async () => {
    const { fixture, emitted } = await boot({
      granted: ['b2b_accounting:read', 'b2b_accounting:write'],
    });

    expect(fixture.nativeElement.querySelector('[data-mode-choice-no-write]')).not.toBeNull();
    expect(listbox(fixture, 'Mode de facturation')).toBeUndefined();
    expect(emitted.at(-1)).toEqual({ kind: 'not-required' });
  });

  it('activation d’un compte qui a déjà choisi : le mode se dit, sans redemander', async () => {
    const { fixture, emitted } = await boot({
      companyId: 'c1',
      since: '2026-10-31T23:00:00.000Z',
    });

    expect(text(fixture)).toContain('Mode déjà choisi : Hebdomadaire.');
    expect(emitted.at(-1)).toEqual({ kind: 'not-required' });
  });

  it('activation d’un compte sans choix : le mode est exigé', async () => {
    const { emitted } = await boot({ companyId: 'c1', since: null });

    expect(emitted.at(-1)).toEqual({ kind: 'missing' });
  });
});
