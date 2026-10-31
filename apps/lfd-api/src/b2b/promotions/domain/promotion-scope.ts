/**
 * **La portée d'éligibilité d'une promotion** — la règle vit dans
 * `@lfd/contracts/promotion-scope` depuis le 2026-10-31 : le compteur du
 * back-office la rejoue, et une seule copie ne peut pas diverger du moteur.
 * Ce module la réexporte pour que le domaine garde son vocabulaire.
 */
export * from "@lfd/contracts/promotion-scope";
