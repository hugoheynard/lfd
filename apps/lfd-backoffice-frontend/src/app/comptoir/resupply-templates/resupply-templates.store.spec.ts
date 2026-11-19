import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { FakeTemplatesService, refusal } from './resupply-template.testing';
import { ResupplyTemplatesService } from './resupply-templates.service';
import { ResupplyTemplatesStore } from './resupply-templates.store';

function mount(): { store: ResupplyTemplatesStore; service: FakeTemplatesService } {
  const service = new FakeTemplatesService();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [ResupplyTemplatesStore, { provide: ResupplyTemplatesService, useValue: service }],
  });
  return { store: TestBed.inject(ResupplyTemplatesStore), service };
}

const CONTENT = {
  name: 'Goûter',
  target: 'asap' as const,
  lines: [{ sku: 'CRO', quantity: 6, saleUnit: 'piece' as const }],
};

describe('ResupplyTemplatesStore', () => {
  it('ouvre la bibliothèque d’un point', async () => {
    const { store } = mount();
    await store.open('site_v');
    expect(store.templates().map((template) => template.name)).toEqual(['Base matin']);
    expect(store.loadError()).toBeNull();
  });

  it('retient l’échec de lecture sans vider ce qu’elle avait', async () => {
    const { store, service } = mount();
    await store.open('site_v');
    service.listFailure = refusal(503, 'down', 'Le serveur ne répond pas.');
    await store.open('site_v');
    expect(store.loadError()).toBe('Le serveur ne répond pas.');
    expect(store.templates()).toHaveLength(1);
  });

  it('crée sous la même clé tant que le geste n’a pas abouti, puis une clé neuve', async () => {
    const { store, service } = mount();
    await store.open('site_v');
    service.createFailure = refusal(503, 'down', 'coupé');
    await expect(store.create(CONTENT)).rejects.toBeTruthy();
    service.createFailure = null;
    await store.create(CONTENT);
    await store.create(CONTENT);
    const keys = service.created.map((call) => call.payload.key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(service.calls.filter((call) => call.startsWith('list'))).toHaveLength(3);
  });

  it('ajuste sous la version lue, relance le refus, et relit après un succès', async () => {
    const { store, service } = mount();
    await store.open('site_v');
    const saved = await store.adjust('tpl_1', CONTENT, 1);
    expect(saved.version).toBe(2);
    expect(service.adjusted[0]?.payload.version).toBe(1);
    service.adjustFailure = refusal(409, 'resupply.template.changed_meanwhile', 'modifié');
    await expect(store.adjust('tpl_1', CONTENT, 1)).rejects.toBeTruthy();
  });

  it('archive, et le modèle quitte la liste', async () => {
    const { store } = mount();
    await store.open('site_v');
    await store.archive('tpl_1');
    expect(store.templates()).toEqual([]);
  });
});
