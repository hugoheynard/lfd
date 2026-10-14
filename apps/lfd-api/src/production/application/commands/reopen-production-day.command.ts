/**
 * **Rouvrir une journée arrêtée** (Hugo, 2026-10-14) — défaire l'arrêt tant
 * que rien ne s'appuie encore sur le plan.
 *
 * L'auteur est obligatoire : la réouverture efface un instantané, et un
 * effacement sans nom serait exactement le recalcul silencieux que l'agrégat
 * refuse.
 */
export class ReopenProductionDayCommand {
  constructor(
    readonly serviceDay: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
