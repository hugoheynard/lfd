/**
 * Port **la source des secrets de clé d'export** : 32 octets d'aléa
 * cryptographique, rendus sûrs en en-tête (plan de l'export des ventes,
 * § 6.1).
 *
 * Distinct de `SecretGenerator` (plateforme), qui rend 130 bits en base32
 * dictable pour un jeton qu'on lit au téléphone : une clé d'export se colle,
 * elle ne se dicte pas, et le plan lui demande 256 bits.
 */
export abstract class ExportKeySecretSource {
  abstract next(): string;
}
