import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

describe("AppController", () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe("root", () => {
    it("renvoie le smoke test de vie", () => {
      expect(appController.getHello()).toBe("LFC B2B platform backend — up.");
    });
  });

  describe("health", () => {
    it("renvoie un statut ok (liveness)", () => {
      expect(appController.health()).toEqual({ status: "ok" });
    });
  });
});
