import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get this app's Shopify Functions — used to identify which discounts
  // in the store belong to this app (and to build the "Add discount" link).
  const functionsResponse = await admin.graphql(
    `#graphql
      query GetFunctions {
        shopifyFunctions(first: 10) {
          nodes {
            id
            title
            apiType
          }
        }
      }`,
  );
  const functionsJson = await functionsResponse.json();
  const functions = functionsJson.data?.shopifyFunctions?.nodes ?? [];
  const functionIds = new Set(functions.map((f) => f.id));

  // List existing discounts in the store, then keep only the ones that use
  // one of this app's functions.
  const discountsResponse = await admin.graphql(
    `#graphql
      query GetAppDiscounts {
        discountNodes(first: 25, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            discount {
              __typename
              ... on DiscountAutomaticApp {
                title
                status
                startsAt
                endsAt
                appDiscountType {
                  functionId
                }
              }
              ... on DiscountCodeApp {
                title
                status
                startsAt
                endsAt
                appDiscountType {
                  functionId
                }
                codes(first: 1) {
                  nodes {
                    code
                  }
                }
              }
            }
          }
        }
      }`,
  );
  const discountsJson = await discountsResponse.json();
  const allDiscountNodes = discountsJson.data?.discountNodes?.nodes ?? [];

  const appDiscounts = allDiscountNodes
    .filter((node) => functionIds.has(node.discount?.appDiscountType?.functionId))
    .map((node) => ({
      id: node.id,
      numericId: node.id.split("/").pop(),
      title: node.discount.title,
      status: node.discount.status,
      startsAt: node.discount.startsAt,
      endsAt: node.discount.endsAt,
      type: node.discount.__typename === "DiscountCodeApp" ? "Code" : "Automatic",
      code:
        node.discount.__typename === "DiscountCodeApp"
          ? node.discount.codes?.nodes?.[0]?.code
          : null,
    }));

  return { functions, appDiscounts };
};

export default function Index({ loaderData }) {
  const { functions, appDiscounts } = loaderData;

  const hasFunction = functions.length > 0;

  return (
    <s-page heading="Variant Discount App">
      {/* shopify:// links are automatically intercepted by App Bridge for
          in-admin navigation — no JS call needed. */}
      <s-link href="shopify://admin/discounts" slot="primary-action">
        Add discount
      </s-link>

      <s-section heading="About this app">
        <s-paragraph>
          Create smart discounts based on variant names. {" "}
          <s-text fontWeight="bold">variant names</s-text>. Include or exclude variants and apply percentage or fixed amount discounts with ease.
        </s-paragraph>
        <s-paragraph>
          Each discount can apply either a{" "}
          <s-text fontWeight="bold">percentage off</s-text> or a{" "}
          <s-text fontWeight="bold">fixed amount off</s-text>, configured from the discount&apos;s settings page after you create it.
        </s-paragraph>
        <s-paragraph>
          To create a new one, click{" "}
          <s-text fontWeight="bold">Add discount</s-text> above, then choose
          this app's discount function from the list.
        </s-paragraph>
      </s-section>

      <s-section heading="Your discounts">
        {!hasFunction && (
          <s-banner tone="warning">
            <s-text>
              No discount function was found for this app. Make sure it's
              deployed (
              <s-text fontWeight="bold">shopify app deploy</s-text>) and
              installed on this store.
            </s-text>
          </s-banner>
        )}

        {hasFunction && appDiscounts.length === 0 && (
          <s-paragraph>
            You haven't created any discounts with this app yet. Click{" "}
            <s-text fontWeight="bold">Add discount</s-text> to get started.
          </s-paragraph>
        )}

        {appDiscounts.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header>Title</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Code</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {appDiscounts.map((d) => (
                <s-table-row key={d.id}>
                  <s-table-cell>
                    <s-link href={`shopify://admin/discounts/${d.numericId}`}>
                      {d.title}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>{d.type}</s-table-cell>
                  <s-table-cell>{d.status}</s-table-cell>
                  <s-table-cell>{d.code ?? "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
