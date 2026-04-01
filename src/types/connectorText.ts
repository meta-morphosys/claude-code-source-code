/**
 * Connector text streaming blocks (CONNECTOR_TEXT beta). Shapes match the API;
 * this module is included for OSS/snapshot trees that omit the internal copy.
 */

export type ConnectorTextBlock = {
  type: 'connector_text'
  connector_text: string
  signature?: string
}

export type ConnectorTextDelta =
  | { type: 'connector_text_delta'; connector_text: string }
  | { type: 'signature_delta'; signature: string }

export function isConnectorTextBlock(
  block: unknown,
): block is ConnectorTextBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: string }).type === 'connector_text'
  )
}
