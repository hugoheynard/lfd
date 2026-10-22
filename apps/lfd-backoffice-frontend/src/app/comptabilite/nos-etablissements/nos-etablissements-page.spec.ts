import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { OwnEstablishmentView, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { CollectionTestsService } from '../collection-tests.service';
import { NosEtablissementsPage } from './nos-etablissements-page';

/**
 * Ce que ces cas tiennent : la décision écrite de pré-notification (Q6) est à
 * l'écran, datée ; chaque colonne rend quelque chose ; sans
 * `collection_test:write`, ni « Déclarer » ni « Retirer ».
 */

const ROW: OwnEstablishmentView = {
  companyId: 'c1',
  companyName: 'Folie Douce Val',
  companyStatus: 'active',
  declaredAt: '2026-10-22T08:00:00.000Z',
  declaredByName: 'Camille Compta',
};

class FakeApi {
  rows: readonly OwnEstablishmentView[] = [ROW];
  withdrawn: string[] = [];
  ownEstablishments(): Promise<{ establishments: readonly OwnEstablishmentView[] }> {
    return Promise.resolve({ establishments: this.rows });
  }
  withdraw(companyId: string): Promise<void> {
    this.withdrawn.push(companyId);
    return Promise.resolve();
  }
}

async function render(
  permissions: readonly StaffPermission[],
): Promise<ComponentFixture<NosEtablissementsPage>> {
  TestBed.configureTestingModule({
    imports: [NosEtablissementsPage],
    providers: [
      { provide: CollectionTestsService, useValue: new FakeApi() },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: FoldPanelHostService,
        useValue: { open: () => ({ closed: Promise.resolve(undefined) }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(NosEtablissementsPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<NosEtablissementsPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function buttons(fixture: ComponentFixture<NosEtablissementsPage>, label: string): HTMLElement[] {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('button');
  return Array.from(all).filter((b) => b.textContent?.trim() === label);
}

describe('NosEtablissementsPage', () => {
  it('affiche la décision écrite de pré-notification, datée', async () => {
    const fixture = await render(['collection_test:read']);

    expect(text(fixture)).toContain('Décision du 22 octobre 2026');
    expect(text(fixture)).toContain(
      'Les essais sur nos propres établissements ne font pas l’objet d’une pré-notification individuelle.',
    );
  });

  it('rend la société et qui l’a déclarée', async () => {
    const fixture = await render(['collection_test:read']);

    expect(text(fixture)).toContain('Folie Douce Val');
    expect(text(fixture)).toContain('Camille Compta');
  });

  it('sans `collection_test:write`, ni « Déclarer » ni « Retirer »', async () => {
    const fixture = await render(['collection_test:read', 'b2b_accounting:write']);

    expect(buttons(fixture, 'Déclarer un établissement')).toHaveLength(0);
    expect(buttons(fixture, 'Retirer')).toHaveLength(0);
  });

  it('avec l’écriture, les deux gestes s’offrent', async () => {
    const fixture = await render(['collection_test:read', 'collection_test:write']);

    expect(buttons(fixture, 'Déclarer un établissement')).toHaveLength(1);
    expect(buttons(fixture, 'Retirer')).toHaveLength(1);
  });
});
