"use client";

import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";
import { api, ApiError, type Asset, type AssetKind } from "@/lib/api";

const KIND_BY_MIME: [RegExp, AssetKind][] = [
  [/^image\//, "IMAGE"],
  [/^video\//, "VIDEO"],
  [/^audio\//, "AUDIO"],
  [/^model\/gltf-binary$/, "MODEL_3D"],
];

function guessMime(file: File): string {
  if (file.type) return file.type;
  if (file.name.toLowerCase().endsWith(".glb")) return "model/gltf-binary";
  return "application/octet-stream";
}

function AssetTile({ asset, url }: { asset: Asset; url?: string }) {
  const draggable = asset.status === "READY" && asset.kind !== "MODEL_3D";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `asset:${asset.id}`,
    data: { type: "asset", assetId: asset.id, kind: asset.kind },
    disabled: !draggable,
  });
  const name = asset.metadata.filename ?? asset.metadata.tool ?? asset.kind;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`overflow-hidden rounded border border-slate-700 bg-slate-900 text-[11px] ${draggable ? "cursor-grab" : "opacity-60"} ${
        isDragging ? "opacity-50" : ""
      }`}
      title={name}
    >
      <div className="flex aspect-video items-center justify-center bg-black">
        {url && asset.mimeType.startsWith("image/") ? (
          <img src={url} alt={name} className="h-full w-full object-contain" />
        ) : (
          <span className="text-slate-500">{asset.kind}</span>
        )}
      </div>
      <div className="truncate px-1.5 py-1">
        {asset.status !== "READY" && <span className="mr-1 text-amber-400">{asset.status}</span>}
        {name}
      </div>
    </div>
  );
}

interface Props {
  projectId: string;
  assets: Asset[];
  assetUrls: Record<string, string>;
  onChanged: () => void;
  onUrl: (id: string, url: string) => void;
}

export function AssetLibrary({ projectId, assets, assetUrls, onChanged, onUrl }: Props) {
  const [uploads, setUploads] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    const mimeType = guessMime(file);
    const kind = KIND_BY_MIME.find(([re]) => re.test(mimeType))?.[1];
    if (!kind) {
      setError(`Unsupported file: ${file.name}`);
      return;
    }
    setError(null);
    try {
      const { asset, uploadUrl } = await api<{ asset: Asset; uploadUrl: string }>(`/projects/${projectId}/assets/uploads`, {
        method: "POST",
        json: { kind, mimeType, sizeBytes: file.size, filename: file.name },
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("content-type", mimeType);
        xhr.upload.onprogress = (e) => setUploads((u) => ({ ...u, [file.name]: e.loaded / e.total }));
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`MinIO upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("MinIO upload failed"));
        xhr.send(file);
      });
      await api(`/assets/${asset.id}/complete`, { method: "POST" });
      const { url } = await api<{ url: string }>(`/assets/${asset.id}/url`);
      onUrl(asset.id, url);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.issues.map((i) => i.message).join("; ") || err.message : String(err));
    } finally {
      setUploads((u) => {
        const { [file.name]: _done, ...rest } = u;
        return rest;
      });
    }
  };

  const visible = assets.filter((a) => a.kind !== "FINAL_RENDER");

  return (
    <div
      className="space-y-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        for (const f of Array.from(e.dataTransfer.files)) void upload(f);
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Assets</h3>
        <label className="cursor-pointer rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700">
          Upload
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,.glb"
            className="hidden"
            onChange={(e) => {
              for (const f of Array.from(e.target.files ?? [])) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {Object.entries(uploads).map(([name, p]) => (
        <div key={name} className="text-xs text-slate-400">
          {name} — {Math.round(p * 100)}%
          <div className="h-1 rounded bg-slate-800">
            <div className="h-1 rounded bg-sky-500" style={{ width: `${p * 100}%` }} />
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-[11px] text-slate-500">Drop files here, then drag an asset onto a matching track.</p>
      <div className="grid grid-cols-2 gap-2">
        {visible.map((a) => (
          <AssetTile key={a.id} asset={a} url={assetUrls[a.id]} />
        ))}
      </div>
    </div>
  );
}
