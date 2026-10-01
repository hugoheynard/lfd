import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { DoorstepSettingsPayload, DoorstepSettingsView } from '@lfd/contracts';
import { FoldListboxComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { DoorstepSettingsService } from '../doorstep-settings.service';
import { DoorstepRuleCard } from './doorstep-rule-card';

interface Wire {
  view: DoorstepSettingsView;
  reads: number;
  writes: DoorstepSettingsPayload[];
  refuse: string | null;
}

let wire: Wire;

async function boot(canWrite = true): Promise<ComponentFixture<DoorstepRuleCard>> {
  wire = { view: { rule: 'ask', source: 'default' }, reads: 0, writes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DoorstepRuleCard],
    providers: [
      {
        provide: DoorstepSettingsService,
        useValue: {
          settings: () => {
            wire.reads += 1;
            return Promise.resolve(wire.view);
          },
          save: (payload: DoorstepSettingsPayload) => {
            wire.writes.push(payload);
            if (wire.refuse !== null) {
              return Promise.reject(
                new HttpErrorResponse({ status: 403, error: { message: wire.refuse } }),
              );
            }
            wire.view = { rule: payload.rule, source: 'explicit' };
            return Promise.resolve();
          },
        } satisfies Partial<Record<keyof DoorstepSettingsService, unknown>>,
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(DoorstepRuleCard);
  fixture.componentRef.setInput('canWrite', canWrite);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<DoorstepRuleCard>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<DoorstepRuleCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function listbox(fixture: ComponentFixture<DoorstepRuleCard>) {
  const found = fixture.debugElement.query(By.css('[data-doorstep-rule-choice]'));
  expect(found.componentInstance).toBeInstanceOf(FoldListboxComponent);
  return found;
}

describe('DoorstepRuleCard (B3 bis)', () => {
  it('dit « Me demander » par défaut, tant que personne n’a réglé', async () => {
    const fixture = await boot();

    expect(host(fixture).textContent).toContain('Par défaut');
    expect((listbox(fixture).componentInstance as FoldListboxComponent<string>).value()).toBe(
      'ask',
    );
  });

  it('enregistre dès qu’on choisit, puis relit la provenance', async () => {
    const fixture = await boot();

    listbox(fixture).triggerEventHandler('selectionChange', 'bring_back');
    await settle(fixture);

    expect(wire.writes).toEqual([{ rule: 'bring_back' }]);
    expect(wire.reads).toBe(2);
    expect(host(fixture).textContent).toContain('Réglé par l’équipe');
  });

  it('sans le droit d’écrire, se lit sans se régler', async () => {
    const fixture = await boot(false);

    expect((listbox(fixture).componentInstance as FoldListboxComponent<string>).disabled()).toBe(
      true,
    );
    listbox(fixture).triggerEventHandler('selectionChange', 'deposit');
    await settle(fixture);
    expect(wire.writes).toEqual([]);
  });

  it('un refus du serveur s’affiche tel quel', async () => {
    const fixture = await boot();
    wire.refuse = 'Accès refusé.';

    listbox(fixture).triggerEventHandler('selectionChange', 'deposit');
    await settle(fixture);

    expect(host(fixture).querySelector('[data-doorstep-refusal]')?.textContent).toContain(
      'Accès refusé.',
    );
  });
});
