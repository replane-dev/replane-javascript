<script lang="ts">
  import type { ReplaneClient } from "@replanejs/sdk";
  import { setReplaneContext } from "../../src/context";
  import { useConfig } from "../../src/stores";

  interface Props {
    client: ReplaneClient<any>;
    configName: string;
    isArray?: boolean;
    isObject?: boolean;
    isDate?: boolean;
    showLength?: boolean;
    showConditional?: boolean;
  }

  let {
    client,
    configName,
    isArray = false,
    isObject = false,
    isDate = false,
    showLength = false,
    showConditional = false,
  }: Props = $props();

  // Set context (simulating what ReplaneProvider does)
  setReplaneContext(client);

  // Create store at top level
  const valueStore = useConfig(configName);

  // Compute display value
  function formatValue(val: unknown): string {
    if (val === undefined) return "UNDEFINED";
    if (val === null) return "NULL";
    if (val === "") return "EMPTY_STRING";
    if (isArray && showLength) return String((val as unknown[]).length);
    if (isArray) return (val as unknown[]).join(",");
    if (isObject) return JSON.stringify(val);
    if (isDate) return (val as Date).toISOString();
    return String(val);
  }
</script>

<div data-testid="value">{formatValue($valueStore)}</div>
{#if showConditional}
  <div data-testid="conditional">{$valueStore}</div>
{/if}
