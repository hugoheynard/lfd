/**
 * Relire la **pièce déposée** d'un mandat précis — le papier signé, scanné.
 *
 * 🔴 Vise le MANDAT depuis le 2026-09-14 (plan mandat client §7 #6). Elle visait
 * la société, donc le mandat courant : en rotation bancaire, `findCurrent` rend
 * l'actif, et l'écran staff montrait la pièce de l'ANCIEN mandat au moment
 * d'activer le NOUVEAU. La société reste portée : c'est le mur tenant.
 */
export class GetMandateProofQuery {
  constructor(
    readonly companyId: string,
    readonly mandateId: string,
  ) {}
}
