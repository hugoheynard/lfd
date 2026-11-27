import { pdfFingerprint } from "../../../../shared/print/__tests__/pdf-fingerprint.js";

import { AppConfig } from "../../../../../platform/config/app-config.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedPaperLogo } from "../../../../shared/print/application/__tests__/paper-logo-doubles.js";
import { GetAtelierSheetSpecimenHandler } from "../get-atelier-sheet-specimen.handler.js";

/**
 * **L'empreinte de la fiche d'atelier : le découpage ne change pas le rendu.**
 *
 * Même mécanique que `document-specimens/__tests__/paper-fingerprints.spec.ts`
 * (dossier du jour, compte à produire) : le spécimen est rendu à un instant
 * figé, et l'empreinte du fichier (`pdfFingerprint`, flux décompressés) est comparé à une valeur versionnée.
 * `render` fige `CreationDate`/`ModDate` à cet instant, et l'`ID` de pdfkit en
 * découle : aucune métadonnée ne suit l'heure murale. L'instant est absolu
 * parce qu'il est imprimé et comparé à aucune horloge (CLAUDE.md §5).
 *
 * **Changement de rendu VOULU** : lancer
 *   pnpm --filter lfd-api exec jest src/production/atelier/application/queries/__tests__/atelier-sheet-fingerprint.spec.ts
 * recopier la valeur « Received » dans `FINGERPRINTS`, et dire dans le commit
 * pourquoi le papier a changé.
 */
const FINGERPRINTS = {
  plain: "84199030d94c41df553832854e271aeb9d9250d9154a690700bd1623111f66bd",
  withQr: "9e170630686480c59d5767b5e8381e079f15ea2c632ae9a95231ed39b9f27ed6",
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
  return pdfFingerprint(paper.bytes);
}

describe("l'empreinte de la fiche d'atelier", () => {
  it("sans QR", async () => {
    expect(await atelierSheet(null)).toBe(FINGERPRINTS.plain);
  });

  it("avec le QR de colisage", async () => {
    expect(await atelierSheet("https://admin.lfc.test")).toBe(FINGERPRINTS.withQr);
  });
});
