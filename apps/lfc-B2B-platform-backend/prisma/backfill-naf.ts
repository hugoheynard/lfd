import "dotenv/config";

import { Test } from "@nestjs/testing";

import { EstablishmentDirectory } from "../src/account/domain/ports/establishment-directory.js";
import { KbisStore } from "../src/account/domain/ports/kbis-store.js";
import { PrismaService } from "../src/infra/database/prisma.service.js";
import { PaymentGateway } from "../src/payments/domain/payment-gateway.js";
import { AppModule } from "../src/app.module.js";
import { FakeKbisStore } from "./seed-growth/fake-kbis-store.js";
import { FakePaymentGateway } from "./seed-growth/fake-payment-gateway.js";

/**
 * Backfill **one-shot** du `Company.nafCode` (doc commercial-data, décision D1) :
 * pour chaque société au NAF vide mais SIRET connu, résout le code NAF via l'API
 * entreprises (le **vrai** {@link EstablishmentDirectory}) et l'écrit. Séquentiel
 * (auto-throttle sous la limite de l'API). Idempotent : une société déjà
 * renseignée n'est pas reprise ; un SIRET introuvable est simplement ignoré,
 * rejouable plus tard. Stripe/S3 sont stubés (non sollicités ici).
 */
async function main(): Promise<void> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PaymentGateway)
    .useClass(FakePaymentGateway)
    .overrideProvider(KbisStore)
    .useClass(FakeKbisStore)
    .compile();
  await module.init();
  const prisma = module.get(PrismaService, { strict: false });
  const directory = module.get(EstablishmentDirectory, { strict: false });
  try {
    const targets = await prisma.company.findMany({
      where: { nafCode: "", NOT: { siret: "" } },
      select: { id: true, siret: true },
    });
    let filled = 0;
    for (const company of targets) {
      const naf = await directory.resolveNaf(company.siret);
      if (naf !== null && naf !== "") {
        await prisma.company.update({ where: { id: company.id }, data: { nafCode: naf } });
        filled += 1;
      }
    }
    console.log(`✔ backfill NAF : ${filled}/${targets.length} sociétés renseignées.`);
  } finally {
    await module.close();
  }
}

main().catch((error: unknown) => {
  console.error("backfill NAF: échec", error);
  process.exitCode = 1;
});
