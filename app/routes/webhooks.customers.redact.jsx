import { authenticate } from "../shopify.server";

// Mandatory GDPR compliance webhook, required for all public Shopify apps.
// Shopify sends this 10 days after a customer redaction request, asking the
// app to delete any data it holds about that customer.
//
// This app never stores customer data (see webhooks.customers.data_request),
// so there is nothing to redact. We just acknowledge the webhook.
export const action = async ({ request }) => {
  await authenticate.webhook(request);

  return new Response();
};
