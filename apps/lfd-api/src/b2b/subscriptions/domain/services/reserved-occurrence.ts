/**
 * **Une échéance dont un article n'est plus réservé au client** — la règle de
 * la génération des occurrences, écrite AVANT la génération
 * (`documentation/catalogue/plan-articles-sur-mesure.md`, § 6, Q7 tranchée
 * par Hugo le 2026-10-30).
 *
 * ⚠️ La génération des occurrences en commandes n'existe pas au 2026-10-30
 * (`fromSubscriptionId` n'est écrit que par le semis). Cette fonction n'a donc
 * pas encore d'appelant de production : le jour où la génération sera bâtie,
 * elle passera `priceAll` avec le lecteur de la société, et ce verdict décide
 * quoi faire d'un refus de réservation.
 *
 * La règle : l'échéance n'est **pas** générée, et une alerte staff nommée part.
 * **Jamais** une commande amputée en silence d'une ligne — le client la
 * recevrait sans l'article qu'il attend, sans que personne le sache.
 */
export type OccurrenceVerdict =
  { readonly generate: true } | { readonly generate: false; readonly alert: string };

export interface OccurrenceUnderReservation {
  /** Le jour de l'échéance, `AAAA-MM-JJ`. */
  readonly date: string;
  readonly companyName: string;
  readonly lines: readonly { readonly sku: string; readonly name: string }[];
  /** Les SKU que le catalogue, lu pour cette société, dit réservés à un autre compte. */
  readonly reservedElsewhere: ReadonlySet<string>;
}

export function occurrenceVerdict(occurrence: OccurrenceUnderReservation): OccurrenceVerdict {
  const refused = occurrence.lines.filter((line) => occurrence.reservedElsewhere.has(line.sku));
  if (refused.length === 0) {
    return { generate: true };
  }
  const names = refused.map((line) => `${line.name} (${line.sku})`).join(", ");
  return {
    generate: false,
    alert: `Occurrence du ${occurrence.date} non générée : ${names} n'est plus réservé à ${occurrence.companyName}. Réservez-le à nouveau à ce compte, ou retirez la ligne de l'abonnement.`,
  };
}
