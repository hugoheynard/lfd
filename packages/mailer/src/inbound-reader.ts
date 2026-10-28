import { Resend } from "resend";

import { MailerReceiveError } from "./errors.js";

/**
 * **Un e-mail REÇU**, réduit à ce que l'app en lit : l'expéditeur tel
 * qu'écrit (`Jean <jean@x.fr>`), l'objet, le texte et le HTML, les en-têtes,
 * et les pièces jointes DÉCRITES — jamais leur contenu.
 */
export interface ReceivedMail {
  readonly id: string;
  readonly from: string;
  readonly subject: string;
  readonly text: string | null;
  readonly html: string | null;
  /** Noms dans leur casse d'origine ; vide quand Resend n'en rend pas. */
  readonly headers: Readonly<Record<string, string>>;
  readonly attachments: readonly ReceivedAttachment[];
}

export interface ReceivedAttachment {
  /** Vide quand le message n'en donne pas. */
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

/**
 * La part de la réception Resend qu'on consomme : `emails.receiving.get`
 * (SDK `resend` 6.18.1, lu le 2026-10-28 dans `dist/index.d.mts`). Typée ici
 * pour qu'un test substitue un double sans tirer les types du SDK.
 */
export interface ResendReceivingLike {
  readonly emails: {
    readonly receiving: {
      get: (id: string) => Promise<{
        data: {
          id: string;
          from: string;
          subject: string;
          text: string | null;
          html: string | null;
          headers: Record<string, string> | null;
          attachments: {
            filename: string | null;
            size: number;
            content_type: string;
          }[];
        } | null;
        error: { message: string; name?: string; statusCode?: number | null } | null;
      }>;
    };
  };
}

/**
 * **Lit un e-mail reçu chez Resend** (plan
 * `documentation/demandes-client/plan-reponses-par-e-mail.md`, §3).
 *
 * Toute panne — le SDK qui jette, ou Resend qui répond `error` — sort sous
 * UNE forme : `MailerReceiveError`. L'appelant la laisse remonter : le
 * webhook échoue, et Resend le rejoue.
 */
export class ResendInboundReader {
  constructor(private readonly client: ResendReceivingLike) {}

  async read(id: string): Promise<ReceivedMail> {
    let result: Awaited<ReturnType<ResendReceivingLike["emails"]["receiving"]["get"]>>;
    try {
      result = await this.client.emails.receiving.get(id);
    } catch (error) {
      throw new MailerReceiveError(
        "Le fournisseur d'e-mail est injoignable : message reçu non lu.",
        error,
      );
    }
    if (result.error !== null || result.data === null) {
      const reason = result.error?.message ?? "réponse vide";
      throw new MailerReceiveError(`Resend n'a pas rendu le message reçu ${id} : ${reason}`);
    }
    const mail = result.data;
    return {
      id: mail.id,
      from: mail.from,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: mail.headers ?? {},
      attachments: mail.attachments.map((file) => ({
        filename: file.filename ?? "",
        contentType: file.content_type,
        sizeBytes: file.size,
      })),
    };
  }
}

/**
 * Le client Resend sous notre contrat étroit ; la surcharge déclare la
 * signature publique sans assertion de type (cf. `resend-mailer.ts`).
 */
function receivingClient(apiKey: string): ResendReceivingLike;
function receivingClient(apiKey: string): object {
  return new Resend(apiKey);
}

/** Le lecteur réel, pour une clé. */
export function createResendInboundReader(apiKey: string): ResendInboundReader {
  return new ResendInboundReader(receivingClient(apiKey));
}
