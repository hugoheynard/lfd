import { Injectable } from "@nestjs/common";

import { isInMailEditor } from "../../templates/sections/mail-block-declarations.js";
import { mailKeys } from "../../templates/specimens/mail-specimens.js";
import { MailProbeTemplates } from "../domain/ports/mail-probe-templates.js";

/** Les e-mails du registre déclarés `outOfEditor` — la sonde de déploiement. */
@Injectable()
export class RegistryMailProbeTemplates extends MailProbeTemplates {
  private readonly probes: readonly string[] = mailKeys().filter((mail) => !isInMailEditor(mail));

  keys(): readonly string[] {
    return this.probes;
  }
}
