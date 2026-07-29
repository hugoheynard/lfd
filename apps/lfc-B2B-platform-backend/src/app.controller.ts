import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service.js";
import { Public } from "./infra/auth/public.decorator.js";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Route de vie — ouverte : sert de smoke test sans jeton. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
