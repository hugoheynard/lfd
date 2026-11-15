import { createHash } from "node:crypto";

import { AppConfig } from "../../../../../platform/config/app-config.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FixedPaperLogo,
  FixedSpecimenDeliveryNote,
} from "../../../../application/__tests__/paper-doubles.js";
import { GetDayDossierSpecimenHandler } from "../../queries/get-day-dossier-specimen.handler.js";
import { GetProductionCountSpecimenHandler } from "../../queries/get-production-count-specimen.handler.js";

/**
 * **L'empreinte des papiers du fournil : le découpage ne change pas le rendu.**
 *
 * Chaque PDF que le fournil produit — le dossier du jour (couverture,
 * récapitulatif, calendrier, bons de commande avec leur BL, réassort), le
 * compte à produire — est rendu depuis les spécimens de la
 * planche, et le SHA-256 du FICHIER ENTIER est comparé à une valeur versionnée.
 * Un déménagement ou un découpage de code qui change un octet rougit ici.
 * La fiche d'atelier, qui appartient à l'atelier et non au plan, a sa sœur :
 * `queries/__tests__/atelier-sheet-fingerprint.spec.ts`.
 *
 * Le fichier entier, et non le seul contenu des pages : `render`
 * (`platform/pdf/paper-pdf-kit.ts`) fixe `CreationDate` et `ModDate` à
 * l'instant passé (`closedAt`, ici l'horloge figée), et l'`ID` que pdfkit
 * dérive de ces métadonnées suit donc. Rien ne dépend de l'heure murale ; les
 * métadonnées font partie de ce qu'on veut garder identique.
 *
 * L'instant est absolu, par exception (CLAUDE.md §5) : il n'est comparé à
 * aucune horloge, il est le sujet imprimé (jour de service, heure d'arrêt), et
 * une date relative changerait l'empreinte chaque jour.
 *
 * **Changement de rendu VOULU** : lancer
 *   pnpm --filter lfd-api exec jest src/production/application/document-specimens/__tests__/paper-fingerprints.spec.ts
 * relever la valeur « Received » de chaque document rouge, la recopier dans
 * `FINGERPRINTS`, et dire dans le commit pourquoi le papier a changé.
 */
const FINGERPRINTS = {
  dayDossier: "b4c876e6c627e0b8c1410a3ac311ae806658d1f261195bf4f09bb273dbc1576f",
  dayDossierWithQr: "140651a1596d98e3c8dff97f1b8ad1861f0e827c966b22da9cf153d6e8401f6d",
  productionCount: "83ca24edf942bc55b9640153af6295a0e6940126c64d4cde327bf17a4ecc13ef",
} as const;

const AT = new Date("2026-03-10T15:30:00.000Z");
const ADMIN_ORIGIN = "https://admin.lfc.test";

/** L'origine du back-office, donnée d'avance — `null` : aucun QR. */
class AdminOrigin extends AppConfig {
  constructor(private readonly origin: string | null) {
    super();
  }

  override adminBaseUrl(): string | null {
    return this.origin;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function dayDossier(origin: string | null): Promise<string> {
  const paper = await new GetDayDossierSpecimenHandler(
    new FixedClock(AT),
    new AdminOrigin(origin),
    new FixedPaperLogo(),
    new FixedSpecimenDeliveryNote(),
  ).execute();
  return sha256(paper.bytes);
}

describe("l'empreinte des papiers du fournil", () => {
  it("le dossier du jour, sans QR", async () => {
    expect(await dayDossier(null)).toBe(FINGERPRINTS.dayDossier);
  });

  it("le dossier du jour, avec les QR de colisage", async () => {
    expect(await dayDossier(ADMIN_ORIGIN)).toBe(FINGERPRINTS.dayDossierWithQr);
  });

  it("le compte à produire", async () => {
    const paper = await new GetProductionCountSpecimenHandler(
      new FixedClock(AT),
      new FixedPaperLogo(),
    ).execute();
    expect(sha256(paper.bytes)).toBe(FINGERPRINTS.productionCount);
  });

  it("deux rendus du même spécimen sont identiques à l'octet", async () => {
    expect(await dayDossier(ADMIN_ORIGIN)).toBe(await dayDossier(ADMIN_ORIGIN));
  });
});
