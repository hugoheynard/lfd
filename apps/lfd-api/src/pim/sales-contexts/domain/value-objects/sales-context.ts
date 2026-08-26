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
 * affaire d'adaptateur (`documentation/pim/ecrans-du-referentiel.md` § 1 bis).
 */
export interface SalesContext {
  readonly id: string;
  /** Identité stable, celle que le code cite quand il doit citer (`b2b`). */
  readonly key: string;
  readonly label: string;
  /**
   * Suffixe de handle **Shopify** — vide pour le contexte par défaut, dont le
   * handle nu protège les URL déjà indexées (C0-bis, write-once SEO).
   *
   * Du vocabulaire de CE canal, donc vide aussi pour un contexte qui n'y est
   * pas projeté : le B2B a son propre projecteur, qui ne fabrique aucun handle.
   *
   * ⚠️ Deux contextes PROJETÉS ne peuvent pas partager un suffixe — ils
   * produiraient le même handle. Rien ne le vérifie encore : aucun canal ne lit
   * ce champ à ce jour, il attend C4 et ses handles suffixés. C'est là que
   * l'invariant devra vivre, pas ici.
   *
   * ⚠️ Ce champ et `shopifyProjected` sont le vocabulaire d'UNE intégration,
   * rangé dans le référentiel — la dernière entorse au principe « le PIM ne
   * connaît pas le vocabulaire des plateformes ». Ils doivent déménager chez
   * l'adaptateur.
   */
  readonly handleSuffix: string;
  /** En service : réglable à l'écran, et facturable. */
  readonly active: boolean;
  /** Shopify en fait un produit. **Distinct** de `active` — cf. le schéma. */
  readonly shopifyProjected: boolean;
  readonly position: number;
}
