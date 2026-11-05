import { getPrisma } from "./client";
import { REFERENCE_TEMPLATE_PROPS } from "./reference-template";

// Idempotent template seed, run by `migrate:deploy` after migrations.

async function main() {
  const prisma = getPrisma();
  await prisma.template.upsert({
    where: { slug: "reference" },
    create: {
      slug: "reference",
      name: "Reference (offline smoke test)",
      compositionId: "StoryComposition",
      defaultProps: REFERENCE_TEMPLATE_PROPS,
    },
    update: { defaultProps: REFERENCE_TEMPLATE_PROPS, compositionId: "StoryComposition" },
  });
  console.log(JSON.stringify({ msg: "seeded templates", templates: ["reference"] }));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
