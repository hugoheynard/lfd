import type { HandoverVia } from "../domain/services/handover.js";

/**
 * La colonne `handed_over_via` → le `via` du domaine.
 *
 * La colonne est un `text` : Postgres accepterait n'importe quoi, et une ligne
 * écrite à la main hors du domaine ne doit pas devenir un `via` inventé en
 * traversant le mapper. Les trois valeurs connues se relisent TELLES QUELLES —
 * `deposit` compris, connu des lecteurs avant que personne ne l'écrive
 * (`a-la-porte.md`, AP-D8). Tout le reste retombe sur `manual`,
 * l'attestation la plus FAIBLE ; jamais sur `scan` : se tromper vers le bas est
 * honnête.
 *
 * Un seul mapper pour les deux lecteurs du retrait (le dépôt qui réhydrate,
 * le lecteur des attestations) : ils ramenaient chacun l'inconnu à `manual`
 * de leur côté, et un dépôt relu serait devenu une « saisie à la main » —
 * que `republish()` aurait propagée au commerce.
 */
export function handoverViaOf(raw: string): HandoverVia {
  switch (raw) {
    case "scan":
    case "deposit":
      return raw;
    default:
      return "manual";
  }
}
