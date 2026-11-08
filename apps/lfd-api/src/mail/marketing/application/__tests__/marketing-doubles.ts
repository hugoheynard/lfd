import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import type { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import { AddressPrint } from "../../domain/ports/address-print.js";
import { MarketingPreferenceReader } from "../../domain/ports/marketing-preference.reader.js";
import { MarketingPreferenceRepository } from "../../domain/ports/marketing-preference.repository.js";
import { SpacePublicOrigins } from "../../domain/ports/space-public-origins.js";
import {
  UnsubscribeTokens,
  type UnsubscribeTarget,
} from "../../domain/ports/unsubscribe-tokens.js";
import type { MarketingStatus } from "../../domain/value-objects/marketing-vocabulary.js";

/** Une empreinte lisible en test : la clé, hexadécimalisée, sur 64 caractères. */
export class ReadablePrint extends AddressPrint {
  of(recipientKey: string): string {
    return Buffer.from(recipientKey, "utf8").toString("hex").padEnd(64, "0").slice(0, 64);
  }
}

/** Le registre en mémoire, par `(espace, empreinte)`, comme l'unicité en base. */
export class InMemoryPreferences extends MarketingPreferenceRepository {
  readonly rows = new Map<string, MarketingPreference>();
  readonly forgotten: string[] = [];
  saves = 0;

  load(space: MailBrandCode, print: string): Promise<MarketingPreference | null> {
    return Promise.resolve(this.rows.get(`${space}|${print}`) ?? null);
  }

  loadAll(print: string): Promise<readonly MarketingPreference[]> {
    return Promise.resolve([...this.rows.values()].filter((row) => row.snapshot().print === print));
  }

  save(preference: MarketingPreference): Promise<void> {
    this.saves += 1;
    const { space, print } = preference.snapshot();
    this.rows.set(`${space}|${print}`, preference);
    return Promise.resolve();
  }

  forget(preference: MarketingPreference): Promise<void> {
    const { space, print } = preference.snapshot();
    this.rows.delete(`${space}|${print}`);
    this.forgotten.push(preference.id);
    return Promise.resolve();
  }
}

/** La lecture du même registre en mémoire. */
export class InMemoryPreferenceReader extends MarketingPreferenceReader {
  constructor(private readonly preferences: InMemoryPreferences) {
    super();
  }

  async statusOf(space: MailBrandCode, print: string): Promise<MarketingStatus | null> {
    const row = await this.preferences.load(space, print);
    return row === null ? null : row.snapshot().status;
  }
}

/** Des jetons en clair, `espace:clé` — le chiffrement s'éprouve dans son adaptateur. */
export class PlainTokens extends UnsubscribeTokens {
  seal(target: UnsubscribeTarget): string {
    return `${target.space}:${target.recipientKey}`;
  }

  open(token: string): UnsubscribeTarget | null {
    const [space, key] = token.split(":");
    return (space === "lfc" || space === "lfd") && key !== undefined && key !== ""
      ? { space, recipientKey: key }
      : null;
  }
}

/** Des origines fixées par espace. */
export class FixedOrigins extends SpacePublicOrigins {
  constructor(private readonly origins: Readonly<Partial<Record<MailBrandCode, string>>>) {
    super();
  }

  originOf(space: MailBrandCode): string | null {
    return this.origins[space] ?? null;
  }
}
