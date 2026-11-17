import prisma from "../app/db.server";
import { seedDevData } from "../app/models/seed.server";

const domain = process.env.SEED_SHOP_DOMAIN || undefined;
seedDevData(domain)
  .then((shop) => console.log(`Seeded ${shop.domain}`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
