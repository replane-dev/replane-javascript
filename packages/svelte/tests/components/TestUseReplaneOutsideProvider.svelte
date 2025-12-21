<script lang="ts">
  import { getReplane } from "../../src/stores";

  // This should throw an error because context is not set
  const replane = getReplane();
</script>

<div data-testid="should-not-render">{replane ? "true" : "false"}</div>
