import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AppConfig } from "./infra/config/app-config";
import { StartupReport } from "./infra/startup/startup-report.service";
import type { MissingCapability } from "./infra/startup/capability-audit";

/** Deux canaux éteints, un de chaque gravité — de quoi vérifier les compteurs. */
const MISSING: readonly MissingCapability[] = [
  {
    capability: "Courrier transactionnel",
    setting: "RESEND_MAILER_B2B_API_KEY",
    consequence: "une invitation ne parvient à personne",
    severity: "blocking",
  },
  {
    capability: "Stockage des KBIS",
    setting: "R2_KBIS_BUCKET",
    consequence: "les KBIS ne peuvent être ni déposés ni téléchargés",
    severity: "degraded",
  },
];

describe("AppController", () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        // Doubles : la vraie AppConfig exigerait un environnement complet, et la
        // sonde n'en lit qu'une chose.
        { provide: AppConfig, useValue: { revision: () => "abc1234" } },
        { provide: StartupReport, useValue: { missing: () => MISSING } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe("root", () => {
    it("renvoie le smoke test de vie", () => {
      expect(appController.getHello()).toBe("LFC B2B platform backend — up.");
    });
  });

  describe("health", () => {
    it("renvoie un statut ok ET la révision servie", () => {
      // La révision est ce qui distingue cette sonde d'un ping inutile : un
      // « ok » nu est vrai de l'ancienne image comme de la nouvelle, et ne
      // permet donc pas d'attendre un déploiement.
      expect(appController.health()).toMatchObject({ status: "ok", revision: "abc1234" });
    });

    it("compte les canaux éteints par gravité", () => {
      expect(appController.health().capabilities).toEqual({ blocking: 1, degraded: 1 });
    });

    it("reste `ok` avec un canal bloquant — c'est une sonde de vie, pas de complétude", () => {
      // Rougir ici ferait redémarrer en boucle une instance parfaitement saine
      // parce qu'une clé de paiement manque. Ce qui doit s'arrêter sur ces
      // compteurs est un déploiement, pas l'orchestrateur.
      expect(appController.health().status).toBe("ok");
    });

    it("ne nomme AUCUN réglage — la sonde est publique", () => {
      // L'invariant qui compte : dire au monde quelle porte n'est pas
      // verrouillée est une aide qu'on ne doit qu'à soi-même. Le détail vit
      // derrière le jeton, sur /admin/ops/capabilities.
      const body = JSON.stringify(appController.health());

      for (const entry of MISSING) {
        expect(body).not.toContain(entry.setting);
        expect(body).not.toContain(entry.capability);
      }
    });
  });
});
