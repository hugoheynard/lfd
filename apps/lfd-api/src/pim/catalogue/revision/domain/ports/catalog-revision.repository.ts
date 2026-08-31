import type { WriteTicket } from "../../../../journal/pim-journal.js";
import type { RevisionIndex } from "../diff.js";
import type { JsonObject } from "../fingerprint.js";
import type { Revision } from "../revision.js";

/** Une publication d'une révision vers une destination. */
export interface RevisionPublication {
  readonly revisionId: string;
  /** `b2b`, `shopify`… Le registre des canaux vit chez qui les pousse. */
  readonly channel: string;
  /** `live` ou `dry-run` — une simulation se trace aussi. */
  readonly mode: string;
  /** `sent` ou `failed`. L'échec s'inscrit : sinon on ne raconte que les bons jours. */
  readonly outcome: string;
  readonly report: unknown;
  readonly publishedAt: Date;
  readonly publishedBy: string | null;
}

/** Une révision posée, telle qu'on la relit. */
export interface RevisionRecord {
  readonly id: string;
  readonly version: number;
  readonly label: string | null;
  readonly hash: string;
  readonly takenAt: Date;
  readonly takenBy: string;
  /** Combien d'articles elle fige — compté, pas déduit d'une lecture des items. */
  readonly articles: number;
}

export abstract class CatalogRevisionRepository {
  /**
   * La dernière révision posée, ou `null` s'il n'y en a aucune.
   *
   * Elle sert à deux choses qui vont ensemble : donner le numéro suivant, et
   * répondre « rien n'a changé depuis » par une comparaison d'empreintes. Les
   * séparer en deux lectures ouvrirait une fenêtre où l'une voit une révision
   * que l'autre ignore.
   */
  abstract latest(): Promise<RevisionRecord | null>;

  /**
   * Pose la révision : les contenus **manquants** d'abord, l'ancre ensuite.
   *
   * « Manquants » est tout l'objet du magasin partagé — un contenu déjà connu
   * n'est pas réécrit, il est référencé. Une capture d'un catalogue inchangé
   * n'écrit donc que la ligne d'ancre et ses appartenances.
   */
  abstract save(
    record: Omit<RevisionRecord, "id" | "articles">,
    revision: Revision,
    ticket: WriteTicket,
  ): Promise<string>;

  /** Les ancres, de la plus récente à la plus ancienne. */
  abstract list(limit: number): Promise<readonly RevisionRecord[]>;

  /** Une ancre par son numéro. `null` = elle n'existe pas. */
  abstract byVersion(version: number): Promise<RevisionRecord | null>;

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
   * Inscrit une publication SUR une révision : où elle est partie, et l'issue.
   *
   * Séparé de `save` parce que les deux actes sont séparés dans le temps : on
   * fige d'abord ce qu'on s'apprête à envoyer, on envoie ensuite, et l'envoi
   * peut échouer. Les fondre obligerait à connaître l'issue avant de figer,
   * c'est-à-dire à ne rien figer du tout.
   */
  abstract recordPublication(publication: RevisionPublication): Promise<void>;

  /** Les payloads de quelques SKU — ceux que le plan a désignés, et eux seuls. */
  abstract payloadsOf(
    revisionId: string,
    skus: readonly string[],
  ): Promise<ReadonlyMap<string, JsonObject>>;
}
