import {
  DeliveryRoundNotReadyError,
  EmptyDeliveryRoundError,
} from "../errors/delivery-loading-errors.js";
import {
  DoorstepRoundNotDepartedError,
  RoundNotDepartedForReturnError,
  RoundStopsWithoutOutcomeError,
} from "../errors/delivery-doorstep-errors.js";
import { SharedBinToRedoError } from "../errors/delivery-bin-declaration-errors.js";
import type { GesturePosition } from "../value-objects/gesture-position.js";
import { sharedBinsToRedo, type StopReadiness, unreadyStops } from "./departure-readiness.js";
import { DeliveryRoundBase } from "./delivery-round-base.js";

/**
 * **Les gestes de la route** d'une tournée — partir (I6, Q14), clore un
 * arrêt (l'exception écrite à I6), rentrer (I8, I9). Sortis de
 * `DeliveryRound` pour la taille du fichier, pas pour l'invariant : c'est
 * toujours l'agrégat qui refuse, sur son propre état.
 */
export abstract class DeliveryRoundOnTheRoad extends DeliveryRoundBase {
  /**
   * **Partir** (L4-C4, Q14) : la tournée quitte le dépôt, et plus rien ne s'y
   * compose (I6). Refusé tant qu'un arrêt vivant n'est pas chargé — un arrêt
   * sans bac (« non étiqueté », L4-C17) comme un arrêt dont un bac manque. On
   * ne part pas avec un bac non chargé : on retire d'abord l'arrêt, et le
   * geste se voit.
   *
   * `readiness` dit l'état de chargement de chaque arrêt ; un arrêt vivant
   * qu'il ne cite pas est tenu pour non étiqueté — jamais pour chargé.
   *
   * @throws {DeliveryRoundDepartedError} déjà partie.
   * @throws {EmptyDeliveryRoundError} aucun arrêt vivant : une tournée vide ne part pas.
   * @throws {DeliveryRoundNotReadyError} un arrêt n'est pas chargé ; le refus
   *   liste les références.
   * @throws {SharedBinToRedoError} un bac partagé n'est plus entre deux arrêts
   *   consécutifs (lot 4 bis, v2-4).
   */
  depart(at: Date, readiness: readonly StopReadiness[]): void {
    this.ensureAtDepot();
    if (this.open.length === 0) {
      throw new EmptyDeliveryRoundError(this.state.vehicleName);
    }
    const { unlabelled, partial } = unreadyStops(this.open, readiness);
    if (unlabelled.length > 0 || partial.length > 0) {
      throw new DeliveryRoundNotReadyError(this.state.vehicleName, unlabelled, partial);
    }
    const toRedo = sharedBinsToRedo(this.open, readiness);
    if (toRedo.length > 0) {
      throw new SharedBinToRedoError(this.state.vehicleName, toRedo);
    }
    this.currentDepartedAt = at;
    this.touch(at);
  }

  /**
   * **Clore un arrêt** (L6-C11, `a-la-porte.md`, AP-D2) — l'exception
   * écrite à I6 : permis APRÈS le départ seulement. L'arrêt garde la position
   * qu'il avait, les arrêts vivants restants se resserrent en 1..n (I2) ; la
   * numérotation du livreur, figée au départ, ne bouge pas.
   *
   * `position` : celle du téléphone au geste (YA-D4), ou `null` — refus du
   * navigateur, pas de signal, ou clôture décidée au bureau. Jamais exigée.
   *
   * @throws {DoorstepRoundNotDepartedError} la tournée est au dépôt.
   * @throws {DeliveryRoundReturnedError} elle est déjà rentrée (I8).
   * @throws {DeliveryStopNotFoundError} @throws {DeliveryStopClosedError}
   */
  closeStop(stopId: string, at: Date, position: GesturePosition | null = null): void {
    if (this.currentDepartedAt === null) {
      throw new DoorstepRoundNotDepartedError();
    }
    this.ensureOnTheRoad();
    const { index, stop } = this.findOpen(stopId);
    this.open = this.open.filter((_, position) => position !== index);
    this.closed = [
      ...this.closed,
      {
        ...stop,
        position: index + 1,
        closedAt: at,
        // Sans relevé, rien à écrire : les colonnes d'un arrêt ouvert sont nulles.
        ...(position === null ? {} : { closedPosition: position }),
      },
    ];
    this.touch(at);
  }

  /**
   * **« Tournée terminée »** (`parcours-du-livreur.md`, PL2, I8) : les bacs
   * vides sont rentrés. Seulement partie ; une fois — un second appel rend
   * `false` et n'écrit rien, le premier retour fait foi. Les arrêts encore
   * ouverts le restent : rien ne se clôt tout seul. Appelé seul, c'est la
   * rentrée du STAFF ; le livreur passe par `finish` (I9).
   *
   * @throws {RoundNotDepartedForReturnError} la tournée n'est pas partie.
   */
  returnToDepot(at: Date, by: { readonly staffUserId: string; readonly name: string }): boolean {
    if (this.currentDepartedAt === null) {
      throw new RoundNotDepartedForReturnError(this.state.vehicleName);
    }
    if (this.currentReturn !== null) {
      return false;
    }
    this.currentReturn = { at, byStaffId: by.staffUserId, byName: by.name };
    this.touch(at);
    return true;
  }

  /**
   * **« Tournée terminée » par le LIVREUR** (`a-la-porte.md`, § 10 B4,
   * I9) : refusée tant qu'un arrêt est vivant. Tout sort — remis, déposé,
   * clos sans remise, rapporté par un commercial ou par réglage — passe par
   * `closeStop` ; un arrêt seulement signalé, ou qui attend la décision du
   * commercial, est encore vivant. Le refus nomme les arrêts par `labels`
   * (commande → « Client (CMD-1) »).
   *
   * Une tournée déjà rentrée rend `false` sans rien vérifier : le premier
   * retour fait foi, même celui du staff avec des arrêts ouverts. La rentrée
   * staff (`returnToDepot` seul) n'est pas soumise à cette règle : c'est la
   * sortie de secours d'un livreur bloqué, et ses arrêts sans sort passent
   * dans « Non remis » (AP-D7).
   *
   * @throws {RoundNotDepartedForReturnError} @throws {RoundStopsWithoutOutcomeError}
   */
  finish(
    at: Date,
    by: { readonly staffUserId: string; readonly name: string },
    labels: ReadonlyMap<string, string>,
  ): boolean {
    if (this.currentDepartedAt !== null && this.currentReturn === null && this.open.length > 0) {
      throw new RoundStopsWithoutOutcomeError(
        this.open.map((stop) => labels.get(stop.orderId) ?? stop.orderId),
      );
    }
    return this.returnToDepot(at, by);
  }
}
