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

/** La chose dont l'événement parle. Le référentiel n'en connaît que quatre. */
export type PimSubjectType = "vat_rate" | "product" | "product_category" | "location";

/**
 * Les faits que le référentiel journalise. **Des décisions**, pas des appels
 * HTTP : `vat_rate.rate_changed` se relit dans six mois,
 * `PUT /commerce/vat-rates/x` non.
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
  productCategoryCreated: "product_category.created",
  productCategoryRenamed: "product_category.renamed",
  /** Change le parent, donc l'héritage de TVA et de canaux en aval. */
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
  productArchived: "product.archived",
  productRestored: "product.restored",
  /**
   * **L'emplacement** — boutique ou point de vente, et sa grille de tables.
   *
   * Il entre dans le journal du référentiel parce qu'il en fait partie : les
   * familles citent les emplacements dans leur grille de canaux, et supprimer
   * un emplacement est refusé tant qu'une famille le coche. Un journal qui
   * expliquerait les canaux sans expliquer les emplacements qu'ils citent
   * s'arrêterait juste avant la réponse.
   */
  locationCreated: "location.created",
  locationUpdated: "location.updated",
  locationDeleted: "location.deleted",
  /**
   * Un QR de table **émis** ou **retiré**. Le jeton n'est PAS dans la charge :
   * il vaut accès à la commande à table, et un journal se lit plus largement
   * que la table qui le porte. On trace le geste, pas le secret.
   */
  locationTableQrGenerated: "location.table_qr_generated",
  locationTableQrRemoved: "location.table_qr_removed",
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
   * un journal n'est pas une copie de la base. Les diffs de section se
   * calculent avec `changesBetween`, qui abrège les longs textes.
   */
  readonly payload: Record<string, unknown>;
  /** La portée directe, si le handler la connaît. */
  readonly blast?: PimBlastRadius;
}

/**
 * Le **laissez-passer d'écriture** : la preuve, portée par le type, qu'une
 * trace a été inscrite.
 *
 * Les dépôts du référentiel l'exigent en paramètre. Il ne peut naître que dans
 * ce module — `mint` n'est pas exporté et la marque est un symbole privé — donc
 * la seule façon d'en obtenir un est de passer par {@link PimJournal}. Écrire
 * sans tracer ne se refuse plus en revue ni en CI : **ça ne compile pas**.
 *
 * C'est la différence entre le filet (`lint:journal-tracked`, qui vérifie qu'un
 * handler INJECTE le journal) et la garantie : injecter n'oblige pas à appeler.
 * Un ticket, si.
 */
const TICKET = Symbol("pim.write-ticket");

export interface WriteTicket {
  readonly [TICKET]: true;
}

/** Frappe un laissez-passer. Privé au module : c'est toute la garantie. */
function mint(): WriteTicket {
  return { [TICKET]: true };
}

/**
 * Port du journal du référentiel.
 *
 * **Bloquant** : le référentiel a choisi que sa trace conditionne l'écriture.
 * Elle part dans la même transaction que la décision qu'elle décrit, donc une
 * panne de journal annule l'enregistrement. C'est la contrepartie assumée — le
 * journal devient un point de panne du métier — et c'est ce qui rend la trace
 * opposable plutôt que probable.
 */
export abstract class PimJournal {
  /**
   * Inscrit le fait, et rend le laissez-passer qui autorise l'écriture.
   *
   * L'ordre n'a pas d'importance pour l'atomicité (tout est dans la même
   * transaction) ; il en a pour la LECTURE du code : on voit ce qu'on s'apprête
   * à affirmer avant de l'écrire.
   */
  async trace(entry: PimJournalEntry): Promise<WriteTicket> {
    await this.record(entry);
    return mint();
  }

  /**
   * Un laissez-passer **sans trace**, avec son motif.
   *
   * Toutes les écritures n'ont pas un fait à nommer, et certaines ne l'ont pas
   * ENCORE (cf. la dette de `lint:journal-tracked`). La dérogation existe donc
   * — mais il faut l'écrire, dire pourquoi, et ça se grep. Une exception
   * lisible vaut mieux qu'une règle contournée en silence : le but n'a jamais
   * été d'empêcher, il a toujours été de rendre visible.
   */
  untraced(reason: string): WriteTicket {
    void reason;
    return mint();
  }

  protected abstract record(entry: PimJournalEntry): Promise<void>;
}
