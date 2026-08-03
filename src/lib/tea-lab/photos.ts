export const TEA_LAB_PHOTO_BUCKET = "tea-lab-photos";
export const TEA_LAB_PHOTO_LIMIT = 6;
export const TEA_LAB_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export type TeaLabPhoto = {
  id: string;
  url: string | null;
  altText: string | null;
  createdAt: string;
  status: "uploading" | "ready";
};
