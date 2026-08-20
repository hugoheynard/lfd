import { z } from "zod";

/**
 * Contrat des **notifications poussées** vers le back-office.
 *
 * Web Push (norme du W3C), et non APNs : le back-office est déjà une application
 * web ajoutée à l'écran d'accueil, iOS la sert depuis la 16.4, et Android depuis
 * toujours. Le canal natif aurait exigé un compte Apple payant pour la seule
 * capacité `Push Notifications`, et une coque à re-signer.
 *
 * Ce qui transite est **l'abonnement du navigateur**, tel qu'il le fabrique :
 * une URL de service de push et deux clés. Nous ne les inventons pas, nous les
 * stockons — d'où la validation par forme plutôt que par contenu.
 */

/**
 * Un abonnement, dans la forme exacte que rend `PushSubscription.toJSON()`.
 *
 * `endpoint` identifie **l'installation**, pas la personne : le même compte sur
 * deux téléphones fait deux abonnements, et c'est voulu — on prévient l'appareil
 * qu'on a sous la main.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    /** Clé publique de la courbe P-256 du navigateur, en base64url. */
    p256dh: z.string().min(1).max(255),
    /** Secret d'authentification, en base64url. */
    auth: z.string().min(1).max(255),
  }),
});

export type PushSubscriptionPayload = z.infer<typeof pushSubscriptionSchema>;

/** Le désabonnement ne porte que l'identifiant d'installation. */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
});

export type PushUnsubscribePayload = z.infer<typeof pushUnsubscribeSchema>;

/**
 * Ce que le navigateur doit connaître pour s'abonner.
 *
 * `publicKey` est **publique par construction** : elle voyage dans chaque
 * abonnement et sert au service de push à vérifier notre signature. `null` quand
 * le serveur n'a pas de paire VAPID — l'écran le dit alors, plutôt que d'offrir
 * un bouton qui échouerait.
 */
export interface PushCapability {
  readonly publicKey: string | null;
}
