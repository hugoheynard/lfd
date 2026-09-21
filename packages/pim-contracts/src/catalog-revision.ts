/**
 * **Les points d'ancrage de publication du catalogue**, tels qu'un écran les
 * lit.
 *
 * Une ancre est une photographie nommée : ce que le catalogue était à un
 * instant, en entier. Le diff entre deux ancres répond à la seule question qui
 * compte devant un client — « qu'est-ce qui a changé depuis la dernière fois ».
 */

/**
 * **Un champ qui diffère entre deux états.**
 *
 * ⚠️ Il vivait dans `shopify.ts`, et ce fichier l'importait de là avec cette
 * raison : « réutilisé depuis la réconciliation Shopify plutôt que redéclaré —
 * deux déclarations du même ensemble finiraient par diverger ». La raison était
 * juste, la DIRECTION ne l'était pas : la réconciliation d'un canal est partie
 * avec ce canal, les révisions restent, et un type que le socle lit ne peut pas
 * vivre chez un consommateur (déplacé le 2026-09-21,
 * [`plan-un-seul-canal-deux-prix.md`](../../../documentation/pim/plan-un-seul-canal-deux-prix.md)
 * § B.2).
 *
 * Rien dedans n'est propre à un canal : trois chaînes, un avant, un après.
 */
export interface FieldDiffView {
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

/** Une ancre, en une ligne de liste. */
export interface CatalogRevisionSummaryView {
  readonly id: string;
  /**
   * La référence LISIBLE — `R-7WT4NA`. Ce qu'on cite, ce qu'on colle dans un
   * lien, ce qu'on dit à voix haute. Même famille que `P-` pour un produit et
   * `C-` pour une société, même alphabet sans caractères ambigus.
   *
   * Elle a remplacé un numéro monotone. « Le suivant » se calcule en lisant le
   * dernier — une course, dont deux publications simultanées faisaient échouer
   * l'une pour une raison étrangère au catalogue. Et un rang n'est pas une
   * identité : il change si l'ordre change.
   */
  readonly reference: string;
  /** `null` = personne ne l'a nommée. */
  readonly label: string | null;
  /**
   * Le POURQUOI, en clair — `null` = personne n'en a écrit.
   *
   * À part du nom parce que ce sont deux lectures : le nom se lit dans une
   * liste à côté de quinze autres, la note se lit quand on ouvre — devant un
   * client qui conteste un prix, six mois plus tard.
   */
  readonly note: string | null;
  readonly hash: string;
  readonly takenAt: string;
  /**
   * L'id de la fiche staff de l'auteur, ou une valeur qui ne désigne personne —
   * un marqueur (`system`, `seed-pim`…) ou un `sub` que la conversion n'a
   * rattaché à aucune fiche. L'écran affiche `takenByName` et ne lit ce champ
   * que quand le nom manque.
   */
  readonly takenBy: string;
  /**
   * « Prénom Nom » de la personne qui l'a posée, résolu au serveur. `null` =
   * l'auteur ne désigne aucune fiche (marqueur, `sub` jamais lié) : l'écran
   * affiche alors `takenBy` tel quel.
   */
  readonly takenByName: string | null;
  /** Combien d'articles elle fige. */
  readonly articles: number;
}

/**
 * Une ancre **dans une liste** — le résumé, plus ce qui la sépare de la
 * précédente.
 *
 * 🔴 Un type à part et non un champ optionnel sur le résumé, pour que `null`
 * n'ait qu'un seul sens. Partout ailleurs — l'état du catalogue, les bornes
 * d'un diff — on rend un résumé sans écart, parce qu'aucun écart n'y est
 * calculé ; y mettre `null` ferait dire « rien avant elle » d'une ancre qui a
 * une devancière.
 */
export interface CatalogRevisionRowView extends CatalogRevisionSummaryView {
  /**
   * **Combien d'articles la séparent de l'ancre précédente** — entrés, retirés
   * et modifiés confondus.
   *
   * `null` sur la plus ancienne du dépôt : il n'y a rien avant elle, et un `0`
   * dirait « rien n'a changé » alors que tout était nouveau.
   *
   * Un seul nombre et non trois : la liste répond à « laquelle a bougé », pas à
   * « comment ». Le détail a son écran. Et il ne se déduit PAS d'`articles` —
   * deux ancres de 97 articles peuvent différer d'une ligne ou de quarante.
   */
  readonly changes: number | null;
}

/**
 * Un champ qui a bougé, **et qui l'a fait bouger**.
 *
 * L'auteur ne vient pas de la révision — elle sait seulement qui l'a POSÉE —
 * mais du journal, fait par fait. `by` à `null` distingue deux choses qu'on ne
 * doit pas confondre : `attributed: false` veut dire « personne ne sait », et
 * `attributed: true` avec `by: null` veut dire « le système », ce qui est une
 * réponse.
 */
export interface AttributedFieldDiffView extends FieldDiffView {
  /** `false` = aucun fait du journal ne revendique ce champ. */
  readonly attributed: boolean;
  /**
   * Un fait GLOBAL de l'intervalle qui a pu altérer ce champ — un taux de TVA
   * révisé, une famille reclassée. `null` = aucun.
   *
   * Ce n'est pas un auteur, et c'est toute la nuance : le fait a PU causer la
   * ligne, il ne la revendique pas. Le présenter comme une attribution ferait
   * porter à quelqu'un un changement qu'il n'a peut-être pas provoqué.
   */
  readonly cause: string | null;
  /** Le nom au moment de l'acte. `null` = le système, ou non attribué. */
  readonly by: string | null;
  /** Quand, en ISO. `null` = non attribué. */
  readonly at: string | null;
}

/** Un article modifié, champ par champ. */
export interface CatalogRevisionItemDiffView {
  readonly sku: string;
  readonly fields: readonly AttributedFieldDiffView[];
}

/**
 * Ce qui a changé entre deux ancres.
 *
 * La comparaison suit l'ordre DEMANDÉ : `from` puis `to`. Demander l'inverse
 * inverse « ajouté » et « retiré », et c'est voulu — on regarde parfois en
 * arrière.
 */
/**
 * Un fait de PARAMÉTRAGE tombé dans l'intervalle.
 *
 * Changer un taux de TVA est un seul fait qui altère cent articles. Aucun de
 * ces cent produits n'a de fait à lui : sans cette liste, l'écran répéterait
 * cent fois « auteur non défini par une action locale » pour une décision prise une fois.
 */
export interface CatalogRevisionCauseView {
  readonly type: string;
  /** Ce que le fait dit de lui-même : « Intermédiaire : 10 → 10.1 ». */
  readonly label: string;
  readonly by: string | null;
  readonly at: string;
  /** Les champs d'article que ce fait peut avoir altérés. */
  readonly explains: readonly string[];
  /**
   * **Sa portée au moment de l'acte** — « b2b : 1, eatIn : 1 ».
   *
   * C'est elle qui transforme une ligne d'historique en explication : sans
   * elle, l'écran dit qu'un taux a bougé sans dire ce que ça a touché, et c'est
   * exactement la question devant cinquante articles modifiés. Vide = portée
   * non enregistrée, ce qui n'est pas « ça n'a rien touché ».
   */
  readonly blast: Readonly<Record<string, number>>;
  /**
   * **Le libellé du moment de chaque contexte de vente que `blast` compte par
   * sa clé** — `{ brunch: "Brunch" }`, pour que l'écran dise « Brunch : 1 »
   * plutôt que « brunch : 1 ».
   *
   * Relu de la charge du fait (`contextLabels`, figée à l'écriture depuis le
   * lot D du plan des phrases du journal, 2026-09-19), et JAMAIS résolu à la
   * lecture : un contexte renommé depuis se lit sous l'ancien nom. Une clé
   * absente — une ligne d'avant, un contexte que le registre ne connaissait
   * plus — se dit par sa clé, jamais par un nom inventé ; une clé de `blast`
   * qui n'est pas un contexte (`articles`, `variants`) n'y figure jamais.
   *
   * Optionnel parce qu'il s'est ajouté à un contrat déjà servi (2026-09-19) :
   * un lecteur qui l'ignore lit ce qu'il lisait.
   */
  readonly contextLabels?: Readonly<Record<string, string>>;
}

export interface CatalogRevisionDiffView {
  readonly from: CatalogRevisionSummaryView;
  readonly to: CatalogRevisionSummaryView;
  /**
   * Ce qui a été réglé pendant l'intervalle et qui peut expliquer des lignes
   * sans auteur. Vide = rien de global n'a bougé.
   */
  readonly causes: readonly CatalogRevisionCauseView[];
  /**
   * Ce qui a bougé sans qu'aucun article ne change — le rapport prix pro / prix
   * public. Vide quand il n'a pas bougé.
   */
  readonly header: readonly FieldDiffView[];
  /** Les SKU entrés au catalogue. */
  readonly added: readonly string[];
  /** Les SKU qui n'y sont plus. */
  readonly removed: readonly string[];
  readonly changed: readonly CatalogRevisionItemDiffView[];
}

/**
 * **Ce qui a bougé depuis la dernière ancre publiée, sans en poser une.**
 *
 * Le même corps qu'un diff entre deux ancres, parce que c'est le même geste :
 * le côté « après » est simplement le catalogue tel qu'il est, construit en
 * mémoire par la MÊME mécanique que la pose. Un écran ne peut donc pas annoncer
 * un changement qu'une capture ignorerait, ni l'inverse.
 *
 * 🔴 Il a longtemps existé sous la forme de **trois nombres** — ajoutés,
 * retirés, changés (`CatalogOverviewView.sinceLastRevision`). On savait qu'il y
 * avait trois changements depuis `R-7WT4NA`, jamais lesquels : de quoi
 * s'inquiéter, jamais de quoi écrire une intention. Le compteur reste, pour les
 * écrans qui n'ont besoin que du chiffre.
 */
export interface CatalogPendingDiffView {
  /**
   * L'ancre de référence — la dernière **publiée**, pas la dernière posée.
   *
   * `null` quand rien n'est jamais parti : il n'y a alors rien à quoi se
   * comparer, et les listes vides ne veulent PAS dire « rien n'a changé ». Un
   * écran doit distinguer les deux.
   */
  readonly from: CatalogRevisionSummaryView | null;
  /**
   * L'instant de la lecture.
   *
   * Le côté « après » n'a pas de date de pose — il n'est pas figé. C'est cet
   * instant qui borne l'intervalle d'attribution, et le dire permet à un écran
   * de savoir de quand date ce qu'il montre.
   */
  readonly at: string;
  readonly causes: readonly CatalogRevisionCauseView[];
  readonly header: readonly FieldDiffView[];
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly CatalogRevisionItemDiffView[];
}

/**
 * Ce que la pose d'une ancre rend.
 *
 * `created: false` dit que le catalogue n'avait pas bougé : l'ancre rendue est
 * celle qui existait déjà. C'est un RÉSULTAT, pas un échec, et l'écran doit
 * savoir le distinguer — annoncer « posée » ferait croire à une version de plus.
 */
export interface CatalogRevisionTakenView {
  readonly id: string;
  readonly reference: string;
  readonly hash: string;
  /**
   * Comment l'ancre s'appelle **après** ce geste. `null` = toujours muette.
   *
   * Rendu parce que l'appelant ne peut pas le déduire : une ancre retrouvée
   * peut porter un nom qu'il n'a pas donné, et une ancre muette peut venir de
   * prendre le sien. Sans ce champ, l'écran devrait relire pour savoir ce qu'il
   * vient de faire.
   */
  readonly label: string | null;
  readonly created: boolean;
}
