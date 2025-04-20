import { inspectAsyncTaskArguments } from '@xstd/async-task';
import { SharedResourceFactory } from '../shared-resource-factory/shared-resource-factory.js';
import { SharedResource, SharedResourceLike } from '../shared-resource/shared-resource.js';

/* TYPES */

export interface OpenSharedResourceFactoryWithArguments<GArguments extends readonly any[], GRef> {
  (
    ...args: OpenSharedResourceFactoryWithArgumentsArguments<GArguments>
  ): Promise<SharedResourceLike<GRef>> | SharedResourceLike<GRef>;
}

export type OpenSharedResourceFactoryWithArgumentsArguments<GArguments extends readonly any[]> =
  readonly [...args: GArguments, signal?: AbortSignal];

export interface GetKeyFromArguments<GArguments extends readonly any[]> {
  (...args: GArguments): string;
}

export interface SharedResourceFactoryWithArgumentsOptions<
  GArguments extends readonly any[],
  GRef,
> {
  readonly open: OpenSharedResourceFactoryWithArguments<GArguments, GRef>;
  readonly getKey: GetKeyFromArguments<GArguments>;
}

/* CLASS */

/**
 * Similar to `SharedResourceFactory`, but `.open(...)` accepts some arguments.
 *
 * Based on these arguments, a hash is created, and the associated `SharedResource` is returned.
 */
export class SharedResourceFactoryWithArguments<GArguments extends readonly any[], GRef> {
  readonly #open: OpenSharedResourceFactoryWithArguments<GArguments, GRef>;
  readonly #getKey: GetKeyFromArguments<GArguments>;

  readonly #map: Map<string, SharedResourceFactory<GRef>>;

  constructor({ open, getKey }: SharedResourceFactoryWithArgumentsOptions<GArguments, GRef>) {
    this.#open = open;
    this.#getKey = getKey;
    this.#map = new Map<string, SharedResourceFactory<GRef>>();
  }

  async open(
    ..._args: OpenSharedResourceFactoryWithArgumentsArguments<GArguments>
  ): Promise<SharedResource<GRef>> {
    const [args, signal] = inspectAsyncTaskArguments(_args);

    signal?.throwIfAborted();

    const key: string = this.#getKey(...args);

    let sharedResourceFactory: SharedResourceFactory<GRef> | undefined = this.#map.get(key);

    if (sharedResourceFactory === undefined) {
      sharedResourceFactory = new SharedResourceFactory<GRef>(
        async (signal?: AbortSignal): Promise<SharedResourceLike<GRef>> => {
          let sharedResource: SharedResourceLike<GRef>;

          try {
            sharedResource = await this.#open(...args, signal);
          } catch (error: unknown) {
            this.#map.delete(key);
            throw error;
          }

          return {
            ref: sharedResource.ref,
            close: async (): Promise<void> => {
              this.#map.delete(key);
              await sharedResource.close();
            },
          };
        },
      );
      this.#map.set(key, sharedResourceFactory);
    }

    return sharedResourceFactory.open(signal);
  }
}
