const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

const prisma = globalForPrisma.__gfShieldPrisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__gfShieldPrisma = prisma;
}

module.exports = prisma;
