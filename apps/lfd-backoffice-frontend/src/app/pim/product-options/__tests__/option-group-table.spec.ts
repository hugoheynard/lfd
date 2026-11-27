import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OptionGroupView } from '@lfd/pim-contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OptionGroupStore } from '../option-group.store';
import { OptionGroupTable } from '../option-group-table/option-group-table';

const GROUP: OptionGroupView = {
  id: 'og-1',
  name: 'Tranchage',
  archived: false,
  choices: [
    { key: 'tranche', label: 'Tranché', audience: 'both', archived: false },
    { key: 'epais', label: 'Épais', audience: 'pro', archived: true },
  ],
  products: 0,
};

function setup(loadError: string | null, canWrite = true) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: OptionGroupStore,
        useValue: { items: signal([GROUP]), loadError: signal(loadError) },
      },
      { provide: PermissionsStore, useValue: { can: () => canWrite } },
      { provide: FoldPanelHostService, useValue: { open: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(OptionGroupTable);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('OptionGroupTable', () => {
  it('ne montre que les choix en service, avec leur clientèle', () => {
    const table = setup(null);
    expect(table['activeChoices'](GROUP).map((choice) => table['choiceLabel'](choice))).toEqual([
      'Tranché · Les deux',
    ]);
    expect(table['productsLabel'](GROUP)).toBe('Aucune fiche');
  });

  it('ne dit pas « aucun groupe » quand la liste n’a pas pu être lue', () => {
    expect(setup('Référentiel injoignable.')['emptyState']().title).toBe('Groupes illisibles');
  });

  it('retire la colonne d’actions sans le droit d’écrire', () => {
    expect(
      setup(null, false)
        ['columns']()
        .map((column) => column.key),
    ).not.toContain('actions');
  });
});
