import { createHash } from "node:crypto";

import { AppConfig } from "../../../../../platform/config/app-config.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedPaperLogo } from "../../../../application/__tests__/paper-doubles.js";
import { GetAtelierSheetSpecimenHandler } from "../get-atelier-sheet-specimen.handler.js";

/**
 * **L'empreinte de la fiche d'atelier : le découpage ne change pas le rendu.**
 *
 * Même mécanique que `document-specimens/__tests__/paper-fingerprints.spec.ts`
 * (dossier du jour, compte à produire) : le spécimen est rendu à un instant
 * figé, et le SHA-256 du fichier entier est comparé à une valeur versionnée.
 * `render` fige `CreationDate`/`ModDate` à cet instant, et l'`ID` de pdfkit en
 * découle : aucune métadonnée ne suit l'heure murale. L'instant est absolu
 * parce qu'il est imprimé et comparé à aucune horloge (CLAUDE.md §5).
 *
 * **Changement de rendu VOULU** : lancer
 *   pnpm --filter lfd-api exec jest src/production/application/queries/__tests__/atelier-sheet-fingerprint.spec.ts
 * recopier la valeur « Received » dans `FINGERPRINTS`, et dire dans le commit
 * pourquoi le papier a changé.
 */
const FINGERPRINTS = {
  plain: "42cc976281cec825e69eb9c4e437a6ed51dd6c251005179141753b9bf4b75df4",
  withQr: "de188a72b7374445c7d64aefd73cb16e0d58a420fa70ad4c53f49529076ba879",
} as const;

const AT = new Date("2026-03-10T15:30:00.000Z");

/** L'origine du back-office, donnée d'avance — `null` : aucun QR. */
class AdminOrigin extends AppConfig {
  constructor(private readonly origin: string | null) {
    super();
  }

  override adminBaseUrl(): string | null {
    return this.origin;
  }
}

async function atelierSheet(origin: string | null): Promise<string> {
  const paper = await new GetAtelierSheetSpecimenHandler(
    new FixedClock(AT),
    new AdminOrigin(origin),
    new FixedPaperLogo(),
  ).execute();
  return createHash("sha256").update(paper.bytes).digest("hex");
}

describe("l'empreinte de la fiche d'atelier", () => {
  it("sans QR", async () => {
    expect(await atelierSheet(null)).toBe(FINGERPRINTS.plain);
  });

  it("avec le QR de colisage", async () => {
    expect(await atelierSheet("https://admin.lfc.test")).toBe(FINGERPRINTS.withQr);
  });
});
