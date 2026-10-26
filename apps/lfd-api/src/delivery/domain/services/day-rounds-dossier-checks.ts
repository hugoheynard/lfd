/**
 * **« À vérifier »** — les alertes que la feuille de route de Tour manager
 * disait en toutes lettres, reprises par le dossier des tournées quand
 * l'onglet est retiré (décision de Hugo du 2026-10-26). Une commande n'y
 * figure que si quelque chose est à vérifier ; une annulée n'y figure jamais.
 *
 * Chaque alerte est une règle de la liste {@link DOSSIER_CHECK_RULES} : une
 * alerte de plus est une règle de plus, pas une branche.
 */

/** Une ligne d'un départ incomplet décidé : ce qui ne part pas. */
export interface DossierShortfallLine {
  readonly productName: string;
  readonly quantity: number;
}

/** Ce que le dossier sait d'une commande à livrer, lu au tirage. */
export interface DossierOrderFacts {
  readonly orderId: string;
  /** La tournée qui la porte (« Camion 1 · passage 1 »), ou `null` : hors tournée. */
  readonly roundTitle: string | null;
  /** `null` : le commerce ne connaît pas (ou plus) la commande. */
  readonly order: {
    readonly reference: string;
    readonly customerLabel: string;
    readonly cancelled: boolean;
  } | null;
  /** `false` : aucune adresse livrée sur la commande. */
  readonly hasAddress: boolean;
  /** `false` : aucun contact convenu. */
  readonly hasContact: boolean;
  /** Reliée à une adresse vivante du carnet de SA société (le mur du commerce). */
  readonly linkedToAddressBook: boolean;
  /** Le départ incomplet décidé ; vide sans décision. */
  readonly shortfall: readonly DossierShortfallLine[];
}

/** Une commande à vérifier, et pourquoi — chaque raison est une phrase imprimée. */
export interface DossierCheck {
  readonly reference: string;
  readonly customerLabel: string;
  readonly roundTitle: string | null;
  readonly reasons: readonly string[];
}

/** Une règle : la phrase à imprimer, ou `null` quand rien n'est à signaler. */
export type DossierCheckRule = (facts: DossierOrderFacts) => string | null;

/**
 * Les règles, dans l'ordre d'impression. « Sans feuille d'atelier » n'y est
 * pas : c'est un fait du fournil, que la livraison ne lit par aucun canal
 * (2026-10-26, remonté avec la décision).
 */
export const DOSSIER_CHECK_RULES: readonly DossierCheckRule[] = [
  (facts) =>
    facts.order === null ? "Commande inconnue du commerce : aucune feuille à imprimer" : null,
  (facts) => (facts.order !== null && !facts.hasAddress ? "Aucune adresse sur la commande" : null),
  (facts) =>
    facts.order !== null && !facts.linkedToAddressBook
      ? "Adresse non reliée au carnet : ni point GPS, ni consignes, ni procédure"
      : null,
  (facts) => (facts.order !== null && !facts.hasContact ? "Aucun contact sur la commande" : null),
  (facts) =>
    facts.shortfall.length === 0
      ? null
      : `Départ incomplet, ne part pas : ${facts.shortfall
          .map((line) => `${String(line.quantity)} × ${line.productName}`)
          .join(", ")}`,
];

/**
 * Les commandes à vérifier, par référence. Une commande annulée ne part pas :
 * rien n'est à vérifier pour elle.
 */
export function dossierChecksOf(
  orders: readonly DossierOrderFacts[],
  rules: readonly DossierCheckRule[] = DOSSIER_CHECK_RULES,
): readonly DossierCheck[] {
  return orders
    .filter((facts) => facts.order?.cancelled !== true)
    .flatMap((facts) => {
      const reasons = rules.flatMap((rule) => {
        const reason = rule(facts);
        return reason === null ? [] : [reason];
      });
      return reasons.length === 0
        ? []
        : [
            {
              reference: facts.order?.reference ?? facts.orderId,
              customerLabel: facts.order?.customerLabel ?? "",
              roundTitle: facts.roundTitle,
              reasons,
            },
          ];
    })
    .sort((a, b) => a.reference.localeCompare(b.reference));
}
