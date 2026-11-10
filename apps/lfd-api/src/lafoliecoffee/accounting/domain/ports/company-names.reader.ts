/**
 * La raison sociale de sociétés, par leur identifiant — ce qui s'imprime en
 * `Dbtr/Nm` d'un export de mandats et dans les messages qui nomment un client.
 *
 * Sorti de `CollectionCandidatesReader` le 2026-10-24 (ISP) : les exports de
 * mandats et les gestes sur un compte bancaire n'appelaient que cette méthode
 * d'un port à cinq (vérifié le 2026-10-24). Même adaptateur (`useExisting`),
 * aucune requête recopiée.
 */
export abstract class CompanyNamesReader {
  /** Les sociétés introuvables sont absentes de la carte : à l'appelant de nommer le repli. */
  abstract companyNames(companyIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
