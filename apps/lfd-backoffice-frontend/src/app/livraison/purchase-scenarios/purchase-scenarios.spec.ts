import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PurchaseScenarioSummaryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { PurchaseScenariosService } from '../purchase-scenarios.service';
import { PurchaseScenarios } from './purchase-scenarios';

const LIVE: PurchaseScenarioSummaryView = {
  id: 'ps1',
  name: 'Kangoo et caisses',
  vehicles: 1,
  formats: 2,
  updatedAt: '2026-01-01T08:00:00.000Z',
  updatedBy: 'Marie',
  archivedAt: null,
};

const ARCHIVED: PurchaseScenarioSummaryView = {
  ...LIVE,
  id: 'ps0',
  name: 'Ancien essai',
  archivedAt: '2026-01-02T08:00:00.000Z',
};

interface Wire {
  asked: boolean[];
  failList: boolean;
  archived: string[];
  reactivated: string[];
  refuse: string | null;
}

let wire: Wire;

async function boot(canWrite: boolean): Promise<ComponentFixture<PurchaseScenarios>> {
  wire = { asked: [], failList: false, archived: [], reactivated: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PurchaseScenarios],
    providers: [
      {
        provide: PurchaseScenariosService,
        useValue: {
          list: (includeArchived: boolean) => {
            wire.asked.push(includeArchived);
            if (wire.failList) return Promise.reject(new Error('panne'));
            return Promise.resolve({ scenarios: includeArchived ? [ARCHIVED, LIVE] : [LIVE] });
          },
          archive: (id: string) => {
            if (wire.refuse !== null) {
              return Promise.reject(
                new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }),
              );
            }
            wire.archived.push(id);
            return Promise.resolve();
          },
          reactivate: (id: string) => {
            if (wire.refuse !== null) {
              return Promise.reject(
                new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }),
              );
            }
            wire.reactivated.push(id);
            return Promise.resolve();
          },
        } satisfies Pick<PurchaseScenariosService, 'list' | 'archive' | 'reactivate'>,
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(PurchaseScenarios);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.componentRef.setInput('currentId', 'ps1');
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<PurchaseScenarios>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<PurchaseScenarios>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('PurchaseScenarios', () => {
  it('liste les scénarios en cours, marque celui du tableau, et émet l’ouverture', async () => {
    const fixture = await boot(false);
    let opened: string | null = null;
    fixture.componentInstance.opened.subscribe((id) => (opened = id));

    expect(host(fixture).querySelector('[data-scenario-name]')?.textContent).toContain(
      'Au tableau',
    );
    expect(host(fixture).textContent).toContain('1 véhicule × 2 formats');
    host(fixture).querySelector<HTMLButtonElement>('[data-scenario-open]')?.click();
    expect(opened).toBe('ps1');
  });

  it('sans droit d’écriture, ni archiver ni réactiver', async () => {
    const fixture = await boot(false);
    expect(host(fixture).querySelector('[data-scenario-archive]')).toBeNull();
  });

  it('montre les archivés sur demande, et les réactive', async () => {
    const fixture = await boot(true);
    host(fixture).querySelector<HTMLInputElement>('[data-include-archived] input')?.click();
    await settle(fixture);

    expect(wire.asked).toEqual([false, true]);
    expect(host(fixture).querySelectorAll('[data-scenario-archived]')).toHaveLength(1);
    host(fixture).querySelector<HTMLButtonElement>('[data-scenario-reactivate]')?.click();
    await settle(fixture);
    expect(wire.reactivated).toEqual(['ps0']);
  });

  it('🔴 un refus de réactivation s’affiche tel quel', async () => {
    const fixture = await boot(true);
    wire.refuse = 'Un scénario d’achat s’appelle déjà « Ancien essai ».';
    host(fixture).querySelector<HTMLInputElement>('[data-include-archived] input')?.click();
    await settle(fixture);
    host(fixture).querySelector<HTMLButtonElement>('[data-scenario-reactivate]')?.click();
    await settle(fixture);
    expect(host(fixture).querySelector('[data-scenario-refusal]')?.textContent).toContain(
      's’appelle déjà',
    );
  });

  it('une liste illisible se dit, et se relit', async () => {
    const fixture = await boot(false);
    wire.failList = true;
    host(fixture).querySelector<HTMLInputElement>('[data-include-archived] input')?.click();
    await settle(fixture);
    expect(host(fixture).textContent).toContain('n’ont pas pu être lus');
  });
});
