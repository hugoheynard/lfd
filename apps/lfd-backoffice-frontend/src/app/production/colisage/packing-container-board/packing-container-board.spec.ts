import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  BinTypeView,
  DeliveryBinFreeHalvesView,
  OpenPackingContainer,
  PackingContainerView,
  PackingLine,
  PackingSheet,
} from '@lfd/contracts';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { FoldIconComponent, FoldPanelHostComponent } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryBinsService } from '../../../livraison/delivery-bins.service';
import { PackingContainersService } from '../../packing-containers.service';
import { PackingDayReader } from '../packing-day.reader';
import { PackingContainerBoard } from './packing-container-board';

/**
 * Ce que ces cas tiennent (K2b, `colisage.md` §2, §5.1) : un
 * bac pour une livraison, un sac pour un retrait ; un dépôt demande combien,
 * « tout » par défaut, au dépôt comme au retrait ; un refus du serveur se dit
 * tel quel ; « Proposer » n'écrit que sur un clic, d'un seul appel ; une
 * livraison partage une moitié voisine ; une commande prête ne bouge plus ; chaque geste
 * se relit.
 */

function line(over: Partial<PackingLine>): PackingLine {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 20,
    packed: false,
    initials: null,
    packedAt: null,
    awaitingProduction: false,
    allocated: 0,
    unallocated: 20,
    ...over,
  };
}

function container(over: Partial<PackingContainerView>): PackingContainerView {
  return {
    id: 'c-1',
    nature: 'bin',
    label: 'A3K',
    binId: 'b-1',
    binCode: 'A3K',
    binHalf: null,
    lines: [],
    pieces: 0,
    ...over,
  };
}

function sheet(over: Partial<PackingSheet>): PackingSheet {
  return {
    orderId: 'o-1',
    reference: 'CMD-1',
    containers: 0,
    customerLabel: 'Le Refuge',
    fulfillmentMethod: 'delivery',
    destination: 'Annecy',
    lines: [line({})],
    lineCount: 1,
    packedLines: 0,
    remainingLines: 1,
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

const TYPES: BinTypeView[] = [
  {
    id: 't-m',
    name: 'Bac M',
    outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
    inner: { lengthCm: 56, widthCm: 36, heightCm: 20 },
    innerVolumeLiters: 40,
    isotherm: false,
    maxStack: 6,
    divisible: false,
    archivedAt: null,
  },
];

/** Le serveur doublé : il garde ce qu'on lui envoie. */
class FakeContainers {
  readonly opened: OpenPackingContainer[] = [];
  readonly allocated: { containerId: string; sku: string; quantity: number }[] = [];
  readonly withdrawn: { containerId: string; sku: string; quantity: number }[] = [];
  readonly voided: string[] = [];
  readonly transferred: { from: string; sku: string; to: string; quantity: number }[] = [];
  voidRefusal: unknown = null;
  proposals = 0;
  proposalRefusal: unknown = null;
  halvesView: DeliveryBinFreeHalvesView = {
    orderId: 'o-1',
    reference: 'CMD-1',
    round: null,
    halves: [],
  };

  open(_date: string, _orderId: string, body: OpenPackingContainer): Promise<string> {
    this.opened.push(body);
    return Promise.resolve(`c-new-${String(this.opened.length)}`);
  }

  allocate(_d: string, _o: string, containerId: string, sku: string, quantity: number) {
    this.allocated.push({ containerId, sku, quantity });
    return Promise.resolve();
  }

  withdraw(_d: string, _o: string, containerId: string, sku: string, quantity: number) {
    this.withdrawn.push({ containerId, sku, quantity });
    return Promise.resolve();
  }

  transfer(_d: string, _o: string, from: string, sku: string, to: string, quantity: number) {
    this.transferred.push({ from, sku, to, quantity });
    return Promise.resolve();
  }

  void(_d: string, _o: string, containerId: string): Promise<void> {
    this.voided.push(containerId);
    return this.voidRefusal === null ? Promise.resolve() : Promise.reject(this.voidRefusal);
  }

  applyProposal(): Promise<void> {
    this.proposals += 1;
    return this.proposalRefusal === null ? Promise.resolve() : Promise.reject(this.proposalRefusal);
  }

  shareableHalves(): Promise<DeliveryBinFreeHalvesView> {
    return Promise.resolve(this.halvesView);
  }
}

let api: FakeContainers;
let rereads: number;
/** Le dialogue « combien ? » vit dans l'hôte des panneaux, hors du tableau. */
let overlay: ComponentFixture<FoldPanelHostComponent>;

async function settle(fixture: ComponentFixture<PackingContainerBoard>): Promise<void> {
  for (let tick = 0; tick < 4; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    overlay.detectChanges();
  }
}

function dialog(): HTMLElement {
  return overlay.nativeElement as HTMLElement;
}

async function render(
  served: PackingSheet,
): Promise<{ fixture: ComponentFixture<PackingContainerBoard>; el: HTMLElement }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PermissionsStore, useValue: { can: () => true } },
      { provide: PackingContainersService, useValue: api },
      {
        provide: PackingDayReader,
        useValue: {
          date: () => '2026-10-05',
          rereadAfterWrite: () => {
            rereads += 1;
            return Promise.resolve(true);
          },
        },
      },
      {
        provide: DeliveryBinsService,
        useValue: { binTypes: () => Promise.resolve({ types: TYPES }) },
      },
    ],
  });
  overlay = TestBed.createComponent(FoldPanelHostComponent);
  const fixture = TestBed.createComponent(PackingContainerBoard);
  fixture.componentRef.setInput('sheet', served);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function said(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

function click(el: HTMLElement, selector: string): void {
  const target = el.querySelector<HTMLElement>(selector);
  expect(target).not.toBeNull();
  target?.click();
}

describe('les contenants d’une commande `listed` (K2b)', () => {
  beforeEach(() => {
    api = new FakeContainers();
    rereads = 0;
  });

  it('un retrait crée un sac, pas un bac, et relit', async () => {
    const { fixture, el } = await render(sheet({ fulfillmentMethod: 'pickup' }));
    expect(el.querySelector('[data-new-bin]')).toBeNull();
    expect(el.querySelector('[data-propose]')).toBeNull();
    expect(el.querySelector('[data-share-half]')).toBeNull();
    click(el, '[data-new-bag]');
    await settle(fixture);
    expect(api.opened).toEqual([{ nature: 'bag' }]);
    expect(rereads).toBe(1);
  });

  it('une livraison choisit le format du bac, comme le panneau de déclaration', async () => {
    const { fixture, el } = await render(sheet({}));
    click(el, '[data-new-bin]');
    await settle(fixture);
    click(el, '[data-bin-format]');
    await settle(fixture);
    expect(api.opened).toEqual([{ nature: 'bin', binTypeId: 't-m', half: false, innerBags: 0 }]);
  });

  it('un dépôt demande combien, « tout » par défaut, et répartit cette quantité', async () => {
    const { fixture } = await render(
      sheet({ lines: [line({ allocated: 5, unallocated: 15 })], containerList: [container({})] }),
    );
    fixture.componentInstance.askQuantity('c-1', 'CRO');
    await settle(fixture);
    expect(said(dialog())).toContain('Mettre « Croissant » dans A3K');
    expect(said(dialog().querySelector('[data-pending-drop]'))).toContain('Tout : 15');
    expect(said(dialog().querySelector('[data-confirm-drop]'))).toBe('Mettre dedans');
    click(dialog(), '[data-confirm-drop]');
    await settle(fixture);
    expect(api.allocated).toEqual([{ containerId: 'c-1', sku: 'CRO', quantity: 15 }]);
    expect(dialog().querySelector('[data-pending-drop]')).toBeNull();
  });

  it('un article glissé vers l’autre contenant y part tout entier, d’un appel, et relit', async () => {
    const { fixture } = await render(
      sheet({
        containerList: [
          container({ lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 10 }] }),
          container({ id: 'c-2', label: 'B7Q', binId: 'b-2', binCode: 'B7Q' }),
        ],
      }),
    );
    fixture.componentInstance.askTransfer({ containerId: 'c-1', sku: 'CRO' }, 'c-2');
    await settle(fixture);
    expect(said(dialog())).toContain('Déplacer « Croissant » vers B7Q');
    expect(said(dialog().querySelector('[data-pending-drop]'))).toContain('Tout : 10');
    click(dialog(), '[data-confirm-drop]');
    await settle(fixture);
    expect(api.transferred).toEqual([{ from: 'c-1', sku: 'CRO', to: 'c-2', quantity: 10 }]);
    expect(api.allocated).toEqual([]);
    expect(rereads).toBe(1);
    expect(dialog().querySelector('[data-pending-drop]')).toBeNull();
  });

  it('ne déplace pas vers le contenant de départ, et sans second contenant ne propose rien', async () => {
    const { fixture, el } = await render(
      sheet({
        containerList: [
          container({ lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 10 }] }),
        ],
      }),
    );
    expect(el.querySelector('[data-share="CRO"].is-draggable')).toBeNull();
    fixture.componentInstance.askTransfer({ containerId: 'c-1', sku: 'CRO' }, 'c-1');
    await settle(fixture);
    expect(dialog().querySelector('[data-pending-drop]')).toBeNull();
  });

  /** Sur tablette, la colonne « Marchandise à répartir » n'est pas rendue : le reste vit sous la ligne. */
  it('écrit sous la quantité le reste servi du même SKU, zéro et manque compris', async () => {
    const { fixture, el } = await render(
      sheet({
        lines: [
          line({ sku: 'CRO' }),
          line({ sku: 'PAC', productName: 'Pain au chocolat' }),
          line({ sku: 'BRI', productName: 'Brioche' }),
          line({ sku: 'BAG', productName: 'Baguette' }),
        ],
        containerList: [container({})],
      }),
    );
    fixture.componentRef.setInput(
      'stock',
      new Map([
        ['CRO', 57],
        ['PAC', 0],
        ['BRI', -3],
      ]),
    );
    fixture.detectChanges();
    expect(said(el.querySelector('[data-line-stock="CRO"]'))).toBe('57 en stock');
    expect(said(el.querySelector('[data-line-stock="PAC"]'))).toBe('0 en stock');
    const short = el.querySelector('[data-line-stock="BRI"]');
    expect(said(short)).toBe('-3 en stock');
    expect(short?.classList.contains('is-short')).toBe(true);
    // Un SKU absent de la marchandise servie : rien d'inventé.
    expect(el.querySelector('[data-line-stock="BAG"]')).toBeNull();
  });

  it('une ligne toute répartie porte une coche', async () => {
    const { fixture } = await render(
      sheet({ lines: [line({ allocated: 20, unallocated: 0 })], containerList: [container({})] }),
    );
    const icon = fixture.debugElement.query(By.css('[data-line="CRO"] fold-icon'));
    expect((icon.componentInstance as FoldIconComponent).name()).toBe('check');
  });

  it('ne demande rien pour une ligne déjà toute répartie', async () => {
    const { fixture } = await render(
      sheet({ lines: [line({ allocated: 20, unallocated: 0 })], containerList: [container({})] }),
    );
    fixture.componentInstance.askQuantity('c-1', 'CRO');
    await settle(fixture);
    expect(dialog().querySelector('[data-pending-drop]')).toBeNull();
  });

  it('retire une partie d’une répartition : « tout » par défaut, puis la quantité dite', async () => {
    const { fixture, el } = await render(
      sheet({
        containerList: [
          container({
            lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 10 }],
            pieces: 10,
          }),
        ],
      }),
    );
    click(el, '[data-withdraw]');
    await settle(fixture);
    expect(said(dialog())).toContain('Retirer « Croissant » de A3K');
    const ask = dialog().querySelector('[data-pending-withdrawal]');
    expect(said(ask)).toContain('Tout : 10');
    expect(api.withdrawn).toEqual([]);
    const input = ask?.querySelector('input');
    expect(input).not.toBeNull();
    if (input) {
      input.value = '4';
      input.dispatchEvent(new Event('input'));
    }
    await settle(fixture);
    click(dialog(), '[data-confirm-withdrawal]');
    await settle(fixture);
    expect(api.withdrawn).toEqual([{ containerId: 'c-1', sku: 'CRO', quantity: 4 }]);
    expect(dialog().querySelector('[data-pending-withdrawal]')).toBeNull();
  });

  it('dit tel quel le refus du serveur à l’annulation d’un bac chargé', async () => {
    api.voidRefusal = new HttpErrorResponse({
      status: 409,
      error: { code: 'x', message: 'Ce bac est chargé — déchargez-le d’abord.' },
    });
    const { fixture, el } = await render(sheet({ containerList: [container({})] }));
    click(el, '[data-void-container]');
    await settle(fixture);
    expect(api.voided).toEqual(['c-1']);
    expect(said(el.querySelector('[data-container-refusal]'))).toBe(
      'Ce bac est chargé — déchargez-le d’abord.',
    );
    expect(rereads).toBe(1);
  });

  it('« Proposer » n’écrit que sur un clic, d’un seul appel au serveur', async () => {
    const { fixture, el } = await render(sheet({}));
    expect(api.proposals).toBe(0);
    click(el, '[data-propose]');
    await settle(fixture);
    expect(api.proposals).toBe(1);
    expect(api.opened).toEqual([]);
    expect(api.allocated).toEqual([]);
    expect(rereads).toBe(1);
  });

  it('une proposition vide se dit telle quelle, et renvoie aux contenances', async () => {
    api.proposalRefusal = new HttpErrorResponse({
      status: 409,
      error: {
        code: 'packing.proposal.empty',
        message: 'La grille des contenances ne couvre rien.',
      },
    });
    const { fixture, el } = await render(sheet({}));
    click(el, '[data-propose]');
    await settle(fixture);
    expect(said(el.querySelector('[data-container-refusal]'))).toContain(
      'La grille des contenances ne couvre rien.',
    );
    expect(el.querySelector('[data-capacities-link]')?.getAttribute('href')).toBe(
      '/livraison/contenances',
    );
  });

  it('un autre refus de « Proposer » ne renvoie pas aux contenances', async () => {
    api.proposalRefusal = new HttpErrorResponse({
      status: 409,
      error: { code: 'packing.proposal.containers_exist', message: 'Elle a déjà un contenant.' },
    });
    const { fixture, el } = await render(sheet({}));
    click(el, '[data-propose]');
    await settle(fixture);
    expect(said(el.querySelector('[data-container-refusal]'))).toBe('Elle a déjà un contenant.');
    expect(el.querySelector('[data-capacities-link]')).toBeNull();
  });

  it('une livraison prend la moitié libre d’un arrêt voisin', async () => {
    api.halvesView = {
      ...api.halvesView,
      halves: [
        {
          binId: 'b-9',
          code: 'Z9Q',
          orderId: 'o-2',
          reference: 'CMD-2',
          customerLabel: 'Chez Max',
          position: 4,
          binTypeId: 't-m',
          binTypeName: 'Bac M',
          isotherm: false,
          freeHalf: 'right',
        },
      ],
    };
    const { fixture, el } = await render(sheet({}));
    click(el, '[data-share-half]');
    await settle(fixture);
    expect(said(el.querySelector('[data-shareable-half]'))).toBe(
      'Z9Q · ½ droite — Chez Max (arrêt 4)',
    );
    click(el, '[data-shareable-half]');
    await settle(fixture);
    expect(api.opened).toEqual([{ nature: 'bin', partnerBinId: 'b-9', innerBags: 0 }]);
  });

  it('sans moitié libre voisine, le dit', async () => {
    const { fixture, el } = await render(sheet({}));
    click(el, '[data-share-half]');
    await settle(fixture);
    expect(said(el.querySelector('[data-no-half]'))).toBe(
      'Aucune moitié libre aux arrêts voisins.',
    );
  });

  it('« Proposer » ne s’offre plus dès qu’un contenant existe', async () => {
    const { el } = await render(sheet({ containerList: [container({})] }));
    expect(el.querySelector('[data-propose]')).toBeNull();
  });

  it('une commande déclarée prête ne s’offre plus à aucun geste', async () => {
    const { el } = await render(
      sheet({
        packedAt: '2026-10-05T05:00:00.000Z',
        containerList: [
          container({ lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 20 }] }),
        ],
      }),
    );
    expect(el.querySelector('[data-new-bin]')).toBeNull();
    expect(el.querySelector('[data-void-container]')).toBeNull();
    expect(el.querySelector('[data-withdraw]')).toBeNull();
  });

  it('un bac s’étiquette, seul ou avec toute la commande ; un sac non', async () => {
    const { el } = await render(
      sheet({
        containerList: [
          container({}),
          container({ id: 'c-2', nature: 'bag', label: 'Sac 1', binId: null, binCode: null }),
        ],
      }),
    );
    const one = el.querySelectorAll<HTMLAnchorElement>('[data-bin-label]');
    expect(one.length).toBe(1);
    expect(one[0]?.getAttribute('href')).toBe('/livraison/etiquettes/o-1?bacs=b-1');
    expect(el.querySelector('[data-labels]')?.getAttribute('href')).toBe(
      '/livraison/etiquettes/o-1',
    );
  });

  it('sans bac, pas d’étiquettes à imprimer', async () => {
    const { el } = await render(sheet({ fulfillmentMethod: 'pickup' }));
    expect(el.querySelector('[data-labels]')).toBeNull();
  });
});
