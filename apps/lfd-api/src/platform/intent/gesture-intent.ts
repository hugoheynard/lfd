/**
 * **Une intention d'un geste** : la clé que l'écran fabrique à l'ouverture
 * d'un dialogue et renvoie à chaque clic (plan
 * `documentation/mail/plan-service-e-mails.md`, revue avec
 * Hugo, cas 4). Le serveur s'en sert comme identifiant du geste : un double
 * clic ne réexécute rien, et un vrai renvoi fabrique une clé neuve.
 *
 * Technique pure : `gesture` et `subject` sont des valeurs opaques, le bloc
 * qui les pose sait ce qu'elles désignent.
 */
export interface GestureIntent {
  /** L'identifiant opaque de qui agit : une clé ne se partage pas entre deux personnes. */
  readonly actorId: string;
  /** La clé d'intention envoyée par l'écran. */
  readonly key: string;
  /** Le nom stable du geste (`account.attach-holder`). */
  readonly gesture: string;
  /**
   * Ce que le geste vise, en identifiants opaques (`<société>`) — jamais une
   * adresse. Une clé rejouée sur un AUTRE sujet est refusée, pas rejouée.
   */
  readonly subject: string;
}

/**
 * Ce qu'un geste rend, tel qu'il est gardé et relu au rejeu : un objet plat,
 * sans donnée personnelle (des identifiants, des booléens, des issues).
 */
export type IntentRecord = Readonly<Record<string, string | boolean | null>>;

/** L'issue d'une tentative de réclamer une intention. */
export type IntentClaim =
  /** Personne ne la tenait, ou son bail avait expiré : le geste s'exécute. */
  | { readonly kind: "claimed" }
  /** Déjà aboutie, sur le même geste et le même sujet : on rend son résultat. */
  | { readonly kind: "replayed"; readonly result: IntentRecord }
  /** Déjà servie pour AUTRE CHOSE : ce n'est pas une répétition. */
  | { readonly kind: "mismatch" }
  /** Réclamée à l'instant par un autre appel, encore en vol. */
  | { readonly kind: "in_flight" };

/**
 * **Le registre des intentions** — la forme de `OrderIdempotencyStore`
 * (passation d'une commande), sortie du commerce pour servir tous les gestes
 * du staff qui envoient un e-mail.
 *
 * C'est la BASE qui arbitre deux clics simultanés (index unique
 * `(actor_id, key)`), jamais une lecture suivie d'une écriture.
 */
export abstract class GestureIntentLedger {
  /** Réclame l'intention ; une intention non résolue plus vieille que le bail est reprise. */
  abstract claim(intent: GestureIntent, now: Date): Promise<IntentClaim>;

  /** Le geste a abouti : son résultat est gardé, et rendu à tout rejeu. */
  abstract resolve(intent: GestureIntent, result: IntentRecord, now: Date): Promise<void>;

  /** Le geste a échoué : l'intention est rendue, un nouvel essai réexécute. */
  abstract release(intent: GestureIntent): Promise<void>;
}

/**
 * **Le bail d'une intention réclamée**, en millisecondes : deux minutes, plus
 * long que le geste le plus lent (fournisseur d'identité, puis Resend), plus
 * court que la patience de qui recharge l'écran. Repris à la lecture, par la
 * tentative suivante, comme la passation.
 */
export const GESTURE_INTENT_LEASE_MS = 2 * 60 * 1_000;
