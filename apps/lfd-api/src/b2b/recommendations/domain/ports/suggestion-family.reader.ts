/**
 * Port de **lecture** : parmi ces ids de famille, lesquels le catalogue
 * servi connaît-il ? Une famille est connue dès qu'un article servi s'y
 * range, elle ou l'une de ses sous-familles — un déclencheur « famille au
 * panier » vaut pour ses sous-familles, comme une décision de prix.
 */
export abstract class SuggestionFamilyReader {
  abstract knownAmong(familyIds: readonly string[]): Promise<ReadonlySet<string>>;
}
