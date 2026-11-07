import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import {
  type MailBacklogSummary,
  MailBacklogSurvey,
} from "../../channels/requests/mail-backlog-survey.js";
import { MailBacklogReader } from "../domain/ports/mail-backlog.reader.js";
import {
  MAIL_STALLED_AFTER_MS,
  mailBacklogCriteria,
  oldestStalledMinutes,
} from "../domain/services/mail-backlog.js";

const MINUTE_MS = 60_000;

/** L'implémentation du bloc : les mêmes critères que la veille qui sonne. */
@Injectable()
export class BlockMailBacklogSurvey extends MailBacklogSurvey {
  constructor(
    private readonly reader: MailBacklogReader,
    private readonly clock: Clock,
  ) {
    super();
  }

  async read(): Promise<MailBacklogSummary> {
    const now = this.clock.now();
    const backlog = await this.reader.read(mailBacklogCriteria(now));
    return {
      stalled: backlog.stalled,
      oldestStalledMinutes: oldestStalledMinutes(backlog, now),
      definitiveFailures: backlog.definitiveFailures,
      stalledAfterMinutes: MAIL_STALLED_AFTER_MS / MINUTE_MS,
    };
  }
}
