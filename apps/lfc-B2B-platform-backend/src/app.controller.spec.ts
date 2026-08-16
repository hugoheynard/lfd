import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AppConfig } from "./infra/config/app-config";

describe("AppController", () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        // Double : la vraie AppConfig exigerait un environnement complet, et la
        // sonde n'en lit qu'une chose.
        { provide: AppConfig, useValue: { revision: () => "abc1234" } },
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
      expect(appController.health()).toEqual({ status: "ok", revision: "abc1234" });
    });
  });
});
