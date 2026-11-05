import { AsyncLocalStorage } from "node:async_hooks";

// While an MCP tool call runs, the hub's own session reader must answer with
// the connection's person, not the browser cookie (there is none). The route
// verifies the bearer token, then runs the tools inside `runAsConnector`.
// `run` only, never `enterWith`: the scope ends when the callback does, so it
// can never leak into the next request on the same worker.

/** The person a connection acts for, in the shape the hub's session reader returns. */
export type ConnectorIdentity<Session = unknown, Role extends string = string> = {
  session: Session;
  /** The role chosen at consent. The hub uses it in place of its role cookie, only while still granted. */
  activeRole: Role;
};

const store = new AsyncLocalStorage<ConnectorIdentity>();

export function runAsConnector<T, Session, Role extends string>(identity: ConnectorIdentity<Session, Role>, fn: () => T): T {
  return store.run(identity as ConnectorIdentity, fn);
}

/** The connection's person while inside `runAsConnector`, else null. */
export function connectorIdentity<Session = unknown, Role extends string = string>(): ConnectorIdentity<Session, Role> | null {
  return (store.getStore() as ConnectorIdentity<Session, Role> | undefined) ?? null;
}

export const inConnectorScope = (): boolean => store.getStore() !== undefined;

/**
 * Wraps the hub's session reader (Auth.js `auth`, say). Called with no
 * arguments inside the scope, it answers the connection's session; any other
 * call (with a request, or as a middleware wrapper) passes through untouched.
 */
export function scopedAuth<F extends (...args: never[]) => unknown>(real: F): F {
  const wrapped = (...args: never[]) => {
    const id = store.getStore();
    if (id && args.length === 0) return Promise.resolve(id.session);
    return real(...args);
  };
  return wrapped as unknown as F;
}
