export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.PAYPAL_ENV || process.env.PAYPAL_BASE_URL || process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_SECRET) {
    const { sandboxGuard } = await import("./lib/paypal.js");
    sandboxGuard();
  }
  if ((process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_SECRET) && !process.env.APP_SIGNING_SECRET)
    throw new Error("Sandbox requires APP_SIGNING_SECRET.");
}
