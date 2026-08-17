import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PriceFloorView } from '@lfd/contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { FloorPanel, type FloorPanelData } from '../floor-panel/floor-panel';
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
  canonicalCents: 200,
};

function mount(opened: string[], calls: string[]): ComponentFixture<FloorPanel> {
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
          open: (component: { name: string }) => {
            opened.push(component.name);
            return { closed: Promise.resolve(false) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(FloorPanel);
  fixture.componentRef.setInput('data', DATA);
  fixture.detectChanges();
  return fixture;
}

describe('retirer une limite', () => {
  /**
   * Le motif est ce qu'on relira. Une suppression immédiate l'aurait perdu, et
   * « êtes-vous sûr ? » ne l'aurait jamais récolté.
   */
  it("passe par le panneau d'archivage, et ne supprime rien tout de suite", () => {
    const opened: string[] = [];
    const calls: string[] = [];

    mount(opened, calls).componentInstance['retire']();

    expect(opened).toEqual(['ArchivePanel']);
    expect(calls).toEqual([]);
  });

  it("ouvre le journal de la limite depuis le panneau où on l'édite", () => {
    const opened: string[] = [];

    mount(opened, []).componentInstance['openJournal']();

    expect(opened).toEqual(['JournalPanel']);
  });
});
