import type { CostFn } from "../ports/distance-matrix.js";
import type { RoutingSettings } from "../value-objects/routing-settings.js";
import type { ProposedTour } from "./proposal.js";
import { timeRoute } from "./route-timing.js";
import { compositionClockOf } from "./time-composition.js";

/** Ce qu'il faut pour rejouer un arrêt seul. */
export interface PlacementContext {
  readonly depotId: string;
  readonly cost: CostFn;
  readonly settings: RoutingSettings;
}

/**
 * **L'alerte rouge** (CA5, §9 — Hugo) : les commandes que leur PLACE rend
 * intenables. Une commande est en retard dans la composition enregistrée,
 * alors qu'une course faite pour elle seule, partie au plus tard dès minuit
 * du jour, tiendrait son échéance : ce n'est ni la route ni l'heure qui la
 * condamnent, c'est l'endroit où elle est — un geste du bureau, glisser ou
 * « Appliquer ».
 *
 * Une commande en retard même seule n'est PAS rouge : aucune place ne la
 * sauverait, et la déplacer ne servirait à rien. Le manque de flotte, lui,
 * est dit par « Proposer » (CA2, `windowMissed` de l'aperçu) avant qu'on
 * applique ; une fois appliquée, la composition est celle du bureau, et une
 * place qui la rend intenable s'y voit en rouge comme une autre.
 *
 * Ne défait rien : le calcul ne fait que nommer. Pure et déterministe ; une
 * course par commande en retard seulement.
 */
export function placementLateOrders(
  ctx: PlacementContext,
  tours: readonly ProposedTour[],
): ReadonlySet<string> {
  const clock = compositionClockOf(ctx.settings);
  const late = new Set<string>();
  for (const tour of tours) {
    tour.stops.forEach((stop, index) => {
      if (tour.timed.missed[index] !== true) {
        return;
      }
      const alone = timeRoute(ctx.depotId, [stop], ctx.cost, clock);
      if (alone.missed[0] !== true) {
        late.add(stop.id);
      }
    });
  }
  return late;
}
