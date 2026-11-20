export class ErrorBodyDto {
  /** Stable machine-readable code, e.g. SHOP_NOT_FOUND. */
  code: string;
  message: string;
  request_id: string;
}
