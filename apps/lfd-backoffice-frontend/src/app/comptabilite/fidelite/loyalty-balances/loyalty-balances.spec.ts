import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { LoyaltyBalanceView, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { LoyaltyService } from '../../loyalty.service';
import { LoyaltyBalances } from './loyalty-balances';

/**
 * Ce que ces cas tiennent : un titulaire se nomme sans jamais emprunter une
 * adresse, l'ajustement ouvre le panneau sur le bon titulaire et relit la
 * liste après un succès, et sans `b2b_accounting:write` aucun geste.
 */

const BALANCES: readonly LoyaltyBalanceView[] = [
  { holder: { kind: 'company', id: 'c1', label: 'Le Lac' }, points: 12_500 },
  { holder: { kind: 'user', id: 'u1', label: null }, points: 300 },
];

class FakeApi {
  reads = 0;
  refuse: unknown = null;

  listBalances(): Promise<readonly LoyaltyBalanceView[]> {
    this.reads += 1;
    return this.refuse === null ? Promise.resolve(BALANCES) : Promise.reject(this.refuse);
  }
}

async function render(
  api: FakeApi,
  permissions: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_accounting:write'],
  opened: unknown[] = [],
  result: boolean | undefined = undefined,
): Promise<ComponentFixture<LoyaltyBalances>> {
  TestBed.configureTestingModule({
    imports: [LoyaltyBalances],
    providers: [
      { provide: LoyaltyService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (_c: unknown, config: { data: unknown }) => {
            opened.push(config.data);
            return { closed: Promise.resolve(result) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(LoyaltyBalances);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<LoyaltyBalances>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<LoyaltyBalances>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function buttons(fixture: ComponentFixture<LoyaltyBalances>, label: string): HTMLButtonElement[] {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
  return Array.from(all).filter((b) => b.textContent?.trim() === label);
}

describe('LoyaltyBalances', () => {
  it('rend chaque titulaire, sa clientèle et son solde', async () => {
    const body = text(await render(new FakeApi()));

    expect(body).toContain('Le Lac');
    expect(body).toContain('Société');
    expect(body).toMatch(/12\s500 points/u);
    expect(body).toContain('Personne sans nom');
    expect(body).toContain('Particulier');
  });

  it('« Ajuster » ouvre le panneau sur le titulaire et son solde, puis relit', async () => {
    const api = new FakeApi();
    const opened: unknown[] = [];
    const fixture = await render(api, undefined, opened, true);

    buttons(fixture, 'Ajuster')[0]?.click();
    await settle(fixture);

    expect(opened).toEqual([{ holder: BALANCES[0]?.holder, points: 12_500 }]);
    expect(api.reads).toBe(2);
  });

  it('un panneau refermé sans succès ne relit rien', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    buttons(fixture, 'Ajuster')[0]?.click();
    await settle(fixture);

    expect(api.reads).toBe(1);
  });

  it('sans droit d’écriture, aucun ajustement', async () => {
    const fixture = await render(new FakeApi(), ['b2b_accounting:read']);
    expect(buttons(fixture, 'Ajuster')).toHaveLength(0);
  });

  it('une lecture refusée s’affiche avec ses mots', async () => {
    const api = new FakeApi();
    api.refuse = { status: 500, error: { message: 'Base indisponible.' } };
    const body = text(await render(api));

    expect(body).toContain('Impossible de lire les soldes');
    expect(body).toContain('Base indisponible.');
  });
});
