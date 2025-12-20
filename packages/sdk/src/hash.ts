/**
 * FNV-1a 32-bit hash function
 *
 * FNV (Fowler–Noll–Vo) is a non-cryptographic hash function known for its
 * speed and good distribution. This implementation uses the FNV-1a variant
 * which XORs before multiplying for better avalanche characteristics.
 *
 * @param input - The string to hash
 * @returns A 32-bit unsigned integer hash value
 */
export function fnv1a32(input: string): number {
  // Convert string to bytes (UTF-8)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);

  // FNV-1a core
  let hash = 0x811c9dc5 >>> 0; // 2166136261, force uint32

  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]; // XOR with byte
    hash = Math.imul(hash, 0x01000193) >>> 0; // * 16777619 mod 2^32
  }

  return hash >>> 0; // ensure unsigned 32-bit
}

/**
 * Convert FNV-1a hash to [0, 1) for bucketing.
 *
 * This is useful for percentage-based segmentation where you need
 * to deterministically assign a value to a bucket based on a string input.
 *
 * @param input - The string to hash
 * @returns A number in the range [0, 1)
 */
export function fnv1a32ToUnit(input: string): number {
  const h = fnv1a32(input);
  return h / 2 ** 32; // double in [0, 1)
}
