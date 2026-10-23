import type { MailCopyAdminView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { MailCopyAdminReader } from "../../domain/ports/mail-copy-admin.reader.js";
import { MailCopyManifest } from "../../domain/mail-copy-manifest.js";
import { mailCopyAdminView } from "../mail-copy-admin-view.js";
import { GetMailCopyAdminQuery } from "./get-mail-copy-admin.query.js";

/** Sert l'écran des textes des e-mails. Lecture pure : l'assemblage est une fonction. */
@QueryHandler(GetMailCopyAdminQuery)
export class GetMailCopyAdminHandler implements IQueryHandler<
  GetMailCopyAdminQuery,
  MailCopyAdminView
> {
  constructor(
    private readonly reader: MailCopyAdminReader,
    private readonly manifest: MailCopyManifest,
  ) {}

  async execute(): Promise<MailCopyAdminView> {
    const [entries, publication] = await Promise.all([
      this.reader.entries(),
      this.reader.publication(),
    ]);
    return mailCopyAdminView(this.manifest, entries, publication);
  }
}
