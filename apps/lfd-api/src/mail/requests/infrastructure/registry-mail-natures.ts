import type { MailNature } from "@lfd/mail-blocks";
import { Injectable } from "@nestjs/common";

import { natureOf } from "../../templates/sections/mail-block-declarations.js";
import { MailNatures } from "../domain/ports/mail-natures.js";

/** La nature déclarée au registre des modèles (`mail-block-declarations.ts`, règle 1). */
@Injectable()
export class RegistryMailNatures extends MailNatures {
  natureOf(template: string): MailNature | null {
    return natureOf(template);
  }
}
