import { AsyncLocalStorage } from "node:async_hooks";

import type { MailDocument, MailLocale } from "@lfd/mail-blocks";
import type { LayoutInput, LayoutSectionId, RenderedMail, TemplateRegistry } from "@lfd/mailer";

/** L'ordre des sections d'un e-mail, par clé du registre. */
export type MailSectionOrders = Readonly<Record<string, readonly LayoutSectionId[]>>;

/**
 * **Ce que la mise en page d'un rendu doit appliquer** (plan
 * `plan-textes-des-e-mails.md`, E4) : l'ordre des sections de chaque e-mail
 * qui en a un — publié pour un envoi, brouillon pour un aperçu —, et les
 * repères de l'aperçu (S4), jamais posés pour un e-mail envoyé.
 */
export interface MailLayoutScope {
  readonly orders: MailSectionOrders;
  readonly markers: boolean;
  /**
   * Le document de chaque e-mail qui en a un, et la langue de l'envoi (plan
   * `plan-editeur-par-blocs.md`, S4b). Il prime sur l'ordre des sections du
   * même e-mail. Aucun envoi ne le pose encore : c'est S4c qui le lira du
   * document publié (vérifié le 2026-11-07 : seuls les tests le posent).
   */
  readonly documents?: Readonly<Record<string, ScopedMailDocument>>;
  /**
   * **L'aperçu de l'éditeur par blocs** (plan `plan-editeur-par-blocs.md`,
   * § 22, S5f) : les phrases ET les variables du dictionnaire sont marquées
   * (`sections/mail-editor-markers.ts`), et l'entrée de la coquille est
   * remise à `capture` pour être découpée en blocs. Jamais posé pour un
   * envoi, un essai ni l'aperçu fidèle.
   */
  readonly editor?: MailEditorCapture;
}

/** Ce que l'aperçu de l'éditeur recueille d'un rendu : l'entrée de la coquille. */
export interface MailEditorCapture {
  capture(input: LayoutInput): void;
}

/** Le rendu en cours est-il l'aperçu de l'éditeur (S5f) ? */
export function isEditorRendering(): boolean {
  return activeMailLayout()?.editor !== undefined;
}

/** Un document à rendre, et la langue de ses blocs libres. */
export interface ScopedMailDocument {
  readonly document: MailDocument;
  readonly locale: MailLocale;
}

/** Aucun ordre, aucun repère : le rendu d'avant les sections, octet pour octet. */
export const NO_MAIL_LAYOUT: MailLayoutScope = { orders: {}, markers: false };

const layoutScope = new AsyncLocalStorage<MailLayoutScope>();
const renderedMail = new AsyncLocalStorage<string>();

/**
 * Rend `run` avec cette mise en page. Un périmètre plutôt qu'un paramètre,
 * pour la même raison que les textes (`withMailCopyOverlay`) : la coquille est
 * appelée au fond de vingt-huit rendus synchrones, dont aucune signature n'a
 * à changer.
 */
export function withMailLayout<T>(scope: MailLayoutScope, run: () => T): T {
  return layoutScope.run(scope, run);
}

/** Le périmètre ouvert, s'il y en a un. */
export function activeMailLayout(): MailLayoutScope | undefined {
  return layoutScope.getStore();
}

/**
 * Chaque rendu du registre sait QUEL e-mail il rend : la coquille en lit
 * l'ordre de ses sections. Posé une fois sur le registre entier, comme le logo.
 */
export function withRenderedMailKey<M extends object>(
  registry: TemplateRegistry<M>,
): TemplateRegistry<M> {
  const wrapped: Partial<TemplateRegistry<M>> = {};
  for (const key of Object.keys(registry) as (keyof M & string)[]) {
    const render = registry[key];
    wrapped[key] = (data: M[typeof key]): RenderedMail => renderedMail.run(key, () => render(data));
  }
  return wrapped as TemplateRegistry<M>;
}

/** Le document de l'e-mail en cours de rendu, s'il en a un : sa clé et lui. */
export function documentOfRenderedMail():
  { readonly mail: string; readonly scoped: ScopedMailDocument } | undefined {
  const mail = renderedMail.getStore();
  const scoped = mail === undefined ? undefined : activeMailLayout()?.documents?.[mail];
  return mail === undefined || scoped === undefined ? undefined : { mail, scoped };
}

/**
 * Ce que la coquille de l'e-mail en cours de rendu doit recevoir : son ordre
 * s'il en a un, les repères s'ils sont demandés — et RIEN sinon, pour que
 * l'entrée de la coquille reste celle d'avant les sections.
 */
export function layoutOptionsOfRenderedMail(): {
  readonly sections?: readonly LayoutSectionId[];
  readonly markSections?: boolean;
} {
  const scope = activeMailLayout();
  const mail = renderedMail.getStore();
  const order = scope === undefined || mail === undefined ? undefined : scope.orders[mail];
  return {
    ...(order === undefined ? {} : { sections: order }),
    ...(scope?.markers === true ? { markSections: true } : {}),
  };
}
