import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Get the package directory from command line argument or current working directory
const packageDir = process.argv[2] || process.cwd();

const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8"));

// Determine SDK name from package name
const sdkName = pkg.name.replace("@replanejs/sdk", "replane-js").replace("@replanejs/", "replane-");

const versionContent = `// Auto-generated - do not edit manually
export const VERSION = "${pkg.version}";
export const DEFAULT_AGENT = \`${sdkName}/\${VERSION}\`;
`;

const versionPath = join(packageDir, "src/version.ts");
writeFileSync(versionPath, versionContent);
console.log(`Updated ${versionPath} to ${sdkName}/${pkg.version}`);
