import { z } from "zod";

/**
 * **Le contenu de plateforme** — les textes de la vitrine, tenus par le staff.
 *
 * Ils vivaient compilés dans le bundle du front client, en trois dictionnaires
 * `fr/en/it.ts`. Un mot à corriger demandait un développeur, une revue et un
 * déploiement ; et les trois langues dérivaient dès que l'une était modifiée
 * seule. Ce contrat les sort du code sans les sortir du versionnage : ils sont
 * une DONNÉE, éditée depuis le back-office et servie par l'API.
 *
 * **Tout est en trois langues, sans exception.** Une langue manquante n'est pas
 * un cas à gérer côté rendu : le schéma exige les trois, et le serveur refuse un
 * enregistrement incomplet. C'est ce qui garantit qu'aucun écran ne se retrouve
 * à choisir entre afficher du français à un italien et n'afficher rien.
 *
 * ⚠️ Ce qui n'est PAS ici : l'identité légale (raison sociale, capital, SIRET,
 * RCS, TVA, téléphone, e-mail). Ce ne sont pas des textes mais des mentions
 * réglementaires — elles ne se traduisent pas, elles ne se rédigent pas, et
 * elles n'ont rien à faire dans un écran d'édition de copie.
 */

/** Les trois langues de la vitrine. L'ordre est celui du sélecteur. */
export const contentLocales = ["fr", "en", "it"] as const;
export const contentLocaleSchema = z.enum(contentLocales);
export type ContentLocale = z.infer<typeof contentLocaleSchema>;

/** Une maison, au pied de page. L'adresse est COMPLÈTE : on la copie dans un GPS. */
export const footerHouseSchema = z.object({
  name: z.string().trim().min(1).max(80),
  street: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  hours: z.string().trim().min(1).max(120),
});
export type FooterHouse = z.infer<typeof footerHouseSchema>;

/** Un lien du pied de page. Le libellé seul tant que les destinations n'existent pas. */
export const footerLinkSchema = z.string().trim().min(1).max(120);

/**
 * Le pied de page dans UNE langue : quatre sections verticales, puis le bandeau
 * légal. C'est exactement ce que la page montre, dans l'ordre où elle le montre
 * — un écran d'édition qui réordonne ce que le rendu empile fait deviner au
 * rédacteur ce qu'il est en train de changer.
 */
export const footerLocaleContentSchema = z.object({
  /** ① La marque : ce qu'on fabrique, et à quelle heure c'est livré. */
  brand: z.object({
    tagline: z.string().trim().min(1).max(80),
    pitch: z.string().trim().min(1).max(400),
  }),
  /** ② Les maisons. */
  houses: z.object({
    head: z.string().trim().min(1).max(60),
    items: z.array(footerHouseSchema).min(1).max(6),
  }),
  /** ③ Commander — la navigation par INTENTION, pas par rubrique. */
  order: z.object({
    head: z.string().trim().min(1).max(60),
    links: z.array(footerLinkSchema).min(1).max(10),
  }),
  /** ④ Aide et contact. */
  help: z.object({
    head: z.string().trim().min(1).max(60),
    phoneHours: z.string().trim().min(1).max(120),
    links: z.array(footerLinkSchema).min(1).max(10),
  }),
  /** Le bandeau légal — la barre qui ferme le pied. */
  legal: z.object({
    pay: z.string().trim().min(1).max(200),
    vat: z.string().trim().min(1).max(200),
    links: z.array(footerLinkSchema).min(1).max(10),
  }),
});
export type FooterLocaleContent = z.infer<typeof footerLocaleContentSchema>;

/**
 * Le pied de page dans les trois langues.
 *
 * Un objet indexé par langue plutôt qu'un tableau : c'est ce qui rend
 * impossible d'en enregistrer deux fois une et d'en oublier une autre, sans
 * qu'aucun code n'ait à le vérifier.
 */
export const footerContentSchema = z.object({
  fr: footerLocaleContentSchema,
  en: footerLocaleContentSchema,
  it: footerLocaleContentSchema,
});
export type FooterContent = z.infer<typeof footerContentSchema>;

/** Ce que le staff envoie pour enregistrer le pied de page. */
export const footerContentPayloadSchema = footerContentSchema;
export type FooterContentPayload = FooterContent;

/**
 * Le pied de page tel qu'il est renvoyé, avec de quoi savoir s'il a bougé.
 *
 * `revision` monte à chaque enregistrement. Le front client s'en sert pour ne
 * pas re-rendre à l'identique, et le back-office pour dire au rédacteur que
 * quelqu'un d'autre a écrit entre-temps.
 */
export interface FooterContentView {
  readonly content: FooterContent;
  readonly revision: number;
  /** ISO 8601. Quand, et par qui — le nom, pas l'identifiant. */
  readonly updatedAt: string;
  readonly updatedBy: string | null;
}
