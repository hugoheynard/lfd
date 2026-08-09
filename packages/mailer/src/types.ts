/**
 * Le contrat du mailer — **sans framework, sans domaine**.
 *
 * L'API publique est volontairement **par gabarit** : l'appelant ne fabrique
 * jamais de HTML ni d'objet d'e-mail. Il choisit un gabarit et passe les données
 * typées que ce gabarit attend. Envoyer un mail devient une décision métier
 * (« prévenir le commercial »), pas une décision de mise en page.
 *
 * La différence avec un mailer d'application : **la carte des gabarits appartient
 * à l'app**, pas au paquet. Le paquet fournit la machinerie (rendu, transport,
 * dégradation) et prend la carte en paramètre de type. Deux apps de la suite
 * peuvent donc partager ce transport sans partager leurs e-mails.
 */

/** Un e-mail rendu, prêt à partir. */
export interface RenderedMail {
  readonly subject: string;
  readonly html: string;
}

/**
 * La **carte des gabarits** d'une app : nom du gabarit → forme de ses données.
 * C'est le paramètre de type de tout le reste.
 *
 *     interface B2bMails {
 *       "appointment.booked": { contactName: string; day: string };
 *     }
 *
 * La contrainte est `object` et **non** `Record<string, unknown>` : une
 * `interface` TypeScript n'a pas de signature d'index implicite, et la contrainte
 * la plus naturelle rejetterait donc la façon dont tout le monde écrit sa carte,
 * avec un message d'erreur incompréhensible. Les clés restent typées par
 * `keyof M` — on ne perd rien.
 */
export type TemplateMap = object;

/**
 * Le **registre** : un rendu par gabarit de la carte.
 *
 * Étant un `Record` sur les clés de la carte, il est **exhaustif par
 * construction** — déclarer un gabarit sans écrire son rendu ne compile pas.
 * C'est ce qui remplace le `switch` exhaustif d'un mailer mono-application.
 */
export type TemplateRegistry<M extends TemplateMap> = {
  readonly [K in keyof M]: (data: M[K]) => RenderedMail;
};

/** Ce qu'on demande d'envoyer : un destinataire, un gabarit, ses données. */
export interface SendMailArgs<M extends TemplateMap, K extends keyof M = keyof M> {
  /** Destinataire unique (une adresse RFC 5321). */
  readonly to: string;
  readonly template: K;
  readonly data: M[K];
  /**
   * En-têtes MIME supplémentaires (`List-Unsubscribe`…). Un adaptateur qui ne
   * sait pas les poser les ignore.
   */
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * Clé d'idempotence côté fournisseur. Quand elle est posée, une **reprise du
   * même envoi** (relance après un délai d'attente que le fournisseur avait en
   * fait accepté) est dédoublonnée chez lui — le destinataire ne reçoit pas deux
   * fois le même e-mail. Ignorée par les adaptateurs qui ne savent pas dédoublonner.
   */
  readonly idempotencyKey?: string;
}

/**
 * Le port. Une app injecte **ça**, jamais un adaptateur.
 *
 * `enabled` dit si un vrai fournisseur est branché : c'est ce qui permet à un
 * appelant de savoir qu'il est en mode journalisé, et à un test de l'affirmer.
 */
export interface Mailer<M extends TemplateMap> {
  readonly enabled: boolean;
  send<K extends keyof M>(args: SendMailArgs<M, K>): Promise<void>;
}

/**
 * Le journal, réduit à ce que le mailer écrit vraiment. Port étroit **exprès** :
 * c'est ce qui évite au paquet de dépendre de Nest, de Pino ou d'une autre app.
 */
export interface MailerLogger {
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
}

/** Journal muet — le défaut, pour qu'un test n'ait rien à brancher. */
export const silentLogger: MailerLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
