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

/**
 * **L'accusé d'un envoi** — ce que le fournisseur en dit sur le moment.
 *
 * `providerId` est l'identifiant que Resend attribue au message. C'est la
 * SEULE clé qui relie un envoi aux événements qui le suivront (délivré, rejeté,
 * plainte) : sans elle, un webhook peut dire qu'un e-mail a rebondi, jamais
 * lequel ni pour qui. Le jeter était le rendre muet d'avance.
 *
 * `null` quand aucun fournisseur n'est branché (mode à blanc) : il n'y a pas
 * d'envoi, donc pas d'identifiant — et surtout pas un identifiant inventé, qui
 * ne correspondrait à rien le jour où on essaierait de le rapprocher.
 */
export interface MailReceipt {
  readonly providerId: string | null;
}

/**
 * Une **pièce jointe en ligne** — une image que le corps HTML référence par
 * `cid:`.
 *
 * ## Pourquoi ce détour, et pas un `data:` URI
 *
 * Un QR dans un e-mail ne peut pas être une image encodée dans l'attribut
 * `src` : **Gmail supprime les `data:` URI**, et Outlook (moteur Word) ne les
 * rend pas davantage. Ça marche chez celui qui teste — souvent Apple Mail — et
 * c'est un carré vide chez le destinataire. Une panne qui ne se voit pas à la
 * relecture est pire qu'une panne franche.
 *
 * Une URL distante marcherait, au prix de deux choses : les images distantes
 * sont bloquées par défaut dans plusieurs clients, et **Gmail va chercher
 * l'image lui-même** par son proxy — ce qui y ferait transiter tout secret
 * présent dans l'URL.
 *
 * La pièce jointe en ligne n'a ni l'un ni l'autre défaut : elle voyage DANS le
 * message.
 *
 * ## Ce qui doit accompagner une image, toujours
 *
 * Un client qui bloque les images doit rester utilisable. Le gabarit pose donc
 * un `alt` qui dit la même chose que l'image, et un repli textuel dessous quand
 * l'information est indispensable — un code qu'on peut lire à voix haute.
 */
export interface MailAttachment {
  /** Nom du fichier, tel qu'un client qui l'expose le montrera. */
  readonly filename: string;
  /** Le contenu, en **base64** — un e-mail ne transporte pas d'octets bruts. */
  readonly contentBase64: string;
  /**
   * L'identifiant que le HTML référence par `cid:`. Posé ⇒ la pièce est **en
   * ligne** et non listée comme un fichier à télécharger.
   *
   * Absent ⇒ pièce jointe ordinaire, celle qu'on ouvre à part.
   */
  readonly contentId?: string;
  /** Type MIME. Déduit du nom par le fournisseur s'il manque — on le pose. */
  readonly contentType?: string;
}

/** Un e-mail rendu, prêt à partir. */
export interface RenderedMail {
  readonly subject: string;
  readonly html: string;
  /**
   * Les images en ligne du corps, s'il y en a. Absent pour l'immense majorité
   * des e-mails — un message qui n'a rien à montrer n'a rien à joindre.
   *
   * Les adaptateurs qui ne savent pas les porter les **ignorent** : le message
   * part alors sans son image, avec son `alt` et son repli textuel. Perdre
   * l'illustration vaut mieux que perdre l'e-mail.
   */
  readonly attachments?: readonly MailAttachment[];
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
  send<K extends keyof M>(args: SendMailArgs<M, K>): Promise<MailReceipt>;
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
