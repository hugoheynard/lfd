import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { ProductionTranchesPayload, ProductionTranchesView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ProductionSettingsService } from '../production-settings.service';
import { ProductionTranchesCard, sortedTranches } from './production-tranches-card';

interface Wire {
  sent: ProductionTranchesPayload[];
  refuse: string | null;
  saved: number;
}

let wire: Wire;

async function boot(
  tranches: ProductionTranchesView,
  canWrite = true,
): Promise<ComponentFixture<ProductionTranchesCard>> {
  wire = { sent: [], refuse: null, saved: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductionTranchesCard],
    providers: [
      {
        provide: ProductionSettingsService,
        useValue: {
          saveTranches: (payload: ProductionTranchesPayload) => {
            wire.sent.push(payload);
            return wire.refuse === null
              ? Promise.resolve()
              : Promise.reject(
                  new HttpErrorResponse({
                    status: 400,
                    error: { code: 'x', message: wire.refuse },
                  }),
                );
          },
        } satisfies Partial<Record<keyof ProductionSettingsService, unknown>>,
      },
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(ProductionTranchesCard);
  fixture.componentRef.setInput('tranches', tranches);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.componentInstance.saved.subscribe(() => {
    wire.saved += 1;
  });
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<ProductionTranchesCard>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function emit(
  fixture: ComponentFixture<ProductionTranchesCard>,
  selector: string,
  event: string,
  value: unknown = undefined,
): void {
  fixture.debugElement.query(By.css(selector)).triggerEventHandler(event, value);
  fixture.detectChanges();
}

const el = (fixture: ComponentFixture<ProductionTranchesCard>, selector: string): HTMLElement =>
  fixture.nativeElement.querySelector(selector) as HTMLElement;

const texts = (fixture: ComponentFixture<ProductionTranchesCard>, selector: string): string[] =>
  [...(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>)].map((n) =>
    (n.textContent ?? '').trim(),
  );

function add(fixture: ComponentFixture<ProductionTranchesCard>, time: string): void {
  emit(fixture, '[data-new-tranche]', 'valueChange', time);
  el(fixture, '[data-add-tranche]').click();
  fixture.detectChanges();
}

describe('sortedTranches', () => {
  it('trie et retire les doublons', () => {
    expect(sortedTranches(['12:00', '05:00', '07:00', '05:00'])).toEqual([
      '05:00',
      '07:00',
      '12:00',
    ]);
  });
});

describe('Production › Réglages — les tranches fixes', () => {
  it('dit la journée entière sans heure réglée', async () => {
    const fixture = await boot({ mode: 'fixed', fixedTranches: [] });
    expect(el(fixture, '[data-single-tranche]').textContent).toContain(
      'une seule tranche, la journée',
    );
  });

  it('affiche les heures triées', async () => {
    const fixture = await boot({ mode: 'fixed', fixedTranches: ['12:00', '05:00'] });
    expect(texts(fixture, '[data-fixed-tranche] span')).toEqual(['avant 05:00', 'avant 12:00']);
  });

  it('n’enregistre que si quelque chose a changé', async () => {
    const fixture = await boot({ mode: 'fixed', fixedTranches: ['05:00'] });
    const save = el(fixture, '[data-save-tranches]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    add(fixture, '07:00');
    expect(save.disabled).toBe(false);
    emit(fixture, '[data-remove-tranche]', 'clicked');
    emit(fixture, '[data-remove-tranche]', 'clicked');
    add(fixture, '05:00');
    expect(save.disabled).toBe(true);
  });

  it('ajoute à sa place, refuse un doublon, et envoie la liste triée', async () => {
    const fixture = await boot({ mode: 'fixed', fixedTranches: ['12:00'] });
    add(fixture, '05:00');
    emit(fixture, '[data-new-tranche]', 'valueChange', '12:00');
    expect((el(fixture, '[data-add-tranche]') as HTMLButtonElement).disabled).toBe(true);
    expect(texts(fixture, '[data-fixed-tranche] span')).toEqual(['avant 05:00', 'avant 12:00']);

    el(fixture, '[data-save-tranches]').click();
    await settle(fixture);
    expect(wire.sent).toEqual([{ mode: 'fixed', fixedTranches: ['05:00', '12:00'] }]);
    expect(wire.saved).toBe(1);
  });

  it('refuse une neuvième heure', async () => {
    const eight = ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00'];
    const fixture = await boot({ mode: 'fixed', fixedTranches: eight });
    emit(fixture, '[data-new-tranche]', 'valueChange', '09:00');
    expect((el(fixture, '[data-add-tranche]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('montre le refus du serveur dans la carte', async () => {
    const fixture = await boot({ mode: 'fixed', fixedTranches: [] });
    wire.refuse = 'Huit tranches au plus.';
    add(fixture, '05:00');
    el(fixture, '[data-save-tranches]').click();
    await settle(fixture);
    expect(el(fixture, '[data-tranches-refusal]').textContent).toContain('Huit tranches au plus.');
    expect(wire.saved).toBe(0);
  });
});

describe('Production › Réglages — les tranches calculées', () => {
  it('dit d’où viennent les heures, avec le lien vers les marges', async () => {
    const fixture = await boot({ mode: 'fixed', fixedTranches: ['05:00'] });
    emit(fixture, '[data-tranche-mode]', 'valueChange', 'computed');
    const note = el(fixture, '[data-computed-explained]');
    expect(note.textContent).toContain('moins les marges');
    expect(note.querySelector('a')?.getAttribute('href')).toBe('/reglages/livraison/zones');
    expect(el(fixture, '[data-fixed-tranche]')).toBeNull();

    el(fixture, '[data-save-tranches]').click();
    await settle(fixture);
    expect(wire.sent).toEqual([{ mode: 'computed', fixedTranches: ['05:00'] }]);
  });
});

describe('Production › Réglages — tranches sans droit d’écriture', () => {
  it('montre les heures et ne propose aucun geste', async () => {
    const fixture = await boot({ mode: 'fixed', fixedTranches: ['05:00'] }, false);
    expect(texts(fixture, '[data-fixed-tranche] span')).toEqual(['avant 05:00']);
    expect(el(fixture, '[data-remove-tranche]')).toBeNull();
    expect(el(fixture, '[data-add-tranche]')).toBeNull();
    expect(el(fixture, '[data-save-tranches]')).toBeNull();
  });
});
