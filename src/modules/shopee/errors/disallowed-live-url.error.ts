/** A live link whose scheme or host is outside the Shopee allow-list; raised before any request is made. */
export class DisallowedLiveUrlError extends Error {}
