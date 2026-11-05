import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "@storyflow/shared/env";
import { PrismaClient } from "./generated/client";

const globalForPrisma = globalThis as unknown as { __storyflowPrisma?: PrismaClient };

/** One PrismaClient per process (survives Next.js dev hot reloads). */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__storyflowPrisma) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    globalForPrisma.__storyflowPrisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.__storyflowPrisma;
}
