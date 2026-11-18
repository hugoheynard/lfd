/**
 * Une **manière de vendre** qui a son propre traitement de TVA.
 *
 * C'est une DONNÉE, lue d'une table : ajouter « borne libre-service » ou
 * « marché » doit être une ligne, pas une migration plus un déploiement. Le
 * code ne connaît plus la liste ; il l'itère.
 *
 * ⚠️ Une carte de capacité se définit par **où l'on consomme**, jamais par où
 * l'on achète — c'est le lieu de consommation qui commande le traitement
 * fiscal. « Sur place par QR » n'est donc pas un contexte : on y consomme sur
 * place, comme au comptoir, donc c'est la même carte. Le chemin d'achat est
 * affaire d'adaptateur (`documentation/pim/contextes-et-points-de-vente.md` § 2).
 */
export interface SalesContext {
  readonly id: string;
  /** Identité stable, celle que le code cite quand il doit citer (`b2b`). */
  readonly key: string;
  readonly label: string;
  /** En service : réglable à l'écran, et facturable. */
  readonly active: boolean;
  readonly position: number;
}
