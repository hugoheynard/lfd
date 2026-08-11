/**
 * Ton d'un badge d'identité — sous-ensemble neutre des variants `fold-badge`
 * utilisés ici. L'app mappe son statut métier vers ce ton.
 */
export type CompanyBadgeTone = 'neutral' | 'success' | 'warning' | 'alert';

/** Le KBIS tel que la carte l'affiche (déposé ou non). */
export interface CompanyKbisView {
  readonly fileName: string;
  /** ISO — date de dépôt. */
  readonly uploadedAt: string;
  /** Certifié = entreprise validée. */
  readonly certified: boolean;
}

/**
 * Vue **neutre** de l'identité légale d'une société — exactement ce que la carte
 * de présentation affiche, indépendamment de la source. Chaque app mappe SON
 * modèle (`Company` côté client, `AdminCompany` côté staff) vers ce view-model ;
 * la carte n'en connaît aucun.
 */
export interface CompanyIdentityView {
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  /** Déjà formaté pour l'affichage (groupes SIRET). */
  readonly siret: string;
  readonly tvaIntracom: string;
  /** TVA requise par la forme juridique mais absente → zone à compléter. */
  readonly tvaMissing: boolean;
  /**
   * Les pièces d'**identité légale** qui manquent, nommées (« raison sociale »,
   * « SIRET »…). Vide quand rien ne manque.
   *
   * Nommées et non comptées : « il manque 2 champs » oblige à chercher
   * lesquels, et un rappel qui fait chercher ne rappelle rien. C'est le même
   * inventaire que la synthèse du haut de page — répété là où l'on corrige,
   * parce qu'entre les deux il y a tout l'écran.
   */
  readonly missingLegal: readonly string[];
  readonly statusLabel: string;
  readonly statusTone: CompanyBadgeTone;
  /**
   * Badge de rôle, ou `null` quand la notion de rôle n'existe pas pour ce
   * consommateur (le staff n'est pas membre de la société).
   */
  readonly roleLabel: string | null;
  /** KBIS déposé, ou `null` s'il n'y en a pas encore. */
  readonly kbis: CompanyKbisView | null;
}
