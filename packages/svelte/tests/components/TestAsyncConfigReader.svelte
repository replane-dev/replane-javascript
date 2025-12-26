<script lang="ts">
  import { config } from "../../src/stores";

  interface Props {
    configName: string;
  }

  let { configName }: Props = $props();

  const value = config<string>(configName);
</script>

<div data-testid="value">{$value}</div>
