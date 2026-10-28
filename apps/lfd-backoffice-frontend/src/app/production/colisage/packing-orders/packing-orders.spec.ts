import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PackingLine, PackingSheet, SitePaletteEntryView } from '@lfd/contracts';
import { By } from '@angular/platform-browser';
import { FoldIconComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { PackingStack } from '../../packing-board';
import { PackingOrders } from './packing-orders';

/**
 * Un composant de présentation : il affiche ce qu'on lui donne — y compris un
 * chiffre incohérent avec les lignes, tel quel — et il émet le bon geste.
 */

function line(over: Partial<PackingLine> = {}): PackingLine {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 12,
    saleUnit: 'piece',
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
    clientele: null,
    fulfillmentMethod: 'delivery',
    destination: '12 rue des Lilas',
    lines: [line()],
    lineCount: 1,
    packedLines: 0,
    remainingLines: 1,
    pieces: 12,
    packedPieces: 0,
    canReportShortfall: false,
    shortfallReportedAt: null,
    deliveryNoteReprintNeeded: false,
    canDeclareReady: false,
    coldOutsideIsotherm: [],
    packedAt: null,
    packedBy: null,
    packedByName: null,
    ...over,
  };
}

interface Given {
  readonly sheets: readonly PackingSheet[];
  readonly stack?: PackingStack;
  readonly orderCount?: number;
  readonly todoCount?: number;
  readonly readyCount?: number;
  readonly openReference?: string | null;
  readonly hitLines?: ReadonlyMap<string, readonly PackingLine[]>;
  readonly palette?: readonly SitePaletteEntryView[];
}

function render(given: Given): ComponentFixture<PackingOrders> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(PackingOrders);
  fixture.componentRef.setInput('sheets', given.sheets);
  fixture.componentRef.setInput('stack', given.stack ?? 'todo');
  fixture.componentRef.setInput('orderCount', given.orderCount ?? 1);
  fixture.componentRef.setInput('todoCount', given.todoCount ?? 1);
  fixture.componentRef.setInput('readyCount', given.readyCount ?? 0);
  fixture.componentRef.setInput('openReference', given.openReference ?? null);
  fixture.componentRef.setInput('hitLines', given.hitLines ?? new Map());
  fixture.componentRef.setInput('palette', given.palette ?? []);
  fixture.detectChanges();
  return fixture;
}

function said(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

describe('la liste des commandes du colisage', () => {
  it('affiche les chiffres servis tels quels, même incohérents avec les lignes', () => {
    // Une ligne de 12 : le serveur dit 777 sur 999, et 50 commandes dont 31 en cours.
    const fixture = render({
      sheets: [sheet({ pieces: 999, packedPieces: 777 })],
      orderCount: 50,
      todoCount: 31,
      readyCount: 4,
    });
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelectorAll('.co-bac')).toHaveLength(1);
    expect(said(host.querySelector('.co-bac'))).toContain('777 / 999 produits');
    expect(said(host.querySelector('.co-band-sum'))).toBe('50 sur la journée');
    expect(said(host.querySelector('.co-stack'))).toContain('En cours 31');
    expect(said(host.querySelector('.co-stack'))).toContain('Prêtes 4');
  });

  it('pose « Pro » ou « Public » après le nom, et rien quand la clientèle est inconnue', () => {
    const fixture = render({
      sheets: [
        sheet({ reference: 'CMD-001', customerLabel: 'Hôtel du Parc', clientele: 'pro' }),
        sheet({ reference: 'CMD-002', customerLabel: 'Léa Martin', clientele: 'public' }),
        sheet({ reference: 'CMD-003', customerLabel: 'Café Neuf', clientele: null }),
      ],
    });
    const who = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.co-bac-who'),
      (element) => said(element),
    );

    expect(who).toEqual(['Hôtel du Parc Pro', 'Léa Martin Public', 'Café Neuf']);
  });

  it('émet la référence de la commande choisie', () => {
    const fixture = render({
      sheets: [sheet(), sheet({ reference: 'CMD-002', customerLabel: 'Café Neuf' })],
    });
    const host: HTMLElement = fixture.nativeElement;
    const chosen: string[] = [];
    fixture.componentInstance.chosen.subscribe((reference) => chosen.push(reference));

    const orders = host.querySelectorAll<HTMLButtonElement>('.co-bac');
    expect(orders).toHaveLength(2);
    orders[1]?.click();

    expect(chosen).toEqual(['CMD-002']);
  });

  it('émet la pile choisie', () => {
    const fixture = render({ sheets: [sheet()] });
    const host: HTMLElement = fixture.nativeElement;
    const stacks: PackingStack[] = [];
    fixture.componentInstance.stackChosen.subscribe((stack) => stacks.push(stack));

    Array.from(host.querySelectorAll<HTMLButtonElement>('.co-stack button'))
      .find((button) => button.textContent?.includes('Prêtes') === true)
      ?.click();

    expect(stacks).toEqual(['ready']);
  });

  it('marque la commande ouverte et la commande prête', () => {
    const fixture = render({
      sheets: [
        sheet(),
        sheet({ reference: 'CMD-002', packedAt: '2026-01-01T05:00:00', packedBy: 'Paul' }),
      ],
      openReference: 'CMD-001',
    });
    const host: HTMLElement = fixture.nativeElement;
    const orders = host.querySelectorAll('.co-bac');

    expect(orders).toHaveLength(2);
    expect(orders[0]?.classList.contains('is-open')).toBe(true);
    expect(orders[1]?.classList.contains('is-closed')).toBe(true);
    expect(said(orders[1])).toContain('Prête');
  });

  it('dit le mode par son icône — comptoir ou camion —, et une commande prête par une coche', () => {
    const fixture = render({
      sheets: [
        sheet({ fulfillmentMethod: 'pickup' }),
        sheet({ reference: 'CMD-002', packedAt: '2026-01-01T05:00:00', packedBy: 'Paul' }),
      ],
    });
    const name = (selector: string): string[] =>
      fixture.debugElement
        .queryAll(By.css(selector))
        .map((icon) => (icon.componentInstance as FoldIconComponent).name());

    // Plus de cadres par type (2026-10-25) : à heure égale, l’ordre servi.
    expect(name('.co-bac-where fold-icon')).toEqual(['store', 'truck']);
    expect(name('.co-bac-closed fold-icon')).toEqual(['check']);
  });

  it('montre les quantités des lignes trouvées, une par une, sans somme', () => {
    const found = [
      line({ sku: 'PAC', productName: 'Pain au chocolat', quantity: 12 }),
      line({ sku: 'PDM', productName: 'Pain de mie', quantity: 8 }),
    ];
    const fixture = render({
      sheets: [sheet({ lines: found })],
      hitLines: new Map([['CMD-001', found]]),
    });
    const host: HTMLElement = fixture.nativeElement;
    const chips = host.querySelectorAll('.co-hit-chip');

    expect(chips).toHaveLength(2);
    expect(Array.from(chips).map((chip) => said(chip))).toEqual([
      '12 Pain au chocolat',
      '8 Pain de mie',
    ]);
    expect(host.querySelector('.co-bac')?.classList.contains('is-hit')).toBe(true);
  });

  it('dit l’heure « prête pour » de chaque commande, et sa source (L2)', () => {
    const fixture = render({
      sheets: [
        sheet({ reference: 'CMD-001', readyBy: '07:10', readyBySource: 'round' }),
        sheet({ reference: 'CMD-002', orderId: 'o-2', readyBy: null, readyBySource: null }),
      ],
    });

    const labels = fixture.debugElement
      .queryAll(By.css('[data-ready-by]'))
      .map((found) => said(found.nativeElement as Element));
    expect(labels).toEqual(['Prête pour 07 h 10 · départ de la tournée', 'Pas encore de départ']);
  });

  it('dit lequel des deux cas quand la pile est vide', () => {
    const todo = render({ sheets: [], stack: 'todo' });
    const todoHost: HTMLElement = todo.nativeElement;
    expect(said(todoHost.querySelector('.co-stack-none'))).toContain('Tout est déclaré prêt');

    const ready = render({ sheets: [], stack: 'ready' });
    const readyHost: HTMLElement = ready.nativeElement;
    expect(said(readyHost.querySelector('.co-stack-none'))).toContain('Rien n');
  });

  it('une liste par urgence, la couleur en barre ; seul le transfert garde un encadré (2026-10-25)', () => {
    const fixture = render({
      sheets: [
        sheet({ reference: 'CMD-001', clientele: 'pro', readyBy: '08:00' }),
        sheet({
          reference: 'CMD-002',
          fulfillmentMethod: 'pickup',
          clientele: 'public',
          siteId: 'vv',
          readyBy: '07:00',
        }),
        sheet({ reference: 'CMD-003', clientele: null, readyBy: '06:00' }),
      ],
      palette: [
        {
          id: 'vv',
          label: 'Val Village',
          supply: 'transfer',
          isDeparture: false,
          pickupColorB2b: null,
          pickupColorB2c: '#fdd835',
          deliveryColorB2b: null,
          deliveryColorB2c: null,
          resupplyColor: null,
          transferColor: '#7c3aed',
        },
      ],
    });
    const host: HTMLElement = fixture.nativeElement;
    const bacs = Array.from(host.querySelectorAll<HTMLElement>('.co-bac'));
    const transfers = host.querySelectorAll<HTMLElement>('.co-transfer');

    expect(bacs.map((bac) => bac.title)).toEqual([
      'Livraison',
      'Retrait particulier Val Village',
      'Livraison pro',
    ]);
    expect(bacs.map((bac) => bac.dataset['bar'])).toEqual(['neutral', '#fdd835', 'neutral']);
    expect(bacs[1]?.style.getPropertyValue('--co-bar-color')).toBe('#fdd835');
    expect(transfers).toHaveLength(1);
    expect(said(transfers[0]?.querySelector('.co-transfer-title') ?? null)).toBe(
      'Transfert Val Village',
    );
    expect(transfers[0]?.contains(bacs[1] ?? null)).toBe(true);
    expect(transfers[0]?.dataset['frameColor']).toBe('#7c3aed');
    expect(transfers[0]?.style.getPropertyValue('--co-frame-color')).toBe('#7c3aed');
  });
});
