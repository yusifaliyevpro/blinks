"use client";

import { useEffect, useState } from "react";
import { clearSession, decryptVault, loadSession } from "@/lib/crypto";
import { getBlob } from "@/lib/store";
import type { LinkItem } from "@/lib/types";
import { LinksView } from "./links-view";
import { PasswordScreen, type Unlocked } from "./password-screen";

type Phase = { kind: "checking" } | { kind: "locked" } | ({ kind: "unlocked" } & Unlocked);

export function VaultApp({ redisAvailable }: { redisAvailable: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await loadSession();
      if (!session) {
        if (!cancelled) setPhase({ kind: "locked" });
        return;
      }
      try {
        const blob = await getBlob(session.backend, session.blobId);
        let title = "";
        let links: LinkItem[] = [];
        let version = 0;

        if (blob) {
          const data = await decryptVault(session.key, blob.ciphertext);
          title = data.title;
          links = data.links;
          version = blob.version;
        }

        if (!cancelled) {
          setPhase({ kind: "unlocked", session, title, links, version });
        }
      } catch {
        // Stored key no longer decrypts the blob — start over.
        clearSession();
        if (!cancelled) setPhase({ kind: "locked" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (phase.kind === "checking") {
    return <div className="min-h-full" aria-hidden="true" />;
  }

  if (phase.kind === "locked") {
    return <PasswordScreen redisAvailable={redisAvailable} onUnlock={(u) => setPhase({ kind: "unlocked", ...u })} />;
  }

  return (
    <LinksView
      session={phase.session}
      initialTitle={phase.title}
      initialLinks={phase.links}
      initialVersion={phase.version}
      onLogout={() => {
        clearSession();
        setPhase({ kind: "locked" });
      }}
    />
  );
}
