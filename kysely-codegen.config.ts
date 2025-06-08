const config = {
  // Use environment variable directly (kysely-codegen supports this syntax)
  url: "env(DATABASE_URL)",

  // Output the types to a different location to avoid conflicts
  outFile: "./src/lib/db/types.ts",

  // Include all schemas (you might want to specify just 'public' if needed)
  includePattern: "public.*",

  // Exclude Prisma's internal tables
  excludePattern: "_prisma_migrations",

  // Use camelCase to match your current setup
  camelCase: true,

  // Generate runtime enums
  runtimeEnums: true,

  // Override unsupported prisma columns to be typed correctly.
  // Note: kysely-codegen doesn't support type-level overrides yet,
  // so we need to override each vector column individually
  overrides: {
    columns: {},
  },
};

export default config;
