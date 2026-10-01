import type { StaffAuthorDirectory } from "../../staff/directory/domain/staff-author-directory.js";
import type { Clock } from "../../platform/time/clock.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import { DeliveryRoundReturnedEvent } from "../domain/events/delivery-doorstep.events.js";
import type { DeliveryRoundRepository } from "../domain/ports/delivery-round.repository.js";
import { deliveryAuthorOf } from "./delivery-author.js";

/** Les ports du retour — ceux des deux portes (livreur et admin). */
export interface ReturnDeps {
  readonly rounds: DeliveryRoundRepository;
  readonly directory: StaffAuthorDirectory;
  readonly clock: Clock;
}

/**
 * **Rentrer, puis écrire** — la suite commune aux deux portes de « Tournée
 * terminée » (`parcours-du-livreur.md`, PL2) : le livreur sur SA tournée, et
 * l'admin depuis Tournées. Elles partagent ceci et le domaine, pas leur
 * handler : chacune charge la tournée à sa façon — avec ou sans mur — dans SA
 * transaction (même partage que `departAndFreeze`, MT-D3 v2).
 *
 * L'auteur est FIGÉ au geste (nom de l'annuaire, `""` s'il n'en a pas). Rend
 * le fait à publier, ou `null` : déjà rentrée, rien ne s'écrit.
 */
export async function returnAndRecord(
  round: DeliveryRound,
  staffUserId: string,
  deps: ReturnDeps,
): Promise<DeliveryRoundReturnedEvent | null> {
  const author = await deliveryAuthorOf(deps.directory, staffUserId);
  if (!round.returnToDepot(deps.clock.now(), author)) {
    return null;
  }
  await deps.rounds.save(round);
  return new DeliveryRoundReturnedEvent(round);
}
