// Seed de développement du catalogue — bascule LocalDb → Prisma (slice 1).
// Idempotent : des `upsert` sur des identifiants déterministes (`prd_<slug>`,
// `<id>_v1`), donc rejouable sans doublon. Reproduit fidèlement l'expansion du
// POC (`toProduct` du frontend) : kind = chocolat ⇒ resale, sinon daily ;
// déclinaison par défaut portant le prix canonique (centimes) et le poids.
//
// Exécution : `pnpm --filter lfc-pim-backend db:seed` (voir package.json) — le
// script charge `.env` via `node --env-file` (natif), pas via `dotenv`.
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/infra/database/client/client.js';
import { ROWS, SEED_CATEGORIES } from './catalogue-seed-data.js';

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  throw new Error('DATABASE_URL manquant : impossible de seeder.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function seedCategories(): Promise<void> {
  for (const category of SEED_CATEGORIES) {
    const fields = {
      name: { fr: category.nameFr },
      slug: { fr: category.slug },
      position: category.position,
    };
    await prisma.category.upsert({
      where: { id: category.id },
      create: { id: category.id, ...fields },
      update: fields,
    });
  }
}

async function seedProducts(): Promise<number> {
  let count = 0;
  for (const row of ROWS) {
    const [sku, name, slug, priceEur, weightGrams, categoryId, description] =
      row;
    const id = `prd_${slug}`;
    const variantId = `${id}_v1`;
    const variantSku = `${sku}-1`;
    const kind = categoryId === 'cat_choco' ? 'resale' : 'daily';
    const priceCents = Math.round(priceEur * 100);

    await prisma.product.upsert({
      where: { id },
      create: {
        id,
        sku,
        name: { fr: name },
        slug: { fr: slug },
        kind,
        categoryId,
        status: 'draft',
      },
      update: { name: { fr: name }, slug: { fr: slug }, kind, categoryId },
    });

    await prisma.productVariant.upsert({
      where: { id: variantId },
      create: {
        id: variantId,
        productId: id,
        sku: variantSku,
        name: { fr: name },
        isDefault: true,
        position: 0,
        priceCents,
        weightGrams,
      },
      update: { priceCents, weightGrams },
    });

    await prisma.skuRegistry.upsert({
      where: { value: sku },
      create: { value: sku, ownerType: 'product', ownerId: id },
      update: {},
    });
    await prisma.skuRegistry.upsert({
      where: { value: variantSku },
      create: { value: variantSku, ownerType: 'variant', ownerId: variantId },
      update: {},
    });

    if (description !== '') {
      const descriptionShort = { fr: description };
      await prisma.productEditorial.upsert({
        where: { productId: id },
        create: { productId: id, descriptionShort },
        update: { descriptionShort },
      });
    }

    count += 1;
  }
  return count;
}

async function main(): Promise<void> {
  await seedCategories();
  const products = await seedProducts();
  console.log(
    `Seed OK : ${SEED_CATEGORIES.length} catégories, ${products} produits.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
