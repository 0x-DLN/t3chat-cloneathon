Personal template for a nextjs project. Largely inspired by [create t3-app](https://create.t3.gg/).

## Getting started

1. `pnpm dlx shadcn@latest add -a -y`
2. `cp .env.example .env`
3. Fill in `.env`, you can use `openssl rand -base64 32` to generate a better auth secret.
4. `pnpm db:up`
5. `pnpm db:migrate --name initial_schema`
6. `pnpm db:migrate:deploy`
7. `pnpm db:generate`
8. `pnpm dev`
