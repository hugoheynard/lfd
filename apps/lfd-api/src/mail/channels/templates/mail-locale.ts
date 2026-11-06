import type { ContentLocale } from "@lfd/contracts";

/**
 * La langue de repli.
 *
 * ⚠️ **Rien ne choisit encore la langue d'un client** : `User` ne porte pas de
 * préférence, et l'inventer depuis l'en-tête `Accept-Language` d'une requête
 * HTTP donnerait la langue du NAVIGATEUR de celui qui commande, pas celle dans
 * laquelle la personne veut être écrite. Tant que la préférence n'existe pas,
 * l'appelant passe `fr` — et le jour où elle existera, il n'y aura qu'un
 * paramètre à remplir, pas un gabarit à traduire.
 */
export const DEFAULT_MAIL_LOCALE: ContentLocale = "fr";
