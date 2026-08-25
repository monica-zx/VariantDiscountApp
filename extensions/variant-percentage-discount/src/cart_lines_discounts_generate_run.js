import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";


function normalize(str) {
  return String(str ?? "").trim().toLowerCase();
}

// A variant title like "ABS Plastic / Red" is Shopify's auto-generated
// concatenation of option values. Splitting on "/" lets us match against
// each individual option value, not just the full combined title.
function titleParts(title) {
  return String(title ?? "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function cartLinesDiscountsGenerateRun(input) {
  // NOTE: enteredDiscountCodesReject is only valid for functions backed by an
  // AUTOMATIC discount (see Shopify's Discount Function API docs). This is a
  // code discount (input.triggeringDiscountCode is set when a code triggers
  // the run), so calling that operation here makes the whole run fail and
  // Shopify falls back to its generic "isn't working right now" message.
  // Until Shopify supports custom rejection messages for code discounts,
  // the only valid response when the cart doesn't qualify is no operations —
  // Shopify will show its own default "not valid for the items in your cart"
  // style message instead.
  const bail = () => {
    return { operations: [] };
  };

  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  const config = input.discount.metafield?.jsonValue;
  const rawNames = config?.variantNames;
  const discountType = config?.discountType; // "percentage" | "fixed"
  const discountValue = Number(config?.discountValue);

  // "include" (default, backward-compatible): only listed variant names get the discount.
  // "exclude": every variant EXCEPT the listed names gets the discount.
  const matchMode = config?.matchMode === "exclude" ? "exclude" : "include";

  if (
    !discountType ||
    !Number.isFinite(discountValue) ||
    discountValue <= 0 ||
    !Array.isArray(rawNames)
  ) {
    return { operations: [] };
  }

  // In include mode an empty name list can never match anything, so bail early.
  // In exclude mode an empty name list is valid — it just means "discount everything".
  if (matchMode === "include" && rawNames.length === 0) {
    return { operations: [] };
  }

  const targetNames = new Set(rawNames.map(normalize));

  function nameMatches(title) {
    // Match on the full title, e.g. "ABS Plastic" or "ABS Plastic / Red"
    if (targetNames.has(normalize(title))) return true;

    // Match on any individual option segment, e.g. "ABS Plastic" inside "ABS Plastic / Red"
    return titleParts(title).some((part) => targetNames.has(normalize(part)));
  }

  function isTargetedByOwnName(line) {
    if (line.merchandise.__typename !== "ProductVariant") return false;
    const matched = nameMatches(line.merchandise.title);
    return matchMode === "exclude" ? !matched : matched;
  }

  // ─── Link Globo Product Options add-ons to their anchor line ───────────────
  // Globo tags the main/anchor line with `_gpo_product_group` and any add-on
  // line it generates with `_gpo_parent_product_group`, both set to the same
  // group id. We use that id so an add-on (e.g. a "Finish" line) inherits the
  // discount decision made for the anchor variant it belongs to (e.g. "Carbon
  // Fiber"), instead of being judged on its own, unrelated variant name.
  const anchorTargetByGroup = new Map();

  for (const line of input.cart.lines) {
    const groupId = line.gpoGroup?.value;
    if (!groupId) continue;
    anchorTargetByGroup.set(groupId, isTargetedByOwnName(line));
  }

  const targets = input.cart.lines
    .filter((line) => {
      if (line.merchandise.__typename !== "ProductVariant") return false;

      const parentGroupId = line.gpoParentGroup?.value;
      if (parentGroupId && anchorTargetByGroup.has(parentGroupId)) {
        // This is a Globo add-on line — inherit its anchor line's decision.
        return anchorTargetByGroup.get(parentGroupId);
      }

      // Anchor line, or an ordinary line unrelated to Globo — judge on its own name.
      return isTargetedByOwnName(line);
    })
    .map((line) => ({ cartLine: { id: line.id } }));

  if (!targets.length) {
    // Would ideally be a custom message like:
    //   matchMode === "exclude"
    //     ? `This code doesn't apply to: ${rawNames.join(", ")}`
    //     : `This code only applies to: ${rawNames.join(", ")}`
    // — but Shopify doesn't support custom rejection messages for code
    // discounts yet (see note above), so we just bail with no operations.
    return bail();
  }

  const value =
    discountType === "fixed"
      ? {
          fixedAmount: {
            amount: discountValue.toFixed(2),
            appliesToEachItem: true, // apply the fixed amount to each matching line, not split across all of them
          },
        }
      : {
          percentage: {
            value: discountValue,
          },
        };

  const scopeLabel = matchMode === "exclude" ? "ELIGIBLE VARIANTS" : "SELECTED VARIANTS";
  const message =
    discountType === "fixed"
      ? `$${discountValue.toFixed(2)} OFF ${scopeLabel}`
      : `${discountValue}% OFF ${scopeLabel}`;

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              message,
              targets,
              value,
            },
          ],
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}