export const MOBILE_PROVIDER_EMAIL_COOKIE = "vf_mobile_provider_email";

export function normalizeAccountEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isApplePrivateRelayEmail(value: string | null | undefined) {
  return normalizeAccountEmail(value).endsWith("@privaterelay.appleid.com");
}
