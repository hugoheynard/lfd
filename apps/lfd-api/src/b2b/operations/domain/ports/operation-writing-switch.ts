/**
 * **L'écriture des opérations au commerce est-elle ouverte ici ?**
 *
 * Un port plutôt que la configuration lue dans chaque cas d'usage : les sept
 * gestes posent la même question, et un double de test y répond sans monter
 * toute la configuration. Fermé par défaut (`OPERATIONS_AT_COMMERCE`) : la
 * bascule l'ouvre (lot 3 du plan), quand le push ne porte plus d'opérations.
 */
export abstract class OperationWritingSwitch {
  abstract isOpen(): boolean;
}
