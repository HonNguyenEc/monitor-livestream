export class HealthResponseDto {
  /** Always `live-qc`: tells this service from another program that holds the port. */
  product: string;
  status: string;
  version: string;
}
