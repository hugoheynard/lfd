/**
 * Remplacer, dans un gabarit, la ligne de l'ancienne référence `fromSku` par
 * `toSku`, née d'un détachement de celle-ci (`plan-report-apres-detachement.md`,
 * § 2.2). Le motif est reçu comme les autres reports ; un gabarit n'a pas de
 * journal, il n'est donc écrit nulle part.
 */
export class CarryOverPriceTemplateLineCommand {
  constructor(
    readonly templateId: string,
    readonly fromSku: string,
    readonly toSku: string,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
