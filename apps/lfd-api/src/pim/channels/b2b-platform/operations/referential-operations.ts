/** Un texte d'annonce dans ses langues — le français toujours. */
export interface ReferentialOperationText {
  readonly fr: string;
  readonly en?: string;
  readonly it?: string;
}

/**
 * **Une opération telle que le référentiel la tient**, archivée comprise —
 * sans rien de ce que l'envoi en retirait (les articles non publiés y sont).
 */
export interface ReferentialOperation {
  readonly key: string;
  readonly name: ReferentialOperationText;
  readonly lede: ReferentialOperationText | null;
  /** L'adresse seule : le texte alternatif est celui de la médiathèque. */
  readonly image: { readonly url: string } | null;
  readonly announceFrom: Date;
  readonly orderFrom: Date | null;
  readonly orderUntil: Date;
  /** Jours `AAAA-MM-JJ`. */
  readonly pickupFrom: string;
  readonly pickupUntil: string;
  readonly audience: "pro" | "public" | "both";
  /** La sélection, dans l'ordre du rayon. */
  readonly skus: readonly string[];
  readonly archivedAt: Date | null;
}

/**
 * **Les opérations du référentiel, pour leur migration au commerce** (lot 3
 * de `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * « La migration repart du PIM »).
 *
 * Publié dans le canal que le référentiel tient POUR la plateforme : c'est la
 * seule surface `b2b → pim` permise. En lecture seule, et pour un seul
 * lecteur — la migration, qui joue une fois. Il disparaîtra avec le code des
 * opérations du référentiel (lot 4).
 *
 * Pourquoi pas l'envoi : il écartait les opérations archivées et les articles
 * non publiés, et il datait du dernier push. La migration doit partir de ce
 * que le référentiel tient AUJOURD'HUI.
 */
export abstract class ReferentialOperations {
  /** Toutes, archivées comprises, l'annonce la plus récente d'abord. */
  abstract list(): Promise<readonly ReferentialOperation[]>;
}
