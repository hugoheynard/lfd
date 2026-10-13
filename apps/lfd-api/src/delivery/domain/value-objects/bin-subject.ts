/**
 * **À qui appartient un bac** (plan du transfert interne, Q-T4 révisée par
 * Hugo le 2026-10-13, lot T3) — à une COMMANDE livrée, comme depuis le lot 4,
 * ou à un TRANSFERT interne : les commandes d'un site servi par transfert
 * partent en sacs, et les sacs dans autant de bacs que nécessaire, qui
 * appartiennent au transfert.
 *
 * Discriminé comme l'arrêt (`StopSubject`) : un bac a exactement un sujet, la
 * base le tient (`delivery_bin_subject_check`).
 */
export type BinSubject =
  | { readonly kind: "order"; readonly orderId: string }
  | { readonly kind: "transfer"; readonly transferId: string };

/** La commande d'un bac de commande ; `null` pour un bac de transfert. */
export function orderOfBin(subject: BinSubject): string | null {
  return subject.kind === "order" ? subject.orderId : null;
}

/** Le transfert d'un bac de transfert ; `null` pour un bac de commande. */
export function transferOfBin(subject: BinSubject): string | null {
  return subject.kind === "transfer" ? subject.transferId : null;
}
