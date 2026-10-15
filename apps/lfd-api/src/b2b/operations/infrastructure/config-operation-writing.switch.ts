import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { OperationWritingSwitch } from "../domain/ports/operation-writing-switch.js";

/** L'interrupteur lu dans la configuration : `OPERATIONS_AT_COMMERCE`, fermé par défaut. */
@Injectable()
export class ConfigOperationWritingSwitch extends OperationWritingSwitch {
  constructor(private readonly config: AppConfig) {
    super();
  }

  isOpen(): boolean {
    return this.config.operationsAtCommerce();
  }
}
