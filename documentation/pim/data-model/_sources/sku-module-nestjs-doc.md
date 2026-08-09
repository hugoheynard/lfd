> ⚠️ **Document source archivé — NON normatif.**
>
> Proposition de conception reçue le 2026-07-21, conservée pour tracer le raisonnement.
> Elle a été **remplacée** après revue adversariale par
> [`06-identifiants-et-sku.md`](../06-identifiants-et-sku.md) : sa notion centrale
> (« un SKU par canal ») est une erreur de catégorie, et ses exemples visent une autre
> stack (TypeORM). **Ne pas s'y référer pour implémenter.**

---

# Module `SKU` — Documentation (NestJS)

Gestion des identifiants produits pour le PIM. Ce module encapsule la **stratégie d'identifiants** du système omnicanal : un UUID immuable comme clé de jointure, et des SKU **par canal** validés à la frontière.

---

## 1. Objectif & principes

- **L'UUID est l'identité** — clé primaire immuable de la variante, et **clé de jointure (FK)** entre PIM, Shopify et caisse. La réconciliation (stock, ventes) se fait **toujours sur l'UUID, jamais sur le SKU**.
- **Le SKU est un libellé par canal** — un `Sku` = `(variantUuid, channel, value)`. Un même produit peut porter un SKU différent selon le système externe (Shopify lisible, PLU numérique caisse, EAN‑13…).
- **Valider à la frontière** — un SKU invalide est rejeté **à l'entrée dans le PIM**, pas au moment du push (où Shopify/caisse le rejetteraient). _Fail at the door, not at sync._
- **Le back fait autorité** — la validation front est du confort de saisie ; le serveur revalide systématiquement avec le même schéma.
- **Source unique de vérité** — un _registre de règles par canal_ alimente à la fois la validation, les messages d'erreur et l'aide à la saisie côté front.

---

## 2. Arborescence du module

```
src/sku/
├── sku.module.ts
├── sku.controller.ts
├── sku.service.ts
├── rules/
│   ├── sku-rules.registry.ts   # registre : regex + label + description + exemple
│   └── ean13.ts                # validation de la clé de contrôle EAN-13
├── schema/
│   └── sku.schema.ts           # schéma Zod dérivé du registre
├── dto/
│   └── create-sku.dto.ts       # DTO via nestjs-zod
├── entities/
│   ├── product.entity.ts
│   ├── variant.entity.ts
│   └── sku.entity.ts
└── sku.service.spec.ts
```

**Dépendances** : `zod`, `nestjs-zod` (pont DTO/pipe), et l'ORM (exemples en TypeORM ; Prisma possible).

---

## 3. Le registre de règles (`rules/sku-rules.registry.ts`)

Cœur du module : chaque canal est un objet auto-documenté. **On modifie la règle ici, et partout ailleurs suit.**

```ts
import { isValidEan13 } from "./ean13";

export interface SkuRule {
  pattern: RegExp;
  label: string; // nom lisible du canal (UI)
  description: string; // règle en clair (hint sous l'input)
  example: string; // exemple valide (placeholder + message d'erreur)
  maxLength?: number; // attribut maxlength de l'input
  normalize?: (v: string) => string; // trim / casse AVANT validation
  extraCheck?: (v: string) => boolean; // règle métier qu'une regex ne couvre pas
}

export const SKU_RULES = {
  shopify: {
    pattern: /^[A-Z0-9]([A-Z0-9-]{0,14}[A-Z0-9])?$/,
    label: "Shopify",
    description: "Lettres majuscules, chiffres et tirets. 16 caractères max.",
    example: "ECL-CHOC-6P",
    maxLength: 16,
    normalize: (v) => v.trim().toUpperCase(),
  },
  caisse: {
    // ⚠️ À CONFIRMER avec PI Electronique (longueur/charset réels de la réf. article)
    pattern: /^\d{1,6}$/,
    label: "Caisse PI Electronique",
    description: "Code numérique, 6 chiffres max (PLU).",
    example: "104582",
    maxLength: 6,
    normalize: (v) => v.trim(),
  },
  ean13: {
    pattern: /^\d{13}$/,
    label: "Code-barres EAN-13",
    description: "13 chiffres, clé de contrôle valide.",
    example: "3612345678901",
    maxLength: 13,
    normalize: (v) => v.trim(),
    extraCheck: isValidEan13, // le checksum, non couvert par la regex
  },
} as const satisfies Record<string, SkuRule>;

export type Channel = keyof typeof SKU_RULES; // "shopify" | "caisse" | "ean13"
export const CHANNELS = Object.keys(SKU_RULES) as [Channel, ...Channel[]];
```

> Le `satisfies Record<string, SkuRule>` garantit la forme **sans perdre** les clés littérales. Ajouter un canal = ajouter une entrée ; types, validation et front suivent automatiquement.

---

## 4. Validation EAN-13 (`rules/ean13.ts`)

Une regex `\d{13}` vérifie la longueur, **pas** la clé de contrôle. À traiter à part.

```ts
export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split("").map(Number);
  const checksum = digits.slice(0, 12).reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 1 : 3), 0);
  const expected = (10 - (checksum % 10)) % 10;
  return expected === digits[12];
}
```

---

## 5. Le schéma Zod (`schema/sku.schema.ts`)

Le schéma **lit** le registre — il ne réécrit pas les règles (aucune divergence back/front possible).

```ts
import { z } from "zod";
import { SKU_RULES, CHANNELS } from "../rules/sku-rules.registry";

export const SkuSchema = z
  .object({
    variantUuid: z.string().uuid(),
    channel: z.enum(CHANNELS),
    value: z.string(),
  })
  // 1) normaliser AVANT de valider
  .transform((s) => ({
    ...s,
    value: (SKU_RULES[s.channel].normalize ?? ((v) => v))(s.value),
  }))
  // 2) valider forme + règle métier
  .superRefine((s, ctx) => {
    const rule = SKU_RULES[s.channel];
    const ok = rule.pattern.test(s.value) && (rule.extraCheck?.(s.value) ?? true);
    if (!ok) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `Format invalide pour « ${rule.label} ». ${rule.description} Ex. : ${rule.example}`,
      });
    }
  });

export type SkuInput = z.infer<typeof SkuSchema>;
```

> Ordre important : `.transform()` normalise **avant** `.superRefine()`. Le message d'erreur **réutilise** `description` + `example` → zéro texte dupliqué.

---

## 6. Intégration NestJS (`dto/create-sku.dto.ts`)

Avec **nestjs-zod**, le schéma devient un DTO utilisable dans les contrôleurs, et un `ZodValidationPipe` global valide toutes les requêtes.

```ts
import { createZodDto } from "nestjs-zod";
import { SkuSchema } from "../schema/sku.schema";

export class CreateSkuDto extends createZodDto(SkuSchema) {}
```

Activation globale du pipe (`main.ts` ou `app.module.ts`) :

```ts
import { ZodValidationPipe } from "nestjs-zod";
import { APP_PIPE } from "@nestjs/core";

@Module({
  providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class AppModule {}
```

> Le même `SkuSchema` sert au front (dérivation du placeholder/hint via le registre) **et** au back (DTO + pipe). Le front guide, le back tranche.

---

## 7. Entités & contraintes DB (`entities/`)

La **forme** est gérée par Zod ; l'**unicité** et l'**intégrité référentielle** par la base.

```ts
// variant.entity.ts
@Entity()
export class Variant {
  @PrimaryColumn("uuid")
  uuid: string; // identité immuable = clé de jointure

  @ManyToOne(() => Product, (p) => p.variants)
  product: Product;

  @OneToMany(() => Sku, (s) => s.variant)
  skus: Sku[];
}

// sku.entity.ts
@Entity()
@Unique(["channel", "value"]) // ← unicité par canal, garantie par la DB
export class Sku {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "enum", enum: CHANNELS })
  channel: Channel;

  @Column()
  value: string; // SKU invariant une fois émis

  @ManyToOne(() => Variant, (v) => v.skus, { nullable: false })
  @JoinColumn({ name: "variant_uuid" })
  variant: Variant; // FK sur l'UUID de la variante
}
```

Points structurants :

- **Index unique `(channel, value)`** → deux SKU identiques sur le même canal impossibles.
- **FK `variant_uuid`** → la jointure repose sur l'UUID, pas sur le SKU.
- **Invariant applicatif** : le service **n'expose pas d'update** de `value` (voir §8). Pour changer un SKU, on crée une nouvelle entité et on gère la dépréciation — sans jamais casser la jointure (l'UUID persiste).

---

## 8. Le service (`sku.service.ts`)

```ts
@Injectable()
export class SkuService {
  constructor(@InjectRepository(Sku) private readonly repo: Repository<Sku>) {}

  /** Crée un SKU. La valeur arrive déjà normalisée + validée par le DTO/pipe. */
  async create(dto: CreateSkuDto): Promise<Sku> {
    try {
      return await this.repo.save(this.repo.create(dto));
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(
          `Le SKU « ${dto.value} » existe déjà pour le canal « ${dto.channel} ».`,
        );
      }
      throw e;
    }
  }

  /** Pas d'updateValue : le SKU est invariant. On déprécie/recrée si besoin. */
}
```

> `isUniqueViolation` = helper qui reconnaît le code d'erreur de l'ORM/driver (ex. `23505` en PostgreSQL) → le mappe en `409 Conflict`.

---

## 9. Le contrôleur (`sku.controller.ts`)

```ts
@Controller("skus")
export class SkuController {
  constructor(private readonly service: SkuService) {}

  @Post()
  create(@Body() dto: CreateSkuDto) {
    // validé automatiquement par ZodValidationPipe
    return this.service.create(dto);
  }
}
```

---

## 10. Le module (`sku.module.ts`)

```ts
@Module({
  imports: [TypeOrmModule.forFeature([Product, Variant, Sku])],
  controllers: [SkuController],
  providers: [SkuService],
  exports: [SkuService], // réutilisable par le module de synchro
})
export class SkuModule {}
```

---

## 11. Flux de validation

```
Front (saisie)                         Back (NestJS)
  │ placeholder/hint/maxlength           │
  │  ← dérivés de SKU_RULES              │
  │ regex live (confort)                 │
  ▼                                      ▼
POST /skus ─────────────────► ZodValidationPipe (SkuSchema)
                                   │ 1. normalize (trim/upper)
                                   │ 2. pattern + extraCheck
                                   ▼
                              SkuService.create()
                                   │ save()
                                   ▼
                              DB: UNIQUE(channel, value) + FK variant_uuid
                                   │  violation → 409 Conflict
                                   ▼
                              201 Created
```

**Règle d'or** : le front **guide** (UX), le back **valide** (autorité), la DB **garantit** (unicité + intégrité).

---

## 12. Tests (`sku.service.spec.ts`)

Cas à couvrir :

- ✅ SKU valide par canal (un test par entrée du registre, piloté par `example`).
- ❌ Format invalide → message contient `label` + `example`.
- ✅ Normalisation : `" ecl-01 "` (shopify) → `ECL-01`.
- ❌ EAN-13 longueur ok mais **checksum faux** → rejet.
- ❌ Doublon `(channel, value)` → `ConflictException` (409).
- ✅ Deux canaux, même `value` → autorisé (unicité **par canal**).

> Astuce : itérer sur `Object.entries(SKU_RULES)` pour générer les tests « exemple valide » automatiquement — le registre pilote aussi la suite de tests.

---

## 13. Points ouverts / à confirmer

- ⚠️ **Règle `caisse`** : la regex `^\d{1,6}$` est un **placeholder**. À remplacer par le format réel confirmé par **PI Electronique** (longueur max + charset de la référence article / PLU). C'est **la seule ligne à éditer** le jour où tu as la réponse.
- Décider si `ean13` est un vrai canal de SKU ou plutôt le champ **code-barres** (distinct du SKU côté Shopify — les douchettes lisent le code-barres, pas le SKU).

---

## 14. Place dans l'architecture globale

- **Shopify** : le champ SKU natif reçoit le `Sku` de canal `shopify` ; l'**UUID de la variante** va dans un **metafield** (`custom.pim_variant_id`) et sert de clé de jointure pour la synchro `productSet`.
- **Caisse PI Electronique** : reçoit le `Sku` de canal `caisse` ; le **mapping `référence caisse → UUID variante`** est détenu par le PIM (puisque la caisse ne stockera probablement pas l'UUID). Comme le SKU caisse est **invariant**, ce mapping est stable.
- **Jointure partout sur l'UUID** → un SKU peut changer de forme selon le canal sans jamais rompre la réconciliation stock/ventes.

---

_Doc de conception — la règle `caisse` reste à confirmer auprès de PI Electronique. Exemples en TypeORM/nestjs-zod ; adapter à ton ORM et à ta version de Zod._
