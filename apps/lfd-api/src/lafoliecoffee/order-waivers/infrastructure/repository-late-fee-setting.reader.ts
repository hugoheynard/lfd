import type { LateFeeAdjustment } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { LateFeeSettingReader } from "../../order-cutoffs/domain/deadline/ports/deadline-sources.js";
import { OrderLateFeeRepository } from "../domain/order-late-fee.repository.js";

/** {@link LateFeeSettingReader} : le réglage de la surtaxe, tel que l'administration l'a posé. */
@Injectable()
export class RepositoryLateFeeSettingReader extends LateFeeSettingReader {
  constructor(private readonly repository: OrderLateFeeRepository) {
    super();
  }

  async current(): Promise<LateFeeAdjustment | null> {
    return this.repository.read();
  }
}
