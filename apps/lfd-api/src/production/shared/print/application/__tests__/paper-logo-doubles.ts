import type { Buffer } from "node:buffer";

import { BrandLogoSource } from "../../../../../platform/brand/brand-logo.source.js";
import { PAPER_LOGO } from "../../domain/services/__tests__/paper-logo.fixture.js";

/** Le logo du dépôt, servi sans disque. */
export class FixedPaperLogo extends BrandLogoSource {
  load(): Promise<Buffer> {
    return Promise.resolve(PAPER_LOGO);
  }
}
