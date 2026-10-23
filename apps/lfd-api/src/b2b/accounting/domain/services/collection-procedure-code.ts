import type { BillingMode } from "../value-objects/billing-mode.js";
import { closureDayOf } from "./collection-procedure-id.js";

/**
 * **Le code court d'une procédure de prélèvement** — `PRL-<AAMMJJ>-<rythmes>`
 * (Hugo, 2026-10-23 ; doc `procedure-de-prelevement.md`, « Les identifiants
 * courts et les noms de fichiers »). `PRL-261031-BM` : la clôture du
 * 31 octobre 2026 à Paris, que le « deux fois par mois » et le mensuel
 * partagent.
 *
 * CALCULÉ, jamais rangé ni compté : le jour de clôture et ses rythmes
 * désignent déjà la procédure (`collection-procedure-id.ts`). Il est unique
 * tant qu'il n'y a qu'UNE entité émettrice — une seconde le partagerait le
 * même jour, et il faudrait alors lui ajouter l'entité. Il ne la porte pas
 * aujourd'hui, délibérément : un préfixe qui ne distingue rien se lit mal.
 *
 * Les lettres sont TRIÉES (`B` < `H` < `M`), pour qu'une même clôture n'ait
 * qu'une écriture ; une clôture dont aucun rythme n'est connu n'en porte pas
 * (`PRL-261031`) — on n'invente pas un mensuel.
 */
const PREFIX = "PRL";

export const PROCEDURE_RHYTHM_LETTERS: Readonly<Record<BillingMode, string>> = {
  weekly: "H",
  semimonthly: "B",
  monthly: "M",
};

/** Le code de la procédure close à `closesAt`, sous ces rythmes. */
export function procedureCodeOf(closesAt: Date, modes: readonly BillingMode[]): string {
  return procedureCodeOfDay(closureDayOf(closesAt), modes);
}

/** Le même, depuis le jour local (`AAAA-MM-JJ`) de la clôture. */
export function procedureCodeOfDay(closureDay: string, modes: readonly BillingMode[]): string {
  const day = closureDay.slice(2).replaceAll("-", "");
  const letters = [...new Set(modes.map((mode) => PROCEDURE_RHYTHM_LETTERS[mode]))].sort().join("");
  return letters === "" ? `${PREFIX}-${day}` : `${PREFIX}-${day}-${letters}`;
}

/**
 * **Une clôture mutualisée** : le hasard des dates fait clore plusieurs
 * rythmes le même jour (l'hebdomadaire du lundi et le mensuel du 1er) — une
 * seule clôture, un seul lot, et un code à plusieurs lettres.
 */
export function isPooledClosure(closureModes: readonly BillingMode[]): boolean {
  return new Set(closureModes).size > 1;
}
