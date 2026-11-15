/**
 * **Arrêter une journée de fabrication.**
 *
 * Le jour arrive en `string` : le handler le passe par `ServiceDay`, qui refuse
 * ce qui n'est pas un jour ISO. Valider ici obligerait chaque appelant à le
 * faire ; le faire une fois, dans le domaine, rend l'invalide inexprimable.
 *
 * ## L'accusé, exception écrite au CQRS (décision D2, audit du 2026-11-02)
 *
 * Le handler rend `ProductionPlanClosure` — `{ date, absorbed, alreadyClosed,
 * closedAt }`. Une commande ne rend pas de modèle de lecture ; ceci n'en est
 * pas un : c'est l'accusé de CE geste — a-t-il arrêté, ou seulement
 * réannoncé ? combien de commandes a-t-il figées ? — qu'aucune relecture ne
 * distingue (une journée arrêtée à l'instant et une journée arrêtée hier se
 * relisent pareil). L'écran affiche l'accusé, puis relit la journée par sa
 * requête. Même exception pour le retirage (`RetakeProductionDayCommand`) et
 * la réouverture (`ReopenProductionDayCommand`) ; elle ne s'étend pas au-delà.
 */
export class CloseProductionDayCommand {
  constructor(
    readonly serviceDay: string,
    /**
     * Qui déclenche : un geste du staff, ou le tour automatique (plan
     * `arret-du-plan.md`, §3, S7, lot A2). Seul le journal le lit — il
     * écrit « automatiquement » plutôt qu'un nom. La clôture est la même.
     */
    readonly trigger: CloseTrigger = "manual",
    /**
     * La fiche staff qui arrête, résolue par le guard — le dossier dit « arrêté
     * par … » (2026-10-06). `null` : l'arrêt automatique, ou un semis.
     */
    readonly staffUserId: string | null = null,
  ) {}
}

/** `manual` : un geste du staff ; `automatic` : le tour de l'arrêt automatique. */
export type CloseTrigger = "manual" | "automatic";
