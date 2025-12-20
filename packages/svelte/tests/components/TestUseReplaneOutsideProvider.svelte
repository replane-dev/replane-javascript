<script lang="ts">
  import { getReplaneContext } from "../../src/context";

  // This should throw an error because context is not set
  const context = getReplaneContext();
</script>

<div data-testid="should-not-render">{context.client ? "true" : "false"}</div>
