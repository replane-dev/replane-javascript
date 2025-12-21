<script lang="ts">
  interface Props {
    primaryColor: string;
  }

  let { primaryColor }: Props = $props();
</script>

<header class="header new-header" style="border-bottom-color: {primaryColor}">
  <h1 style="color: {primaryColor}">Replane Demo (New Header)</h1>
  <nav>
    <a href="#">Home</a>
    <a href="#">Features</a>
    <a href="#">Docs</a>
  </nav>
</header>
