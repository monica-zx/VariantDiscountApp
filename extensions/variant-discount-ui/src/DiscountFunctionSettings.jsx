import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";

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

function App() {
  const { applyMetafieldChange, data, query } = shopify;
  const [discountType, setDiscountType] = useState("percentage"); // "percentage" | "fixed"
  const [discountValue, setDiscountValue] = useState(10);
  const [variantNames, setVariantNames] = useState([]);
  const [nameInput, setNameInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [debugInfo, setDebugInfo] = useState("");

  // Track if this is the initial load — don't auto-save on first render
  const isInitialLoad = useRef(true);

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
          setDebugInfo("✅ Loaded saved config");
          if (parsed.discountType === "percentage" || parsed.discountType === "fixed") {
            setDiscountType(parsed.discountType);
          }
          if (typeof parsed.discountValue === "number") setDiscountValue(parsed.discountValue);
          if (Array.isArray(parsed.variantNames)) setVariantNames(parsed.variantNames);
        } else {
          setDebugInfo("ℹ️ No saved config yet");
        }
      } catch (e) {
        console.error("Load error:", e);
        setDebugInfo("❌ Load error: " + e.message);
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  // ─── Auto-save whenever any field changes ─────────────────────────────────
  useEffect(() => {
    if (loading) return;

    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    setSaveStatus("saving");

    const payload = JSON.stringify({
      discountType,
      discountValue: Number(discountValue),
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
          setSaveStatus("error");
          setDebugInfo("❌ Save error: " + result.message);
        } else {
          setSaveStatus("saved");
          setDebugInfo("✅ Config ready — click Save to confirm");
        }
      } catch (e) {
        console.error("Auto-save error:", e);
        setSaveStatus("error");
        setDebugInfo("❌ Save error: " + e.message);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [discountType, discountValue, variantNames, loading]);

  // ─── Add / remove variant names ───────────────────────────────────────────
  function handleAddName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;

    const exists = variantNames.some(
      (n) => n.toLowerCase() === trimmed.toLowerCase()
    );
    if (!exists) {
      setVariantNames((c) => [...c, trimmed]);
    }
    setNameInput("");
  }

  function handleRemoveName(name) {
    setVariantNames((c) => c.filter((n) => n !== name));
  }

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

  return (
    <s-function-settings>
      <s-section heading="Variant Name Discount">
        <s-stack gap="base">

          {/* Status banner */}
          <s-banner tone={
            saveStatus === "saved" ? "success"
            : saveStatus === "error" ? "critical"
            : "info"
          }>
            <s-text>
              {saveStatus === "saving" ? "⏳ Saving..."
               : saveStatus === "saved" ? "✅ Changes ready — click the Save button above to confirm"
               : saveStatus === "error" ? "❌ Save failed — check console"
               : debugInfo}
            </s-text>
          </s-banner>

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

          {/* Discount value — label/bounds adapt to type */}
          <s-number-field
            label={isPercentage ? "Discount percentage (%)" : "Discount amount"}
            name="discountValue"
            value={discountValue}
            min={0.01}
            max={isPercentage ? 100 : undefined}
            step={isPercentage ? 1 : 0.01}
            onChange={(e) => setDiscountValue(Number(e.currentTarget.value))}
          />

          {/* Hidden fields — keep form dirty so page Save button stays enabled */}
          <s-box display="none">
            <s-text-field
              label="variantNames"
              labelaccessibilityvisibility="hidden"
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
              onChange={(e) => setNameInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddName();
                }
              }}
            />
            <s-button onClick={handleAddName}>Add</s-button>
          </s-stack>

          <s-text tone="subdued">
            Matches any cart variant whose name
          </s-text>

          {/* Saved names list */}
          {variantNames.length > 0 && (
            <s-stack gap="tight">
              {variantNames.map((name) => (
                <s-stack
                  key={name}
                  direction="inline"
                  alignItems="center"
                  gap="tight"
                >
                  <s-text>{name}</s-text>
                  <s-button
                    variant="tertiary"
                    onClick={() => handleRemoveName(name)}
                  >
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
