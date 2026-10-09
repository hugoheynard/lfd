/**
 * Port de **lecture** de la conservation : quelles demandes sont dues à
 * l'anonymisation. L'écriture, elle, passe par l'agrégat (`anonymize`) et
 * le port d'écriture : c'est lui qui sait quels objets de stockage purger.
 */
export abstract class CustomerRequestRetention {
  /**
   * Au plus `limit` identifiants de demandes pas encore anonymisées, traitées
   * avant `before` — ou jamais traitées et reçues avant `before`.
   */
  abstract dueBefore(before: Date, limit: number): Promise<readonly string[]>;
}
