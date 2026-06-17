// Ambientne deklaracie pre balicky bez vlastnych/DefinitelyTyped typov.

declare module "session-file-store" {
  import session from "express-session";

  interface FileStoreOptions {
    path?: string;
    ttl?: number;
    retries?: number;
    [key: string]: unknown;
  }

  function fileStoreFactory(
    session: typeof import("express-session")
  ): new (options?: FileStoreOptions) => session.Store;

  export = fileStoreFactory;
}

declare module "express-ejs-layouts" {
  import { RequestHandler } from "express";
  const expressLayouts: RequestHandler;
  export = expressLayouts;
}
