import type { PriceTemplateKind } from "@lfd/contracts";

import type { PriceTemplateState } from "../../domain/entities/price-template.js";

/**
 * Un gabarit tel qu'il est rangé : son état de domaine, **plus les instants que
 * le domaine ne porte pas**.
 *
 * `createdAt` et `updatedAt` sont des colonnes **système** (`CLAUDE.md` §1 les
 * nomme ainsi, hors-domaine). L'agrégat n'a aucune raison de les connaître ; un
 * écran qui trie par « touché en dernier », si. Les faire voyager à part plutôt
 * que de les pousser dans l'état garde la frontière lisible.
 */
export interface StoredPriceTemplate {
  readonly state: PriceTemplateState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * **Port de lecture des gabarits**, pour l'écran qui les liste.
 *
 * Distinct de `PriceTemplateRepository`, qui charge **un agrégat** pour le
 * muter : ce port-ci ne rend rien qui puisse être sauvegardé, et c'est la
 * séparation lecture/écriture que le dépôt tient partout.
 */
export abstract class PriceTemplatesReader {
  /** Les gabarits vivants de cette nature, du plus récemment touché au plus ancien. */
  abstract list(kind: PriceTemplateKind): Promise<readonly StoredPriceTemplate[]>;

  /** Un gabarit par son identifiant, **archivé compris** : l'écran le montre. */
  abstract byId(id: string): Promise<StoredPriceTemplate | null>;
}
