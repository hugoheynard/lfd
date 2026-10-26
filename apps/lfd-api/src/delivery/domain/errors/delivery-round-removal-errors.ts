import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de **« Supprimer la tournée »** (décision de Hugo, 2026-10-26) —
 * lus au dépôt par qui n'a pas le code sous les yeux : chacun nomme le cas
 * réel et le geste de sortie (`CLAUDE.md` §0).
 */

/** La tournée a été supprimée : elle ne reprend aucun geste. */
export class DeliveryRoundRemovedError extends BusinessError {
  constructor(vehicleName: string, serviceDay: string) {
    super(
      "delivery.round_removed",
      `La tournée « ${vehicleName} » du ${serviceDay} a été supprimée : ses arrêts sont retournés à répartir. Rechargez l'écran, puis composez sur une autre tournée.`,
    );
  }
}

/**
 * **On ne compose pas une journée passée** : ce qui a roulé ce jour-là est
 * de l'histoire, et la réécrire fausserait le dossier du jour. Tenu pour
 * ouvrir, appliquer une proposition, réordonner et supprimer une tournée ;
 * les gestes de rattrapage sur un arrêt (retirer, déplacer, rentrer) restent
 * ouverts.
 */
export class PastServiceDayCompositionError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "delivery.past_service_day",
      `On ne compose pas une journée passée : le ${serviceDay} est derrière nous, ses tournées ne s'ouvrent, ne se réordonnent ni ne se suppriment plus. Composez un jour à venir.`,
    );
  }
}

/**
 * **Supprimer une tournée dont des bacs sont chargés** : refusé, plutôt que
 * de les décharger en douce — un bac déjà dans le véhicule doit en ressortir
 * par un geste qui se voit.
 */
export class LoadedRoundRemovalError extends BusinessError {
  constructor(vehicleName: string, loadedStops: number) {
    super(
      "delivery.loaded_round_removal",
      `${loadedStops > 1 ? `${loadedStops} arrêts` : "Un arrêt"} de la tournée « ${vehicleName} » ${loadedStops > 1 ? "ont" : "a"} des bacs chargés : déchargez d'abord les bacs de cette tournée (Livraison → Chargement), puis supprimez-la.`,
    );
  }
}
