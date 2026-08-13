export type EncryptedBlob = {
  ciphertext: string;
  version: number;
};

export type GetBlobResult = EncryptedBlob | null;

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
