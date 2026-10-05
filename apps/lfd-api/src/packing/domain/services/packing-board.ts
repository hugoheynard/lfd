import type { PackingResource, ProductionPackingView } from "@lfd/contracts";

import type { PackingBoardDay } from "../ports/packing-board.reader.js";
import { allocationOf, type Awaiting, byNameThenSku, sheetOf } from "./packing-board-sheet.js";
import { leftToPlace, shortfall } from "./placement.js";
import { relativeDayOf } from "./relative-day.js";

/**
 * **Le poste de colisage, servi par le colisage** (plan
 * `colisage/colisage.md`, §17, K3a) — fonction pure.
 *
 * Même FORME que celle du fournil (`ProductionPackingView`, `packingBoardOf`
 * de `production/domain/services/production-packing.ts`) : l'écran change
 * d'adresse, pas de contrat. Les mêmes règles, recopiées et non importées —
 * le colisage n'atteint le fournil que par son canal, et l'ancien poste est
 * retiré en K3c.
 *
 * Ce qui change est la SOURCE de chaque moitié :
 *
 * - les bacs, leurs lignes, leurs contenants : les tables du colisage ;
 * - le compte à produire (`produced`) : la somme des quantités dues de la liste
 *   à coliser, par article — c'est ainsi que le fournil le calcule
 *   (`countOf`, à la clôture comme au retirage) ;
 * - le disponible : la réserve, reçu − rendu − au bac ;
 * - l'heure de clôture : le premier tirage reçu, qui porte l'instant de la
 *   clôture (§17.1 : « déjà dans la liste à coliser ») ;
 * - la destination et la retenue au contrôle : posées par le handler, qui les
 *   demande au fournil par son canal.
 *
 * ⚠️ Une journée dont la liste n'est pas encore arrivée se lit « plan non
 * arrêté » (`closedAt: null`) : vrai du point de vue du colisage, qui n'a
 * encore rien à ranger.
 */
export interface BoardSources {
  readonly date: string;
  readonly day: PackingBoardDay;
  /** L'instant du serveur — seulement pour « aujourd'hui » / « demain ». */
  readonly now: Date;
  readonly destinationOf: (orderId: string) => string;
  readonly authorName: (reference: string | null) => string | null;
  readonly heldOrders: ReadonlySet<string>;
}

/** Assemble le poste — mêmes ordres que l'ancien : bacs par référence, articles par nom. */
export function packingBoardOf(sources: BoardSources): ProductionPackingView {
  const relativeDay = relativeDayOf(sources.date, sources.now);
  const { orders } = sources.day;
  const closedAt = firstDrawnAt(sources.day);
  if (closedAt === null) {
    return {
      date: sources.date,
      closedAt: null,
      sheets: [],
      resources: [],
      orderCount: 0,
      todoCount: 0,
      readyCount: 0,
      relativeDay,
    };
  }
  const awaiting = awaitingOf(sources.day);
  const readyCount = orders.filter((order) => order.packed !== null).length;
  return {
    date: sources.date,
    closedAt: closedAt.toISOString(),
    sheets: orders
      .map((order) => sheetOf(order, { ...sources, awaiting }))
      .sort((left, right) => left.reference.localeCompare(right.reference)),
    resources: resourcesOf(sources.day, awaiting),
    orderCount: orders.length,
    todoCount: orders.length - readyCount,
    readyCount,
    relativeDay,
  };
}

function firstDrawnAt(day: PackingBoardDay): Date | null {
  return day.orders.reduce<Date | null>(
    (first, order) => (first === null || order.drawnAt < first ? order.drawnAt : first),
    null,
  );
}

/**
 * Le disponible ne couvre pas la quantité — `shortfall`, la règle même de la
 * garde (`PackingStock.take`) : la ligne que l'écran grise est celle que le
 * serveur refuse. Le libre n'est pas borné ici : une réserve en dette manque
 * d'autant. Rien à poser n'attend rien.
 */
function awaitingOf(day: PackingBoardDay): Awaiting {
  const free = new Map(
    day.stocks.map((stock) => [stock.sku, stock.received - stock.returned - stock.packed] as const),
  );
  return (sku, quantity) => shortfall(free.get(sku) ?? 0, quantity) > 0;
}

/**
 * **La balance**, article par article. `allocated` = les pièces POSÉES, lignes
 * ouvertes comprises ; `remaining` = compte − posé, et baisse dès le dépôt.
 * L'attente compare le libre au seul reste à poser des lignes ouvertes : le
 * libre a déjà retiré ce qui est dans un sac, le recompter dans la demande
 * fabriquait un manque (bug du 2026-10-05). `remaining` peut être négatif :
 * les bacs demandent plus que le compte — c'est ce qu'il faut voir.
 */
function resourcesOf(day: PackingBoardDay, awaiting: Awaiting): readonly PackingResource[] {
  const produced = new Map<string, number>();
  const allocated = new Map<string, number>();
  // Ce que les bacs OUVERTS attendent encore.
  const pending = new Map<string, number>();
  const names = new Map<string, string>();
  for (const order of day.orders) {
    const allocatedOf = allocationOf(order);
    for (const line of order.lines) {
      const placed = allocatedOf(line);
      names.set(line.sku, names.get(line.sku) ?? line.productName);
      addTo(produced, line.sku, line.quantity);
      addTo(allocated, line.sku, placed);
      if (line.packed === null) {
        addTo(pending, line.sku, leftToPlace(line.quantity, placed));
      }
    }
  }
  return [...names.entries()]
    .map(([sku, productName]) => {
      const count = produced.get(sku) ?? 0;
      const taken = allocated.get(sku) ?? 0;
      const remaining = count - taken;
      const awaitingProduction = awaiting(sku, pending.get(sku) ?? 0);
      return {
        sku,
        productName,
        produced: count,
        allocated: taken,
        remaining,
        awaitingProduction,
        exhausted: remaining === 0 && !awaitingProduction,
      };
    })
    .sort(byNameThenSku);
}

function addTo(totals: Map<string, number>, sku: string, quantity: number): void {
  totals.set(sku, (totals.get(sku) ?? 0) + quantity);
}
