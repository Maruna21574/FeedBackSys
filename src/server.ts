import { app } from "./app";
import { env } from "./config/env";

app.listen(env.port, () => {
  console.log(`Feedback nástroj beží na ${env.appUrl} (port ${env.port}, ${env.nodeEnv})`);
});
