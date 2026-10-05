import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PackingLine, PackingSheet } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryBinsService } from '../../../livraison/delivery-bins.service';
import { DeliveryLoadingService } from '../../../livraison/delivery-loading.service';
import { PackingOpenOrder } from './packing-open-order';

/**
 * Un composant de présentation : il affiche ce qu'on lui donne — y compris un
 * chiffre ou une règle incohérents avec les lignes, tels quels — et il émet le
 * bon geste.
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
    ...over,
  };
}

function sheet(over: Partial<PackingSheet> = {}): PackingSheet {
  return {
    reference: 'CMD-001',
    orderId: 'o-CMD-001',
    containers: 0,
    customerLabel: 'Hôtel du Parc',
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
    ...over,
  };
}

/**
 * La rangée « + format » d'une livraison (lot PC1) lit la livraison : sans le
 * droit, elle se tait — ces cas-là parlent de la commande, pas des bacs.
 */
function render(inputs: Readonly<Record<string, unknown>>): ComponentFixture<PackingOpenOrder> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PermissionsStore, useValue: { can: () => false } },
      { provide: DeliveryLoadingService, useValue: {} },
      { provide: DeliveryBinsService, useValue: {} },
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

describe('les bacs d’une commande prête (lot 4 bis)', () => {
  function renderWithBins(over: Partial<PackingSheet>): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PermissionsStore, useValue: { can: () => false } },
        { provide: DeliveryLoadingService, useValue: {} },
        { provide: DeliveryBinsService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(PackingOpenOrder);
    fixture.componentRef.setInput(
      'sheet',
      sheet({ packedAt: '2026-10-01T05:00:00.000Z', ...over }),
    );
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('se déclarent sur une livraison prête', () => {
    expect(renderWithBins({}).querySelector('app-packing-bins')).not.toBeNull();
  });

  it('pas sur un retrait', () => {
    expect(
      renderWithBins({ fulfillmentMethod: 'pickup' }).querySelector('app-packing-bins'),
    ).toBeNull();
  });
});

describe('la commande ouverte du colisage', () => {
  it('affiche les lignes dans le bac telles que servies, même incohérentes', () => {
    const fixture = render({ sheet: sheet({ lineCount: 9, packedLines: 5 }) });
    const host: HTMLElement = fixture.nativeElement;

    // Deux lignes réellement là, et le serveur dit « 5 sur 9 » : c'est ce qui se lit.
    expect(host.querySelectorAll('.co-line')).toHaveLength(2);
    expect(said(host.querySelector('.co-band-sum'))).toBe('5 lignes sur 9 dans la commande');
  });

  it('arme « Déclarer prête » selon le serveur, ligne dehors ou non', () => {
    const fixture = render({ sheet: sheet({ canDeclareReady: true, remainingLines: 2 }) });
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector<HTMLButtonElement>('.co-close button')?.disabled).toBe(false);
    expect(said(host.querySelector('.co-close'))).not.toContain('encore dehors');
  });

  it('désarme « Déclarer prête » pendant la déclaration en vol', () => {
    const fixture = render({ sheet: sheet({ canDeclareReady: true }), closing: true });
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector<HTMLButtonElement>('.co-close button')?.disabled).toBe(true);
  });

  it('dit les lignes encore dehors avec le chiffre servi', () => {
    const fixture = render({ sheet: sheet({ canDeclareReady: false, remainingLines: 42 }) });
    const host: HTMLElement = fixture.nativeElement;

    expect(said(host.querySelector('.co-close'))).toContain('42 lignes encore dehors');
  });

  it('émet la déclaration', () => {
    const fixture = render({
      sheet: sheet({ canDeclareReady: true }),
      readyLabel: 'Déclarer prête pour la livraison',
    });
    const host: HTMLElement = fixture.nativeElement;
    let declared = 0;
    fixture.componentInstance.declareReady.subscribe(() => (declared += 1));

    const button = host.querySelector<HTMLButtonElement>('.co-close button');
    expect(said(button)).toBe('Déclarer prête pour la livraison');
    button?.click();

    expect(declared).toBe(1);
  });

  it('🔴 ne laisse plus cocher ni compter (K3b) : lignes et compte en lecture seule', () => {
    const fixture = render({ sheet: sheet({ containers: 3, fulfillmentMethod: 'pickup' }) });
    const host: HTMLElement = fixture.nativeElement;

    for (const box of Array.from(host.querySelectorAll<HTMLInputElement>('.co-line input'))) {
      expect(box.disabled).toBe(true);
    }
    expect(host.querySelector('.co-container-step')).toBeNull();
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
    const fixture = render({ sheet: sheet({ packedAt: '2026-10-05T05:00:00' }), reopening: true });
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector<HTMLButtonElement>('[data-reopen]')?.disabled).toBe(true);
  });

  it('dit lequel des deux cas quand aucune commande n’est ouverte', () => {
    const todo = render({ sheet: null, stack: 'todo' });
    const todoHost: HTMLElement = todo.nativeElement;
    expect(todoHost.textContent).toContain('Tout est déclaré prêt');

    const ready = render({ sheet: null, stack: 'ready' });
    const readyHost: HTMLElement = ready.nativeElement;
    expect(readyHost.textContent).toContain('Rien n’est encore prêt');
  });
});

describe('le « + » choisit un bac sur une livraison (lot PC1)', () => {
  /** Un poste qui peut déclarer, et une livraison sans bac ni froid. */
  function renderDeclaring(over: Partial<PackingSheet>): ComponentFixture<PackingOpenOrder> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PermissionsStore, useValue: { can: () => true } },
        {
          provide: DeliveryLoadingService,
          useValue: {
            orderBins: (orderId: string) =>
              Promise.resolve({ orderId, reference: 'CMD-001', bins: [], round: null }),
            packingProposal: () => Promise.reject(new Error('sans proposition')),
          },
        },
        {
          provide: DeliveryBinsService,
          useValue: { binTypes: () => Promise.resolve({ types: [] }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(PackingOpenOrder);
    fixture.componentRef.setInput('sheet', sheet(over));
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ComponentFixture<PackingOpenOrder>): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  it('une livraison montre la rangée des bacs, et plus le compte anonyme', () => {
    const host: HTMLElement = render({ sheet: sheet() }).nativeElement;

    expect(host.querySelector('app-packing-bin-row')).not.toBeNull();
    expect(host.querySelector('app-packing-containers')).toBeNull();
  });

  it('un retrait garde son compte anonyme, sans rangée (D4)', () => {
    const host: HTMLElement = render({
      sheet: sheet({ fulfillmentMethod: 'pickup' }),
    }).nativeElement;

    expect(host.querySelector('app-packing-containers')).not.toBeNull();
    expect(host.querySelector('app-packing-bin-row')).toBeNull();
  });

  it('🔴 avertit au premier appui sur « Prête » (aucun bac), déclare au second — jamais un refus', async () => {
    const fixture = renderDeclaring({ canDeclareReady: true });
    await settle(fixture);
    const host: HTMLElement = fixture.nativeElement;
    let declared = 0;
    fixture.componentInstance.declareReady.subscribe(() => (declared += 1));

    host.querySelector<HTMLButtonElement>('[data-declare-ready]')?.click();
    fixture.detectChanges();

    expect(declared).toBe(0);
    expect(said(host.querySelector('[data-ready-warnings]'))).toContain(
      'Aucun bac déclaré pour cette livraison.',
    );
    expect(said(host.querySelector('[data-declare-ready]'))).toBe('Déclarer prête quand même');

    host.querySelector<HTMLButtonElement>('[data-declare-ready]')?.click();
    fixture.detectChanges();

    expect(declared).toBe(1);
  });

  it('un retrait se déclare au premier appui : rien à avertir', () => {
    const fixture = render({
      sheet: sheet({ canDeclareReady: true, fulfillmentMethod: 'pickup' }),
    });
    let declared = 0;
    fixture.componentInstance.declareReady.subscribe(() => (declared += 1));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-declare-ready]')
      ?.click();

    expect(declared).toBe(1);
  });
});
