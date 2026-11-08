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
export {
  MailerCircuitOpenError,
  MailerError,
  MailerIdempotencyInFlightError,
  MailerInvalidReplyToError,
  MailerRateLimitedError,
  MailerReceiveError,
  MailerSendError,
} from "./errors.js";
export type { MailerErrorCategory } from "./errors.js";
export {
  effectiveSectionOrder,
  htmlEscape,
  isLayoutSectionId,
  LAYOUT_SECTIONS,
  BODY_STYLE,
  BRAND,
  BUTTON_STYLE,
  CALLOUT_COLORS,
  CALLOUT_TEXT_STYLE,
  CTA_SPACING_STYLE,
  FOOTER_STYLE,
  MUTED_TEXT_STYLE,
  OUTLINE_BUTTON_STYLE,
  renderLayout,
  RULE_STYLE,
  sanitiseSubject,
  SECONDARY_LINK_STYLE,
  TEXT_FONT_STACK,
  TEXT_STYLE,
  TITLE_STYLE,
  TITLE_TEXT_STYLE,
  WHITE,
} from "./html.js";
export { MAIL_CHARTER_DARK } from "./document-theme.js";
export {
  renderCharterOf,
  STARTING_MAIL_CHARTER,
  startingMailCharterSettings,
} from "./render-charter.js";
export type { MailRenderCharter } from "./render-charter.js";
export { mailStylesOf } from "./charter-styles.js";
export type { MailStyles } from "./charter-styles.js";
export type { DarkPalette } from "./document-theme.js";
export { isRearrangedDocument, renderMailDocument } from "./render-document.js";
export type { MailDocumentRenderOptions } from "./render-document.js";
export { renderLayoutText } from "./layout-text.js";
export { renderColumnsText, renderFreeBlockText, renderMailDocumentText } from "./document-text.js";
export { TEXT_LINE_WIDTH } from "./text-format.js";
export { renderMailDocumentParts } from "./render-document-parts.js";
export type { MailDocumentBlockFragment, MailDocumentParts } from "./render-document-parts.js";
export type {
  LayoutImage,
  LayoutInput,
  LayoutLogo,
  LayoutRow,
  LayoutSectionId,
  MailCta,
} from "./html.js";
export { createResendInboundReader, ResendInboundReader } from "./inbound-reader.js";
export type { ReceivedAttachment, ReceivedMail, ResendReceivingLike } from "./inbound-reader.js";
export { isValidReplyTo, validReplyTo } from "./reply-to.js";
export { createResendMailer, ResendMailer } from "./resend-mailer.js";
export type { ResendLike, ResendMailerDeps } from "./resend-mailer.js";
export { silentLogger } from "./types.js";
export type {
  Mailer,
  MailAttachment,
  MailerLogger,
  MailReceipt,
  RenderedMail,
  SendMailArgs,
  TemplateMap,
  TemplateRegistry,
} from "./types.js";

export { createMailer } from "./create-mailer.js";
export type { CreateMailerConfig } from "./create-mailer.js";
