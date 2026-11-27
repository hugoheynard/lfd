/**
 * **Les options proposées à l'écran** (« Tranchage » → « tranché »,
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.2) : par article,
 * les groupes actifs et les seuls choix que la clientèle de l'appelant peut
 * demander. L'audience est toujours résolue par le serveur ; l'écran ne filtre
 * rien. Aucun prix : les options sont gratuites.
 */
export interface OfferedOptionChoiceView {
  /** La clé du choix — ce qui part dans `optionChoices[].choice`. */
  readonly key: string;
  readonly label: string;
}

/** Un groupe proposé sur un article ; « sans » est implicite et n'y figure pas. */
export interface OfferedOptionGroupView {
  /** L'identifiant du groupe — ce qui part dans `optionChoices[].group`. */
  readonly id: string;
  readonly name: string;
  readonly choices: readonly OfferedOptionChoiceView[];
}

/** Les groupes d'un article. Un article sans groupe proposé est ABSENT de la liste. */
export interface ShopItemOptionGroupsView {
  readonly sku: string;
  readonly groups: readonly OfferedOptionGroupView[];
}

/** La réponse de `GET /shop/catalogue/options` et de `GET /shop/catalogue/options/mine`. */
export interface ShopOptionGroupsView {
  readonly items: readonly ShopItemOptionGroupsView[];
}
