import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import type { RevisionIndex } from "../diff.js";
import type { JsonObject } from "../fingerprint.js";
import type { CatalogRevision } from "../entities/catalog-revision.js";
import type { Revision } from "../revision.js";

/** Une révision posée, telle qu'on la relit. */
export interface RevisionRecord {
  readonly id: string;
  /** La référence lisible — `R-7WT4NA`. C'est par elle qu'on cite une ancre. */
  readonly reference: string;
  readonly label: string | null;
  /**
   * Le POURQUOI, en clair — `null` = personne n'en a écrit.
   *
   * À part du nom parce que ce sont deux lectures : le nom se lit dans une
   * liste à côté de quinze autres, la note se lit quand on ouvre. Allonger le
   * nom ferait qu'une liste afficherait des paragraphes.
   */
  readonly note: string | null;
  readonly hash: string;
  readonly takenAt: Date;
  readonly takenBy: string;
  /** Combien d'articles elle fige — compté, pas déduit d'une lecture des items. */
  readonly articles: number;
}

export abstract class CatalogRevisionRepository {
  /**
   * L'ancre portant cette empreinte, ou `null`.
   *
   * La garde de la pose demande « **cette ancre existe-t-elle ?** » et non plus
   * « est-ce la dernière ? ». La seconde était une approximation de la première,
   * juste tant qu'on ne revient jamais en arrière — et fausse dès qu'un
   * catalogue revient à un état qu'il a déjà eu.
   *
   * Elle rend la **plus ancienne** quand plusieurs partagent l'empreinte : une
   * ancre répond à « le catalogue ÉTAIT ceci », c'est un contenu, pas un moment.
   * Le « quand » est porté par les publications, qui ont chacune leur date.
   *
   * ⚠️ Elle referme aussi l'ancre **orpheline** d'un push échoué : l'ancre est
   * posée AVANT l'envoi, donc un échec en laisse une sans publication. Au retry,
   * l'empreinte la retrouve et la publication réussie s'inscrit dessus, au lieu
   * de poser un doublon.
   */
  abstract loadByHash(hash: string): Promise<CatalogRevision | null>;

  /**
   * Pose la révision : les contenus **manquants** d'abord, l'ancre ensuite.
   *
   * L'identifiant et la référence sont fabriqués par l'appelant (la factory de
   * l'agrégat les exige) ; le dépôt écrit ce qu'on lui rend.
   *
   * « Manquants » est tout l'objet du magasin partagé — un contenu déjà connu
   * n'est pas réécrit, il est référencé. Une capture d'un catalogue inchangé
   * n'écrit donc que la ligne d'ancre et ses appartenances.
   *
   * @throws {RevisionHashAlreadyTakenError} la base refuse : une autre ancre
   *   porte déjà cette empreinte (la course de deux pushs simultanés).
   */
  abstract add(revision: CatalogRevision, photograph: Revision, ticket: WriteTicket): Promise<void>;

  /**
   * Écrit le nom (et la note) d'une ancre posée — le seul champ qui bouge.
   * La règle « une ancre nommée ne se renomme pas » est celle de l'agrégat, pas
   * celle du dépôt.
   */
  abstract save(revision: CatalogRevision): Promise<void>;

  /** Une ancre par sa référence, en agrégat. `null` = elle n'existe pas. */
  abstract load(reference: string): Promise<CatalogRevision | null>;

  /** Les ancres, de la plus récente à la plus ancienne. */
  abstract list(limit: number): Promise<readonly RevisionRecord[]>;

  /** Une ancre par sa référence. `null` = elle n'existe pas. */
  abstract byReference(reference: string): Promise<RevisionRecord | null>;

  /**
   * De quoi COMPARER une révision sans la lire : une empreinte par SKU, et
   * l'en-tête.
   *
   * C'est la lecture qui rend le diff paresseux. Rapatrier les payloads pour
   * découvrir que trois articles ont bougé sur mille coûterait mille lectures
   * pour trois lignes de résultat.
   */
  abstract indexOf(revisionId: string): Promise<RevisionIndex>;

  /**
   * Les index de PLUSIEURS ancres, en une requête.
   *
   * Existe pour la liste des révisions, qui veut dire combien d'articles
   * séparent chaque ancre de la précédente. Boucler sur `indexOf` ferait
   * cinquante allers-retours pour afficher un écran — et c'est exactement le
   * genre de boucle qu'on ne voit pas venir : chacun est rapide, leur somme ne
   * l'est pas.
   *
   * Les ancres absentes ne sont pas dans la carte rendue.
   */
  abstract indexesOf(revisionIds: readonly string[]): Promise<ReadonlyMap<string, RevisionIndex>>;

  /** Les payloads de quelques SKU — ceux que le plan a désignés, et eux seuls. */
  abstract payloadsOf(
    revisionId: string,
    skus: readonly string[],
  ): Promise<ReadonlyMap<string, JsonObject>>;
}
