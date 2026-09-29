import { hash } from "@node-rs/argon2";
import { prisma } from "../src/lib/prisma";

/**
 * Creates (or resets) a full-access ADMIN of the shop's /admin.
 *
 * The password never lives in the repo, a file or the shell history: run it
 * with a hidden prompt, from the project root —
 *
 *   read -rs "ADMIN_PASSWORD?Password: " && export ADMIN_PASSWORD && \
 *     npx tsx --env-file=.env scripts/seed-admin.ts; unset ADMIN_PASSWORD
 *
 * ADMIN_EMAIL overrides the default address. Running it again for the same
 * email resets that admin's password and re-activates the account.
 */
const EMAIL = (process.env.ADMIN_EMAIL ?? "gkozyris@i4ria.com").trim().toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD ?? "";

async function main() {
  if (PASSWORD.length < 10) {
    throw new Error("ADMIN_PASSWORD is missing or shorter than 10 characters — see the note at the top.");
  }
  const existing = await prisma.adminUser.findMany({ select: { email: true, role: true, isActive: true } });
  console.log("  υπάρχοντες admins:", existing.length ? existing.map(a => `${a.email} (${a.role})`).join(", ") : "κανένας");

  // Ίδιες παράμετροι με τον verifier του auth.ts (argon2id, m=19456 t=2 p=1).
  const passwordHash = await hash(PASSWORD, {
    memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32,
  });

  const user = await prisma.adminUser.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, name: process.env.ADMIN_NAME || null, passwordHash, role: "ADMIN", isActive: true },
    update: { passwordHash, role: "ADMIN", isActive: true, sessionsValidFrom: new Date() },
    select: { id: true, email: true, role: true, isActive: true, createdAt: true },
  });
  console.log(`  ✅ ${user.email} · ${user.role} · ενεργός=${user.isActive}`);
}
main().catch(e => { console.error("❌", e.message); process.exitCode = 1; })
      .finally(() => prisma.$disconnect());
