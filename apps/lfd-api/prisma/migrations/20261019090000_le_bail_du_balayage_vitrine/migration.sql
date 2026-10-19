-- LE BAIL DU BALAYAGE DE LA VITRINE (2026-10-19)
--
-- Doc `documentation/webhooks/vitrine.md` : deux passages du cron `*/5` qui
-- se chevauchent (un balayage de plus de cinq minutes) pouvaient poster deux
-- fois la même livraison. Le balayage prend désormais un bail par UNE
-- écriture conditionnée (`INSERT … ON CONFLICT DO UPDATE … WHERE` échu) ; le
-- second passage le trouve tenu et sort sans rien faire.
--
-- ADDITIVE : une table neuve, vide ; la ligne naît au premier balayage.
--
-- Retour arrière : `DROP TABLE "public"."vitrine_sweep_leases"` — le
-- balayage redevient sans bail (le code qui le lit doit être retiré avant).

CREATE TABLE "public"."vitrine_sweep_leases" (
    "name" TEXT NOT NULL,
    "claim_token" TEXT,
    "claimed_until" TIMESTAMPTZ(3),
    CONSTRAINT "vitrine_sweep_leases_pkey" PRIMARY KEY ("name"),
    CONSTRAINT "vitrine_sweep_leases_held" CHECK (("claim_token" IS NULL) = ("claimed_until" IS NULL))
);
