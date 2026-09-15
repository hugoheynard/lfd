import { TestBed } from '@angular/core/testing';
import { PERSONAL_WORKSPACE } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from './client-workspace.fixture';
import { OrderContextStore, type ServiceChoice } from './order-context.store';

const AU_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  pickupAddressId: 'pick_labo',
  slot: '7 h – 8 h',
  window: { start: '07:00', end: '08:00' },
  date: '2026-09-07',
};

function boot(current: string | null): { store: OrderContextStore; workspace: WorkspaceDouble } {
  const workspace = workspaceDouble(current);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideWorkspace(workspace)] });
  const store = TestBed.inject(OrderContextStore);
  TestBed.tick();
  return { store, workspace };
}

/** Plan espace de travail, D7 : une adresse appartient à une société. */
describe('OrderContextStore — le mode de service et l’espace', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** Le choix relu du navigateur a été fait dans l'espace qui se résout : la page se charge, rien ne bascule. */
  it('la première résolution de l’espace n’efface rien', () => {
    localStorage.setItem('lfc.order.choice', JSON.stringify(AU_LABO));
    const { store, workspace } = boot(null);
    expect(store.choice()?.place).toBe('Le Labo');

    workspace.current.set('cmp_a');
    TestBed.tick();

    expect(store.choice()?.place).toBe('Le Labo');
  });

  it('un changement d’espace efface le mode de service', () => {
    const { store, workspace } = boot('cmp_a');
    store.choice.set(AU_LABO);

    workspace.current.set(PERSONAL_WORKSPACE);
    TestBed.tick();

    expect(store.choice()).toBeNull();
  });

  it('un choix posé après la bascule est gardé', () => {
    const { store, workspace } = boot('cmp_a');
    workspace.current.set('cmp_b');
    TestBed.tick();

    store.choice.set(AU_LABO);
    TestBed.tick();

    expect(store.choice()?.place).toBe('Le Labo');
  });
});
