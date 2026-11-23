import { isIP } from "node:net";

import { ExportReaderKeyIpInvalidError } from "../errors/export-reader-key-errors.js";

/**
 * **Les adresses d'où une clé peut lire** (plan de l'export des ventes, § 6.5).
 * Facultatif par clé : une liste vide admet toute adresse — une IP de box qui
 * change rendrait la restriction inutilisable, d'où l'option.
 *
 * Une adresse se compare telle quelle, en minuscules : ni plage ni masque. Une
 * adresse illisible est refusée à la création plutôt que gardée pour n'admettre
 * personne.
 */
export class AdmittedAddresses {
  private constructor(readonly values: readonly string[]) {}

  /** Lit une liste saisie : espaces retirés, doublons ignorés, chaque adresse vérifiée. */
  static of(raw: readonly string[]): AdmittedAddresses {
    const normalized = raw.map(normalize);
    for (const ip of normalized) {
      if (isIP(ip) === 0) {
        throw new ExportReaderKeyIpInvalidError(ip);
      }
    }
    return new AdmittedAddresses([...new Set(normalized)]);
  }

  /** Vide : toute adresse. Sinon, l'adresse vue doit être l'une d'elles. */
  admits(ip: string): boolean {
    return this.values.length === 0 || this.values.includes(normalize(ip));
  }
}

function normalize(ip: string): string {
  return ip.trim().toLowerCase();
}
