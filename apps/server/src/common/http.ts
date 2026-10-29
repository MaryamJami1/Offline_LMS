/**
 * The little of the HTTP request and response that the server's own filters
 * and guards touch. Naming it here keeps them testable with plain objects and
 * saves pulling Express's type definitions into the build for three members.
 */

export interface HttpRequest {
  /** The path as the router saw it, used to decide what a first login may do. */
  path: string;
  headers: { authorization?: string };
}

export interface HttpResponse {
  status(code: number): { json(body: unknown): unknown };
}
