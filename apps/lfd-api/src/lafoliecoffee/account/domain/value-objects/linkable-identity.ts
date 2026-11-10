import { LoginMethodNotLinkableError } from "../errors/account-errors.js";

/**
 * Les fournisseurs qu'un client peut rattacher à son compte depuis le profil :
 * ceux que l'écran propose, et eux seuls.
 *
 * 🔴 **La liste EST le mur** (2026-10-09). Depuis que le rattachement désigne
 * l'identité secondaire par `{ provider, user_id }` — et non plus par le jeton,
 * qu'Auth0 refusait (audience de la SPA ≠ client de gestion) —, c'est NOUS qui
 * disons quel compte absorber, et le client de gestion peut en absorber
 * n'importe lequel. `auth0|…` désigne aussi bien un client qu'un membre du
 * staff (`lfc-staff`, même tenant) : l'admettre permettrait d'absorber un
 * compte staff, qui ne produirait plus jamais de jeton. `email|…` n'est pas
 * proposé à l'écran. Ni l'un ni l'autre n'entre donc ici.
 */
export const LINKABLE_PROVIDERS: readonly string[] = ["google-oauth2", "facebook"];

/**
 * Le sujet secondaire **vérifié**, découpé une fois et une seule.
 *
 * La découpe se fait au PREMIER `|` : un identifiant de fournisseur peut en
 * contenir (`oauth2|x|y`), le préfixe jamais. Toute lecture `provider` /
 * `userId` d'un sujet rattaché passe par ici — une seconde découpe ailleurs
 * pourrait désigner un autre compte, et rien chez le fournisseur ne le
 * refuserait.
 */
export class LinkableIdentity {
  private constructor(
    readonly subject: string,
    readonly provider: string,
    readonly userId: string,
  ) {}

  /** @throws {LoginMethodNotLinkableError} sujet mal formé, ou fournisseur hors liste. */
  static of(subject: string): LinkableIdentity {
    const cut = subject.indexOf("|");
    const provider = cut < 0 ? "" : subject.slice(0, cut);
    const userId = cut < 0 ? "" : subject.slice(cut + 1);
    if (userId === "" || !LINKABLE_PROVIDERS.includes(provider)) {
      throw new LoginMethodNotLinkableError();
    }
    return new LinkableIdentity(subject, provider, userId);
  }
}
