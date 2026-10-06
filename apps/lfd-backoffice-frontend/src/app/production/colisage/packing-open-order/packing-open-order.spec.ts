import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PackingLine, PackingSheet } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryBinsService } from '../../../livraison/delivery-bins.service';
import { PackingContainersService } from '../../packing-containers.service';
import { PackingDayReader } from '../packing-day.reader';
import { PackingOpenOrder } from './packing-open-order';

/**
 * Un composant de présentation : il affiche ce qu'on lui donne — y compris un
 * chiffre ou une règle incohérents avec les lignes, tels quels — et il émet le
 * bon geste. Une commande `counted` (colisée avec l'ancien poste) est en
 * lecture seule (plan du colisage, §17.6).
 */

function line(over: Partial<PackingLine> = {}): PackingLine {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 12,
    packed: false,
    initials: null,
    packedAt: null,
    awaitingProduction: false,
    allocated: 0,
    unallocated: 12,
    ...over,
  };
}

function sheet(over: Partial<PackingSheet> = {}): PackingSheet {
  return {
    reference: 'CMD-001',
    orderId: 'o-CMD-001',
    containers: 0,
    customerLabel: 'Hôtel du Parc',
    clientele: null,
    fulfillmentMethod: 'delivery',
    destination: '12 rue des Lilas',
    lines: [line(), line({ sku: 'BAG', productName: 'Baguette', quantity: 8 })],
    lineCount: 2,
    packedLines: 0,
    remainingLines: 2,
    pieces: 20,
    packedPieces: 0,
    canDeclareReady: false,
    packedAt: null,
    packedBy: null,
    packedByName: null,
    containerMode: 'listed',
    containerList: [],
    ...over,
  };
}

/** La colonne des contenants (`listed`) lit ses services : on les tient muets. */
function render(inputs: Readonly<Record<string, unknown>>): ComponentFixture<PackingOpenOrder> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PermissionsStore, useValue: { can: () => false } },
      { provide: PackingContainersService, useValue: {} },
      {
        provide: PackingDayReader,
        useValue: { date: () => '2026-10-05', rereadAfterWrite: () => Promise.resolve(true) },
      },
      {
        provide: DeliveryBinsService,
        useValue: { binTypes: () => Promise.resolve({ types: [] }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PackingOpenOrder);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture;
}

function said(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

describe('la commande ouverte du colisage', () => {
  it('affiche le compte servi, même incohérent avec les lignes', () => {
    const host: HTMLElement = render({
      sheet: sheet({ lineCount: 9, packedLines: 5 }),
    }).nativeElement;

    expect(said(host.querySelector('.co-band-sum'))).toBe('5 lignes sur 9 dans la commande');
    expect(host.querySelector('app-packing-container-board')).not.toBeNull();
  });

  it('arme « Déclarer prête » selon le serveur, ligne dehors ou non', () => {
    const host: HTMLElement = render({
      sheet: sheet({ canDeclareReady: true, remainingLines: 2 }),
    }).nativeElement;

    expect(host.querySelector<HTMLButtonElement>('[data-declare-ready]')?.disabled).toBe(false);
    expect(said(host.querySelector('.co-close'))).not.toContain('encore dehors');
  });

  it('désarme « Déclarer prête » pendant la déclaration en vol', () => {
    const host: HTMLElement = render({
      sheet: sheet({ canDeclareReady: true }),
      closing: true,
    }).nativeElement;

    expect(host.querySelector<HTMLButtonElement>('[data-declare-ready]')?.disabled).toBe(true);
  });

  it('dit les lignes encore dehors avec le chiffre servi', () => {
    const host: HTMLElement = render({
      sheet: sheet({ canDeclareReady: false, remainingLines: 42 }),
    }).nativeElement;

    expect(said(host.querySelector('.co-close'))).toContain('42 lignes encore dehors');
  });

  it('émet la déclaration au premier appui, avec le libellé du mode', () => {
    const fixture = render({
      sheet: sheet({ canDeclareReady: true }),
      readyLabel: 'Déclarer prête pour la livraison',
    });
    const host: HTMLElement = fixture.nativeElement;
    let declared = 0;
    fixture.componentInstance.declareReady.subscribe(() => (declared += 1));

    const button = host.querySelector<HTMLButtonElement>('[data-declare-ready]');
    expect(said(button)).toBe('Déclarer prête pour la livraison');
    button?.click();

    expect(declared).toBe(1);
  });

  it('offre « Rouvrir » sur une commande prête, et l’émet', () => {
    const fixture = render({ sheet: sheet({ packedAt: '2026-10-05T05:00:00' }) });
    const host: HTMLElement = fixture.nativeElement;
    let reopened = 0;
    fixture.componentInstance.reopen.subscribe(() => (reopened += 1));

    expect(host.querySelector('[data-declare-ready]')).toBeNull();
    host.querySelector<HTMLButtonElement>('[data-reopen]')?.click();

    expect(reopened).toBe(1);
    expect(said(host.querySelector('.co-close'))).toContain('reste prête au commerce');
  });

  it('désarme « Rouvrir » pendant la réouverture en vol', () => {
    const host: HTMLElement = render({
      sheet: sheet({ packedAt: '2026-10-05T05:00:00' }),
      reopening: true,
    }).nativeElement;

    expect(host.querySelector<HTMLButtonElement>('[data-reopen]')?.disabled).toBe(true);
  });

  it('dit lequel des deux cas quand aucune commande n’est ouverte', () => {
    const todoHost: HTMLElement = render({ sheet: null, stack: 'todo' }).nativeElement;
    expect(todoHost.textContent).toContain('Tout est déclaré prêt');

    const readyHost: HTMLElement = render({ sheet: null, stack: 'ready' }).nativeElement;
    expect(readyHost.textContent).toContain('Rien n’est encore prêt');
  });
});

describe('une commande colisée avec l’ancien poste (`counted`, §17.6)', () => {
  const MESSAGE = "Commande colisée avec l'ancien poste : elle ne se modifie plus ici.";

  it.each([
    ['à préparer', null],
    ['prête', '2026-10-05T05:00:00'],
  ])('%s : le dit, et n’offre ni « Prête » ni « Rouvrir »', (_case, packedAt) => {
    const host: HTMLElement = render({
      sheet: sheet({ containerMode: 'counted', canDeclareReady: true, packedAt, containers: 3 }),
    }).nativeElement;

    expect(said(host.querySelector('[data-legacy-order]'))).toBe(MESSAGE);
    expect(host.querySelector('[data-declare-ready]')).toBeNull();
    expect(host.querySelector('[data-reopen]')).toBeNull();
    expect(host.querySelector('app-packing-container-board')).toBeNull();
  });

  it('montre ses lignes et son compte sans rien laisser toucher', () => {
    const host: HTMLElement = render({
      sheet: sheet({ containerMode: 'counted', containers: 3, fulfillmentMethod: 'pickup' }),
    }).nativeElement;

    expect(host.querySelectorAll('.co-line')).toHaveLength(2);
    for (const box of Array.from(host.querySelectorAll<HTMLInputElement>('.co-line input'))) {
      expect(box.disabled).toBe(true);
    }
    expect(host.querySelector('.co-container-step')).toBeNull();
  });

  it('une commande d’avant le mode (`containerMode` absent) se lit comme `counted`', () => {
    const { containerMode: _dropped, ...legacy } = sheet();
    const host: HTMLElement = render({ sheet: legacy }).nativeElement;

    expect(host.querySelector('[data-legacy-order]')).not.toBeNull();
  });
});
