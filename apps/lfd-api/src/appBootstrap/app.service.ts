import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHello(): string {
    return "LFC B2B platform backend — up.";
  }
}
