import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { DeployedRevision } from "../domain/deployed-revision.js";

/** La révision lue où la carte « Capacités » la lit : `APP_REVISION`, par `AppConfig`. */
@Injectable()
export class AppConfigDeployedRevision extends DeployedRevision {
  constructor(private readonly config: AppConfig) {
    super();
  }

  current(): string {
    return this.config.revision();
  }
}
