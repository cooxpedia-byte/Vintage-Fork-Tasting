type FeatureFlagEnvironment = {
  TEA_LAB_ENABLED?: string;
};

export type ServerFeatureFlags = Readonly<{
  teaLab: boolean;
}>;

export function getServerFeatureFlags(
  environment: FeatureFlagEnvironment = { TEA_LAB_ENABLED: process.env.TEA_LAB_ENABLED }
): ServerFeatureFlags {
  return Object.freeze({
    teaLab: environment.TEA_LAB_ENABLED === "true"
  });
}
