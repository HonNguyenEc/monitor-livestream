import { ResolveRequest } from '../models/resolve-request.model';
import { ResolveResult } from '../models/resolve-result.model';

export interface PlatformResolver {
  /** Whether this resolver takes the request; the first one that does resolves it. */
  supports(request: ResolveRequest): boolean;
  /** Expected outcomes (not live, no cookie) are failures in the result; only programming errors throw. */
  resolve(request: ResolveRequest): Promise<ResolveResult>;
}

export const PLATFORM_RESOLVERS = Symbol('PLATFORM_RESOLVERS');
