import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  OpenPlannedColumnPayload,
  PlannerView,
  PutPlannedColumnPayload,
  ShopItemView,
  ShopQuotePayload,
} from '@lfd/contracts';

import { OrderContextStore, type ServiceChoice } from '../order-context.store';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ClientPlanner } from './client-planner.service';
import { PlannerBoard } from './planner-board.store';
import { cellKey, emptyCell, quotePayload } from './planner-grid';
import { plannedColumn, plannerView, PLANNER_DAY, PLANNER_NEXT_DAY } from './planner.fixture';

const SLOT = { start: '07:00', end: '09:00' };

const PICKUP: ServiceChoice = {
  mode: 'pickup',
  pickupAddressId: 'pt_labo',
  place: 'Le Labo',
  at: 'au Labo',
  address: '',
  slot: '7 h – 9 h',
  window: SLOT,
  date: PLANNER_DAY,
};

/** Le croissant se prend par six au moins (minimum pro). */
const ITEMS: Readonly<Record<string, Partial<ShopItemView>>> = {
  'VIE-001': { sku: 'VIE-001', name: 'Croissant', minQuantity: 6 },
  'PAI-001': { sku: 'PAI-001', name: 'Baguette' },
};

let views: PlannerView[];
let opened: OpenPlannedColumnPayload[];
let written: { id: string; payload: PutPlannedColumnPayload; keepalive: boolean }[];
let quoted: ShopQuotePayload[];
let writeFails: unknown;
const choice = signal<ServiceChoice | null>(PICKUP);

function boardWith(first: PlannerView): PlannerBoard {
  views = [first];
  opened = [];
  written = [];
  quoted = [];
  writeFails = null;
  choice.set(PICKUP);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      PlannerBoard,
      { provide: OrderContextStore, useValue: { choice } },
      {
        provide: ShopCatalogue,
        useValue: { itemOf: (sku: string) => ITEMS[sku] ?? null },
      },
      {
        provide: ClientPlanner,
        useValue: {
          read: () => Promise.resolve(views.at(-1)),
          open: (payload: OpenPlannedColumnPayload) => {
            opened.push(payload);
            return Promise.resolve({ id: 'col_new', version: 1 });
          },
          write: (id: string, payload: PutPlannedColumnPayload, keepalive = false) => {
            written.push({ id, payload, keepalive });
            return writeFails === null
              ? Promise.resolve({ version: payload.version + 1 })
              : Promise.reject(writeFails);
          },
          quote: (payload: ShopQuotePayload) => {
            quoted.push(payload);
            return Promise.resolve(8420);
          },
        },
      },
    ],
  });
  return TestBed.inject(PlannerBoard);
}

describe('PlannerBoard', () => {
  it('lit la vue, range les colonnes en cases, et chiffre chaque case remplie', async () => {
    const board = boardWith(plannerView());
    await board.load(PLANNER_DAY);
    await Promise.resolve();

    const key = cellKey(PLANNER_DAY, SLOT);
    expect(board.status()).toBe('ready');
    expect(board.cellAt(PLANNER_DAY, SLOT).lines).toEqual([{ sku: 'VIE-001', quantity: 10 }]);
    expect(quoted).toHaveLength(1);
    expect(board.totals().get(key)).toBe(8420);
  });

  it('un échec de la première lecture est un échec de la page', async () => {
    const board = boardWith(plannerView());
    TestBed.inject(ClientPlanner).read = () => Promise.reject(new Error('réseau'));
    await board.load(PLANNER_DAY);

    expect(board.status()).toBe('failed');
  });

  it('un favori déposé dans une case vide l’ouvre, puis l’écrit à la quantité minimale', async () => {
    const board = boardWith(plannerView({ days: [], shownDays: [PLANNER_DAY] }));
    await board.load(PLANNER_DAY);
    const key = cellKey(PLANNER_NEXT_DAY, SLOT);

    board.add('VIE-001', key);
    await board.flushNow();

    expect(opened).toEqual([
      {
        day: PLANNER_NEXT_DAY,
        routing: {
          method: 'pickup',
          deliveryAddress: null,
          pickupAddressId: 'pt_labo',
          window: SLOT,
        },
      },
    ]);
    expect(written[0]?.id).toBe('col_new');
    expect(written[0]?.payload.lines).toEqual([{ sku: 'VIE-001', quantity: 6 }]);
  });

  it('à la fermeture de l’onglet, l’écriture part en keepalive', async () => {
    const board = boardWith(plannerView());
    await board.load(PLANNER_DAY);
    const key = cellKey(PLANNER_DAY, SLOT);

    board.setQuantity(key, 'VIE-001', 12);
    expect(board.hasUnsavedWrites()).toBe(true);
    await board.flushNow(true);

    expect(written).toHaveLength(1);
    expect(written[0]?.keepalive).toBe(true);
    expect(board.hasUnsavedWrites()).toBe(false);
  });

  it('plusieurs gestes sur une case partent en UNE écriture de la case entière', async () => {
    const board = boardWith(plannerView());
    await board.load(PLANNER_DAY);
    const key = cellKey(PLANNER_DAY, SLOT);

    board.add('PAI-001', key);
    board.setQuantity(key, 'VIE-001', 12);
    await board.flushNow();

    expect(opened).toEqual([]);
    expect(written).toHaveLength(1);
    expect(written[0]?.payload).toMatchObject({
      version: 1,
      lines: [
        { sku: 'VIE-001', quantity: 12 },
        { sku: 'PAI-001', quantity: 1 },
      ],
    });
  });

  it('un déplacement vide la case de départ et ajoute à celle d’arrivée', async () => {
    const board = boardWith(plannerView());
    await board.load(PLANNER_DAY);
    const from = cellKey(PLANNER_DAY, SLOT);
    const to = cellKey(PLANNER_NEXT_DAY, SLOT);

    board.move('VIE-001', from, to);

    expect(board.cellAt(PLANNER_DAY, SLOT).lines).toEqual([]);
    expect(board.cellAt(PLANNER_NEXT_DAY, SLOT).lines).toEqual([{ sku: 'VIE-001', quantity: 10 }]);
  });

  it('un 409 (jour gelé, ou écrit ailleurs) relit la grille au lieu d’afficher une erreur', async () => {
    const board = boardWith(plannerView());
    await board.load(PLANNER_DAY);
    writeFails = new HttpErrorResponse({ status: 409 });
    views.push(
      plannerView({ days: [{ day: PLANNER_DAY, columns: [plannedColumn({ version: 3 })] }] }),
    );

    board.setQuantity(cellKey(PLANNER_DAY, SLOT), 'VIE-001', 20);
    await board.flushNow();

    expect(board.writeError()).toBeNull();
    expect(board.reloadedAfterConflict()).toBe(true);
    expect(board.cellAt(PLANNER_DAY, SLOT).lines).toEqual([{ sku: 'VIE-001', quantity: 10 }]);
    expect(board.cellAt(PLANNER_DAY, SLOT).version).toBe(3);
  });

  it('un autre refus s’affiche, et la case garde ce que le client a fait', async () => {
    const board = boardWith(plannerView());
    await board.load(PLANNER_DAY);
    writeFails = new HttpErrorResponse({ status: 400, error: { message: 'Quantité refusée.' } });

    board.setQuantity(cellKey(PLANNER_DAY, SLOT), 'VIE-001', 20);
    await board.flushNow();

    expect(board.writeError()).toBe('Quantité refusée.');
  });

  it('sans mode de service choisi ni colonne enregistrée, rien ne s’ouvre', async () => {
    const board = boardWith(plannerView({ days: [] }));
    choice.set(null);
    await board.load(PLANNER_DAY);

    board.add('VIE-001', cellKey(PLANNER_DAY, SLOT));
    await board.flushNow();

    expect(board.routing()).toBeNull();
    expect(opened).toEqual([]);
  });

  it('le devis d’une case porte son jour et son créneau, et le code postal en livraison', () => {
    const cell = {
      ...emptyCell(PLANNER_DAY, SLOT),
      lines: [{ sku: 'VIE-001', quantity: 6 }],
    };
    const payload = quotePayload(cell, {
      method: 'delivery',
      deliveryAddress: {
        label: '',
        ligne1: '1 rue des Halles',
        ligne2: '',
        codePostal: '75001',
        ville: 'Paris',
        pays: 'France',
      },
      pickupAddressId: null,
    });

    expect(payload).toEqual({
      lines: [{ sku: 'VIE-001', quantity: 6 }],
      fulfillment: { method: 'delivery', codePostal: '75001' },
      requestedDeliveryDate: PLANNER_DAY,
      requestedWindow: SLOT,
    });
  });
});
