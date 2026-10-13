declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    OWNER_EMAIL?: string;
    BUCKET?: R2Bucket;
    ADMIN_SYNC_TOKEN?: string;
    PHONE_SESSION_SECRET?: string;
    PHONE_UNLOCK_VERIFIER?: string;
  }
}

