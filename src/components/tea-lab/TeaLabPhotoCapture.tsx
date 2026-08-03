"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import {
  TEA_LAB_PHOTO_BUCKET,
  TEA_LAB_PHOTO_LIMIT,
  TEA_LAB_PHOTO_MAX_BYTES,
  type TeaLabPhoto
} from "@/lib/tea-lab/photos";

type JsonObject = Record<string, unknown>;

async function responseJson(response: Response): Promise<JsonObject> {
  return await response.json().catch(() => ({})) as JsonObject;
}

function responseError(payload: JsonObject, fallback: string): string {
  return typeof payload.error === "string" ? payload.error : fallback;
}

export function TeaLabPhotoCapture({
  cardId,
  online,
  prepareCard,
  onBusyChange
}: {
  cardId: string;
  online: boolean;
  prepareCard: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [photos, setPhotos] = useState<TeaLabPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadPhotos = useCallback(async () => {
    const response = await fetch(`/api/tea-lab/photos?cardId=${encodeURIComponent(cardId)}`, { cache: "no-store" });
    const payload = await responseJson(response);
    if (response.status === 404) {
      if (mounted.current) setPhotos([]);
      return;
    }
    if (!response.ok) throw new Error(responseError(payload, "Your tasting photos could not be loaded."));
    if (mounted.current) setPhotos(Array.isArray(payload.photos) ? payload.photos as TeaLabPhoto[] : []);
  }, [cardId]);

  useEffect(() => {
    void loadPhotos().catch(cause => {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Your tasting photos could not be loaded.");
    });
  }, [loadPhotos]);

  async function removePhoto(photoId: string) {
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const response = await fetch(`/api/tea-lab/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" });
      const payload = await responseJson(response);
      if (!response.ok) throw new Error(responseError(payload, "The photo could not be removed."));
      if (mounted.current) setPhotos(current => current.filter(photo => photo.id !== photoId));
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "The photo could not be removed.");
    } finally {
      if (mounted.current) setBusy(false);
      onBusyChange(false);
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length || busy) return;
    if (!online) {
      setError("Connect to the internet before adding a photo. Your written tasting draft is still safe on this device.");
      return;
    }
    const remaining = TEA_LAB_PHOTO_LIMIT - photos.length;
    if (remaining <= 0) {
      setError(`A tasting can have up to ${TEA_LAB_PHOTO_LIMIT} photos.`);
      return;
    }
    const selected = Array.from(fileList).slice(0, remaining);
    const invalid = selected.find(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > TEA_LAB_PHOTO_MAX_BYTES);
    if (invalid) {
      setError("Use a JPEG, PNG, or WebP image no larger than 8 MB.");
      return;
    }

    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      await prepareCard();
      const supabase = createClient();
      for (const file of selected) {
        let photoId = "";
        try {
          const prepareResponse = await fetch("/api/tea-lab/photos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cardId, contentType: file.type, sizeBytes: file.size })
          });
          const prepared = await responseJson(prepareResponse);
          if (!prepareResponse.ok) throw new Error(responseError(prepared, "The photo upload could not be prepared."));
          if (typeof prepared.photoId !== "string" || typeof prepared.path !== "string" || typeof prepared.token !== "string") {
            throw new Error("The photo upload could not be prepared.");
          }
          photoId = prepared.photoId;
          if (mounted.current) setPhotos(current => [...current, {
            id: photoId,
            url: null,
            altText: null,
            createdAt: new Date().toISOString(),
            status: "uploading"
          }]);

          const { error: uploadError } = await supabase.storage.from(TEA_LAB_PHOTO_BUCKET)
            .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type });
          if (uploadError) throw uploadError;

          const confirmResponse = await fetch("/api/tea-lab/photos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photoId })
          });
          const confirmed = await responseJson(confirmResponse);
          if (!confirmResponse.ok) throw new Error(responseError(confirmed, "The photo upload could not be completed."));
          const photo = confirmed.photo as TeaLabPhoto | undefined;
          if (!photo?.id) throw new Error("The photo upload could not be completed.");
          if (mounted.current) setPhotos(current => current.map(item => item.id === photoId ? photo : item));
        } catch (cause) {
          if (photoId) {
            await fetch(`/api/tea-lab/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" }).catch(() => undefined);
            if (mounted.current) setPhotos(current => current.filter(photo => photo.id !== photoId));
          }
          throw cause;
        }
      }
      if (selected.length < fileList.length && mounted.current) {
        setError(`Only ${TEA_LAB_PHOTO_LIMIT} photos can be attached to one tasting.`);
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "The photo could not be added.");
    } finally {
      if (mounted.current) setBusy(false);
      onBusyChange(false);
    }
  }

  const atLimit = photos.length >= TEA_LAB_PHOTO_LIMIT;

  return <section className="tea-lab-photo-capture" aria-labelledby="tasting-photo-heading">
    <div className="page-heading-row">
      <div>
        <h2 className="card-title" id="tasting-photo-heading">Photos of this tasting</h2>
        <p className="help">Optional and private. Add up to {TEA_LAB_PHOTO_LIMIT}; they will appear in the finished tasting card.</p>
      </div>
      <span className="chip">{photos.length} / {TEA_LAB_PHOTO_LIMIT}</span>
    </div>
    {photos.length > 0 && <div className="tea-lab-photo-strip" aria-label="Attached tasting photos">{photos.map(photo => <figure key={photo.id}>
      {photo.url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photo.url} alt={photo.altText ?? "Attached tasting"} />
        : <div className="tea-lab-photo-pending" role="status">Uploading…</div>}
      <button className="btn btn-quiet danger" type="button" disabled={busy} aria-label="Remove this tasting photo" onClick={() => void removePhoto(photo.id)}>Remove</button>
    </figure>)}</div>}
    <div className="tea-lab-photo-actions">
      <label className={`btn btn-primary${busy || atLimit ? " disabled" : ""}`}>
        Take photo
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy || atLimit} onChange={event => { void uploadFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
      </label>
      <label className={`btn btn-secondary${busy || atLimit ? " disabled" : ""}`}>
        Add from library
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || atLimit} onChange={event => { void uploadFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
      </label>
    </div>
    {!online && <p className="help">Photo uploads need a connection. Your tasting notes will continue saving on this device.</p>}
    {busy && <p className="help" role="status" aria-live="polite">Securing your photo…</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}
