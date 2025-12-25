import { testSuite } from "../src/test-suite";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

testSuite({
  superadminKey: getEnv("REPLANE_SUPERADMIN_API_KEY"),
  adminApiBaseUrl: getEnv("REPLANE_ADMIN_API_BASE_URL"),
  edgeApiBaseUrl: getEnv("REPLANE_EDGE_API_BASE_URL"),
});
