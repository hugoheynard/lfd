/**
 * **Le coffre du jeton d'un lien** (§2.1) : le jeton n'est jamais rangé en
 * clair. Son empreinte le retrouve, son scellé le rend au staff qui recopie
 * le lien.
 */
export abstract class PayLinkTokenVault {
  /** L'empreinte déterministe (HMAC-SHA-256) — la clé de recherche. */
  abstract fingerprint(token: string): string;

  /** Le scellé, non déterministe. */
  abstract seal(token: string): string;

  /** Rouvre un scellé. */
  abstract open(sealed: string): string;
}
