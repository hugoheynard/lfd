import type { CatalogParityView } from "./catalog-parity.js";

/**
 * **Ce que l'envoi ferait, s'il partait maintenant** — la lecture de l'écran de
 * publication.
 *
 * ## Pourquoi ce contrat existe
 *
 * Regarder passait par `POST /pim/channels/b2b/push` avec `dryRun: true`, et une
 * simulation n'était donc pas une lecture : elle traversait toute la tuyauterie
 * d'envoi, **posait une ancre de révision** et inscrivait une ligne de
 * publication. D'où un bouton « Simuler » — on ne déclenche pas des écritures au
 * chargement d'une page — et d'où des ancres qui s'accumulaient à chaque regard,
 * alors qu'une révision est censée dire ce qu'on s'apprête à publier.
 *
 * Cette vue ne fait qu'assembler deux lectures qui existaient déjà : la
 * projection (ce qui partirait) et le miroir (ce que le canal tient). Elle
 * n'écrit rien, donc l'écran peut la charger à l'ouverture.
 *
 * ## Ce qu'elle apporte que la simulation ne pouvait pas
 *
 * Le pilote à blanc l'avouait lui-même : « seul `removedSkus` reste vide, et
 * c'est correct : lui seul suppose de connaître l'état de l'autre côté ». Une
 * simulation ne voyait donc jamais les **retraits**. En rapprochant la
 * projection du miroir, ils apparaissent — et chaque article sortant sait s'il
 * entre, s'il change, ou s'il ne bouge pas.
 */
export interface B2bPushPreviewView {
  /** Ce qui partirait, article par article, avec l'effet sur le canal. */
  readonly outgoing: readonly B2bPushPreviewItem[];
  /** Fiches candidates au moment du calcul — exclusions comprises. */
  readonly candidates: number;
  /**
   * Ce que la projection écarte, avec son motif.
   *
   * Le motif voyage en **chaîne** et non en union fermée : son vocabulaire
   * appartient au référentiel, et `@lfd/contracts` n'importe pas
   * `@lfd/pim-contracts` — les deux paquets tiennent deux langages métier
   * distincts, et les faire dépendre l'un de l'autre les mélangerait. Le
   * back-office, lui, connaît les deux et sait traduire.
   */
  readonly excluded: readonly B2bPushPreviewExclusion[];
  /**
   * Ce que le canal tient et que le référentiel ne publie plus — donc ce que cet
   * envoi **retirerait** de la vente. C'est `parity.stale`, remonté ici parce
   * que c'est la moitié de la question qu'aucun écran ne posait.
   */
  readonly removed: readonly string[];
  /**
   * L'empreinte de ce qui vient d'être projeté — le jeton que l'envoi redonne.
   *
   * C'est elle qui relie ce qu'on regarde à ce qu'on envoie : si le catalogue
   * bouge entre l'ouverture de l'écran et le clic, le serveur refuse.
   */
  readonly fingerprint: string;
  /** L'écart complet avec le canal, gaps de prix et de taux compris. */
  readonly parity: CatalogParityView;
}

export interface B2bPushPreviewExclusion {
  readonly sku: string;
  readonly reason: string;
}

/**
 * Ce que l'envoi ferait à CET article, vu du canal.
 *
 * Trois états et pas deux : « inchangé » est une réponse, et la plus fréquente.
 * L'omettre laisserait croire qu'un envoi remue tout le catalogue à chaque fois.
 */
export type B2bPushChange = "added" | "changed" | "unchanged";

export interface B2bPushPreviewItem {
  readonly sku: string;
  readonly name: string;
  /** Prix canonique HT en millicentimes — l'unité du fil, pas celle de l'écran. */
  readonly priceMillicents: number;
  /** `null` = famille non réglée : l'article voyage mais n'est pas vendable. */
  readonly vatRatePercent: number | null;
  readonly change: B2bPushChange;
}
