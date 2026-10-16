import app from "./app";
import { logger } from "./lib/logger";
import { seedSalonData } from "./lib/seedSalon";

const port = process.env["PORT"] ? Number(process.env["PORT"]) : 3000;

await seedSalonData();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
