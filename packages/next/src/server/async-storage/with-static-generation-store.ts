import type { WithStore } from './with-store'
import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'
import type { AsyncLocalStorage } from 'async_hooks'
import type { IncrementalCache } from '../lib/incremental-cache'
import type { RenderOptsPartial } from '../app-render/types'
import type { FetchMetric } from '../base-http'
import type { RequestLifecycleOpts } from '../base-server'
import type { FallbackRouteParams } from '../../server/request/fallback-params'

import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'

export type StaticGenerationContext = {
  /**
   * The page that is being rendered. This relates to the path to the page file.
   */
  page: string

  /**
   * The route parameters that are currently unknown.
   */
  fallbackRouteParams: FallbackRouteParams | null

  requestEndedState?: { ended?: boolean }
  renderOpts: {
    incrementalCache?: IncrementalCache
    isOnDemandRevalidate?: boolean
    fetchCache?: StaticGenerationStore['fetchCache']
    isServerAction?: boolean
    pendingWaitUntil?: Promise<any>
    experimental: Pick<
      RenderOptsPartial['experimental'],
      'isRoutePPREnabled' | 'after' | 'dynamicIO'
    >

    /**
     * Fetch metrics attached in patch-fetch.ts
     **/
    fetchMetrics?: FetchMetric[]

    /**
     * A hack around accessing the store value outside the context of the
     * request.
     *
     * @internal
     * @deprecated should only be used as a temporary workaround
     */
    // TODO: remove this when we resolve accessing the store outside the execution context
    store?: StaticGenerationStore
  } & Pick<
    // Pull some properties from RenderOptsPartial so that the docs are also
    // mirrored.
    RenderOptsPartial,
    | 'supportsDynamicResponse'
    | 'isRevalidate'
    | 'nextExport'
    | 'isDraftMode'
    | 'isDebugDynamicAccesses'
  > &
    Partial<RequestLifecycleOpts>
}

export const withStaticGenerationStore: WithStore<
  StaticGenerationStore,
  StaticGenerationContext
> = <Result>(
  storage: AsyncLocalStorage<StaticGenerationStore>,
  {
    page,
    fallbackRouteParams,
    renderOpts,
    requestEndedState,
  }: StaticGenerationContext,
  callback: (store: StaticGenerationStore) => Result
): Result => {
  /**
   * Rules of Static & Dynamic HTML:
   *
   *    1.) We must generate static HTML unless the caller explicitly opts
   *        in to dynamic HTML support.
   *
   *    2.) If dynamic HTML support is requested, we must honor that request
   *        or throw an error. It is the sole responsibility of the caller to
   *        ensure they aren't e.g. requesting dynamic HTML for an AMP page.
   *
   *    3.) If the request is in draft mode, we must generate dynamic HTML.
   *
   *    4.) If the request is a server action, we must generate dynamic HTML.
   *
   * These rules help ensure that other existing features like request caching,
   * coalescing, and ISR continue working as intended.
   */
  const isStaticGeneration =
    !renderOpts.supportsDynamicResponse &&
    !renderOpts.isDraftMode &&
    !renderOpts.isServerAction

  const store: StaticGenerationStore = {
    isStaticGeneration,
    page,
    fallbackRouteParams,
    route: normalizeAppPath(page),
    incrementalCache:
      // we fallback to a global incremental cache for edge-runtime locally
      // so that it can access the fs cache without mocks
      renderOpts.incrementalCache || (globalThis as any).__incrementalCache,
    isRevalidate: renderOpts.isRevalidate,
    isPrerendering: renderOpts.nextExport,
    fetchCache: renderOpts.fetchCache,
    isOnDemandRevalidate: renderOpts.isOnDemandRevalidate,

    isDraftMode: renderOpts.isDraftMode,

    requestEndedState,
  }

  // TODO: remove this when we resolve accessing the store outside the execution context
  renderOpts.store = store

  return storage.run(store, callback, store)
}
