import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PriceFloorView } from '@lfd/contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { ArchivePanel } from '../archive-panel/archive-panel';
import { FloorPanel, type FloorPanelData } from '../floor-panel/floor-panel';
import { JournalPanel } from '../journal-panel/journal-panel';
import { TarificationService } from '../tarification.service';

/**
 * **Ce que le panneau Limite ne fait plus.**
 *
 * « Retirer » n'appelle plus de suppression : il ouvre le panneau d'archivage,
 * qui demande pourquoi. C'est le seul chemin destructeur de cet écran, donc
 * celui qui mérite d'être figé par un test.
 */

const FLOOR: PriceFloorView = {
  id: 'category:viennoiserie',
  scope: { type: 'category', id: 'viennoiserie' },
  mode: 'amount',
  value: 150,
  dynamic: null,
  drift: null,
  createdBy: 'staff',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const DATA: FloorPanelData = {
  scope: { type: 'category', id: 'viennoiserie' },
  target: 'Viennoiseries',
  current: FLOOR,
  inherited: null,
  canonicalMillicents: 200,
};

function mount(
  opened: unknown[],
  calls: string[],
  data: FloorPanelData = DATA,
): ComponentFixture<FloorPanel> {
  const service: Pick<TarificationService, 'setFloor' | 'confirmFloor'> = {
    setFloor: () => {
      calls.push('setFloor');
      return Promise.resolve();
    },
    confirmFloor: () => {
      calls.push('confirmFloor');
      return Promise.resolve();
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: TarificationService, useValue: service },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown) => {
            opened.push(component);
            return { closed: Promise.resolve(false) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(FloorPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('retirer une limite', () => {
  /**
   * Le motif est ce qu'on relira. Une suppression immédiate l'aurait perdu, et
   * « êtes-vous sûr ? » ne l'aurait jamais récolté.
   */
  it("passe par le panneau d'archivage, et ne supprime rien tout de suite", () => {
    const opened: unknown[] = [];
    const calls: string[] = [];

    mount(opened, calls).componentInstance['retire']();

    expect(opened).toEqual([ArchivePanel]);
    expect(calls).toEqual([]);
  });

  it("ouvre le journal de la limite depuis le panneau où on l'édite", () => {
    const opened: unknown[] = [];

    mount(opened, []).componentInstance['openJournal']();

    expect(opened).toEqual([JournalPanel]);
  });
});

/**
 * **Une limite en euros n'a de sens que sur une unité.**
 *
 * Sur une famille ou sur tout le catalogue, un montant unique relèverait les
 * prix bas et laisserait passer les prix élevés — le même mur, deux effets
 * opposés. L'écran ne propose donc pas le choix, plutôt que de l'offrir et de le
 * refuser ensuite : c'est la façon la plus sûre de faire saisir deux fois la
 * même chose.
 */
describe("l'unité de la limite", () => {
  const onScope = (scope: FloorPanelData['scope']): FloorPanelData => ({
    ...DATA,
    scope,
    current: null,
  });

  it('laisse choisir sur un article', () => {
    const panel = mount([], [], onScope({ type: 'product', id: 'VIE-001' })).componentInstance;

    expect(panel['unitScoped']()).toBe(true);
  });

  it("s'ouvre en pourcentage sur une famille, et refuse d'en changer", () => {
    const panel = mount(
      [],
      [],
      onScope({ type: 'category', id: 'viennoiserie' }),
    ).componentInstance;

    expect(panel['mode']()).toBe('percent');
    panel['setMode']('amount');
    expect(panel['mode']()).toBe('percent');
  });

  it('fait de même sur tout le catalogue', () => {
    const panel = mount([], [], onScope({ type: 'global', id: null })).componentInstance;

    expect(panel['unitScoped']()).toBe(false);
    expect(panel['mode']()).toBe('percent');
  });

  /** L'écran l'ÉCRIT, plutôt que de laisser deviner pourquoi le choix a disparu. */
  it('écrit pourquoi le choix ne se pose pas', () => {
    const text = String(
      mount([], [], onScope({ type: 'global', id: null })).nativeElement.textContent ?? '',
    );

    expect(text).toContain('En pourcentage du tarif');
  });
});
