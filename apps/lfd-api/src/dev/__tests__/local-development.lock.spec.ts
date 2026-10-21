import { ServiceUnavailableException } from "@nestjs/common";

import { refuseUnlessLocalDevelopment } from "../local-development.lock.js";

/**
 * La serrure de l'outillage de développement — celle que `seed:invoices`
 * franchit avant d'émettre une seule facture, immuable une fois écrite.
 */
function target(url: string, production = false) {
  return { isProduction: () => production, databaseUrl: () => url };
}

describe("refuseUnlessLocalDevelopment", () => {
  it("laisse passer un Postgres direct sur la machine", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(() =>
        refuseUnlessLocalDevelopment(target(`postgresql://lfc:x@${host}:5433/lfc_b2b_dev`)),
      ).not.toThrow();
    }
    expect(() =>
      refuseUnlessLocalDevelopment(target("postgres://lfc:x@localhost:5433/lfc_b2b_dev")),
    ).not.toThrow();
  });

  it("refuse la production, même pointée sur localhost", () => {
    expect(() =>
      refuseUnlessLocalDevelopment(target("postgresql://lfc:x@localhost:5433/lfc", true)),
    ).toThrow(ServiceUnavailableException);
  });

  it("refuse un hôte distant, y compris le pooler de production en postgres://", () => {
    expect(() =>
      refuseUnlessLocalDevelopment(target("postgres://u:p@pooled.db.prisma.io:5432/postgres")),
    ).toThrow(/pooled\.db\.prisma\.io/);
    expect(() =>
      refuseUnlessLocalDevelopment(target("postgresql://u:p@10.0.0.12:5432/lfc")),
    ).toThrow(ServiceUnavailableException);
  });

  it("refuse une URL qui n'est pas un Postgres direct (Accelerate)", () => {
    expect(() =>
      refuseUnlessLocalDevelopment(target("prisma+postgres://accelerate.prisma-data.net/?k=1")),
    ).toThrow(/Postgres direct/);
  });
});
