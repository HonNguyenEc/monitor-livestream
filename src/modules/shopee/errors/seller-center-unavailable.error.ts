/** Seller Center could not give an answer: network failure, timeout, 5xx, 429 or a body that is not JSON. */
export class SellerCenterUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = SellerCenterUnavailableError.name;
  }
}
