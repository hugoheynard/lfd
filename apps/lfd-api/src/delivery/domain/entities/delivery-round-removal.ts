import { LoadedRoundRemovalError } from "../errors/delivery-round-removal-errors.js";
import { ensureServiceDayNotPast } from "../services/composable-day.js";
import { DeliveryRoundOnTheRoad } from "./delivery-round-on-the-road.js";
import type { DetachedStop } from "./delivery-round-state.js";

/**
 * **Supprimer la tournée** (décision de Hugo, 2026-10-26) — une tournée créée
 * par erreur. Sorti de `DeliveryRound` pour la taille du fichier, pas pour
 * l'invariant : c'est toujours l'agrégat qui refuse, sur son propre état.
 */
export abstract class DeliveryRoundRemoval extends DeliveryRoundOnTheRoad {
  /**
   * Retire TOUS ses arrêts vivants — chacun garde la position qu'il avait, et
   * sa commande (ou son transfert) redevient à répartir — puis marque la
   * tournée supprimée. Jamais de suppression physique : la ligne reste.
   *
   * Refusé au-delà du dépôt (I6, partie ou rentrée), sur une journée passée
   * (`today` : le jour de Paris au moment du geste), et dès qu'un arrêt a un
   * bac chargé (`loadedStopIds`) : on décharge d'abord, par un geste qui se
   * voit, plutôt que de laisser un bac dans un véhicule sans tournée.
   *
   * Rend les arrêts retirés, dans l'ordre de passage.
   * @throws {DeliveryRoundRemovedError} @throws {DeliveryRoundDepartedError}
   * @throws {PastServiceDayCompositionError} @throws {LoadedRoundRemovalError}
   */
  removeRound(
    at: Date,
    today: string,
    loadedStopIds: ReadonlySet<string>,
  ): readonly DetachedStop[] {
    this.ensureAtDepot();
    ensureServiceDayNotPast(this.state.serviceDay, today);
    const loaded = this.open.filter((stop) => loadedStopIds.has(stop.id)).length;
    if (loaded > 0) {
      throw new LoadedRoundRemovalError(this.state.vehicleName, loaded);
    }
    const stops = [...this.open];
    this.removed.push(
      ...stops.map((stop, index) => ({
        ...stop,
        position: index + 1,
        closedAt: null,
        removedAt: at,
      })),
    );
    this.open = [];
    this.currentRemovedAt = at;
    this.recompose(at);
    return stops;
  }
}
