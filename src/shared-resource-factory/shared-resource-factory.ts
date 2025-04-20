import { rejectPromiseWhenSignalIsAborted } from '@xstd/async-task';
import { block } from '@xstd/block';
import {
  CloseSharedResource,
  SharedResource,
  type SharedResourceLike,
} from '../shared-resource/shared-resource.js';

export interface OpenSharedResourceFactory<GRef> {
  (signal?: AbortSignal): Promise<SharedResourceLike<GRef>> | SharedResourceLike<GRef>;
}

/**
 * A builder for a `SharedResource`.
 *
 * When `.open(...)` is called:
 *  - is no `SharedResource` is opening or opened: invokes the provided `open` function and store the `result`.
 *  - then, or later when `.open(...)` is called again, use this `result` to return a new `SharedResource`.
 *
 * When all the returned `SharedResource` are closed, it closes the original `result` and resets the processus.
 */
export class SharedResourceFactory<GRef> {
  readonly #initialOpen: OpenSharedResourceFactory<GRef>;

  #usageCount: number;
  #sharedRef: GRef | undefined;
  #sharedClose: CloseSharedResource | undefined;
  #openController: AbortController | undefined;
  #openPromise: Promise<void> | undefined;
  #closePromise: Promise<void> | undefined;

  constructor(open: OpenSharedResourceFactory<GRef>) {
    this.#initialOpen = open;
    this.#usageCount = 0;
  }

  async open(signal?: AbortSignal): Promise<SharedResource<GRef>> {
    await this.#open(signal);

    return new SharedResource<GRef>(this.#sharedRef!, (reason?: unknown): Promise<void> => {
      return this.#close(reason);
    });
  }

  async #open(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();

    // await previous disposal
    if (this.#closePromise !== undefined) {
      await rejectPromiseWhenSignalIsAborted(this.#closePromise, signal);
    }

    try {
      await rejectPromiseWhenSignalIsAborted(
        block(async (): Promise<void> => {
          this.#usageCount++;

          if (this.#usageCount === 1) {
            this.#openController = new AbortController();
            const signal: AbortSignal = this.#openController.signal;

            const openPromiseWithResolvers: PromiseWithResolvers<void> =
              Promise.withResolvers<void>();
            this.#openPromise = openPromiseWithResolvers.promise;

            try {
              const sharedResourceLike: SharedResourceLike<GRef> = await this.#initialOpen(signal);
              signal?.throwIfAborted();
              this.#sharedRef = sharedResourceLike.ref;
              this.#sharedClose = sharedResourceLike.close.bind(sharedResourceLike);
              openPromiseWithResolvers.resolve();
            } catch (error: unknown) {
              openPromiseWithResolvers.reject(error);
              throw error;
            } finally {
              this.#openController = undefined;
              this.#openPromise = undefined;
            }
          } else {
            await this.#openPromise!;
          }
        }),
        signal,
      );
    } catch (error: unknown) {
      await this.#close(error);
      throw error;
    }
  }

  async #close(reason?: unknown): Promise<void> {
    this.#usageCount--;

    if (this.#usageCount === 0) {
      if (this.#openController !== undefined) {
        this.#openController.abort();
      }

      const closePromiseWithResolvers: PromiseWithResolvers<void> = Promise.withResolvers<void>();
      this.#closePromise = closePromiseWithResolvers.promise;

      try {
        if (this.#sharedClose !== undefined) {
          await this.#sharedClose(reason);
        }
      } finally {
        this.#sharedRef = undefined;
        this.#sharedClose = undefined;
        this.#closePromise = undefined;
        closePromiseWithResolvers.resolve();
      }
    }
  }
}
