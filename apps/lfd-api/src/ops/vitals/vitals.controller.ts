import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { isWebVitalName, type WebVitalSample } from "@lfd/ops-contract";

import { Public } from "../../platform/auth/public.decorator.js";
import { Clock } from "../../platform/time/clock.js";
import { TOPOLOGY } from "../topology/topology.js";
import { VitalsStore } from "./vitals.store.js";

/** Au-delà, on ignore la suite : un navigateur n'a que trois mesures à rendre. */
const MAX_SAMPLES = 12;

/** Les fronts déclarés — le navigateur ne décide pas de ce qui figure sur la carte. */
const KNOWN_FRONTS = new Set(
  TOPOLOGY.filter((node) => node.kind === "frontend").map((node) => node.id),
);

/**
 * **La collecte des Core Web Vitals**, postés par les navigateurs.
 *
 * Route **publique**, et elle doit l'être : un visiteur de la boutique n'a pas
 * de jeton, et c'est précisément son expérience qu'on veut mesurer. Une route
 * réservée aux gens connectés ne mesurerait que le back-office.
 *
 * Ce qui la rend acceptable ouverte, dans l'ordre :
 *
 * - **elle n'accepte aucune donnée personnelle.** Ni identifiant, ni adresse,
 *   ni chemin visité — le chemin trahirait la page qu'une personne regarde ;
 * - **elle n'écrit rien** en base. Tout vit en mémoire, borné (§28 : une
 *   écriture par mesure ferait trois opérations Prisma par visite) ;
 * - **elle ne crée rien.** Un `front` inconnu de la topologie est jeté ;
 * - **elle est bornée** par le limiteur applicatif comme le reste.
 *
 * Le pire qu'on risque est donc un chiffre faussé sur un écran interne. C'est
 * assumé : la mesure vaut plus que la certitude.
 */
@Controller("ops/vitals")
export class VitalsController {
  constructor(
    private readonly store: VitalsStore,
    private readonly clock: Clock,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  collect(@Body() body: unknown): void {
    const now = this.clock.now().getTime();
    for (const sample of readSamples(body)) {
      this.store.record(sample, now);
    }
  }
}

/**
 * Lit la charge **défensivement**, et sans jeter : une charge malformée n'est
 * pas une erreur à signaler à un navigateur anonyme, c'est une mesure qu'on
 * n'aura pas. Rendre `400` apprendrait surtout à quelqu'un ce qui passe.
 */
function readSamples(body: unknown): readonly WebVitalSample[] {
  if (typeof body !== "object" || body === null || !("samples" in body)) {
    return [];
  }
  const samples: unknown = body.samples;
  if (!Array.isArray(samples)) {
    return [];
  }
  return samples.slice(0, MAX_SAMPLES).flatMap((entry: unknown) => toSample(entry));
}

function toSample(entry: unknown): readonly WebVitalSample[] {
  if (typeof entry !== "object" || entry === null) {
    return [];
  }
  const front: unknown = "front" in entry ? entry.front : null;
  const metric: unknown = "metric" in entry ? entry.metric : null;
  const value: unknown = "value" in entry ? entry.value : null;
  if (typeof front !== "string" || !KNOWN_FRONTS.has(front)) {
    return [];
  }
  if (!isWebVitalName(metric) || typeof value !== "number") {
    return [];
  }
  return [{ front, metric, value }];
}
