import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory GDPR compliance webhook, required for all public Shopify apps.
// Shopify sends this 48 hours after a shop uninstalls the app, asking it to
// delete any remaining data for that shop.
//
// Session rows are already removed by the app/uninstalled webhook, but we
// clean up again here in case that webhook was missed or the shop still has
// leftover rows for any other reason. This app stores no other shop data —
// the discount configuration lives in a Shopify metafield on the merchant's
// own store, not in our database.
export const action = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);

  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
