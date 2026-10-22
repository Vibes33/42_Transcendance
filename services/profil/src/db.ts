import { openDatabase } from "@loltr/shared/server";
import { join } from "node:path";
import * as schema from "./schema";

export function createDb(file = process.env.DB_FILE ?? "./data/profil.sqlite") {
  return openDatabase({ file, schema, migrations: join(import.meta.dir, "../drizzle") }).db;
}
export type Db = ReturnType<typeof createDb>;
export { schema };
