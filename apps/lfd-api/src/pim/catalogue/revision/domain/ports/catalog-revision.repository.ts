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
  /**
   * L'empreinte de la **projection** partie sur ce canal — jamais celle de
   * l'ancre. L'ancre archive le catalogue ; la projection est ce qu'un canal en
   * tire, et c'est elle seule qui répond à « le canal a-t-il reçu ce que le
   * référentiel produirait aujourd'hui ? ».
   *
   * `null` pour un canal qui n'en produit pas. Une lecture qui cherche
   * « l'empreinte reçue » filtre `mode = 'live'` **et** `outcome = 'sent'` : une
   * simulation et un échec laissent une ligne eux aussi.
   */
  readonly projectionFingerprint: string | null;
  readonly publishedAt: Date;
  readonly publishedBy: string | null;
}

/** Une révision posée, telle qu'on la relit. */
export interface RevisionRecord {
  readonly id: string;
  /** La référence lisible — `R-7WT4NA`. C'est par elle qu'on cite une ancre. */
  readonly reference: string;
  readonly label: string | null;
  readonly hash: string;
  readonly takenAt: Date;
  readonly takenBy: string;
  /** Combien d'articles elle fige — compté, pas déduit d'une lecture des items. */
  readonly articles: number;
}

export abstract class CatalogRevisionRepository {
  /**
   * L'ancre de la **dernière publication réussie**, ou `null` s'il n'y en a
   * aucune.
   *
   * C'est la référence du diff : « 3 articles ont changé depuis R-7WT4NA ». Elle
   * s'appelait `latest()` et rendait la dernière ancre **posée**, ce qui n'est
   * pas la même chose et rendait l'écran faux dans un cas banal — un catalogue
   * qui va de A à B puis revient à A comparait à B, sur un catalogue qu'on
   * venait de republier entier.
   *
   * 🔴 **« Publiée » filtre `mode = 'live'` ET `outcome = 'sent'`.** Une ligne de
   * publication existe aussi pour une simulation et pour un échec ; sans le
   * filtre, un dry-run lancé après le dernier envoi deviendrait la référence.
   *
   * ⚠️ **La dernière PUBLICATION, pas la dernière ancre publiée.** La nuance
   * décide du cas qui motive tout : après un aller-retour A → B → A, l'ancre A
   * reçoit une seconde publication mais garde sa date de pose. Trier les ancres
   * publiées par leur pose rendrait B — et rejouerait le bug.
   *
   * ⚖️ **Au moins une**, pas toutes. Le modèle définit R comme un consensus —
   * publiée sur TOUS les canaux. Appliqué ici, le diff
   * perdrait sa référence dès qu'un canal est en retard, c'est-à-dire souvent.
   * Le consensus reste une information d'écran (« Shopify est deux ancres en
   * arrière ») ; ce qui informe ne doit pas devenir le dénominateur de tout.
   *
   * Conséquence assumée : un catalogue que l'on n'a jamais fait que **simuler**
   * n'a pas de référence, et l'écran le dit. C'est exact — rien n'est parti.
   */
  abstract lastPublished(): Promise<RevisionRecord | null>;

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
  abstract byHash(hash: string): Promise<RevisionRecord | null>;

  /**
   * Pose la révision : les contenus **manquants** d'abord, l'ancre ensuite.
   *
   * Rend l'identifiant ET la référence : cette dernière est FABRIQUÉE ici, à
   * partir de l'identifiant, et l'appelant ne peut donc pas la connaître avant.
   *
   * « Manquants » est tout l'objet du magasin partagé — un contenu déjà connu
   * n'est pas réécrit, il est référencé. Une capture d'un catalogue inchangé
   * n'écrit donc que la ligne d'ancre et ses appartenances.
   */
  abstract save(
    record: Omit<RevisionRecord, "id" | "articles" | "reference">,
    revision: Revision,
    ticket: WriteTicket,
  ): Promise<{ readonly id: string; readonly reference: string }>;

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
