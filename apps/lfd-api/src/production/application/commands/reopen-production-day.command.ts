/**
 * **Rouvrir une journée arrêtée** (Hugo, 2026-10-14) — défaire l'arrêt tant
 * que rien ne s'appuie encore sur le plan.
 *
 * L'auteur est obligatoire : la réouverture efface un instantané, et un
 * effacement sans nom serait exactement le recalcul silencieux que l'agrégat
 * refuse.
 *
 * ## L'accusé, et pourquoi ce n'est pas une entorse au CQRS
 *
 * Le handler rend `{ date, released, reopenedAt }` (décision D2 de l'audit du
 * réassort, 2026-11-02). Ce n'est pas un modèle de lecture : aucun état que
 * le client devrait relire, seulement l'accusé de CE geste — combien de
 * commandes il a rendues, à quel instant — que l'écran affiche une fois et
 * qu'aucune lecture ne saurait reconstituer (le journal garde le compte, pas
 * la réponse). Relire la journée montrerait une journée ouverte, pas ce que la
 * réouverture a défait. Même exception, écrite, pour l'arrêt et le retirage.
 */
export class ReopenProductionDayCommand {
  constructor(
    readonly serviceDay: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
