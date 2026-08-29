import type { AccountView } from "@lfd/contracts";

/**
 * Les crédits **accordés** (miroir de l'enum Prisma `DeferredTerm`). C'est un
 * réglage **toujours présent** de l'entreprise — jamais absent —, défaut « à la
 * commande » (`per_order`). Le terme **convenu** n'est écrit que par le staff ;
 * le client exprime un souhait via une **demande** (cf. `requestedPaymentTerm`).
 */
// Le type vit dans les contrats : les deux frontends le lisent aussi.
export type { DeferredTerm } from "@lfd/contracts";

/** Le profil de la personne, tel que l'écran « Mon profil » l'affiche. */
/**
 * Les vues du compte vivent dans `@lfd/contracts` : la boutique en rendait sa
 * propre copie, champ pour champ et commentaire pour commentaire. Deux modèles
 * qu'aucun compilateur ne rapproche finissent par diverger.
 *
 * On les RÉ-EXPORTE ici pour que rien du domaine ne bouge : le port reste le
 * port, il ne possède simplement plus la forme.
 */
export type { ProfileView, ContactView, KbisView, CompanyView, AccountView } from "@lfd/contracts";

/**
 * Port de **lecture** du compte. Côté requête, on assume de renvoyer une vue
 * dénormalisée : aucun agrégat n'est reconstruit, aucune règle n'est rejouée —
 * une lecture ne mute rien et n'a donc rien à protéger.
 */
export abstract class AccountReader {
  abstract read(userId: string): Promise<AccountView | null>;
}
