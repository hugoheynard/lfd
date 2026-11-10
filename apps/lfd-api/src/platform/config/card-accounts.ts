/**
 * **Le registre des comptes d'encaissement par carte** — sa moitié écrite
 * dans le dépôt (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.2).
 *
 * Un compte est un contrat chez un prestataire : un nom stable (persisté sur
 * chaque paiement, `card_payment.payment.account`), un type de prestataire (un
 * adaptateur par TYPE dans le code), et le préfixe de ses trois secrets dans
 * l'environnement. Les SECRETS, eux, ne sont jamais ici : `AppConfig` les lit
 * sous les noms déclarés (`cardAccountSecrets`).
 *
 * 🔴 **Un compte neuf est une décision en quatre endroits**, et chacun est
 * tenu : ce fichier (ses noms, LITTÉRAUX), le `CHECK payment_account_known`
 * de la table (une migration — `lint:card-accounts` compare les deux), et
 * les trois listes que `container/__tests__/runtime-keys.spec.ts` confronte
 * (`env-readers.ts`, `RUNTIME_KEYS` du Worker, la boucle du workflow).
 *
 * `lfc-stripe` pointe sur les trois variables d'avant le registre
 * (`STRIPE_*`), que `stripeConfig()` lit encore pour les liens de paiement de
 * `lafoliecoffee/payments` : une rotation de clé n'a qu'un endroit (§3.1).
 */

/** Les types de prestataire qu'un adaptateur du code sait servir. */
export const CARD_PROVIDER_TYPES = ["stripe"] as const;
export type CardProviderType = (typeof CARD_PROVIDER_TYPES)[number];

/**
 * Les noms d'environnement d'un compte, tirés de son préfixe — le compilateur
 * refuse un nom qui ne le porte pas, et chacun reste écrit EN TOUTES LETTRES
 * plus bas (la porte et la relecture lisent le texte, pas un calcul).
 */
export interface CardAccountEnvNames<P extends string = string> {
  readonly secretKey: `${P}_SECRET_KEY`;
  readonly publishableKey: `${P}_PUBLISHABLE_KEY`;
  readonly webhookSecret: `${P}_WEBHOOK_SECRET`;
}

/** Une entrée du registre. */
export interface CardAccountDeclaration<N extends string = string, P extends string = string> {
  /** Le nom persisté — 🔴 une valeur écrite en base, qui ne se renomme pas. */
  readonly name: N;
  readonly provider: CardProviderType;
  readonly prefix: P;
  readonly env: CardAccountEnvNames<P>;
}

/** Garde de forme : le préfixe et les trois noms s'accordent, à la compilation. */
function cardAccount<const N extends string, const P extends string>(
  declaration: CardAccountDeclaration<N, P>,
): CardAccountDeclaration<N, P> {
  return declaration;
}

/**
 * **Les comptes** — la liste que `lint:card-accounts` confronte au
 * `CHECK payment_account_known` de la dernière migration qui le pose.
 *
 * Demain (décision de Hugo, 2026-11-09) : `lfc-caisse-epargne`, type `lyra`,
 * préfixe `LYRA_CE` — pas avant son adaptateur.
 */
export const CARD_ACCOUNTS = [
  cardAccount({
    name: "lfc-stripe",
    provider: "stripe",
    prefix: "STRIPE",
    env: {
      secretKey: "STRIPE_SECRET_KEY",
      publishableKey: "STRIPE_PUBLISHABLE_KEY",
      webhookSecret: "STRIPE_WEBHOOK_SECRET",
    },
  }),
] as const;

export type CardAccountName = (typeof CARD_ACCOUNTS)[number]["name"];

/**
 * Le compte qu'un webhook sans compte dans son chemin (`POST
 * /payments/webhook`) désigne — jusqu'au resserrement P2, où l'endpoint
 * Stripe sera repointé vers `/payments/webhook/lfc-stripe` (§3.2, §10).
 */
export const UNNAMED_WEBHOOK_ACCOUNT: CardAccountName = "lfc-stripe";

/** Le compte du registre qui porte ce nom, ou `null`. */
export function declaredCardAccount(name: string): (typeof CARD_ACCOUNTS)[number] | null {
  return CARD_ACCOUNTS.find((account) => account.name === name) ?? null;
}

/** Les trois secrets d'un compte, lus dans l'environnement. */
export interface CardAccountSecrets {
  /** Signe les appels serveur — secret. */
  readonly secretKey: string;
  /** Part au navigateur — publique par construction. */
  readonly publishableKey: string;
  /** Authentifie les webhooks reçus — secret. */
  readonly webhookSecret: string;
}

/**
 * **Le compte par défaut d'un type de sujet** — la FORME `default_for` du
 * registre (§3.2).
 *
 * La VALEUR (`order → lfc-stripe`) n'est pas ici : seule la racine de
 * composition connaît à la fois un type de sujet et un compte, et c'est elle
 * qui la pose (`appBootstrap/`, lot P0.c2). Un appelant ne nomme jamais un
 * compte : une chaîne `"lfc-stripe"` dans un bloc métier serait la chaîne en
 * dur que le `CLAUDE.md` § 6 interdit.
 */
export abstract class CardAccountDefaults {
  /** Le compte qui encaisse ce type de sujet, ou `null` s'il n'en a pas. */
  abstract accountFor(subjectType: string): CardAccountName | null;
}

/** Les défauts posés par une table — la forme que la racine de composition remplit. */
export class DeclaredCardAccountDefaults extends CardAccountDefaults {
  constructor(private readonly bySubjectType: Readonly<Record<string, CardAccountName>>) {
    super();
  }

  accountFor(subjectType: string): CardAccountName | null {
    return Object.hasOwn(this.bySubjectType, subjectType)
      ? (this.bySubjectType[subjectType] ?? null)
      : null;
  }
}
