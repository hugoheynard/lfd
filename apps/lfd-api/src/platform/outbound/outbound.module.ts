import { Module } from "@nestjs/common";

import { DnsHostResolver, HostResolver } from "./host-resolver.js";
import { PinnedHttpsWebhookPoster } from "./pinned-https-webhook-poster.js";
import { WebhookPoster } from "./webhook-poster.js";

/**
 * **Le relais HTTP sortant vers un tiers** — `https` seul, adresse résolue
 * vérifiée et épinglée, sans redirection (plan vitrine, S2). Technique pure :
 * il ne sait pas qui il prévient ni pourquoi.
 */
@Module({
  providers: [
    { provide: HostResolver, useClass: DnsHostResolver },
    { provide: WebhookPoster, useClass: PinnedHttpsWebhookPoster },
  ],
  exports: [WebhookPoster],
})
export class OutboundModule {}
