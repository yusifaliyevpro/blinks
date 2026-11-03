// Where the encrypted blob lives. "redis" = the server-side store;
// "local" = this browser's IndexedDB (offline, single-device). The choice never
// touches the crypto — only the write destination changes.
export type StorageBackend = "redis" | "local";

type EncryptedBlob = {
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
  // Single category per link ("", = uncategorized). Legacy `tags` arrays from
  // the tags experiment migrate to the first entry on decrypt.
  category?: string;
};

// The full decrypted vault payload (encrypted as a single blob).
export type VaultData = {
  title: string;
  links: LinkItem[];
  // Vault-level category list, managed explicitly. Links reference one by name;
  // a link whose category was deleted renders as Uncategorized.
  categories?: string[];
};
