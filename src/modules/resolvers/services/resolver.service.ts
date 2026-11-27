import { Inject, Injectable } from '@nestjs/common';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { PLATFORM_RESOLVERS, PlatformResolver } from '../interfaces/platform-resolver.interface';
import { ResolveRequest } from '../models/resolve-request.model';
import { cancelled, failed, ResolveResult } from '../models/resolve-result.model';

/** Hands a request to the first resolver that supports it: the backend resolver claims every request with a brandId, and each platform resolver refuses one. */
@Injectable()
export class ResolverService {
  constructor(@Inject(PLATFORM_RESOLVERS) private readonly resolvers: PlatformResolver[]) {}

  async resolve(request: ResolveRequest): Promise<ResolveResult> {
    const resolver = this.resolvers.find((candidate) => candidate.supports(request));
    if (!resolver) {
      return failed(ResolveFailureCode.UNSUPPORTED, `no resolver for platform ${request.platform}`);
    }
    let result: ResolveResult;
    try {
      result = await resolver.resolve(request);
    } catch (error) {
      if (request.signal?.aborted) return cancelled();
      throw error;
    }
    // Whatever the resolver made of an aborted request, it says nothing about the channel.
    return request.signal?.aborted && !result.ok ? cancelled() : result;
  }
}
