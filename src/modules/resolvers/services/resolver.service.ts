import { Inject, Injectable } from '@nestjs/common';
import { Platform } from '../../../common/enums/platform.enum';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { BackendPlayUrlResolver } from '../backend/backend-play-url.resolver';
import { PLATFORM_RESOLVERS, PlatformResolver } from '../interfaces/platform-resolver.interface';
import { ResolveRequest } from '../models/resolve-request.model';
import { failed, ResolveResult } from '../models/resolve-result.model';

/** Picks the resolver for a channel: the backend one when it carries a brandId (`source: backend`), else its platform's. */
@Injectable()
export class ResolverService {
  private readonly byPlatform: Map<Platform, PlatformResolver>;

  constructor(
    @Inject(PLATFORM_RESOLVERS) resolvers: PlatformResolver[],
    private readonly backend: BackendPlayUrlResolver,
  ) {
    this.byPlatform = new Map(resolvers.map((resolver) => [resolver.platform, resolver]));
  }

  resolve(request: ResolveRequest): Promise<ResolveResult> {
    if (request.brandId !== undefined) {
      return this.backend.resolve(request);
    }
    const resolver = this.byPlatform.get(request.platform);
    if (!resolver) {
      return Promise.resolve(
        failed(ResolveFailureCode.UNSUPPORTED, `no resolver for platform ${request.platform}`),
      );
    }
    return resolver.resolve(request);
  }
}
