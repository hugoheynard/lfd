import { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import type { MintBlocker } from "../services/mint-blockers.js";

/**
 * Chaque mention manquante, **et où la saisir** — lu par du personnel comme
 * par un client, ni l'un ni l'autre n'ayant le code sous les yeux.
 */
const MENTION_LABELS: Readonly<Record<MintBlocker, string>> = {
  bank_account_missing: "le RIB du compte à débiter (à saisir dans « RIB »)",
  issuer_missing:
    "une entité émettrice unique et complète (Comptabilité › Entités juridiques : aucune n'est active, elle est incomplète, ou plusieurs le sont)",
  company_name_missing: "la raison sociale de la société (à saisir dans « Identité légale »)",
  siren_missing: "le SIREN de la société (à saisir dans « Identité légale »)",
  holder_legal_form_missing:
    "la civilité ou forme juridique du titulaire du compte (à saisir dans « RIB »)",
};

/**
 * On a voulu frapper un mandat auquel il manque une **mention obligatoire** —
 * **409**.
 *
 * Une RUM frappée sur un papier incomplet est une référence perdue : la banque
 * du débiteur rejette un mandat interentreprises sans SIREN, et le rejet arrive
 * après signature. Refuser ici, avant tout tirage, coûte un clic.
 *
 * `blockers` porte les codes que rend aussi la lecture (`mintBlockers`) : ils
 * viennent de la même fonction, `mintBlockersOf`.
 *
 * Remplace, pour la frappe, `MandateWithoutBankAccountError` et `NoIssuerError`
 * (2026-09-15) : le RIB et l'émetteur sont deux mentions parmi les autres, et
 * les dire une par une ferait recommencer autant de fois qu'il en manque.
 */
export class MandateMentionsMissingError extends BusinessError {
  constructor(readonly blockers: readonly MintBlocker[]) {
    super(
      "payments.mandate.mentions_missing",
      `Le mandat ne peut pas être frappé : il manque ${blockers.map((blocker) => MENTION_LABELS[blocker]).join(" ; ")}. ` +
        "Complétez ces mentions, puis recommencez.",
    );
  }
}
