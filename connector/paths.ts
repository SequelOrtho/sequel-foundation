import { DEFAULT_CONNECTOR_PATHS, type ConnectorPaths } from "./config";

// The connector's paths that skip the sign-in gate: Claude's servers call
// them with no cookie. An exact list, never a prefix. The consent page, its
// Allow post and the hub's connections page stay behind sign-in. Each route
// checks its own token or input, and answers 404 while the connector is off.

export type OpenRequestMap = Record<string, readonly string[]>;

/** The default open list for a set of connector paths. */
export function connectorOpenRequests(paths: ConnectorPaths = DEFAULT_CONNECTOR_PATHS): OpenRequestMap {
  return {
    [paths.resourceMetadata]: ["GET", "HEAD"],
    [`${paths.resourceMetadata}${paths.mcp}`]: ["GET", "HEAD"],
    [paths.asMetadata]: ["GET", "HEAD"],
    [paths.register]: ["POST"],
    [paths.token]: ["POST"],
    [paths.mcp]: ["POST", "GET", "DELETE"],
  };
}

/** A matcher for the proxy: exact paths and methods only. */
export function createConnectorOpenRequest(open: OpenRequestMap = connectorOpenRequests()) {
  return (method: string, pathname: string): boolean =>
    Object.hasOwn(open, pathname) && open[pathname].includes(method.toUpperCase());
}

/** The default matcher, over `DEFAULT_CONNECTOR_PATHS`. */
export const isConnectorOpenRequest = createConnectorOpenRequest();
