import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory GDPR compliance webhooks, required for all public Shopify apps.
// One endpoint handles all three topics — customers/data_request,
// customers/redact, shop/redact — since shopify.app.toml registers them
// together under a single compliance_topics subscription/URI.
//
// This app never stores or processes customer data — it only reads a
// merchant-configured discount metafield (variant names, discount type/
// value) at checkout time, and doesn't persist anything about individual
// customers. So there's nothing to return for a data request or redact for
// a customer. For shop/redact we clean up the shop's session row, in case
// it wasn't already removed by the app/uninstalled webhook.
export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);

  if (topic === "shop/redact") {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
