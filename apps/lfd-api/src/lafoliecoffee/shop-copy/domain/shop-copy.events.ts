import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { ShopCopyChange } from "./shop-copy-entry.js";

export const SHOP_COPY_FACTS = {
  published: "shop_copy.published",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Il n'y a qu'un jeu de textes publiés : c'est son identifiant, en base comme au journal. */
export const SHOP_COPY_SUBJECT = "shop";

/**
 * **Les textes de la boutique ont été publiés** — UN fait par « Publier »,
 * dans la transaction de la publication (§3, §10).
 *
 * Il porte, pour chaque texte qui change à l'écran, la valeur servie AVANT et
 * APRÈS : c'est la seule trace de ce que la boutique disait la veille, et de
 * quoi l'y remettre à la main.
 *
 * ⚠️ Son préfixe `shop_copy.` est rangé côté serveur
 * (`growth/domain/activity-module.ts`) ; sa phrase au back-office vit dans
 * `shared/journal/phrases/storefront-phrases.ts`.
 */
export class ShopCopyPublishedEvent implements JournaledEvent {
  constructor(
    readonly version: number,
    readonly changes: readonly ShopCopyChange[],
  ) {}

  journalFact(): JournalFact {
    return {
      type: SHOP_COPY_FACTS.published,
      subjectType: "shop_copy",
      subjectId: SHOP_COPY_SUBJECT,
      payload: {
        subjectLabel: "Textes de la boutique",
        version: this.version,
        changes: this.changes.map((change) => ({
          key: change.key,
          locale: change.locale,
          before: change.before,
          after: change.after,
        })),
      },
    };
  }
}
