import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CounterAccountConversionView,
  CounterOpenedAccountRow,
  CounterOpenedAccountsView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CounterOpenedAccountsService } from '../counter-opened-accounts.service';
import { CounterAccountsPage } from './counter-accounts-page';

/** Une date seulement affichée : aucune n'est comparée à l'horloge. */
function row(over: Partial<CounterOpenedAccountRow> = {}): CounterOpenedAccountRow {
  return {
    companyId: 'co_1',
    reference: 'C-ABC123',
    enseigne: 'Le Bistrot',
    contact: { firstName: 'Camille', lastName: 'Durand', email: 'camille@test.fr', phone: '0601' },
    openedAt: '2026-11-20T10:00:00.000Z',
    openedByName: 'Léa Martin',
    identityCheck: {
      seen: true,
      byStaffId: 'st_1',
      byName: 'Léa Martin',
      at: '2026-11-20T10:00:00.000Z',
    },
    onAccountOrders: 3,
    outstandingCents: 12_345,
    missing: ['identite_legale', 'facturation'],
    convertsToActive: false,
    ...over,
  };
}

class FakeApi {
  view: CounterOpenedAccountsView = { accounts: [row()], totalOutstandingCents: 12_345 };
  fails = false;
  readonly converted: string[] = [];
  refusal: unknown = null;
  lists = 0;
  list(): Promise<CounterOpenedAccountsView> {
    this.lists += 1;
    return this.fails ? Promise.reject(new Error('injoignable')) : Promise.resolve(this.view);
  }
  convert(companyId: string): Promise<CounterAccountConversionView> {
    this.converted.push(companyId);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.view = { accounts: [], totalOutstandingCents: 0 };
    return Promise.resolve({ status: 'pending' });
  }
}

class FakeNotify {
  readonly said: string[] = [];
  success(message: string): void {
    this.said.push(`ok:${message}`);
  }
  error(): void {
    this.said.push('error');
  }
}

async function mount(
  api: FakeApi,
  permissions: readonly StaffPermission[] = ['b2b_companies:read', 'b2b_companies:write'],
  notify = new FakeNotify(),
): Promise<ComponentFixture<CounterAccountsPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CounterAccountsPage],
    providers: [
      provideRouter([]),
      { provide: CounterOpenedAccountsService, useValue: api },
      { provide: NotifyService, useValue: notify },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CounterAccountsPage);
  fixture.detectChanges();
  // La lecture enchaîne deux attentes : une macro-tâche les laisse toutes aboutir.
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<CounterAccountsPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('CounterAccountsPage', () => {
  it('rend chaque colonne, ce qui manque et le total du dû', async () => {
    const fixture = await mount(new FakeApi());
    const shown = text(fixture);

    expect(shown).toContain('Le Bistrot');
    expect(shown).toContain('C-ABC123');
    expect(shown).toContain('camille@test.fr');
    expect(shown).toContain('par Léa Martin');
    expect(shown).toContain('Pièce vue par Léa Martin');
    expect(shown).toContain('Raison sociale et SIRET, Adresse de facturation');
    expect(shown).toMatch(/123,45\s€/);
    expect(shown).toContain('Total dû');
    expect(shown).toContain('Convertir');
  });

  it('dit « Pièce non vue » et propose « Activer » quand rien ne manque', async () => {
    const api = new FakeApi();
    api.view = {
      accounts: [
        row({
          identityCheck: {
            seen: false,
            byStaffId: 'st_1',
            byName: 'Léa',
            at: '2026-11-20T10:00:00.000Z',
          },
          missing: [],
          convertsToActive: true,
        }),
      ],
      totalOutstandingCents: 0,
    };
    const shown = text(await mount(api));

    expect(shown).toContain('Pièce non vue');
    expect(shown).toContain('Activer');
    expect(shown).toContain('Rien');
  });

  it('convertit, annonce le statut atteint, puis relit la table', async () => {
    const api = new FakeApi();
    const notify = new FakeNotify();
    const fixture = await mount(api, undefined, notify);
    await fixture.componentInstance['convert'](row());
    fixture.detectChanges();

    expect(api.converted).toEqual(['co_1']);
    expect(notify.said).toEqual([
      'ok:Le compte « Le Bistrot » est converti : il attend sa validation.',
    ]);
    expect(api.lists).toBe(2);
    expect(text(fixture)).toContain('Aucun compte ouvert au comptoir');
  });

  it('laisse la table telle quelle sur un refus, et le signale', async () => {
    const api = new FakeApi();
    api.refusal = new Error('409');
    const notify = new FakeNotify();
    const fixture = await mount(api, undefined, notify);
    await fixture.componentInstance['convert'](row());
    fixture.detectChanges();

    expect(notify.said).toEqual(['error']);
    expect(api.lists).toBe(1);
    expect(text(fixture)).toContain('Le Bistrot');
  });

  it('ne propose aucun geste sans le droit d’écriture', async () => {
    const fixture = await mount(new FakeApi(), ['b2b_companies:read']);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-convert]')).toBeNull();
  });

  it('dit l’échec de lecture plutôt qu’une liste vide', async () => {
    const api = new FakeApi();
    api.fails = true;
    expect(text(await mount(api))).toContain('Impossible de lire les comptes du comptoir');
  });
});
