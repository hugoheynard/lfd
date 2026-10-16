import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { ReferentialOperationWriting } from "../domain/ports/referential-operation-writing.js";

/** Ouverte tant que l'interrupteur `OPERATIONS_AT_COMMERCE` est fermé — le défaut. */
@Injectable()
export class ConfigReferentialOperationWriting extends ReferentialOperationWriting {
  constructor(private readonly config: AppConfig) {
    super();
  }

  isOpen(): boolean {
    return !this.config.operationsAtCommerce();
  }
}
