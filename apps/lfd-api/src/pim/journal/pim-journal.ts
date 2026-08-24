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
 * **Quand promouvoir le journal en `platform/`** : au troisième bloc émetteur.
 * À deux, un port et un binding de racine coûtent moins qu'un déménagement de
 * 43 fichiers ; à trois, la fiction « la croissance possède le journal » ne
 * tient plus.
 */

/** La chose dont l'événement parle. Le référentiel n'en connaît que trois. */
export type PimSubjectType = "tva_rate" | "product" | "category";

/**
 * Les faits que le référentiel journalise. **Des décisions**, pas des appels
 * HTTP : `tax_rate.rate_changed` se relit dans six mois,
 * `PUT /commerce/tva-rates/x` non.
 *
 * On ne trace pas tout. Ces sept-là ont en commun de **changer ce qui est taxé
 * ou vendu** — le reste (une description retouchée, un libellé) n'a pas d'aval
 * et n'a rien à faire dans un journal qu'on relit pour comprendre un écart.
 */
export const PIM_EVENTS = {
  tvaRateCreated: "tax_rate.created",
  /** Le taux a bougé — le seul changement de taux qui ait un aval. */
  tvaRateRateChanged: "tax_rate.rate_changed",
  /** Renommage / description : tracé à part, parce que c'est sans conséquence. */
  tvaRateRenamed: "tax_rate.renamed",
  tvaRateDeleted: "tax_rate.deleted",
  categoryTvaChanged: "category.tva_changed",
  /**
   * Une fiche DÉROGE au taux de sa famille — ou lui revient. Distinct du fait
   * précédent : l'un décide pour un rayon entier, l'autre pour une ligne, et
   * confondre les deux dans l'historique rendrait illisible la question qu'on
   * pose vraiment — « qui a décidé ça, et quand ».
   */
  productTvaChanged: "product.tva_changed",
  productPublished: "product.published",
  productUnpublished: "product.unpublished",
} as const;

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
}

/** Ce qu'un handler du référentiel fournit pour tracer un fait. */
export interface PimJournalEntry {
  /** Un des {@link PIM_EVENTS}. */
  readonly type: string;
  readonly subjectType: PimSubjectType;
  readonly subjectId: string;
  /**
   * Ce que le fait a changé — le « avant → après », en clair. Reste petit :
   * un journal n'est pas une copie de la base.
   */
  readonly payload: Record<string, unknown>;
  /** La portée directe, si le handler la connaît. */
  readonly blast?: PimBlastRadius;
}

/**
 * Port du journal du référentiel.
 *
 * **Best-effort**, comme le journal qu'il représente : `record` n'échoue jamais
 * vers l'appelant. Une trace manquée ne doit pas annuler la décision qu'elle
 * décrit — sinon le journal devient un point de panne du métier.
 */
export abstract class PimJournal {
  abstract record(entry: PimJournalEntry): Promise<void>;
}
