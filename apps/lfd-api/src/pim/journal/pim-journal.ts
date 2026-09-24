import type { JournalFactType } from "@lfd/contracts/journal-facts";
import { ScopedJournal } from "../../platform/journal/scoped-journal.js";

/**
 * Le **journal du référentiel** — ce que le PIM déclare vouloir tracer, sans
 * savoir qui l'écrit.
 *
 * Le journal d'activité existe déjà (`growth.activity_events` : append-only,
 * acteur figé au moment de l'acte, `traceId`, idempotence). Le PIM ne peut pas
 * l'appeler directement — la matrice des frontières lui interdit de voir `b2b`
 * — et surtout il ne devrait pas avoir à le connaître. Il déclare donc son
 * port, que la racine de composition branche sur le journal réel : le même
 * montage que `B2bCatalogDriver`, pour la même raison.
 *
 * ✅ **C'est fait le 2026-09-23.** Ce fichier disait « quand promouvoir le
 * journal en `platform/` : au troisième bloc émetteur ». La médiathèque est le
 * troisième, et elle importait `PimJournal` — un bloc indépendant tenait donc
 * sa garantie d'écriture d'un bloc voisin.
 *
 * 🔴 **Seule la MÉCANIQUE est montée** (`platform/journal/scoped-journal.ts`) :
 * le laissez-passer, `trace`, `untraced`. Ce qui reste ici est le
 * **vocabulaire du référentiel** — ses faits, ses sujets, sa portée —, et il
 * reste ici parce qu'un catalogue de faits centralisé obligerait chaque bloc à
 * demander la permission d'avoir une histoire.
 */

/** La chose dont l'événement parle — treize sujets, énumérés plutôt que comptés. */
// ⚠️ « treize » n'était plus vrai depuis le départ de `media_asset` (douze) ;
// il le redevient avec `operation`, le 2026-09-24 (compté ce jour-là).
export type PimSubjectType =
  | "vat_rate"
  | "product"
  | "product_category"
  | "point_of_sale"
  | "sales_context"
  | "accounting_rules"
  | "catalog_revision"
  | "ingredient"
  | "appellation"
  | "allergen_category"
  | "allergen_entry"
  | "order_time_limit"
  | "operation";

/*
 * 🔴 **`media_asset` a quitté cette liste le 2026-09-23.** La bibliothèque est
 * un bloc à part : elle nomme ses sujets et ses faits chez elle
 * (`media/journal/media-journal.ts`). Les garder ici faisait dire au
 * référentiel ce qu'une image devient, alors qu'il ne fait que l'afficher.
 */

/**
 * Les faits que le référentiel journalise. **Des décisions**, pas des appels
 * HTTP : `vat_rate.rate_changed` se relit dans six mois,
 * `PUT /vat-rates/x` non.
 *
 * ## Plus de trou : toute écriture du référentiel nomme son fait
 *
 * La liste a commencé par les seuls faits qui **changent ce qui est taxé ou
 * vendu**, et laissait volontairement de côté ce qui n'avait « pas d'aval » :
 * un renommage de famille, un emplacement créé, une fiche archivée. Quatorze
 * gestes écrivaient donc sans rien affirmer, sous une dérogation comptée par
 * `lint:journal-tracked`.
 *
 * Cette frontière ne tenait pas. Elle triait selon l'usage qu'on IMAGINAIT du
 * journal — comprendre un écart de facturation — alors que la question qu'on
 * lui pose vraiment est « qui a touché à ça, et quand ». Pour cette
 * question-là, un renommage compte autant qu'un changement de taux : c'est
 * souvent lui qu'on cherche, parce que c'est lui qui a fait disparaître une
 * ligne d'un écran sans que personne ne s'en souvienne. Et une lacune de
 * journal ne se rattrape pas : le jour où l'on constate qu'il manque un fait,
 * les mois passés sont perdus.
 *
 * Le tri n'a donc pas disparu, il a changé d'endroit : le flux enregistre tout
 * ce que le référentiel décide, et c'est la **lecture** qui choisit ce qu'elle
 * montre — l'historique d'une fiche descend au détail, la vue générale reste
 * sur les faits à aval.
 */
export const PIM_EVENTS = {
  /*
   * 🔴 **Les trois faits d'image sont partis le 2026-09-23** —
   * `media_asset.deposited`, `.described`, `.discarded`. Ils vivent dans
   * `media/journal/media-journal.ts`, avec le bloc qui les prononce. Le
   * référentiel affiche des images ; il ne décide pas de leur vie.
   */
  vatRateCreated: "vat_rate.created",
  /** Le taux a bougé — le seul changement de taux qui ait un aval. */
  vatRateRateChanged: "vat_rate.rate_changed",
  /** Renommage / description : tracé à part, parce que c'est sans conséquence. */
  vatRateRenamed: "vat_rate.renamed",
  vatRateDeleted: "vat_rate.deleted",
  productCategoryVatChanged: "product_category.vat_changed",
  /**
   * Une fiche DÉROGE au taux de sa famille — ou lui revient. Distinct du fait
   * précédent : l'un décide pour un rayon entier, l'autre pour une ligne, et
   * confondre les deux dans l'historique rendrait illisible la question qu'on
   * pose vraiment — « qui a décidé ça, et quand ».
   */
  productVatChanged: "product.vat_changed",
  /** Une fiche redéfinit où elle se vend — ou revient à sa famille. */
  productChannelsChanged: "product.channels_changed",
  /**
   * **Quelqu'un affirme que la fiche est juste.** Distinct de `published` :
   * l'un est une signature sur un contenu, l'autre une mise en vente. Un
   * historique qui les confondrait ne saurait plus répondre à « qui a validé ce
   * prix », seulement à « qui l'a mis en ligne » — et ce n'est pas la même
   * question ni, souvent, la même personne.
   */
  productDeclaredReady: "product.declared_ready",
  productPublished: "product.published",
  productUnpublished: "product.unpublished",
  /**
   * Les **sections de la fiche**, une par geste d'enregistrement.
   *
   * Elles rompent avec la règle énoncée plus haut — « on ne trace pas tout » —
   * et c'est délibéré. Cette règle servait un journal qu'on relit pour
   * comprendre un écart : y verser une description retouchée n'apprenait rien.
   * La demande a changé : savoir QUI a touché à une fiche, et à quoi, est un
   * besoin à part entière. Les deux natures cohabitent donc dans le même flux —
   * une seule table, une seule vérité sur qui a fait quoi — et c'est la LECTURE
   * qui les sépare : l'historique d'édition ne se lit que depuis la fiche
   * concernée, il ne remonte pas au flux général.
   */
  productIdentitySaved: "product.identity_saved",
  productPricingSaved: "product.pricing_saved",
  /**
   * **Les deux moitiés de la fiche réglementaire**, une par geste.
   *
   * Elles s'écrivaient ensemble sous `productDeclarationSaved` : enregistrer
   * l'une renvoyait donc l'autre, et en oublier un bout l'effaçait. Deux faits
   * plutôt qu'un parce que ce sont deux sujets — ce qu'un produit CONTIENT
   * engage la sécurité du mangeur, ce qu'il VAUT le renseigne — et parce qu'un
   * fait unique ne dirait pas laquelle des deux a bougé (plan
   * `plan-separer-allergenes-et-nutrition.md`, D4).
   *
   * Préfixés `product.` bien que leur sujet soit la DÉCLINAISON : les deux
   * gardes exhaustives (`content-facts.ts`, `attribution.ts`) ne voient que ce
   * préfixe, et un `variant.*` leur échapperait en silence (§6c).
   */
  productAllergensSaved: "product.allergens_saved",
  productNutritionSaved: "product.nutrition_saved",
  /**
   * ⚠️ **Retiré le 2026-09-22** — plus aucun code ne l'écrit, et le catalogue
   * des faits le refuse à l'écriture. Il reste nommé ici parce que les gardes
   * le citent encore : ses lignes doivent continuer à périmer une signature et
   * à attribuer leurs changements (§6c du plan).
   */
  productDeclarationSaved: "product.declaration_saved",
  productEditorialSaved: "product.editorial_saved",
  productMediaSaved: "product.media_saved",
  /**
   * **La famille** — l'arbre du catalogue.
   *
   * Cinq verbes distincts plutôt qu'un `category.updated` fourre-tout : ils ne
   * répondent pas à la même question, et ils n'ont pas les mêmes conséquences.
   * Archiver retire un rayon de la vente, déplacer change ce dont une fiche
   * hérite, renommer ne fait ni l'un ni l'autre — les confondre obligerait à
   * rouvrir chaque charge utile pour savoir laquelle des trois on lit.
   */
  /**
   * **Une ancre de publication est posée.** Le fait ne dit pas ce qu'elle
   * contient — la révision le porte, en entier et pour toujours. Il dit qui l'a
   * posée et quand, ce que la révision, elle, ne dirait pas d'elle-même.
   */
  catalogRevisionTaken: "catalog_revision.taken",
  /** Une ancre reçoit le nom qu'elle n'avait pas. Elle n'en change jamais. */
  catalogRevisionNamed: "catalog_revision.named",
  /**
   * **Une révision est partie vers un canal.** Distinct de sa pose : une ancre
   * peut exister sans que rien ne soit sorti, et c'est même l'état d'un push
   * qui a échoué.
   *
   * Le mode (`live` / `dry-run`) est dans le payload plutôt que dans deux faits
   * séparés : une simulation laisse elle aussi une ligne de publication en base,
   * et un journal qui la tairait laisserait des ancres sans explication.
   */
  catalogRevisionPushed: "catalog_revision.pushed",
  productCategoryCreated: "product_category.created",
  productCategoryRenamed: "product_category.renamed",
  /**
   * Change le parent — sa place dans l'arbre, et rien de ce qu'elle facture.
   *
   * ⚠️ Ce commentaire disait « donc l'héritage de TVA et de canaux en aval ».
   * C'est faux : une famille ne tient ni sa TVA ni ses canaux de son parent —
   * `effectiveVat` ne lit que la famille directe d'une fiche, et le lecteur du
   * catalogue ne lit que son `channelPreset` (vérifié le 2026-09-19).
   */
  productCategoryMoved: "product_category.moved",
  productCategoryArchived: "product_category.archived",
  /**
   * Un niveau entier renuméroté — le sujet est le **parent**, pas chaque
   * famille déplacée. Une ligne par fratrie réordonnée : c'est un seul geste,
   * et N traces pour N sœurs noieraient l'historique de chacune sous des
   * changements de rang que personne ne relit.
   */
  productCategoriesReordered: "product_category.reordered",
  /** Où un rayon se vend — d'où ses fiches héritent, sauf dérogation. */
  productCategoryChannelsChanged: "product_category.channels_changed",
  /** Les textes d'une famille — descriptions et référencement. */
  productCategoryEditorialSaved: "product_category.editorial_saved",
  /** Ses visuels : la liste entière, l'ordre compris. */
  productCategoryMediaSaved: "product_category.media_saved",
  /**
   * **La fiche** — sa naissance et sa sortie de la vente.
   *
   * `archived` / `restored` ne doublonnent pas `unpublished` / `published` :
   * dépublier retire de la vente une fiche qu'on continue de travailler,
   * archiver la retire du référentiel. C'est la différence entre « on ne le
   * vend plus en ce moment » et « on ne le fait plus » — et c'est exactement
   * ce qu'on vient demander au journal six mois plus tard.
   */
  productCreated: "product.created",
  /**
   * Une déclinaison de plus sous la même fiche. Nommée `variant.*` et non
   * `product.*` : le sujet du fait est le produit, mais ce qui a changé est une
   * déclinaison, et l'historique d'une fiche doit pouvoir se lire en distinguant
   * « on a modifié le produit » de « on lui a ajouté un article ».
   */
  variantAdded: "variant.added",
  /**
   * Elle suit désormais le défaut sur une section — ou reprend la sienne.
   *
   * La SECTION est dans la charge (`aspect`), pas dans le type : « aligné » est
   * le même fait qu'on parle d'étiquette ou de prix, et deux types jumeaux
   * obligeraient tout lecteur du journal à connaître la liste des sections
   * alignables pour ne rien manquer.
   */
  variantAligned: "variant.aligned",
  /**
   * Elle a changé de nom. Le fait est mince, et il compte quand même : le nom
   * d'un article part dans les envois vers les canaux, donc « pourquoi la
   * boutique affiche-t-elle autre chose qu'avant » se répond ici.
   *
   * La RÉFÉRENCE, elle, ne bouge jamais — il n'y a donc pas de `variant.recoded`
   * à côté, et il ne faut pas en ajouter un.
   */
  variantRenamed: "variant.renamed",
  productArchived: "product.archived",
  productRestored: "product.restored",
  /**
   * **La fiche change de famille** — `{ from, to }`, les deux familles avec
   * leur nom du moment (`{ id, name }`, lot B du plan des phrases du journal).
   *
   * Distinct de `identity_saved`, qui porte déjà `categoryId` dans son diff et
   * le garde : ce fait-ci existe parce que changer de famille change les taux
   * et les canaux dont la fiche HÉRITE, et la comptabilité le relit dans la
   * tranche fiscale (Hugo, 2026-09-19 : « la compta doit voir tout ce qui
   * touche au taux »). Y verser `identity_saved` entier l'inonderait de chaque
   * nom retouché.
   *
   * Les lignes écrites avant le 2026-09-19 (lot B) ne portent que les deux
   * identifiants : elles se relisent telles quelles, le journal ne se
   * réécrit pas.
   */
  productReclassified: "product.reclassified",
  /**
   * **Le point de vente** — boutique ou plateforme, son offre et sa grille de
   * tables.
   *
   * Il entre dans le journal du référentiel parce qu'il en fait partie : les
   * familles citent les points de vente dans leur matrice de canaux, et
   * supprimer un point de vente est refusé tant qu'une famille y vend. Un
   * journal qui expliquerait les canaux sans expliquer les points de vente
   * qu'ils citent s'arrêterait juste avant la réponse.
   *
   * ⚠️ Ces clés s'appelaient `location.*`. Elles ont été traduites EN BASE par
   * `20260826240000_resserrer_point_de_vente` : ce sont des données, pas des
   * identifiants de code, et un journal où la moitié des gestes portent le nom
   * d'une table disparue n'explique plus rien.
   */
  pointOfSaleCreated: "point_of_sale.created",
  pointOfSaleUpdated: "point_of_sale.updated",
  pointOfSaleDeleted: "point_of_sale.deleted",
  /**
   * Un QR de table **émis** ou **retiré**. Le jeton n'est PAS dans la charge :
   * il vaut accès à la commande à table, et un journal se lit plus largement
   * que la table qui le porte. On trace le geste, pas le secret.
   */
  pointOfSaleTableQrGenerated: "point_of_sale.table_qr_generated",
  pointOfSaleTableQrRemoved: "point_of_sale.table_qr_removed",
  /**
   * **Le contexte de vente** — une manière de vendre qui a son propre taux.
   *
   * Il est devenu réglable à l'écran, donc il doit se relire : c'est lui qui
   * décide de ce qu'on PEUT vendre, et un contexte mis hors service arrête de
   * facturer sans rien casser de visible. « Pourquoi le B2B ne facture plus
   * depuis mardi » n'a de réponse que si le geste est inscrit.
   */
  /**
   * Le **rapport prix pro / prix public** a bougé.
   *
   * Un fait à fort aval, et c'est pour ça qu'il est tracé avant même que
   * quelque chose le lise : le jour où la dérivation sera branchée, il faudra
   * savoir depuis quand le rapport vaut ce qu'il vaut. Une lacune de journal ne
   * se rattrape pas — les mois passés sont perdus.
   *
   * Sans `blast` : la portée est le catalogue entier, et un nombre le dirait
   * moins bien que la phrase.
   */
  accountingRulesProRatioChanged: "accounting_rules.pro_ratio_changed",
  /**
   * La **méthode** de calcul du prix professionnel a changé.
   *
   * Distincte du rapport, et pas par symétrie : les deux retarifent le
   * catalogue professionnel entier, et un seul type de fait rendrait impossible
   * de répondre à « d'où vient cet écart de prix ». Une bascule vers
   * `remise_apres_tva_max` déplace le prix de base d'environ 12 % sur un article
   * à 5,5 % — c'est le genre de fait qu'on relit sous pression.
   */
  accountingRulesMethodChanged: "accounting_rules.method_changed",
  salesContextCreated: "sales_context.created",
  salesContextUpdated: "sales_context.updated",
  salesContextDeleted: "sales_context.deleted",
  /**
   * **La provenance** — les ingrédients, les appellations, et ce qu'une fiche
   * en cite.
   *
   * Ils entrent au journal pour une raison qui leur est propre : une
   * appellation est une affirmation RÉGLEMENTÉE. « Depuis quand ce produit
   * revendique-t-il de l'AOP » est une question qu'on peut avoir à défendre,
   * et elle n'a de réponse que si le geste est inscrit.
   */
  appellationCreated: "appellation.created",
  appellationUpdated: "appellation.updated",
  appellationDeleted: "appellation.deleted",
  ingredientCreated: "ingredient.created",
  ingredientUpdated: "ingredient.updated",
  ingredientDeleted: "ingredient.deleted",
  /**
   * Ce qu'une matière **contient** — la liste entière, en codes.
   *
   * Distinct d'`ingredient.updated`, qui porte le nom, l'origine et
   * l'appellation : ce fait-ci alimente l'ensemble dérivé proposé aux fiches
   * réglementaires, et « depuis quand cette farine porte-t-elle le sarrasin »
   * est une question qu'on peut avoir à défendre. La noyer dans un diff de
   * formulaire la rendrait introuvable.
   *
   * Un SEUL fait pour la liste, et l'avant/après en **codes** : six mois plus
   * tard, « on a retiré la noisette du praliné » doit se lire sans une jointure
   * sur un référentiel qui aura peut-être bougé.
   */
  ingredientAllergensSaved: "ingredient.allergens_saved",
  /** Ce qu'une fiche cite — la liste entière, l'ordre compris. */
  productIngredientsSaved: "product.ingredients_saved",
  /**
   * **Le référentiel d'allergènes** — ce que le staff y ajoute et ce qu'il en
   * retire.
   *
   * Il entre au journal pour la raison qui vaut déjà pour les appellations, en
   * plus fort : un allergène est une mention RÉGLEMENTAIRE. « Depuis quand ce
   * code est-il proposé à la saisie », « qui a retiré celui-ci du référentiel »
   * sont des questions qu'on peut avoir à défendre, et elles n'ont de réponse
   * que si le geste est inscrit.
   *
   * ⚠️ Aucun de ces faits ne peut porter sur une ligne OFFICIELLE : les 30
   * codes GS1 et les 15 catégories semées sont inaltérables — l'agrégat le
   * refuse, et un trigger le tient en base. Ce que ce flux raconte est donc
   * l'histoire du référentiel **maison**, et de lui seul.
   */
  allergenCategoryCreated: "allergen_category.created",
  allergenCategoryRenamed: "allergen_category.renamed",
  /**
   * Le rang d'affichage a bougé. Tracé comme le reste bien qu'il soit sans
   * portée réglementaire : c'est le seul geste qu'une catégorie OFFICIELLE
   * accepte, donc le seul qui puisse toucher une ligne du droit.
   */
  allergenCategoryReordered: "allergen_category.reordered",
  /**
   * Retirée de ce qu'on PROPOSE, jamais de ce qu'on reconnaît (D2 bis) : les
   * déclarations qui citent ses entrées restent valides.
   */
  allergenCategoryArchived: "allergen_category.archived",
  allergenCategoryRestored: "allergen_category.restored",
  allergenEntryCreated: "allergen_entry.created",
  /** Libellé et/ou rattachement. Le code n'y est pas : c'est une identité. */
  allergenEntryUpdated: "allergen_entry.updated",
  allergenEntryArchived: "allergen_entry.archived",
  allergenEntryRestored: "allergen_entry.restored",

  /**
   * **Un point d'arrêt de prise de commande a été posé** sur une portée.
   *
   * Un seul fait pour la création et le remplacement, parce qu'il n'y a qu'une
   * règle par portée : « posé » décrit exactement ce qui s'est produit, alors
   * que distinguer `created` de `updated` obligerait le lecteur à recoller deux
   * types pour suivre une seule valeur dans le temps.
   */
  orderTimeLimitSet: "order_time_limit.set",
  /** Retirée : l'article retombe sur le rang du dessus. */
  orderTimeLimitRemoved: "order_time_limit.removed",

  /**
   * **Les opérations datées** — Noël, Pâques, la galette (lot 1 du plan
   * `documentation/order/architecture-operations-datees.md`). Le sujet est
   * l'opération, son identifiant sa CLÉ : une clé ne se réemploie jamais.
   *
   * Un fait par geste de l'écran de préparation : redater change ce que la
   * boutique vendra et quand, renommer ne change que ce qu'elle affiche, et
   * « qui a avancé la clôture de Noël » ne doit pas se chercher parmi des
   * retouches d'accroche.
   */
  operationPrepared: "operation.prepared",
  operationEdited: "operation.edited",
  operationRescheduled: "operation.rescheduled",
  operationAudienceChanged: "operation.audience_changed",
  operationSelectionSaved: "operation.selection_saved",
  operationArchived: "operation.archived",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * **La portée** d'un fait : ce qu'il touchait, au moment où il s'est produit.
 *
 * Des **comptes directs**, jamais un rayon transitif. Un taux touche des
 * familles ; ces familles portent des articles ; ces articles partent sur des
 * canaux ; ces canaux facturent des commandes. Figer un nombre au bout de cette
 * chaîne, ce serait figer surtout l'endroit où l'on a choisi de s'arrêter — et
 * il faudrait le recalculer à chaque nouvel aval branché.
 *
 * Ce qu'on fige est donc ce que le handler sait déjà, en une requête qu'il fait
 * de toute façon. La profondeur se **dérive à la lecture**, quand quelqu'un
 * ouvre l'événement et demande « ça a touché quoi » : à ce moment-là c'est une
 * requête, et elle peut être honnête sur sa date.
 *
 * Les clés sont **nommées par ce qu'elles comptent** — jamais un `blastRadius`
 * magique dont personne ne saurait dire ce qu'il additionne.
 */
export interface PimBlastRadius {
  /**
   * Familles visant ce taux, **par clé de contexte de vente**.
   *
   * C'étaient trois champs nommés, et il n'y en a eu longtemps que deux : la
   * portée d'un changement de taux comptait deux canaux sur trois, et un taux
   * que seules des familles B2B visent bougeait sous un « 0 / 0 » — la trace
   * disait que ça ne touchait personne. Une carte ne peut pas oublier un
   * contexte, et un contexte ajouté demain y entrera sans qu'on y pense.
   */
  readonly families?: Readonly<Record<string, number>>;
  /** Articles portés par le produit concerné. */
  readonly variants?: number;
  /**
   * Articles figés par une ancre de publication.
   *
   * Distinct de `variants` : celui-ci compte les déclinaisons d'UN produit,
   * celui-là tout ce qu'une révision photographie. Les confondre dans un même
   * champ ferait lire « 3 » sur une ancre de catalogue entier.
   */
  readonly articles?: number;
}

/** Ce qu'un handler du référentiel fournit pour tracer un fait. */
export interface PimJournalEntry {
  /** Un des {@link PIM_EVENTS} — donc un type du catalogue des faits. */
  readonly type: JournalFactType;
  readonly subjectType: PimSubjectType;
  readonly subjectId: string;
  /**
   * Ce que le fait a changé — le « avant → après », en clair. Reste petit :
   * un journal n'est pas une copie de la base. Les diffs de section se
   * calculent avec `changesBetween`, qui abrège les longs textes.
   */
  readonly payload: Record<string, unknown>;
  /** La portée directe, si le handler la connaît. */
  readonly blast?: PimBlastRadius;
}

/**
 * Port du journal du référentiel — le vocabulaire du PIM sur la mécanique
 * commune.
 *
 * Tout ce qui faisait la garantie — le laissez-passer, `trace`, `untraced` —
 * vit dans {@link ScopedJournal} depuis le 2026-09-23. Ce qui reste ici est ce
 * que le référentiel a à dire, et lui seul.
 */
export abstract class PimJournal extends ScopedJournal<PimJournalEntry> {}
