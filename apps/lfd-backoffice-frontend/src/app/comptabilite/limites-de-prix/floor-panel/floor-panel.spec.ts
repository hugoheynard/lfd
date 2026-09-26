import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PriceFloorView, SetPriceFloorPayload } from '@lfd/contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ArchivePanel } from '../../../b2b/tarification/archive-panel/archive-panel';
import { JournalPanel } from '../../../b2b/tarification/journal-panel/journal-panel';
import { NotifyService } from '../../../notify.service';
import { PriceLimitsService } from '../../price-limits.service';
import type { ScopeChoice } from '../scope-picker/scope-picker';
import { FloorPanel, type FloorPanelData } from './floor-panel';

/**
 * Ce que le panneau d'une limite tient :
 *
 * - « Retirer » vit dans la zone danger et passe par le panneau d'archivage ;
 * - chaque geste envoie la clientèle ;
 * - « Créer une limite » l'ouvre vide, et la portée se choisit DEDANS ;
 * - sans le droit, il se lit : ni enregistrement, ni zone danger.
 */

const FLOOR: PriceFloorView = {
  id: 'category:fam_01J9V1',
  scope: { type: 'category', id: 'fam_01J9V1' },
  mode: 'amount',
  value: 150,
  dynamic: null,
  drift: null,
  createdBy: 'staff',
  createdByName: null,
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const DATA: FloorPanelData = {
  clientele: 'pro',
  canWrite: true,
  target: {
    scope: { type: 'category', id: 'fam_01J9V1' },
    target: 'Viennoiseries',
    current: FLOOR,
    inherited: null,
    canonicalMillicents: null,
  },
  choices: [],
};

const DRAFT = { mode: 'percent', value: 4000, dynamic: null } as const;

function mount(
  opened: unknown[],
  calls: string[],
  data: FloorPanelData = DATA,
  sent: SetPriceFloorPayload[] = [],
): ComponentFixture<FloorPanel> {
  const service: Pick<PriceLimitsService, 'setFloor' | 'confirmFloor'> = {
    setFloor: (payload) => {
      sent.push(payload);
      calls.push(`setFloor:${payload.clientele}`);
      return Promise.resolve();
    },
    confirmFloor: (_scope, clientele) => {
      calls.push(`confirmFloor:${clientele}`);
      return Promise.resolve();
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PriceLimitsService, useValue: service },
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

const labels = (fixture: ComponentFixture<FloorPanel>): string[] =>
  Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).map(
    (b) => b.textContent?.trim() ?? '',
  );

describe('retirer une limite', () => {
  it("passe par le panneau d'archivage, et ne supprime rien tout de suite", () => {
    const opened: unknown[] = [];
    const calls: string[] = [];

    mount(opened, calls).componentInstance['retire']();

    expect(opened).toEqual([ArchivePanel]);
    expect(calls).toEqual([]);
  });

  it('vit dans la zone danger, avec le droit', () => {
    const fixture = mount([], []);

    expect(fixture.nativeElement.querySelector('fold-danger-zone')).not.toBeNull();
    expect(labels(fixture)).toContain('Retirer la limite');
  });

  it("ouvre le journal de la limite depuis le panneau où on l'édite", () => {
    const opened: unknown[] = [];

    mount(opened, []).componentInstance['openJournal']();

    expect(opened).toEqual([JournalPanel]);
  });
});

/**
 * **Le geste envoie la clientèle.** Le serveur vise `pro` quand elle manque :
 * une limite publique posée sans elle remplacerait la limite pro de la même
 * portée.
 */
describe('la clientèle du geste', () => {
  const PUBLIC: FloorPanelData = { ...DATA, clientele: 'public' };

  it('pose la limite pour la clientèle choisie', async () => {
    const calls: string[] = [];
    const panel = mount([], calls, PUBLIC).componentInstance;

    panel['draft'].set(DRAFT);
    await panel['submit']();

    expect(calls).toEqual(['setFloor:public']);
  });

  it('confirme la limite de la clientèle choisie', async () => {
    const calls: string[] = [];

    await mount([], calls, PUBLIC).componentInstance['confirm']();

    expect(calls).toEqual(['confirmFloor:public']);
  });
});

/** « Créer une limite » : le panneau s'ouvre vide, la portée se choisit dedans. */
describe('la portée choisie dans le panneau', () => {
  const CHOICE: ScopeChoice = {
    key: 'product:VIE-001',
    group: 'article',
    label: 'Croissant · VIE-001',
    scope: { type: 'product', id: 'VIE-001' },
    target: 'Croissant',
    current: null,
    inherited: null,
    canonicalMillicents: 200_000,
  };
  const CREATE: FloorPanelData = { ...DATA, target: null, choices: [CHOICE] };

  it('ne pose rien tant qu’aucune portée n’est choisie', async () => {
    const calls: string[] = [];
    const panel = mount([], calls, CREATE).componentInstance;

    panel['draft'].set(DRAFT);
    await panel['submit']();

    expect(calls).toEqual([]);
  });

  it('pose sur la portée choisie', async () => {
    const sent: SetPriceFloorPayload[] = [];
    const fixture = mount([], [], CREATE, sent);
    const panel = fixture.componentInstance;

    expect(fixture.nativeElement.querySelector('app-scope-picker')).not.toBeNull();
    panel['pick'](CHOICE);
    fixture.detectChanges();
    panel['draft'].set(DRAFT);
    await panel['submit']();

    expect(sent[0]?.scope).toEqual({ type: 'product', id: 'VIE-001' });
  });
});

/**
 * **Sans `lfc_price_limits:write`, le panneau se lit.** Même contenu, aucun
 * geste : ni enregistrement, ni confirmation, ni zone danger.
 */
describe('le panneau en lecture seule', () => {
  const READ_ONLY: FloorPanelData = { ...DATA, canWrite: false };

  it('ne montre ni zone danger ni enregistrement sans le droit', () => {
    const fixture = mount([], [], READ_ONLY);

    expect(fixture.nativeElement.querySelector('fold-danger-zone')).toBeNull();
    expect(labels(fixture)).not.toContain('Enregistrer');
    expect(labels(fixture)).toContain('Fermer');
    expect(labels(fixture)).toContain('Journal');
  });

  it('refuse les gestes même appelés directement', async () => {
    const opened: unknown[] = [];
    const calls: string[] = [];
    const panel = mount(opened, calls, READ_ONLY).componentInstance;

    panel['draft'].set(DRAFT);
    panel['retire']();
    await panel['confirm']();
    await panel['submit']();

    expect(opened).toEqual([]);
    expect(calls).toEqual([]);
  });
});
