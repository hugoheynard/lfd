import type { MailEditorListView } from "@lfd/mail-blocks";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { mailCopyAdminView } from "../../../copy/application/mail-copy-admin-view.js";
import { MailCopyManifest } from "../../../copy/domain/mail-copy-manifest.js";
import { MailCopyAdminReader } from "../../../copy/domain/ports/mail-copy-admin.reader.js";
import { MailDocumentReader } from "../../domain/ports/mail-document.reader.js";
import { MailTemplateCatalogue } from "../../domain/ports/mail-template-catalogue.js";
import { publishedView } from "../mail-editor-view.js";
import { ListMailTemplatesQuery } from "./list-mail-templates.query.js";

/**
 * La liste des e-mails (plan `plan-editeur-par-blocs.md`, § 6) : le registre
 * du code, dans son ordre, chacun avec son destinataire — l'écran les range
 * par là — et ce qu'il en est de son document. Lecture pure.
 *
 * `copyPendingCount` (S5e, § 21) est le compte de l'écran des textes
 * (`mailCopyAdminView`), lu par les mêmes lectures : jamais recompté ici.
 */
@QueryHandler(ListMailTemplatesQuery)
export class ListMailTemplatesHandler implements IQueryHandler<
  ListMailTemplatesQuery,
  MailEditorListView
> {
  constructor(
    private readonly catalogue: MailTemplateCatalogue,
    private readonly reader: MailDocumentReader,
    private readonly copy: MailCopyAdminReader,
    private readonly manifest: MailCopyManifest,
  ) {}

  async execute(): Promise<MailEditorListView> {
    const [all, entries, publication, orders] = await Promise.all([
      this.reader.all(),
      this.copy.entries(),
      this.copy.publication(),
      this.copy.sectionOrders(),
    ]);
    const states = new Map(all.map((state) => [state.template, state]));
    return {
      copyPendingCount: mailCopyAdminView(this.manifest, entries, publication, orders).pendingCount,
      mails: this.catalogue.list().map((entry) => {
        const state = states.get(entry.template) ?? null;
        return {
          template: entry.template,
          audience: entry.audience,
          family: entry.family,
          charter: entry.declaration.charter,
          locales: entry.declaration.locales,
          published: publishedView(state),
          hasDraft: (state?.draft ?? null) !== null,
        };
      }),
    };
  }
}
