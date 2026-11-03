data "external_schema" "drizzle" {
  program = ["./node_modules/.bin/drizzle-kit", "export", "--config", "apps/api/drizzle.config.ts"]
}

env "local" {
  src = data.external_schema.drizzle.url
  dev = getenv("ATLAS_DEV_URL")

  migration {
    dir = "file://db/migrations"
  }
}
