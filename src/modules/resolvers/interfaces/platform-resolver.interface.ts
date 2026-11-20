import { Platform } from '../../../common/enums/platform.enum';
import { ResolveRequest } from '../models/resolve-request.model';
import { ResolveResult } from '../models/resolve-result.model';

export interface PlatformResolver {
  readonly platform: Platform;
  /** Expected outcomes (not live, no cookie) are failures in the result; only programming errors throw. */
  resolve(request: ResolveRequest): Promise<ResolveResult>;
}

export const PLATFORM_RESOLVERS = Symbol('PLATFORM_RESOLVERS');
