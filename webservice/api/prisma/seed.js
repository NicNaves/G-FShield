const bcrypt = require("bcrypt");
const prisma = require("../src/lib/prisma");

async function main() {
  const hashedPassword = await bcrypt.hash("senhaSegura123", 10);

  const adminUsers = [
    {
      name: "Admin",
      email: "admin@admin.com",
      password: hashedPassword,
      role: "ADMIN",
      active: true,
    },
  ];

  const users = [];
  for (const adminUser of adminUsers) {
    const user = await prisma.user.upsert({
      where: { email: adminUser.email },
      update: {
        name: adminUser.name,
        password: adminUser.password,
        role: adminUser.role,
        active: true,
      },
      create: adminUser,
    });

    users.push(user);
  }

  console.log("Usuarios admin G-FShield garantidos pelo seed:", users.map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    active: user.active,
  })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
