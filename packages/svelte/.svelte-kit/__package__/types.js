/**
 * Type guard to check if props contain a pre-created client.
 */
export function hasClient(props) {
    return "client" in props && props.client !== undefined;
}
/**
 * Type guard to check if props contain options.
 */
export function hasOptions(props) {
    return "options" in props && props.options !== undefined;
}
/**
 * Type guard to check if props contain a snapshot.
 */
export function hasSnapshot(props) {
    return "snapshot" in props && props.snapshot !== undefined;
}
