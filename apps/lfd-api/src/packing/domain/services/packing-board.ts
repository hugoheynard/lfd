import type { PackingResource, ProductionPackingView } from "@lfd/contracts";

import type { PackingBoardDay } from "../ports/packing-board.reader.js";
import { type Awaiting, byNameThenSku, sheetOf } from "./packing-board-sheet.js";
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
 * Le disponible ne couvre pas la quantité — la règle de la garde
 * (`PackingStock.take`) : la ligne que l'écran grise est celle que le serveur
 * refuse. Sans garde sur `quantity > 0`, comme l'ancien poste : un disponible
 * négatif reste « en attente ».
 */
function awaitingOf(day: PackingBoardDay): Awaiting {
  const free = new Map(
    day.stocks.map((stock) => [stock.sku, stock.received - stock.returned - stock.packed] as const),
  );
  return (sku, quantity) => (free.get(sku) ?? 0) < quantity;
}

/**
 * **La balance**, article par article. `remaining` peut être négatif : les
 * bacs demandent plus que le compte — c'est ce qu'il faut voir.
 */
function resourcesOf(day: PackingBoardDay, awaiting: Awaiting): readonly PackingResource[] {
  const produced = new Map<string, number>();
  const allocated = new Map<string, number>();
  // Ce que les bacs OUVERTS attendent encore.
  const pending = new Map<string, number>();
  const names = new Map<string, string>();
  for (const line of day.orders.flatMap((order) => order.lines)) {
    names.set(line.sku, names.get(line.sku) ?? line.productName);
    produced.set(line.sku, (produced.get(line.sku) ?? 0) + line.quantity);
    const bucket = line.packed === null ? pending : allocated;
    bucket.set(line.sku, (bucket.get(line.sku) ?? 0) + line.quantity);
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
