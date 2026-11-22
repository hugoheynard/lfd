/** Une origine du registre, sa racine publique résolue (`null` : non configurée). */
export interface PayLinkOriginEntry {
  readonly name: string;
  readonly label: string;
  readonly publicRoot: string | null;
}

/**
 * **Le registre des origines**, tel que les liens le lisent : l'application
 * qui demande un lien, et la racine où sa page `/payer/<jeton>` est montée.
 */
export abstract class PayLinkOrigins {
  /** L'origine de ce nom, ou `null` si le registre ne la déclare pas. */
  abstract find(name: string): PayLinkOriginEntry | null;
}
