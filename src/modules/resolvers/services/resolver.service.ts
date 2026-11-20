import { Inject, Injectable } from '@nestjs/common';
import { Platform } from '../../../common/enums/platform.enum';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { PLATFORM_RESOLVERS, PlatformResolver } from '../interfaces/platform-resolver.interface';
import { ResolveRequest } from '../models/resolve-request.model';
import { failed, ResolveResult } from '../models/resolve-result.model';

/** Picks the resolver for a channel's platform. */
@Injectable()
export class ResolverService {
  private readonly byPlatform: Map<Platform, PlatformResolver>;

  constructor(@Inject(PLATFORM_RESOLVERS) resolvers: PlatformResolver[]) {
    this.byPlatform = new Map(resolvers.map((resolver) => [resolver.platform, resolver]));
  }

  resolve(request: ResolveRequest): Promise<ResolveResult> {
    const resolver = this.byPlatform.get(request.platform);
    if (!resolver) {
      return Promise.resolve(
        failed(ResolveFailureCode.UNSUPPORTED, `no resolver for platform ${request.platform}`),
      );
    }
    return resolver.resolve(request);
  }
}
