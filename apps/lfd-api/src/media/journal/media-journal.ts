import type { JournalFactType } from "@lfd/contracts/journal-facts";

import { ScopedJournal } from "../../platform/journal/scoped-journal.js";

/**
 * **Le journal de la médiathèque** — ce que le fonds d'images déclare vouloir
 * tracer, sans savoir qui l'écrit.
 *
 * 🔴 Ces faits vivaient dans `PIM_EVENTS` jusqu'au 2026-09-23, et les trois
 * handlers de ce bloc injectaient `PimJournal`. C'était la dernière raison
 * vivante pour la médiathèque de franchir la frontière vers le référentiel :
 * les autres sont tombées avec son schéma. Un bloc indépendant qui tient sa
 * garantie d'écriture d'un bloc voisin n'est pas indépendant.
 *
 * La **mécanique** est commune ({@link ScopedJournal}) : le laissez-passer, la
 * transaction, le caractère bloquant. Le **vocabulaire** est ici, parce qu'un
 * catalogue de faits centralisé obligerait chaque bloc à demander la permission
 * d'avoir une histoire — et parce que le référentiel affiche des images sans
 * décider de leur vie.
 */

/**
 * Ce dont un fait de la médiathèque parle. **Un seul sujet**, et c'est le
 * fonds lui-même.
 *
 * 🔴 Son `subjectId` est son **URL**, jamais un identifiant de ligne : l'URL
 * est le SHA-256 du contenu, donc la seule identité qui survive à un
 * redépôt, à une fusion de doublons et à un changement de schéma. Un
 * identifiant d'actif aurait désigné une ligne — et les lignes, elles, ont
 * déjà été refondues une fois.
 */
export type MediaSubjectType = "media_asset";

/**
 * Les faits du fonds. **Trois**, et ils décrivent la vie d'une IMAGE — jamais
 * l'usage qu'un porteur en fait.
 *
 * C'est la même ligne de partage que partout dans ce bloc : rattacher une image
 * à une fiche est un fait du RÉFÉRENTIEL (`product.media_saved`), parce que
 * c'est la fiche qui change. Déposer, décrire, retirer sont des faits du fonds,
 * parce que c'est l'image qui change — et elle est partagée.
 */
export const MEDIA_EVENTS = {
  /** Une image entre dans la bibliothèque — aucun porteur n'est touché. */
  mediaDeposited: "media_asset.deposited",
  /** Son étiquette, ses mots-clés ou son point focal changent. */
  mediaDescribed: "media_asset.described",
  /** Elle quitte la bibliothèque, octets compris. */
  mediaDiscarded: "media_asset.discarded",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * Ce qu'un handler de la médiathèque fournit pour tracer un fait.
 *
 * ⚠️ **Pas de portée** (`blast`), et ce n'est pas un oubli. Le référentiel en
 * fige une parce que ses décisions ont un aval chiffrable — un taux touche tant
 * de familles. Une image déposée ne touche rien ; une image retirée ne PEUT
 * rien toucher, puisqu'on refuse de la retirer tant qu'un porteur l'affiche.
 * Le seul nombre qui aurait du sens ici est le compte d'emplois, et il est déjà
 * dans la charge du refus.
 */
export interface MediaJournalEntry {
  /** Un des {@link MEDIA_EVENTS} — donc un type du catalogue des faits. */
  readonly type: JournalFactType;
  readonly subjectType: MediaSubjectType;
  /** L'URL de l'image. Voir {@link MediaSubjectType}. */
  readonly subjectId: string;
  /**
   * Ce que le fait a changé — le « avant → après », en clair. Reste petit : un
   * journal n'est pas une copie de la base.
   */
  readonly payload: Record<string, unknown>;
}

/**
 * Port du journal de la médiathèque.
 *
 * **Bloquant**, comme celui du référentiel : la trace part dans la même
 * transaction que la décision qu'elle décrit. Une image déposée dont le dépôt
 * n'a pas été inscrit n'existe pas — c'est ce qui rend le journal du fonds
 * opposable, et ce qui permet au ramassage des orphelines de se fier à lui.
 */
export abstract class MediaJournal extends ScopedJournal<MediaJournalEntry> {}
