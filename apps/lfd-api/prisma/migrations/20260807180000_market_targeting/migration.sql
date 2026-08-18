-- CreateTable
CREATE TABLE "growth"."market_naf_codes" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_naf_codes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "growth"."market_zones" (
    "code_postal" TEXT NOT NULL,
    "addressable" INTEGER NOT NULL DEFAULT 0,
    "per_naf" JSONB NOT NULL DEFAULT '[]',
    "fetched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_zones_pkey" PRIMARY KEY ("code_postal")
);
