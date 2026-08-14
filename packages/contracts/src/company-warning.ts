import { z } from "zod";

/**
 * Les **avertissements de dossier** d'un compte client — ce qui appelle un
 * geste du staff sans forcément empêcher quoi que ce soit.
 *
 * À ne pas confondre avec les **alertes de commande** (`alert.ts`), qui parlent
 * d'un panier ; celles-ci parlent d'un dossier.
 *
 * - `mandat_absent` — un règlement différé a été **accordé** et aucun mandat
 *   SEPA actif ne permet de prélever. C'est le plus grave : on a promis un
 *   crédit qu'on ne peut pas encaisser.
 * - `activation_bloquee` — le compte est en attente et il lui manque de quoi
 *   ouvrir. Le client ne peut pas commander : du chiffre à l'arrêt.
 * - `attente_prolongee` — en attente depuis longtemps. Rien ne manque forcément :
 *   c'est le dossier que personne n'a repris.
 * - `kbis_a_verifier` — l'extrait est déposé, personne ne l'a ouvert. Ne bloque
 *   rien (convention interne), et c'est précisément pour ça qu'il faut le voir
 *   quelque part.
 */
export const companyWarningKindSchema = z.enum([
  "mandat_absent",
  "activation_bloquee",
  "attente_prolongee",
  "kbis_a_verifier",
]);
export type CompanyWarningKind = z.infer<typeof companyWarningKindSchema>;

/**
 * Un avertissement, tel que la galerie le rend : **un compte, un motif**.
 *
 * Deux manques sur la même société font deux cartes. Les fusionner obligerait
 * la carte à porter une liste, donc à choisir un geste parmi plusieurs — et la
 * répétition du nom EST le signal.
 */
export const companyWarningSchema = z.object({
  kind: companyWarningKindSchema,
  /**
   * Depuis quand, en ISO — c'est l'âge qui fait monter l'urgence, pas le motif.
   * `null` quand le fait n'a pas de date propre (un mandat qui n'existe pas n'a
   * pas de date) : la carte se tait alors, plutôt que d'inventer un compteur.
   */
  since: z.string().nullable(),
});
export type CompanyWarning = z.infer<typeof companyWarningSchema>;
