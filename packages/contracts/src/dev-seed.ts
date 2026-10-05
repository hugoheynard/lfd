/**
 * Contrat de fil du **rechargement du jeu de données de développement**.
 *
 * Il vit dans le contrat comme n'importe quel autre fil : deux applications se
 * parlent, donc la forme leur appartient à toutes les deux. Le fait qu'il
 * n'existe qu'en développement ne change rien à cette règle — c'est le seul
 * endroit où une divergence entre l'API et l'écran se verrait à la compilation.
 *
 * ⚠️ Ce sont des **types** : ils disparaissent à la compilation, et n'ajoutent
 * donc rien au bundle de production, même si l'écran qui les lit en est absent.
 */

/** Ce que la coupe a emporté. */
export interface DevSeedResetReport {
  readonly companies: number;
  readonly people: number;
  readonly pickupPoints: number;
  readonly zones: number;
  /**
   * Règles de prix retirées — promotions, gestes, mercuriales d'essai.
   *
   * Comptées et dites : une décision tarifaire d'essai n'est pas un décor, c'est
   * un prix. Retirer quatre remises sans le nommer laisserait croire que le
   * catalogue a changé.
   */
  readonly priceRules: number;
  readonly volumeLadders: number;
}

/** Ce que le semis a posé, et les deux journées qui font l'invariant. */
export interface DevSeedOrdersReport {
  readonly removed: number;
  readonly placed: number;
  /** `AAAA-MM-JJ` — la journée servie la veille. */
  readonly yesterday: string;
  /** `AAAA-MM-JJ` — la journée du comptoir : ce que la file de remise montre. */
  readonly today: string;
  /**
   * Combien de lignes cette file porte, tous points confondus.
   *
   * Dit plutôt que sous-entendu : l'écran de rechargement annonçait « livraison
   * + retrait » en toutes lettres pour demain, une phrase qui ne peut que
   * diverger du semis. Un nombre que le serveur compte ne diverge pas.
   */
  readonly counterToday: number;
  /**
   * `AAAA-MM-JJ` — la journée des deux commandes en attente, et **le pic** du
   * prévisionnel.
   *
   * 🔴 Elle s'appelait `tomorrow` et valait J+1 jusqu'au 2026-09-17. Les deux
   * commandes ont été déplacées à **J+2** pour que « le mur qui arrive » montre
   * une montée devant soi plutôt que la charge du jour : tant qu'elles tombaient
   * demain, le jour le plus chargé restait aujourd'hui, et la colonne teintée
   * n'apprenait rien.
   *
   * Renommée plutôt que laissée telle quelle : l'écran de rechargement AFFICHE
   * cette date, et un champ nommé `tomorrow` qui porterait J+2 est exactement la
   * divergence que `counterToday` existe pour éviter.
   */
  readonly peakDay: string;
}

/**
 * Ce qu'un bucket de développement a rendu.
 *
 * Le rechargement supprime les commandes ; sans lui, les bons déjà tirés
 * restaient en magasin sous des identifiants qui n'existaient plus. Pire, un bon
 * archivé est servi TEL QUEL au téléchargement suivant : un poste gardait le
 * vieux dessin sur une commande neuve.
 */
export interface DevSeedStorageReport {
  readonly bucket: string;
  readonly objects: number;
}

/**
 * **La journée de livraison d'aujourd'hui**, telle que le semis l'a posée
 * (2026-09-29) : des nombres comptés par le serveur, pour que l'écran de
 * rechargement ne décrive pas de mémoire ce que le semis a fait.
 */
export interface DevSeedDeliveryReport {
  /** `AAAA-MM-JJ` — la journée de livraison. */
  readonly day: string;
  /** Les livraisons du jour, celle du comptoir comprise. */
  readonly deliveries: number;
  /** Celles qui ne sont pas encore colisées. */
  readonly notReady: number;
  /** Les véhicules de la flotte semée — ceux ajoutés à la main ne sont pas comptés. */
  readonly vehicles: number;
  /** Les tournées composées et chargées, pas parties. */
  readonly rounds: number;
  /** Les bacs chargés dans ces tournées. */
  readonly loadedBins: number;
  /** Les livraisons laissées hors tournée — ce que « Proposer » a à placer. */
  readonly unassigned: number;
  /** À qui la tournée chargée est affectée, ou pourquoi elle ne l'est pas (2026-10-01). */
  readonly driver: DevSeedDriverReport;
}

/**
 * **Le livreur de la tournée chargée.** Le semis l'affecte à QUI a cliqué, par
 * la vraie commande d'affectation : `assigned` veut donc toujours dire « à
 * vous », et « Ma tournée » la montre. `refused` porte le refus du serveur
 * (le droit « Conduire sa tournée » manque) ; `no_requester` est la ligne de
 * commande, qui n'a personne à qui l'affecter.
 */
export type DevSeedDriverReport =
  | { readonly status: "assigned"; readonly name: string }
  | { readonly status: "refused"; readonly reason: string }
  | { readonly status: "no_requester" };

/** La réponse de `POST /admin/dev/seed/reload`. */
export interface DevSeedReport {
  readonly reset: DevSeedResetReport;
  readonly orders: DevSeedOrdersReport;
  readonly delivery: DevSeedDeliveryReport;
  /** Vide si aucun bucket n'est configuré sur ce poste. */
  readonly storage: readonly DevSeedStorageReport[];
}

/**
 * La réponse de `POST /admin/dev/seed/reload/orders` : le scénario de commandes
 * seul (2026-09-30). Pas de `reset` — rien n'est coupé hors des commandes.
 */
export type DevSeedOrdersOnlyReport = Omit<DevSeedReport, "reset">;

/**
 * **Les étapes du scénario du jour** (2026-10-05,
 * `documentation/order/plan-jeu-de-donnees-par-etapes.md` §1) : 0 commandes
 * passées, 1 plan de production clôturé, 2 tournées composées, 3 production
 * complète, 4 colisage complet, 5 tournées chargées prêtes à partir.
 *
 * Les tournées avant le colisage : c'est l'ordre que le code impose (un
 * demi-bac ne se partage qu'entre deux arrêts consécutifs d'une tournée).
 */
export type DevScenarioStep = 0 | 1 | 2 | 3 | 4 | 5;

/** Une étape, cochée ou non, avec ce que la base en dit. */
export interface DevScenarioStepView {
  readonly step: DevScenarioStep;
  /** Atteinte : cette étape ET toutes celles d'avant sont vraies en base. */
  readonly reached: boolean;
  /** Ce que la base porte pour elle, compté par le serveur (« 3 tournées, 51 bacs »). */
  readonly summary: string;
}

/**
 * La réponse de `GET /admin/dev/scenario`.
 *
 * `reached` est **déduit** de la base à chaque lecture, jamais mémorisé : une
 * base retouchée à la main montre l'étape réellement atteinte. `null` = le
 * scénario du jour n'est pas posé (ou plus entier) — la remise à l'état de base
 * le repose.
 */
export interface DevScenarioView {
  /** `AAAA-MM-JJ` — la journée jouée. */
  readonly day: string;
  readonly reached: DevScenarioStep | null;
  readonly steps: readonly DevScenarioStepView[];
  /** `pg_database_size`, en octets : la dérive se voit avant de bloquer (§2 bis). */
  readonly databaseBytes: number;
}

/** Les catégories que la remise à l'état de base compte (§2 bis). */
export type DevScenarioPurgeCategory =
  "orders" | "production" | "packing" | "delivery" | "outbox" | "journals";

/** Les lignes supprimées d'une catégorie. */
export interface DevScenarioPurgeView {
  readonly category: DevScenarioPurgeCategory;
  readonly rows: number;
}

/** La réponse de `POST /admin/dev/scenario/reset` : ce qui est parti, ce qui est reposé. */
export interface DevScenarioResetReport {
  readonly day: string;
  readonly removed: readonly DevScenarioPurgeView[];
  /** Les objets retirés, bucket par bucket — seulement ceux du scénario. */
  readonly storage: readonly DevSeedStorageReport[];
  /** Les commandes reposées, tous jours confondus. */
  readonly placed: number;
}

/** La réponse de `POST /admin/dev/scenario/next` : l'étape jouée. L'écran relit l'état. */
export interface DevScenarioNextReport {
  readonly played: DevScenarioStep;
}
