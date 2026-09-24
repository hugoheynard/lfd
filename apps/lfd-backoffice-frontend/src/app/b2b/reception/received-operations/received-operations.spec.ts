import { TestBed } from '@angular/core/testing';
import type { ReceivedOperationView } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CatalogueService } from '../../catalogue/catalogue.service';
import { receivedOperation } from '../received-operation.testing';
import { ReceivedOperationsService } from '../received-operations.service';
import { operationCardOf, ReceivedOperations } from './received-operations';

const NAMES = new Map([
  ['BUCHE-4', 'Bûche 4 parts'],
  ['BUCHE-8', 'Bûche 8 parts'],
  ['GALETTE-1', 'Galette'],
]);

const RESTRICTED = receivedOperation({
  override: {
    isHidden: false,
    orderUntil: '2026-12-20T11:00:00.000Z',
    audience: 'public',
    hiddenSkus: ['BUCHE-8'],
    decidedBy: 'staff_1',
    decidedByName: null,
    decidedAt: '2026-11-02T09:00:00.000Z',
  },
  audience: 'pro',
  effective: {
    isHidden: false,
    orderUntil: '2026-12-20T11:00:00.000Z',
    audience: 'none',
    skus: ['BUCHE-4', 'GALETTE-1'],
  },
});

describe('operationCardOf', () => {
  it('montre ce qui s’applique, et ce qui était reçu quand la surcharge y change quelque chose', () => {
    const card = operationCardOf(RESTRICTED, NAMES);
    expect(card.lines).toEqual([
      {
        label: 'Clôture des commandes',
        effective: 'dim. 20 déc. 2026 à 12:00',
        received: 'lun. 21 déc. 2026 à 12:00',
      },
      {
        label: 'Clientèle',
        effective: 'Aucune — la clientèle restreinte ne recouvre pas celle reçue',
        received: 'Professionnels',
      },
      {
        label: 'Articles',
        effective: 'Bûche 4 parts, Galette',
        received: 'Bûche 4 parts, Bûche 8 parts, Galette',
      },
    ]);
    expect(card.decided).toBe('Surcharge décidée le lun. 2 nov. 2026 à 10:00');
  });

  it('sans surcharge, rien n’est mis en regard', () => {
    const card = operationCardOf(receivedOperation(), NAMES);
    expect(card.lines.map((line) => line.received)).toEqual([null, null, null]);
    expect(card.decided).toBeNull();
    expect(card.withdrawn).toBeNull();
  });

  it('dit qu’une opération est retirée, et quand', () => {
    const card = operationCardOf(
      receivedOperation({ withdrawn: true, withdrawnAt: '2026-11-05T09:00:00.000Z' }),
      NAMES,
    );
    expect(card.withdrawn).toBe('Retirée par le référentiel le jeu. 5 nov. 2026 à 10:00');
  });
});

function setup(
  list: () => Promise<readonly ReceivedOperationView[]>,
  allowed = true,
): { root: () => HTMLElement } {
  TestBed.configureTestingModule({
    providers: [
      { provide: ReceivedOperationsService, useValue: { list } },
      {
        provide: CatalogueService,
        useValue: { list: async () => [...NAMES].map(([sku, name]) => ({ sku, name })) },
      },
      { provide: PermissionsStore, useValue: { can: () => allowed, ensureLoaded: async () => {} } },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(ReceivedOperations);
  fixture.detectChanges();
  return {
    root: () => {
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    },
  };
}

describe('ReceivedOperations', () => {
  it('un échec de lecture se dit, avec de quoi réessayer', async () => {
    const { root } = setup(async () => {
      throw new Error('panne');
    });
    await vi.waitFor(() =>
      expect(root().textContent).toContain('Impossible de lire les opérations reçues'),
    );
  });

  it('rien de reçu est un vide serein', async () => {
    const { root } = setup(async () => []);
    await vi.waitFor(() => expect(root().textContent).toContain('Aucune opération reçue'));
  });

  it('seul qui peut écrire voit le geste de surcharge', async () => {
    const writer = setup(async () => [receivedOperation()]);
    await vi.waitFor(() => expect(writer.root().textContent).toContain('Restreindre'));
    TestBed.resetTestingModule();
    const reader = setup(async () => [receivedOperation()], false);
    await vi.waitFor(() => expect(reader.root().textContent).toContain('Noël'));
    expect(reader.root().textContent).not.toContain('Restreindre');
  });

  it('une opération retirée ne se restreint plus', async () => {
    const { root } = setup(async () => [receivedOperation({ withdrawn: true })]);
    await vi.waitFor(() => expect(root().textContent).toContain('Retirée par le référentiel'));
    expect(root().textContent).not.toContain('Restreindre');
  });
});
