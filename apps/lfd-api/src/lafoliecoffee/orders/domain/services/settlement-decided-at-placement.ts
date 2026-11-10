import type { PaymentStatus } from "@lfd/contracts";

/**
 * 🔴 **Le règlement est-il DÉCIDÉ dès la passation ?** (Hugo, 2026-09-17) —
 * décidé par le MODE, pas par l'état du moment (corrigé le 2026-10-10).
 *
 * Seule une commande `not_required` — au compte, rien à encaisser — l'est :
 * ce qui parle d'elle part sur la passation. Une commande carte ne l'est à
 * aucun moment de sa vie : ce qui parle d'elle attend `order.paid`. Lu par
 * l'accusé au client et par l'avis au principal (2026-10-20), une seule règle.
 */
export function settlementDecidedAtPlacement(payment: PaymentStatus): boolean {
  return payment === "not_required";
}
