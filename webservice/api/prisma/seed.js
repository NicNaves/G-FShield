const bcrypt = require("bcrypt");
const prisma = require("../src/lib/prisma");

async function main() {
  const hashedPassword = await bcrypt.hash("senhaSegura123", 10);

  const user = await prisma.user.upsert({
    where: { email: "admin@admin.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@admin.com",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  console.log("Usuario admin GF-Shield criado:", user);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
