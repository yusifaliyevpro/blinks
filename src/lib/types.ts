// Where the encrypted blob lives. "redis" = the server-side store;
// "local" = this browser's IndexedDB (offline, single-device). The choice never
// touches the crypto — only the write destination changes.
export type StorageBackend = "redis" | "local";

export type EncryptedBlob = {
  ciphertext: string;
  version: number;
};

export type GetBlobResult = EncryptedBlob | null;

export type PutBlobInput = {
  blobId: string;
  ciphertext: string;
  expectedVersion: number;
  writeToken: string;
};

export type PutBlobResult = { version: number } | { conflict: true; current: EncryptedBlob | null };

export type LinkMetadata = {
  title: string;
  description: string;
  image: string;
};

export type LinkItem = LinkMetadata & {
  id: string;
  url: string;
  createdAt: number;
};

// The full decrypted vault payload (encrypted as a single blob).
export type VaultData = {
  title: string;
  links: LinkItem[];
};
