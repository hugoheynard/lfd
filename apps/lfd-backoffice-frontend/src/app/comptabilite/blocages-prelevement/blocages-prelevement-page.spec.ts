import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { DirectDebitBlockView, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DirectDebitBlocksService } from '../direct-debit-blocks.service';
import { BlocagesPrelevementPage } from './blocages-prelevement-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build ne disent :
 *
 * - chaque colonne rend quelque chose (`fold-data-table` n'a aucun rendu par
 *   défaut) — l'état, l'agent, la raison ;
 * - le filtre « Bloquées » retire les sociétés au prélèvement ;
 * - sans `b2b_accounting:write`, aucun geste ne s'affiche ;
 * - un refus du serveur s'affiche avec SES mots, et la liste reste à l'écran.
 */

function row(over: Partial<DirectDebitBlockView> = {}): DirectDebitBlockView {
  return {
    companyId: 'c1',
    reference: 'C-AAA111',
    raisonSociale: 'Boulangerie du Lac SAS',
    enseigne: 'Le Lac',
    block: null,
    ...over,
  };
}

const BLOCKED = row({
  companyId: 'c2',
  reference: 'C-BBB222',
  raisonSociale: 'Café des Alpes SARL',
  enseigne: '',
  block: {
    blockedAt: '2026-09-20T09:00:00.000Z',
    blockedBy: { name: 'Camille Martin', role: 'Comptable' },
    reason: 'Deux rejets de prélèvement',
  },
});

class FakeApi {
  rows: readonly DirectDebitBlockView[] = [row(), BLOCKED];
  unblocked: string[] = [];
  refuse: unknown = null;

  list(): Promise<readonly DirectDebitBlockView[]> {
    return Promise.resolve(this.rows);
  }

  unblock(companyId: string): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.unblocked.push(companyId);
    this.rows = this.rows.map((r) => (r.companyId === companyId ? { ...r, block: null } : r));
    return Promise.resolve();
  }
}

interface Opened {
  readonly data: unknown;
}

async function render(
  api: FakeApi,
  permissions: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_accounting:write'],
  opened: Opened[] = [],
  answer: boolean | undefined = undefined,
): Promise<ComponentFixture<BlocagesPrelevementPage>> {
  TestBed.configureTestingModule({
    imports: [BlocagesPrelevementPage],
    providers: [
      { provide: DirectDebitBlocksService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (_component: unknown, config: { data: unknown }) => {
            opened.push({ data: config.data });
            return { closed: Promise.resolve(answer) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BlocagesPrelevementPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<BlocagesPrelevementPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function buttons(fixture: ComponentFixture<BlocagesPrelevementPage>, label: string): HTMLElement[] {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('button');
  return Array.from(all).filter((b) => b.textContent?.trim() === label);
}

async function settle(fixture: ComponentFixture<BlocagesPrelevementPage>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('BlocagesPrelevementPage', () => {
  it('rend l’état, l’agent et la raison de chaque ligne', async () => {
    const fixture = await render(new FakeApi());
    const body = text(fixture);

    expect(body).toContain('Le Lac');
    expect(body).toContain('Café des Alpes SARL');
    expect(body).toContain('Au prélèvement');
    expect(body).toContain('Prélèvement bloqué');
    expect(body).toContain('Camille Martin');
    expect(body).toContain('Deux rejets de prélèvement');
  });

  it('le filtre « Bloquées » ne garde que les sociétés bloquées, « Toutes » les rend', async () => {
    const fixture = await render(new FakeApi());
    const listbox = fixture.debugElement.query(By.css('fold-listbox'));

    listbox.triggerEventHandler('selectionChange', 'blocked');
    await settle(fixture);
    expect(text(fixture)).toContain('Café des Alpes SARL');
    expect(text(fixture)).not.toContain('Le Lac');

    listbox.triggerEventHandler('selectionChange', 'all');
    await settle(fixture);
    expect(text(fixture)).toContain('Le Lac');
    expect(text(fixture)).toContain('Café des Alpes SARL');
  });

  it('« Bloquées » sans aucune société bloquée : la liste se vide, pas l’écran', async () => {
    const api = new FakeApi();
    api.rows = [row()];
    const fixture = await render(api);

    fixture.debugElement
      .query(By.css('fold-listbox'))
      .triggerEventHandler('selectionChange', 'blocked');
    await settle(fixture);

    expect(text(fixture)).not.toContain('Le Lac');
    expect(fixture.debugElement.query(By.css('fold-listbox'))).not.toBeNull();
  });

  it('sans droit d’écriture, ni « Bloquer » ni « Débloquer »', async () => {
    const fixture = await render(new FakeApi(), ['b2b_accounting:read']);

    expect(buttons(fixture, 'Bloquer')).toHaveLength(0);
    expect(buttons(fixture, 'Débloquer')).toHaveLength(0);
  });

  it('« Bloquer » ouvre le dialogue sur la société, puis relit la liste', async () => {
    const api = new FakeApi();
    const opened: Opened[] = [];
    const fixture = await render(api, undefined, opened, true);
    api.rows = [
      row({
        block: {
          blockedAt: '2026-09-25T08:00:00.000Z',
          blockedBy: null,
          reason: 'Mandat contesté',
        },
      }),
      BLOCKED,
    ];

    buttons(fixture, 'Bloquer')[0]?.click();
    await settle(fixture);

    expect(opened).toEqual([{ data: { companyId: 'c1', companyName: 'Le Lac' } }]);
    expect(text(fixture)).toContain('Mandat contesté');
  });

  it('« Débloquer » demande confirmation avant d’écrire', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    buttons(fixture, 'Débloquer')[0]?.click();
    await settle(fixture);
    expect(api.unblocked).toEqual([]);

    const confirm = buttons(fixture, 'Débloquer').at(-1);
    confirm?.click();
    await settle(fixture);

    expect(api.unblocked).toEqual(['c2']);
    expect(text(fixture)).not.toContain('Prélèvement bloqué');
  });

  it('un refus du serveur s’affiche avec ses mots, la liste reste', async () => {
    const api = new FakeApi();
    api.refuse = {
      status: 409,
      error: { message: "Le prélèvement de ce client n'est pas bloqué." },
    };
    const fixture = await render(api);

    buttons(fixture, 'Débloquer')[0]?.click();
    await settle(fixture);
    buttons(fixture, 'Débloquer').at(-1)?.click();
    await settle(fixture);

    expect(text(fixture)).toContain("Le prélèvement de ce client n'est pas bloqué.");
    expect(text(fixture)).toContain('Café des Alpes SARL');
  });
});
