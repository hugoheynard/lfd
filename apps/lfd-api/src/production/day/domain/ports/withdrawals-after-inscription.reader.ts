import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/** Un retrait venu après l'inscription : la commande, et l'instant du registre. */
export interface WithdrawalAfterInscription {
  readonly orderId: string;
  readonly at: Date;
}

/**
 * **Les retraits après inscription d'une journée** — ce que les versions du
 * plan gardent à part (« annulée après l'arrêt — toujours produite »,
 * `documentation/fournil/les-versions-du-plan.md`). Port à part
 * de `OrderWithdrawalsReader` (ISP) : l'arrêt et le retirage ne lisent
 * que les identifiants, la version lit aussi l'instant. Lu sous le verrou.
 */
export abstract class WithdrawalsAfterInscriptionReader {
  abstract afterInscriptionOn(day: ServiceDay): Promise<readonly WithdrawalAfterInscription[]>;
}
