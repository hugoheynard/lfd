/** Les articles qu'on peut mettre dans une formule, dont le nom ou le SKU contient `term`. */
export class SearchBundleChoicesQuery {
  constructor(readonly term: string) {}
}
