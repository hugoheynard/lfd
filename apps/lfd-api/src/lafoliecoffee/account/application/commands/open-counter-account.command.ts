import type { ContactDetailsInput } from "../../domain/value-objects/contact-details.js";

/**
 * **Ouvrir un compte pro au comptoir** (`plan-comptes-du-comptoir.md`, § 3.1,
 * § 3.2, § 3.5) : un nom d'usage et un contact joignable, rien d'autre — ni
 * SIRET, ni adresse, ni RIB. Le compte naît `counter_opened`, au mensuel et
 * au virement ; le commerce le convertit ensuite.
 *
 * `identitySeen` est la case « J'ai vu une preuve d'identité » : non
 * bloquante, attestée au nom de `staffUserId` (une trace, pas une
 * autorisation — la porte est le guard).
 */
export class OpenCounterAccountCommand {
  constructor(
    readonly enseigne: string,
    readonly contact: ContactDetailsInput,
    readonly identitySeen: boolean,
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un second clic n'ouvre pas un second compte. */
    readonly intentKey: string,
  ) {}
}
