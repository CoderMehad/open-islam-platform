import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { logger } from "./logger.adapter.js";

const ses = new SESv2Client({ region: "eu-west-1" });

interface SendApiKeyEmailParams {
  to: string;
  name: string;
  apiKey: string;
  prefix: string;
}

export async function sendApiKeyEmail({ to, name, apiKey, prefix }: SendApiKeyEmailParams): Promise<void> {
  const command = new SendEmailCommand({
    FromEmailAddress: "Qivam <noreply@qivam.com>",
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: "Your Qivam API Key" },
        Body: {
          Text: {
            Data: [
              `Hi ${name},`,
              "",
              "Your Qivam API key is ready to use:",
              "",
              `  ${apiKey}`,
              "",
              `Key prefix: ${prefix}`,
              "",
              "Include it in requests via the X-API-Key header:",
              "",
              `  curl -H "X-API-Key: ${apiKey}" https://api.qivam.com/v1/mosques`,
              "",
              "API documentation: https://docs.qivam.com",
              "",
              "— Qivam",
            ].join("\n"),
          },
        },
      },
    },
  });

  try {
    await ses.send(command);
    logger.info("API key email sent", { source: "ses", attributes: { to, prefix } });
  } catch (err) {
    logger.error("Failed to send API key email", { source: "ses", attributes: { to, prefix }, error: err instanceof Error ? err : undefined });
    throw err;
  }
}

interface SendMosqueSubmissionEmailParams {
  superAdminEmail: string;
  mosqueName: string;
  mosqueId: string;
  adminEmail: string;
}

export async function sendMosqueSubmissionEmail({
  superAdminEmail,
  mosqueName,
  mosqueId,
  adminEmail,
}: SendMosqueSubmissionEmailParams): Promise<void> {
  const command = new SendEmailCommand({
    FromEmailAddress: "Qivam <noreply@qivam.com>",
    Destination: { ToAddresses: [superAdminEmail] },
    Content: {
      Simple: {
        Subject: { Data: `New mosque pending review: ${mosqueName}` },
        Body: {
          Text: {
            Data: [
              "A new mosque has been submitted and is pending review.",
              "",
              `  Name:        ${mosqueName}`,
              `  Mosque ID:   ${mosqueId}`,
              `  Submitted by: ${adminEmail}`,
              "",
              "To approve:",
              `  PATCH /v1/super/mosques/${mosqueId}/approve`,
              "",
              "To reject:",
              `  PATCH /v1/super/mosques/${mosqueId}/reject`,
              "",
              "— Qivam",
            ].join("\n"),
          },
        },
      },
    },
  });

  try {
    await ses.send(command);
    logger.info("Mosque submission email sent", { source: "ses", attributes: { superAdminEmail, mosqueId } });
  } catch (err) {
    logger.error("Failed to send mosque submission email", { source: "ses", attributes: { superAdminEmail, mosqueId }, error: err instanceof Error ? err : undefined });
    throw err;
  }
}

interface SendMosqueStatusEmailParams {
  to: string;
  adminName: string;
  mosqueName: string;
}

export async function sendMosqueApprovedEmail({
  to,
  adminName,
  mosqueName,
}: SendMosqueStatusEmailParams): Promise<void> {
  const command = new SendEmailCommand({
    FromEmailAddress: "Qivam <noreply@qivam.com>",
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: `${mosqueName} is now live on Qivam` },
        Body: {
          Text: {
            Data: [
              `Assalamu Alaikum ${adminName},`,
              "",
              `Your mosque "${mosqueName}" has been verified and is now live on Qivam.`,
              "",
              "Developers can now find it via the API.",
              "",
              "— Qivam",
            ].join("\n"),
          },
        },
      },
    },
  });

  try {
    await ses.send(command);
    logger.info("Mosque approved email sent", { source: "ses", attributes: { to, mosqueName } });
  } catch (err) {
    logger.error("Failed to send mosque approved email", { source: "ses", attributes: { to, mosqueName }, error: err instanceof Error ? err : undefined });
    throw err;
  }
}

export async function sendMosqueRejectedEmail({
  to,
  adminName,
  mosqueName,
}: SendMosqueStatusEmailParams): Promise<void> {
  const command = new SendEmailCommand({
    FromEmailAddress: "Qivam <noreply@qivam.com>",
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: `Update on your mosque submission: ${mosqueName}` },
        Body: {
          Text: {
            Data: [
              `Assalamu Alaikum ${adminName},`,
              "",
              `Your mosque "${mosqueName}" could not be verified at this time.`,
              "",
              "Please reach out if you have any questions.",
              "",
              "— Qivam",
            ].join("\n"),
          },
        },
      },
    },
  });

  try {
    await ses.send(command);
    logger.info("Mosque rejected email sent", { source: "ses", attributes: { to, mosqueName } });
  } catch (err) {
    logger.error("Failed to send mosque rejected email", { source: "ses", attributes: { to, mosqueName }, error: err instanceof Error ? err : undefined });
    throw err;
  }
}
