/**
 * Port de **lecture** : parmi ces SKU, lesquels le catalogue sert-il à
 * quelqu'un — un pro ou un particulier ?
 *
 * La route de mesure est publique et ne sait pas qui regarde : elle compte un
 * article dès qu'il est en vente pour l'une des deux audiences, et refuse le
 * reste. Le masquage n'est pas relu ici : c'est `resolveMany` qui l'applique.
 */
export abstract class AudienceSkuReader {
  abstract servedAmong(skus: readonly string[]): Promise<ReadonlySet<string>>;
}
