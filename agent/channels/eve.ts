import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";
import { betterAuthEveAuth } from "@/lib/eve-auth";

export default eveChannel({
  auth: [betterAuthEveAuth, localDev(), vercelOidc()],
  // Accept image, PDF, and text/code attachments (up to 20 MB) from the composer.
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf", "text/*", "application/json"],
    maxBytes: 20 * 1024 * 1024,
  },
});
