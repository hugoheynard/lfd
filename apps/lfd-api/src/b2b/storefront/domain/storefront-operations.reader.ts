/** Un texte d'opération dans ses langues — le français toujours. */
export interface ShownOperationText {
  readonly fr: string;
  readonly en?: string;
  readonly it?: string;
}

/** La clientèle d'une lecture de la vitrine : un visiteur, ou une société reconnue. */
export type StorefrontAudience = "pro" | "public";

/**
 * **Une opération que la boutique MONTRE à cette clientèle, à cet instant** —
 * tenue, non masquée, dans sa fenêtre (de l'annonce au lendemain du dernier
 * jour de retrait), avec au moins un article dans sa sélection effective. Ses
 * dates sont les dates EFFECTIVES (la clôture de la réception comprise).
 */
export interface ShownOperation {
  readonly key: string;
  readonly name: ShownOperationText;
  readonly lede: ShownOperationText | null;
  readonly image: { readonly url: string; readonly alt: string } | null;
  readonly state: "announced" | "open" | "closed";
  /** L'ouverture de la commande — l'annonce quand le référentiel n'en fixe pas. */
  readonly orderFrom: Date;
  readonly orderUntil: Date;
  /** Jours `AAAA-MM-JJ`. */
  readonly pickupFrom: string;
  readonly pickupUntil: string;
}

/**
 * Port de **lecture des opérations pour la vitrine publique** (D11 de
 * `documentation/order/architecture-operations-datees.md`) : de quoi éteindre
 * une annonce dont l'opération n'est pas montrée, et remplir ce qu'elle hérite.
 *
 * Distinct du lecteur de la page (ISP) : la page se lit dans les tables de la
 * vitrine, les opérations dans le catalogue — par le port qu'il publie, jamais
 * par ses tables. La fenêtre et la clientèle se tranchent chez le catalogue
 * (`operationStateAt`, `reachesAudience`), pas ici : deux calculs de la même
 * fenêtre finiraient par ne plus dire la même chose que le rayon.
 */
export abstract class StorefrontOperationsReader {
  /** Les opérations montrées à `audience` à l'instant `now`, par clé. */
  abstract shownTo(
    audience: StorefrontAudience,
    now: Date,
  ): Promise<ReadonlyMap<string, ShownOperation>>;
}
