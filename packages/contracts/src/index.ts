export const API_VERSION = "v1" as const;

export interface HealthResponse {
  status: "ok";
  service: "event-hub-api";
  version: typeof API_VERSION;
}
