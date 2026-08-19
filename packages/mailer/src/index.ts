/**
 * `@lfd/mailer` — l'e-mail transactionnel de la suite, **sans framework**.
 *
 * Ce que le paquet apporte : le transport (Resend), la dégradation (mode à
 * blanc, disjoncteur), et les primitives de rendu (échappement, objet
 * assaini, coquille commune).
 *
 * Ce qu'il **n'apporte pas**, volontairement : les gabarits. Ils appartiennent à
 * l'app, qui les déclare dans une carte (`TemplateMap`) et un registre
 * (`TemplateRegistry`) — le paquet ne connaît donc jamais le vocabulaire métier
 * d'une app, et deux apps de la suite partagent le transport sans partager
 * leurs e-mails.
 *
 *     interface Mails { "appointment.booked": { day: string } }
 *     const registry: TemplateRegistry<Mails> = { "appointment.booked": (d) => ... };
 *     const mailer = createMailer({ apiKey, registry, fromAddress });
 *     await mailer.send({ to, template: "appointment.booked", data: { day } });
 */
export { CircuitBreakerMailer } from "./circuit-breaker.js";
export type { CircuitBreakerOptions } from "./circuit-breaker.js";
export { DryRunMailer } from "./dry-run-mailer.js";
export { MailerCircuitOpenError, MailerError, MailerSendError } from "./errors.js";
export type { MailerErrorCategory } from "./errors.js";
export { htmlEscape, renderLayout, sanitiseSubject } from "./html.js";
export type { LayoutInput, MailCta } from "./html.js";
export { createResendMailer, ResendMailer } from "./resend-mailer.js";
export type { ResendLike, ResendMailerDeps } from "./resend-mailer.js";
export { silentLogger } from "./types.js";
export type {
  Mailer,
  MailerLogger,
  MailReceipt,
  RenderedMail,
  SendMailArgs,
  TemplateMap,
  TemplateRegistry,
} from "./types.js";

export { createMailer } from "./create-mailer.js";
export type { CreateMailerConfig } from "./create-mailer.js";
