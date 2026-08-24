import { authenticate } from "../shopify.server";

// Mandatory GDPR compliance webhook, required for all public Shopify apps.
// Shopify sends this when a merchant's customer requests their data.
//
// This app never stores or processes customer data — it only reads a
// merchant-configured discount metafield (variant names, discount type/value)
// at checkout time, and does not persist anything about individual customers.
// There is nothing to return, so we just acknowledge the webhook.
export const action = async ({ request }) => {
  await authenticate.webhook(request);

  return new Response();
};
