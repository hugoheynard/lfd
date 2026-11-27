import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OptionGroupView, ProductOptionGroupView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../../../auth/permissions.store';
import { NotifyService } from '../../../../../notify.service';
import { OptionGroupStore } from '../../../../product-options/option-group.store';
import { ProductOptionGroupsHttpApi } from '../../../product-option-groups-http-api';
import { ProductFormStore } from '../../product-form-store';
import { OptionGroupsForm } from './option-groups-form';

const TRANCHAGE: OptionGroupView = {
  id: 'og-tranchage',
  name: 'Tranchage',
  archived: false,
  choices: [{ key: 'tranche', label: 'Tranché', audience: 'both', archived: false }],
  products: 0,
};

/** Ce que la carte lit d'une déclinaison : son id et son libellé d'onglet. */
function variant(id: string, internalLabel: string) {
  return { id, internalLabel, isDefault: false, position: 0 };
}

interface Calls {
  readonly activated: [string, string, readonly string[] | null][];
  readonly deactivated: [string, string][];
}

function setup(options: {
  readonly status?: string;
  readonly activations?: ProductOptionGroupView[];
  readonly activate?: () => Promise<void>;
}) {
  const calls: Calls = { activated: [], deactivated: [] };
  const said: string[] = [];
  let served = options.activations ?? [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ProductFormStore,
        useValue: {
          productId: signal('p-pain'),
          status: signal(options.status ?? 'active'),
          variants: signal([variant('v-500', '500 g'), variant('v-1kg', '1 kg')]),
        },
      },
      { provide: OptionGroupStore, useValue: { items: signal([TRANCHAGE]) } },
      { provide: PermissionsStore, useValue: { can: () => true } },
      {
        provide: ProductOptionGroupsHttpApi,
        useValue: {
          list: () => Promise.resolve(served),
          activate: async (id: string, groupId: string, variantIds: readonly string[] | null) => {
            calls.activated.push([id, groupId, variantIds]);
            await (options.activate ?? (() => Promise.resolve()))();
            served = [{ groupId, name: 'Tranchage', archived: false, variantIds }];
          },
          deactivate: (id: string, groupId: string) => {
            calls.deactivated.push([id, groupId]);
            served = [];
            return Promise.resolve();
          },
        },
      },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(`ok:${message}`),
          refused: (_error: unknown, fallback: string) => said.push(`ko:${fallback}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(OptionGroupsForm);
  fixture.detectChanges();
  return { fixture, form: fixture.componentInstance, calls, said };
}

describe('OptionGroupsForm', () => {
  it('active un groupe pour toutes les déclinaisons par défaut', async () => {
    const { fixture, form, calls } = setup({});
    await fixture.whenStable();
    form['selectGroup']('og-tranchage');
    await form['activate']();
    expect(calls.activated).toEqual([['p-pain', 'og-tranchage', null]]);
    expect(form['activations']()).toHaveLength(1);
    expect(form['selectedGroupId']()).toBeNull();
  });

  it('pose une sélection de déclinaisons, dans l’ordre de la fiche', async () => {
    const { fixture, form, calls } = setup({});
    await fixture.whenStable();
    form['selectGroup']('og-tranchage');
    form['allVariants'].set(false);
    expect(form['canSubmit']()).toBe(false);
    form['togglePick']('v-1kg', true);
    form['togglePick']('v-500', true);
    await form['activate']();
    expect(calls.activated).toEqual([['p-pain', 'og-tranchage', ['v-500', 'v-1kg']]]);
  });

  it('reprend la sélection d’un groupe déjà activé', async () => {
    const { fixture, form } = setup({
      activations: [
        { groupId: 'og-tranchage', name: 'Tranchage', archived: false, variantIds: ['v-1kg'] },
      ],
    });
    await fixture.whenStable();
    form['selectGroup']('og-tranchage');
    expect(form['allVariants']()).toBe(false);
    expect(form['isPicked']('v-1kg')).toBe(true);
    expect(form['scopeLabel'](form['activations']()[0]!)).toBe('1 kg');
  });

  it('retire un groupe de la fiche', async () => {
    const { fixture, form, calls, said } = setup({
      activations: [
        { groupId: 'og-tranchage', name: 'Tranchage', archived: false, variantIds: null },
      ],
    });
    await fixture.whenStable();
    await form['deactivate']('og-tranchage');
    expect(calls.deactivated).toEqual([['p-pain', 'og-tranchage']]);
    expect(form['activations']()).toEqual([]);
    expect(said).toEqual(['ok:Groupe retiré de la fiche.']);
  });

  it('un refus garde la liste et le dit', async () => {
    const { fixture, form, said } = setup({ activate: () => Promise.reject(new Error('refus')) });
    await fixture.whenStable();
    form['selectGroup']('og-tranchage');
    await form['activate']();
    expect(form['activations']()).toEqual([]);
    expect(said).toEqual(["ko:Le réglage n'a pas pu être enregistré."]);
    expect(form['busy']()).toBe(false);
  });

  it('une fiche archivée se lit sans geste', async () => {
    const { fixture } = setup({
      status: 'archived',
      activations: [
        { groupId: 'og-tranchage', name: 'Tranchage', archived: false, variantIds: null },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Toutes les déclinaisons');
    expect(host.querySelector('fold-listbox')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(0);
  });
});
