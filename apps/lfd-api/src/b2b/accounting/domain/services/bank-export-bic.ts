import { Bic } from "../value-objects/bic.js";

/** Le motif qui écarte d'un export pour la banque un compte sans BIC. */
export const NO_BIC_EXCLUSION = "no_bic";

/** Le BIC d'un compte, ou pourquoi le compte ne part pas à la banque. */
export type BankExportBic =
  | { readonly bic: Bic; readonly exclusion: null }
  | { readonly bic: null; readonly exclusion: typeof NO_BIC_EXCLUSION };

/**
 * **Un compte sans BIC ne part pas à la banque** — ni dans l'export des
 * comptes, ni dans celui des mandats : le fichier CENET l'exige, là où le
 * lot de prélèvement se contente de `NOTPROVIDED`. Une seule règle, lue par
 * les deux lecteurs (sortie de leurs adaptateurs le 2026-10-23).
 *
 * @throws {InvalidBicError} une valeur rangée qui n'est pas un BIC.
 */
export function bankExportBicOf(stored: string): BankExportBic {
  const bic = Bic.fromStored(stored);
  return bic === null ? { bic: null, exclusion: NO_BIC_EXCLUSION } : { bic, exclusion: null };
}
