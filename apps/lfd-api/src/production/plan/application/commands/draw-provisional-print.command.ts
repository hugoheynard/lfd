import type { ProvisionalChoice } from "../../domain/entities/provisional-print.js";

/**
 * **Tirer une impression provisoire du dossier** (
 * `documentation/fournil/dossier-prod-du-jour.md`) — avant
 * l'arrêt, des commandes en direct. Rend l'identifiant de l'impression ; le
 * PDF se lit ensuite par `GetProvisionalPrintPdfQuery`.
 */
export class DrawProvisionalPrintCommand {
  constructor(
    readonly serviceDay: string,
    readonly choice: ProvisionalChoice,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un double clic ne tire pas deux numéros. */
    readonly intentKey: string,
  ) {}
}
