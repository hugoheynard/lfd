import type { AddressPointKind } from "@lfd/contracts";

/**
 * **Le verrou des décisions sur une suggestion** (adresse, sorte de point).
 *
 * « Appliquer » et « Ignorer » vérifient la suggestion vue, puis inscrivent
 * leur décision. Sans verrou, deux gestes simultanés sur la même suggestion
 * la voyaient chacun encore proposée et écrivaient chacun : deux décisions,
 * deux corrections demandées au commerce. Le geste compte donc les décisions
 * déjà prises avant sa vérification, puis, dans son unité de travail, prend
 * ce verrou et recompte : un compte qui a bougé est une décision d'un
 * collègue, et le geste est refusé.
 *
 * Séparé de `AddressSuggestionDecisionRepository` (ISP) : l'écriture n'en a
 * pas besoin.
 */
export abstract class AddressSuggestionDecisionLock {
  /** Le nombre de décisions déjà prises sur (adresse, sorte), lu sans verrou. */
  abstract decisionsSoFar(addressId: string, kind: AddressPointKind): Promise<number>;

  /**
   * Tient (adresse, sorte) jusqu'à la fin de l'unité de travail de
   * l'appelant, PUIS relit le nombre de décisions : ce qu'un geste concurrent
   * a validé pendant l'attente y est compté. Hors d'une unité de travail,
   * refus technique.
   */
  abstract holdAndCount(addressId: string, kind: AddressPointKind): Promise<number>;
}
