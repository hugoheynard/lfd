import type { CollectionBatchLine } from "../entities/collection-batch-line.js";
import type { MandateNow } from "../ports/mandate-recheck.reader.js";

/**
 * **La relecture du dépôt** : ce qui a changé depuis la constitution, en
 * phrases qui nomment — le verdict que `CollectionBatch.markDeposited` reçoit.
 *
 * Un mandat absent de `mandates` n'existe plus et compte comme révoqué ; un
 * mandat encore actif dont le compte n'a plus l'IBAN figé sur la ligne
 * refuse aussi : le fichier débiterait l'ancien compte. Sorti du handler le
 * 2026-10-23, sans changer une phrase.
 */
export function depositRecheckProblems(
  lines: readonly CollectionBatchLine[],
  mandates: ReadonlyMap<string, MandateNow>,
  cancelledOrderNumbers: readonly string[],
): readonly string[] {
  const mandateProblems = lines.flatMap((line) => {
    const current = mandates.get(line.mandateId);
    if (current?.active !== true) {
      return [`le mandat ${line.mandateReference} de ${line.debtorName} n'est plus actif`];
    }
    return current.iban === line.debtorIban.value
      ? []
      : [`le compte de ${line.debtorName} a changé depuis la constitution`];
  });
  return [
    ...mandateProblems,
    ...cancelledOrderNumbers.map((orderNumber) => `la commande ${orderNumber} a été annulée`),
  ];
}
