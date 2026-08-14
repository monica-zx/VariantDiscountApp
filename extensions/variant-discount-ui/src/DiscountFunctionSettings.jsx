import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState, useEffect, useRef, useCallback, useMemo } from "preact/hooks";

export default async () => {
  render(<App />, document.body);
};

const KEY = "function-configuration";
const NAMESPACE = "$app";

const LOAD_QUERY = `
  query GetDiscountConfig($id: ID!) {
    discountNode(id: $id) {
      metafield(namespace: "$app", key: "function-configuration") {
        value
      }
    }
  }
`;

// ─── Pure helpers (kept outside the component so they aren't re-created every render) ───

function validateDiscountValue(type, rawValue) {
  if (rawValue === "" || rawValue === null || Number.isNaN(Number(rawValue))) {
    return "Enter a discount value";
  }
  const num = Number(rawValue);
  if (num <= 0) return "Must be greater than 0";
  if (type === "percentage" && num > 100) return "Percentage can't exceed 100";
  return "";
}

function matchModeHelpText(matchMode, variantCount) {
  if (matchMode === "exclude") {
    return variantCount === 0
      ? "No variants excluded yet — this discount currently applies to your ENTIRE store."
      : "Discount applies to every variant except the ones listed below (exact name match, case-insensitive).";
  }
  return variantCount === 0
    ? "Add at least one variant name below — otherwise this discount won't apply to anything."
    : "Discount applies only to variants whose name exactly matches one below (case-insensitive).";
}

function App() {
  const { applyMetafieldChange, data, query } = shopify;

  const [discountType, setDiscountType] = useState("percentage"); // "percentage" | "fixed"
  const [discountValue, setDiscountValue] = useState(10);
  const [matchMode, setMatchMode] = useState("include"); // "include" | "exclude"
  const [variantNames, setVariantNames] = useState([]);
  const [nameInput, setNameInput] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [saveErrorMessage, setSaveErrorMessage] = useState("");

  // Track if this is the initial load — don't auto-save on first render
  const isInitialLoad = useRef(true);
  const duplicateTimerRef = useRef(null);

  // ─── Load saved config via GraphQL ───────────────────────────────────────
  useEffect(() => {
    async function loadConfig() {
      try {
        const rawId = data.id;
        const gid = String(rawId).startsWith("gid://")
          ? rawId
          : `gid://shopify/DiscountNode/${rawId}`;

        const result = await query(LOAD_QUERY, { variables: { id: gid } });
        const val = result?.data?.discountNode?.metafield?.value;

        if (val) {
          const parsed = JSON.parse(val);
          if (parsed.discountType === "percentage" || parsed.discountType === "fixed") {
            setDiscountType(parsed.discountType);
          }
          if (typeof parsed.discountValue === "number") setDiscountValue(parsed.discountValue);
          if (parsed.matchMode === "include" || parsed.matchMode === "exclude") {
            setMatchMode(parsed.matchMode);
          }
          if (Array.isArray(parsed.variantNames)) setVariantNames(parsed.variantNames);
        }
      } catch (e) {
        // Technical detail stays in the console; merchants get a plain-language banner instead.
        console.error("Load error:", e);
        setSaveStatus("error");
        setSaveErrorMessage("Couldn't load your saved settings. Try reopening this panel.");
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  const discountValueError = useMemo(
    () => validateDiscountValue(discountType, discountValue),
    [discountType, discountValue]
  );

  // ─── Auto-stage changes (debounced) whenever a field changes ─────────────
  useEffect(() => {
    if (loading) return;

    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    // Don't stage invalid data — let the merchant fix it first.
    if (discountValueError) {
      setSaveStatus("error");
      setSaveErrorMessage(discountValueError);
      return;
    }

    setSaveStatus("saving");

    const payload = JSON.stringify({
      discountType,
      discountValue: Number(discountValue),
      matchMode,
      variantNames,
    });

    const timer = setTimeout(async () => {
      try {
        const result = await applyMetafieldChange({
          type: "updateMetafield",
          namespace: NAMESPACE,
          key: KEY,
          valueType: "json",
          value: payload,
        });

        if (result.type === "error") {
          console.error("Save error:", result.message);
          setSaveStatus("error");
          setSaveErrorMessage("Couldn't stage your changes. Please try again.");
        } else {
          setSaveStatus("saved");
        }
      } catch (e) {
        console.error("Auto-save error:", e);
        setSaveStatus("error");
        setSaveErrorMessage("Couldn't stage your changes. Please try again.");
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [discountType, discountValue, matchMode, variantNames, loading, discountValueError]);

  // ─── Add / remove variant names ───────────────────────────────────────────
  const handleAddName = useCallback(() => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;

    const exists = variantNames.some(
      (n) => n.toLowerCase() === trimmed.toLowerCase()
    );

    if (exists) {
      setDuplicateWarning(true);
      clearTimeout(duplicateTimerRef.current);
      duplicateTimerRef.current = setTimeout(() => setDuplicateWarning(false), 2000);
      return;
    }

    setVariantNames((c) => [...c, trimmed]);
    setNameInput("");
    setDuplicateWarning(false);
  }, [nameInput, variantNames]);

  const handleRemoveName = useCallback((name) => {
    setVariantNames((c) => c.filter((n) => n !== name));
  }, []);

  const handleClearAll = useCallback(() => {
    setVariantNames([]);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <s-section>
        <s-stack gap="base" alignItems="center">
          <s-spinner />
          <s-text>Loading...</s-text>
        </s-stack>
      </s-section>
    );
  }

  const isPercentage = discountType === "percentage";
  const showRiskWarning = matchMode === "exclude" && variantNames.length === 0;

  return (
    <s-function-settings>
      <s-section heading="Variant Name Discount">
        <s-stack gap="base">

          {/* Status banner — only shown when there's something worth telling the merchant */}
          {saveStatus === "saving" && (
            <s-banner tone="info">
              <s-text>Staging changes…</s-text>
            </s-banner>
          )}
          {saveStatus === "saved" && (
            <s-banner tone="success">
              <s-text>Changes staged — click Save (top of page) to publish.</s-text>
            </s-banner>
          )}
          {saveStatus === "error" && (
            <s-banner tone="critical">
              <s-text>{saveErrorMessage}</s-text>
            </s-banner>
          )}
          {showRiskWarning && (
            <s-banner tone="warning">
              <s-text>
                Heads up: with "exclude" selected and no variant names added, this
                discount applies to every variant in your store.
              </s-text>
            </s-banner>
          )}

          {/* Discount type */}
          <s-select
            label="Discount type"
            name="discountType"
            value={discountType}
            onChange={(e) => setDiscountType(e.currentTarget.value)}
          >
            <s-option value="percentage">Percentage off</s-option>
            <s-option value="fixed">Fixed amount off</s-option>
          </s-select>

          {/* Discount value — label/bounds adapt to type, inline validation */}
          <s-number-field
            label={isPercentage ? "Discount percentage (%)" : "Discount amount"}
            name="discountValue"
            value={discountValue}
            min={0.01}
            max={isPercentage ? 100 : undefined}
            step={isPercentage ? 1 : 0.01}
            error={discountValueError || undefined}
            onChange={(e) => setDiscountValue(e.currentTarget.value)}
          />

          {/* Include vs exclude mode */}
          <s-select
            label="Apply discount to"
            name="matchMode"
            value={matchMode}
            onChange={(e) => setMatchMode(e.currentTarget.value)}
          >
            <s-option value="include">Only the variants listed below</s-option>
            <s-option value="exclude">All variants EXCEPT the ones listed below</s-option>
          </s-select>

          {/* Hidden field — mirrors variantNames so the extension's array data
              participates in Shopify's native form dirty-state tracking, since
              there's no built-in "list" form control. (matchMode doesn't need
              this: the <s-select name="matchMode"> above already tracks itself.) */}
          <s-box display="none">
            <s-text-field
              label="variantNames"
              labelAccessibilityVisibility="exclusive"
              name="variantNames"
              value={variantNames.join(",")}
              defaultValue=""
            />
          </s-box>

          {/* Name input */}
          <s-stack direction="inline" alignItems="center" gap="base">
            <s-text-field
              label="Variant name"
              placeholder="e.g. Large"
              value={nameInput}
              error={duplicateWarning ? "Already added" : undefined}
              onChange={(e) => {
                setNameInput(e.currentTarget.value);
                if (duplicateWarning) setDuplicateWarning(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddName();
                }
              }}
            />
            <s-button onClick={handleAddName}>Add</s-button>
          </s-stack>

          <s-text tone="subdued">{matchModeHelpText(matchMode, variantNames.length)}</s-text>

          {/* Saved names list */}
          {variantNames.length > 0 && (
            <s-stack gap="tight">
              <s-stack direction="inline" alignItems="center" gap="base">
                <s-text tone="subdued">
                  {variantNames.length} variant name{variantNames.length === 1 ? "" : "s"} added
                </s-text>
                <s-button variant="tertiary" onClick={handleClearAll}>
                  Clear all
                </s-button>
              </s-stack>
              {variantNames.map((name) => (
                <s-stack key={name} direction="inline" alignItems="center" gap="tight">
                  <s-text>{name}</s-text>
                  <s-button variant="tertiary" onClick={() => handleRemoveName(name)}>
                    Remove
                  </s-button>
                </s-stack>
              ))}
            </s-stack>
          )}

        </s-stack>
      </s-section>
    </s-function-settings>
  );
}
