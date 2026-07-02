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
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  const config = input.discount.metafield?.jsonValue;
  const rawNames = config?.variantNames;
  const discountType = config?.discountType; // "percentage" | "fixed"
  const discountValue = Number(config?.discountValue);

  if (
    !discountType ||
    !Number.isFinite(discountValue) ||
    discountValue <= 0 ||
    !Array.isArray(rawNames) ||
    rawNames.length === 0
  ) {
    return { operations: [] };
  }

  const targetNames = new Set(rawNames.map(normalize));

  const targets = input.cart.lines
    .filter((line) => {
      if (line.merchandise.__typename !== "ProductVariant") return false;

      const variant = line.merchandise;

      // Match on the full title, e.g. "ABS Plastic" or "ABS Plastic / Red"
      if (targetNames.has(normalize(variant.title))) return true;

      // Match on any individual option segment, e.g. "ABS Plastic" inside "ABS Plastic / Red"
      return titleParts(variant.title).some((part) => targetNames.has(normalize(part)));
    })
    .map((line) => ({ cartLine: { id: line.id } }));

  if (!targets.length) {
    return { operations: [] };
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

  const message =
    discountType === "fixed"
      ? `$${discountValue.toFixed(2)} OFF SELECTED VARIANTS`
      : `${discountValue}% OFF SELECTED VARIANTS`;

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