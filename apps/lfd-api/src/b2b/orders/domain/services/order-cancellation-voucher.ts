/**
 * **Les phrases du bon à l'annulation** (doc
 * `documentation/commandes/annulation/fusion-du-bon.md`, lot C3b, C3b.7) —
 * pures. Lues par l'équipe sans le code sous les yeux : elles ne promettent
 * que ce qui est possible. Montants en centimes HT, l'unité du bon.
 */

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const SHORT_DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Paris",
});

/** « 12,00 € » */
export function voucherEuros(cents: number): string {
  return EUROS.format(cents / 100);
}

/** « 30/11 », à l'heure de Paris. */
export function voucherDay(at: Date): string {
  return SHORT_DAY.format(at);
}

/** Ce que l'annulation fera du bon — la phrase montrée dans la confirmation. */
export type CancellationVoucherOutcome =
  | {
      readonly outcome: "returned" | "lapsed";
      readonly voucherValueCents: number;
      readonly expiresAt: Date;
    }
  | {
      readonly outcome: "merged";
      readonly voucherValueCents: number;
      readonly remainderValueCents: number;
      readonly expiresAt: Date;
    };

export function cancellationVoucherSentenceOf(voucher: CancellationVoucherOutcome): string {
  const value = voucherEuros(voucher.voucherValueCents);
  const day = voucherDay(voucher.expiresAt);
  switch (voucher.outcome) {
    case "returned":
      return `Le bon de fidélité de ${value} utilisé sur cette commande sera rendu au client, valable jusqu'au ${day}.`;
    case "merged":
      return (
        `Le bon de ${value} avait laissé un reliquat de ${voucherEuros(voucher.remainderValueCents)}. ` +
        `Ce reliquat sera annulé et le bon de ${value} redeviendra disponible jusqu'au ${day} : ` +
        "le client retrouve le bon d'avant la commande."
      );
    case "lapsed":
      return `Le bon de fidélité de ${value} est arrivé à échéance le ${day} : il ne sera pas rendu.`;
  }
}

/** Cas 5 : le reste du bon a servi sur une autre commande, vivante. */
export function remainderEngagedRefusalOf(
  remainderValueCents: number,
  orderNumber: string,
  otherCancellable: boolean,
): string {
  const head = `Le reste de ${voucherEuros(remainderValueCents)} du bon utilisé ici a servi sur la commande ${orderNumber}`;
  return otherCancellable
    ? `${head} : annulez-la d'abord, puis celle-ci.`
    : `${head}, qui ne peut plus être annulée : l'annulation de cette commande n'est plus possible. Voyez avec la direction.`;
}

/** Cas 6 : le reste du bon a été annulé par l'équipe. */
export function remainderCancelledRefusalOf(remainderValueCents: number): string {
  return (
    `Le reste de ce bon (${voucherEuros(remainderValueCents)}) a été annulé par l'équipe : ` +
    "l'annulation de la commande n'est plus possible. Voyez avec la direction."
  );
}
