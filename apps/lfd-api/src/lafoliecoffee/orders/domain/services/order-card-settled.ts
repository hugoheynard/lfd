/**
 * **Le règlement d'une commande tel qu'elle le voit**, dit au bloc
 * `card-payment` (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.3, §4.3) — son `payment_status`, rien de plus ; `closed` seulement pour
 * une annulée que rien n'a réglée ni refusée.
 *
 * Les quatre valeurs sont celles de `SubjectSettledState` du canal, réécrites
 * ici pour que le domaine ne dépende de rien.
 */
export type OrderCardSettled = "paid" | "pending" | "failed" | "closed";

/** Les règlements d'une commande qui disent l'argent reçu — remboursé compris. */
const RECEIVED: readonly string[] = ["paid", "refunded"];

/**
 * L'ordre compte, et il est CELUI de la reprise SQL de la migration
 * `20261109030000_le_schema_de_l_encaissement_par_carte` (§4.3) : encaissée
 * (ou remboursée) d'abord, puis annulée, puis refusée, sinon en attente.
 *
 * Une annulée non payée porte `failed` (C3.4) ET son intention a été fermée
 * chez le prestataire par `cancel` : sa ligne `payment` est `closed`. Si elle
 * se disait `failed` ici, le rattrapage horaire la verrait « en écart » à
 * chaque passage (`closed → failed` n'est pas une transition), et l'écart
 * grossirait avec chaque annulation (relevé au lot P0.c2, 2026-11-09). Une
 * annulée ENCAISSÉE après coup est l'exception connue du rattrapage : ligne
 * `paid`, sujet `closed` — juste, pas un écart.
 */
export function orderCardSettled(status: string, paymentStatus: string): OrderCardSettled {
  if (RECEIVED.includes(paymentStatus)) {
    return "paid";
  }
  if (status === "cancelled") {
    return "closed";
  }
  if (paymentStatus === "failed") {
    return "failed";
  }
  return "pending";
}
