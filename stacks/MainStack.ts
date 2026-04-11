import { Api, Config, Cron, StackContext, Table } from "sst/constructs";
import * as ses from "aws-cdk-lib/aws-ses";

export function MainStack({ stack }: StackContext) {
  const NEON_DATABASE_URL = new Config.Secret(stack, "NEON_DATABASE_URL");
  const JWT_SECRET = new Config.Secret(stack, "JWT_SECRET");
  const SUPER_ADMIN_KEY = new Config.Secret(stack, "SUPER_ADMIN_KEY");
  const SUPER_ADMIN_EMAIL = new Config.Secret(stack, "SUPER_ADMIN_EMAIL");
  const rateLimitTable = new Table(stack, "RateLimitState", {
    fields: {
      apiKeyId: "string",
      windowBucket: "string",
    },
    primaryIndex: {
      partitionKey: "apiKeyId",
      sortKey: "windowBucket",
    },
    timeToLiveAttribute: "expiresAt",
  });

  // SES domain identity — only on production (domain identity is a regional singleton;
  // creating it on every stage would conflict with the existing production resource)
  if (stack.stage === "production") {
    new ses.EmailIdentity(stack, "SesIdentity", {
      identity: ses.Identity.domain("qivam.com"),
    });
  }

  // TODO: Re-add Bucket for mosque media (S3) when needed
  // const mediaBucket = new Bucket(stack, "MediaBucket");

  const api = new Api(stack, "Api", {
    defaults: {
      function: {
        bind: [
          NEON_DATABASE_URL,
          JWT_SECRET,
          SUPER_ADMIN_KEY,
          SUPER_ADMIN_EMAIL,
          rateLimitTable,
        ],
        environment: {
          RATE_LIMIT_TABLE_NAME: rateLimitTable.tableName,
          SST_STAGE: stack.stage,
        },
        logRetention: "one_month",
        nodejs: {
          install: ["tzlookup"],
        },
      },
      throttle: {
        rate: 100,
        burst: 200,
      },
    },
    routes: {
      "ANY /{proxy+}": "packages/functions/api.handler",
    },
  });

  api.attachPermissions(["ses:SendEmail", "ses:SendRawEmail"]);

  // ── Log retention cron ───────────────────────────────────────────────────
  new Cron(stack, "LogCleanup", {
    schedule: "rate(1 day)",
    job: {
      function: {
        handler: "packages/functions/crons/log-cleanup.handler",
        bind: [NEON_DATABASE_URL],
        environment: {
          SST_STAGE: stack.stage,
        },
      },
    },
  });

  stack.addOutputs({
    ApiEndpoint: api.url,
  });

  return { api };
}
